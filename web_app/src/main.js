import { findGame, getGameName } from './data/games.js';
import { applyStaticTranslations, createTranslator, resolveLocale, saveLocale } from './i18n.js';
import { getScoringEngine } from './scoring/engines.js';
import { LocalGameRepository, LocalSessionRepository, createId, exportBackup, importBackup, migrateStorage } from './state/repositories.js';
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
  saveSessionButton: byId('save-session'), cancelSession: byId('cancel-session'), cancelSessionEdit: byId('cancel-session-edit'), sessionPlayerEditor: byId('session-player-editor'), sessionPlayers: byId('session-players'), sessionPanel: byId('session-panel'), sessionTitle: byId('session-title'),
  newSessionCard: byId('new-session-card'),
  entryPanel: byId('entry-panel'), savedList: byId('saved-list'), homeSummary: byId('home-summary'),
  statistics: byId('statistics'),
  gamesList: byId('games-list'), gameForm: byId('game-form'), gameName: byId('game-name'),
  addGame: byId('add-game'), gameCategory: byId('game-category'), playMode: byId('play-mode'), scoreCategories: byId('score-categories'), addScoreCategory: byId('add-score-category'), categoryScoring: byId('category-scoring'), gameSearch: byId('game-search'), categoryFilter: byId('category-filter'),
  entryMode: byId('entry-mode'), ranking: byId('ranking'), rankingLabel: byId('ranking-label'), editingGameId: byId('editing-game-id'),
  saveGame: byId('save-game'), cancelEdit: byId('cancel-game-edit'), error: byId('app-error'),
  language: byId('language'),
  tabButtons: document.querySelectorAll('.tab'),
  views: { home: byId('view-home'), 'new-session': byId('view-new-session'), history: byId('view-history'), statistics: byId('view-statistics'), games: byId('view-games') },
};
const gameRepository = new LocalGameRepository(localStorage);
const sessionRepository = new LocalSessionRepository(localStorage);
const state = { activeSession: null, activeEditorState: { draft: {}, editingRoundId: null }, editingSessionId: null, games: [], sessions: [], historyGrouped: false, gameFilters: { query: '', category: '' }, draftScoreCategories: [] };
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
  renderSavedSessions(dom.savedList, state.sessions, state.games, {
    onDelete: async (id) => { await sessionRepository.delete(id); await refresh(); },
    onEdit: editSavedSession,
    onExport: () => run(exportSessions),
    onImport: (file) => run(() => importSessions(file)),
  }, i18n, state.historyGrouped, (grouped) => {
    state.historyGrouped = grouped;
    renderDynamic();
  });
  renderStatistics(dom.statistics, state.sessions, state.games, i18n);
  populateCategoryFilter();
  renderGameManager(dom.gamesList, state.games, {
    duplicate: async (id) => run(async () => {
      const copyName = (name, number) => i18n.t(number === 1 ? 'games.copy' : 'games.copyNumber', { name, number });
      await gameRepository.duplicate(id, i18n.locale, copyName); await refresh();
    }),
    edit: beginEdit,
    delete: async (game) => {
      if (confirm(i18n.t('games.deleteConfirm', { game: getGameName(game, i18n.locale) }))) await run(async () => { await gameRepository.delete(game.id); await refresh(); });
    },
  }, i18n, state.gameFilters);
  if (dom.editingGameId.value) dom.saveGame.textContent = i18n.t('games.saveChanges');
  if (state.activeSession) {
    const game = findGame(state.games, state.activeSession.gameId);
    const gameName = game ? getGameName(game, i18n.locale) : state.activeSession.gameNameAtPlay;
    dom.sessionTitle.textContent = i18n.t('session.title', { game: gameName });
    const engine = getScoringEngine(state.activeSession.scoring.engineId);
    renderEngineEditor(dom.entryPanel, state.activeSession, engine, (key) => alert(localized(key)), i18n, state.activeEditorState, (editorState) => { state.activeEditorState = editorState; });
    dom.saveSessionButton.textContent = i18n.t(state.editingSessionId ? 'session.saveChanges' : 'session.save');
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
    schemaVersion: 3, id: createId('session'), gameId: game.id, gameNameAtPlay: getGameName(game, i18n.locale), playMode: game.playMode,
    scoreCategories: [...(game.scoreCategories ?? [])], categoryScoring: game.categoryScoring, participants: parsed.participants, scoring: { ...game.scoring }, entries: engine.initialEntries(), totals: {}, categoryTotals: {}, createdAt: new Date().toISOString(),
  };
  state.activeEditorState = { draft: {}, editingRoundId: null }; state.editingSessionId = null;
  dom.sessionPlayerEditor.classList.add('hidden'); dom.cancelSession.classList.remove('hidden'); dom.cancelSessionEdit.classList.add('hidden');
  dom.saveSessionButton.textContent = i18n.t('session.save');
  dom.newSessionCard.classList.add('hidden'); dom.sessionPanel.classList.remove('hidden'); dom.sessionTitle.textContent = i18n.t('session.title', { game: getGameName(game, i18n.locale) });
  renderEngineEditor(dom.entryPanel, state.activeSession, engine, (key) => alert(localized(key)), i18n, state.activeEditorState, (editorState) => { state.activeEditorState = editorState; });
  showView('new-session', dom.views, dom.tabButtons);
}

async function saveActiveSession() {
  if (!state.activeSession) return;
  if (state.editingSessionId) {
    const parsed = parseParticipants(dom.sessionPlayers.value);
    if (!parsed.valid) return alert(localized(parsed.error));
    if (parsed.participants.length !== state.activeSession.participants.length) return alert(localized('errors.playerCountUnchanged'));
    state.activeSession.participants = state.activeSession.participants.map((participant, index) => ({ ...participant, displayName: parsed.participants[index].displayName }));
  }
  const engine = getScoringEngine(state.activeSession.scoring.engineId);
  const result = finalizeEditor(state.activeSession, engine);
  if (!result.valid) return alert(localized(result.error));
  await sessionRepository.save(state.activeSession);
  closeActiveSession(); await refresh();
  showView('history', dom.views, dom.tabButtons);
}

function closeActiveSession() {
  state.activeSession = null; state.activeEditorState = { draft: {}, editingRoundId: null }; state.editingSessionId = null;
  dom.sessionPanel.classList.add('hidden'); dom.newSessionCard.classList.remove('hidden'); dom.sessionPlayerEditor.classList.add('hidden'); dom.cancelSession.classList.add('hidden'); dom.cancelSessionEdit.classList.add('hidden'); dom.saveSessionButton.textContent = i18n.t('session.save');
}

function editSavedSession(session) {
  state.activeSession = structuredClone(session);
  state.editingSessionId = session.id;
  state.activeEditorState = { draft: {}, editingRoundId: null };
  dom.sessionPlayers.value = session.participants.map((participant) => participant.displayName).join(', ');
  dom.sessionPlayerEditor.classList.remove('hidden'); dom.cancelSession.classList.add('hidden'); dom.cancelSessionEdit.classList.remove('hidden'); dom.newSessionCard.classList.add('hidden'); dom.sessionPanel.classList.remove('hidden');
  const engine = getScoringEngine(state.activeSession.scoring.engineId);
  dom.saveSessionButton.textContent = i18n.t('session.saveChanges');
  renderEngineEditor(dom.entryPanel, state.activeSession, engine, (key) => alert(localized(key)), i18n, state.activeEditorState, (editorState) => { state.activeEditorState = editorState; });
  showView('new-session', dom.views, dom.tabButtons);
  renderDynamic();
}

async function exportSessions() {
  const backup = await exportBackup(localStorage);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'scoresheets-backup.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

async function importSessions(file) {
  let backup;
  try { backup = JSON.parse(await file.text()); } catch { throw new Error('errors.backupInvalid'); }
  const result = await importBackup(localStorage, backup);
  await refresh();
  reportError(i18n.t('backup.importResult', { importedSessions: result.imported.sessions, importedGames: result.imported.games, skippedSessions: result.skipped.sessions, skippedGames: result.skipped.games }));
}

function beginEdit(game) {
  dom.editingGameId.value = game.id; dom.gameName.value = game.name;
  dom.gameCategory.value = game.category ?? ''; dom.playMode.value = game.playMode ?? 'competitive'; state.draftScoreCategories = [...(game.scoreCategories ?? [])]; dom.categoryScoring.value = game.categoryScoring ?? 'per-round'; renderScoreCategoryInputs();
  dom.entryMode.value = game.scoring.engineId; dom.ranking.value = game.scoring.ranking;
  updateGameModeControls();
  dom.gameForm.classList.remove('hidden'); dom.addGame.classList.add('hidden'); dom.saveGame.textContent = i18n.t('games.saveChanges'); dom.cancelEdit.classList.remove('hidden'); dom.gameName.focus();
}

function clearGameForm() {
  dom.gameForm.reset(); dom.editingGameId.value = ''; state.draftScoreCategories = []; renderScoreCategoryInputs(); updateRankingControl(); dom.saveGame.textContent = i18n.t('games.create'); dom.cancelEdit.classList.add('hidden'); dom.gameForm.classList.add('hidden'); dom.addGame.classList.remove('hidden');
}

function openCreateGame() { clearGameForm(); dom.gameForm.classList.remove('hidden'); dom.addGame.classList.add('hidden'); dom.gameName.focus(); }

function renderScoreCategoryInputs() {
  dom.scoreCategories.replaceChildren();
  state.draftScoreCategories.forEach((category, index) => { const row = document.createElement('div'); row.className = 'score-category-row'; const input = document.createElement('input'); input.value = category; input.maxLength = 40; input.setAttribute('aria-label', `${i18n.t('games.scoreCategory')} ${index + 1}`); input.addEventListener('input', () => { state.draftScoreCategories[index] = input.value; }); const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary'; remove.textContent = '−'; remove.title = i18n.t('games.removeScoreCategory'); remove.setAttribute('aria-label', remove.title); remove.addEventListener('click', () => { state.draftScoreCategories.splice(index, 1); renderScoreCategoryInputs(); }); row.append(input, remove); dom.scoreCategories.append(row); });
  dom.categoryScoring.disabled = !state.draftScoreCategories.length;
}

function populateCategoryFilter() {
  const selected = state.gameFilters.category; const categories = [...new Set(state.games.map((game) => game.category?.toLocaleLowerCase()).filter(Boolean))].sort(); dom.categoryFilter.replaceChildren();
  [['', i18n.t('games.allCategories')], ['__uncategorized__', i18n.t('games.uncategorized')], ...categories.map((value) => [value, value])].forEach(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; dom.categoryFilter.append(option); });
  dom.categoryFilter.value = categories.includes(selected) || ['', '__uncategorized__'].includes(selected) ? selected : '';
}

function updateRankingControl() {
  const isWinnerOnly = dom.entryMode.value === 'winner-only';
  dom.ranking.disabled = isWinnerOnly;
  dom.ranking.classList.toggle('hidden', isWinnerOnly);
  dom.rankingLabel.classList.toggle('hidden', isWinnerOnly);
  if (isWinnerOnly) dom.ranking.value = 'selected';
  else if (!['highest', 'lowest'].includes(dom.ranking.value)) dom.ranking.value = 'highest';
}

function updateGameModeControls() {
  const cooperative = dom.playMode.value === 'cooperative';
  if (cooperative) dom.entryMode.value = 'winner-only';
  dom.entryMode.disabled = cooperative;
  document.getElementById('score-categories-fieldset').classList.toggle('hidden', dom.entryMode.value === 'winner-only');
  if (dom.entryMode.value === 'round-sum') dom.categoryScoring.value = 'per-round';
  if (dom.entryMode.value === 'final-total') dom.categoryScoring.value = 'final-total';
  dom.categoryScoring.classList.toggle('hidden', cooperative || !state.draftScoreCategories.length);
  dom.categoryScoring.disabled = cooperative || !state.draftScoreCategories.length;
  updateRankingControl();
}

dom.gameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  run(async () => {
    const data = { name: dom.gameName.value, category: dom.gameCategory.value, playMode: dom.playMode.value, scoreCategories: state.draftScoreCategories, categoryScoring: dom.categoryScoring.value, scoring: { engineId: dom.entryMode.value, ranking: dom.entryMode.value === 'winner-only' ? 'selected' : dom.ranking.value } };
    if (dom.editingGameId.value) await gameRepository.update(dom.editingGameId.value, data); else await gameRepository.create(data);
    clearGameForm(); await refresh();
  });
});
dom.cancelEdit.addEventListener('click', clearGameForm);
dom.addGame.addEventListener('click', openCreateGame);
dom.addScoreCategory.addEventListener('click', () => { state.draftScoreCategories.push(''); renderScoreCategoryInputs(); });
dom.gameSearch.addEventListener('input', () => { state.gameFilters.query = dom.gameSearch.value; renderDynamic(); });
dom.categoryFilter.addEventListener('change', () => { state.gameFilters.category = dom.categoryFilter.value; renderDynamic(); });
dom.entryMode.addEventListener('change', updateGameModeControls);
dom.playMode.addEventListener('change', updateGameModeControls);
wireTabNavigation(dom.tabButtons, dom.views, (nextView) => {
  if (nextView === 'new-session' && !state.activeSession) dom.newSessionCard.classList.remove('hidden');
  showView(nextView, dom.views, dom.tabButtons);
});
dom.startButton.addEventListener('click', startSession);
dom.saveSessionButton.addEventListener('click', () => run(saveActiveSession));
dom.cancelSession.addEventListener('click', () => {
  if (!confirm(i18n.t('session.cancelConfirm'))) return;
  closeActiveSession(); showView('new-session', dom.views, dom.tabButtons);
});
dom.cancelSessionEdit.addEventListener('click', () => { closeActiveSession(); showView('history', dom.views, dom.tabButtons); });
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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => { /* The app works without offline support. */ });
showView('home', dom.views, dom.tabButtons);
