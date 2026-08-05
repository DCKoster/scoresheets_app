import { findGame, getGameName } from './data/games.js';
import { applyStaticTranslations, createTranslator, resolveLocale, saveLocale } from './i18n.js';
import { getScoringEngine } from './scoring/engines.js';
import { LocalGameRepository, LocalSessionRepository, createId, migrateStorage } from './state/repositories.js';
import { parseParticipants } from './utils/players.js';
import { showView, wireTabNavigation } from './ui/navigation.js';
import { renderHomeSummary } from './ui/home.js';
import { renderSavedSessions } from './ui/history.js';
import { renderStatistics } from './ui/statistics.js';
import { finalizeEditor, renderEngineEditor } from './ui/session-form.js';
import { renderGameManager } from './ui/game-manager.js';

const byId = (id) => document.getElementById(id);
const dom = {
  gameSelect: byId('game'), playersInput: byId('players'), startButton: byId('start-session'),
  saveSessionButton: byId('save-session'), sessionPanel: byId('session-panel'), sessionTitle: byId('session-title'),
  newSessionCard: byId('new-session-card'),
  entryPanel: byId('entry-panel'), savedList: byId('saved-list'), homeSummary: byId('home-summary'),
  statistics: byId('statistics'),
  gamesList: byId('games-list'), gameForm: byId('game-form'), gameName: byId('game-name'),
  entryMode: byId('entry-mode'), ranking: byId('ranking'), rankingLabel: byId('ranking-label'), editingGameId: byId('editing-game-id'),
  saveGame: byId('save-game'), cancelEdit: byId('cancel-game-edit'), error: byId('app-error'),
  language: byId('language'),
  tabButtons: document.querySelectorAll('.tab'),
  views: { home: byId('view-home'), 'new-session': byId('view-new-session'), history: byId('view-history'), statistics: byId('view-statistics'), games: byId('view-games') },
};
const gameRepository = new LocalGameRepository(localStorage);
const sessionRepository = new LocalSessionRepository(localStorage);
const state = { activeSession: null, activeDraft: {}, games: [], sessions: [], historyGrouped: false };
const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
let i18n = createTranslator(resolveLocale(localStorage, browserLanguages));

function reportError(message) { dom.error.textContent = message; dom.error.classList.toggle('hidden', !message); }
function localized(key, parameters = {}) {
  if (!key) return '';
  const values = { ...parameters };
  if (key === 'errors.migration' && values.message) values.message = i18n.t(values.message);
  return i18n.t(key, values);
}

function updateLanguageButton() {
  dom.language.textContent = i18n.locale === 'nl' ? '🇳🇱 NL' : '🇬🇧 EN';
  dom.language.setAttribute('aria-label', i18n.t('language.switchTo'));
}

function populateGameSelect() {
  const selected = dom.gameSelect.value;
  dom.gameSelect.replaceChildren();
  state.games.forEach((game) => {
    const option = document.createElement('option'); option.value = game.id;
    option.textContent = `${getGameName(game, i18n.locale)} (${i18n.t(`games.engine.${game.scoring.engineId}`)})`;
    dom.gameSelect.append(option);
  });
  if (state.games.some((game) => game.id === selected)) dom.gameSelect.value = selected;
}

function renderDynamic() {
  populateGameSelect();
  renderHomeSummary(dom.homeSummary, state.sessions, state.games, i18n);
  renderSavedSessions(dom.savedList, state.sessions, state.games, async (id) => { await sessionRepository.delete(id); await refresh(); }, i18n, state.historyGrouped, (grouped) => {
    state.historyGrouped = grouped;
    renderDynamic();
  });
  renderStatistics(dom.statistics, state.sessions, state.games, i18n);
  renderGameManager(dom.gamesList, state.games, {
    duplicate: async (id) => run(async () => {
      const copyName = (name, number) => i18n.t(number === 1 ? 'games.copy' : 'games.copyNumber', { name, number });
      await gameRepository.duplicate(id, i18n.locale, copyName); await refresh();
    }),
    edit: beginEdit,
    delete: async (game) => {
      if (confirm(i18n.t('games.deleteConfirm', { game: getGameName(game, i18n.locale) }))) await run(async () => { await gameRepository.delete(game.id); await refresh(); });
    },
  }, i18n);
  if (dom.editingGameId.value) dom.saveGame.textContent = i18n.t('games.saveChanges');
  if (state.activeSession) {
    const game = findGame(state.games, state.activeSession.gameId);
    const gameName = game ? getGameName(game, i18n.locale) : state.activeSession.gameNameAtPlay;
    dom.sessionTitle.textContent = i18n.t('session.title', { game: gameName });
    const engine = getScoringEngine(state.activeSession.scoring.engineId);
    renderEngineEditor(dom.entryPanel, state.activeSession, engine, (key) => alert(localized(key)), i18n, state.activeDraft, (draft) => { state.activeDraft = draft; });
  }
}

async function refresh() {
  [state.games, state.sessions] = await Promise.all([gameRepository.list(), sessionRepository.list()]);
  renderDynamic();
}

async function run(action) { try { reportError(''); await action(); } catch (error) { reportError(localized(error.message, error.parameters)); } }

function startSession() {
  reportError('');
  const parsed = parseParticipants(dom.playersInput.value);
  if (!parsed.valid) return alert(localized(parsed.error));
  const game = findGame(state.games, dom.gameSelect.value);
  if (!game) return alert(localized('errors.gameInvalid'));
  const engine = getScoringEngine(game.scoring.engineId);
  state.activeSession = {
    schemaVersion: 2, id: createId('session'), gameId: game.id, gameNameAtPlay: getGameName(game, i18n.locale),
    participants: parsed.participants, scoring: { ...game.scoring }, entries: engine.initialEntries(), totals: {}, createdAt: new Date().toISOString(),
  };
  state.activeDraft = {};
  dom.newSessionCard.classList.add('hidden'); dom.sessionPanel.classList.remove('hidden'); dom.sessionTitle.textContent = i18n.t('session.title', { game: getGameName(game, i18n.locale) });
  renderEngineEditor(dom.entryPanel, state.activeSession, engine, (key) => alert(localized(key)), i18n, state.activeDraft, (draft) => { state.activeDraft = draft; });
  showView('new-session', dom.views, dom.tabButtons);
}

async function saveActiveSession() {
  if (!state.activeSession) return;
  const engine = getScoringEngine(state.activeSession.scoring.engineId);
  const result = finalizeEditor(state.activeSession, engine);
  if (!result.valid) return alert(localized(result.error));
  await sessionRepository.save(state.activeSession);
  state.activeSession = null; state.activeDraft = {}; dom.sessionPanel.classList.add('hidden'); dom.newSessionCard.classList.remove('hidden'); await refresh();
  showView('history', dom.views, dom.tabButtons);
}

function beginEdit(game) {
  dom.editingGameId.value = game.id; dom.gameName.value = game.name;
  dom.entryMode.value = game.scoring.engineId; dom.ranking.value = game.scoring.ranking;
  updateRankingControl();
  dom.saveGame.textContent = i18n.t('games.saveChanges'); dom.cancelEdit.classList.remove('hidden'); dom.gameName.focus();
}

function clearGameForm() {
  dom.gameForm.reset(); dom.editingGameId.value = ''; updateRankingControl(); dom.saveGame.textContent = i18n.t('games.create'); dom.cancelEdit.classList.add('hidden');
}

function updateRankingControl() {
  const isWinnerOnly = dom.entryMode.value === 'winner-only';
  dom.ranking.disabled = isWinnerOnly;
  dom.ranking.classList.toggle('hidden', isWinnerOnly);
  dom.rankingLabel.classList.toggle('hidden', isWinnerOnly);
  if (isWinnerOnly) dom.ranking.value = 'selected';
  else if (!['highest', 'lowest'].includes(dom.ranking.value)) dom.ranking.value = 'highest';
}

dom.gameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  run(async () => {
    const data = { name: dom.gameName.value, scoring: { engineId: dom.entryMode.value, ranking: dom.entryMode.value === 'winner-only' ? 'selected' : dom.ranking.value } };
    if (dom.editingGameId.value) await gameRepository.update(dom.editingGameId.value, data); else await gameRepository.create(data);
    clearGameForm(); await refresh();
  });
});
dom.cancelEdit.addEventListener('click', clearGameForm);
dom.entryMode.addEventListener('change', updateRankingControl);
wireTabNavigation(dom.tabButtons, dom.views, (nextView) => {
  if (nextView === 'new-session' && !state.activeSession) dom.newSessionCard.classList.remove('hidden');
  showView(nextView, dom.views, dom.tabButtons);
});
dom.startButton.addEventListener('click', startSession);
dom.saveSessionButton.addEventListener('click', () => run(saveActiveSession));
dom.language.addEventListener('click', () => {
  i18n = createTranslator(saveLocale(localStorage, i18n.locale === 'en' ? 'nl' : 'en'));
  applyStaticTranslations(document, i18n);
  updateLanguageButton();
  updateRankingControl();
  renderDynamic();
});

await run(async () => {
  applyStaticTranslations(document, i18n);
  updateLanguageButton();
  const migration = await migrateStorage(localStorage);
  if (migration.error) reportError(localized(migration.error, migration.parameters));
  await refresh();
});
showView('home', dom.views, dom.tabButtons);
