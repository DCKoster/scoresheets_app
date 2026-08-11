import { findGame, getGameName } from './data/games.js';
import { applyStaticTranslations, createTranslator, resolveLocale, saveLocale } from './i18n.js';
import { getScoringEngine } from './scoring/engines.js';
import { LocalGameRepository, LocalSessionRepository, createId, exportBackup, exportSessionBackup, importBackup, migrateStorage } from './state/repositories.js';
import { parseParticipants } from './utils/players.js';
import { showView, wireTabNavigation } from './ui/navigation.js';
import { renderHomeSummary } from './ui/home.js';
import { renderSavedSessions } from './ui/history.js';
import { renderStatistics } from './ui/statistics.js';
import { finalizeEditor, renderEngineEditor } from './ui/session-form.js';
import { renderGameManager } from './ui/game-manager.js';
import { renderMarioKartEditor } from './ui/mario-kart.js';

const byId = (id) => document.getElementById(id);
const dom = {
  gameSelect: byId('game'), playersLabel: byId('players-label'), playersInput: byId('players'), playerSuggestions: byId('player-suggestions'), targetRaces: byId('target-races'), targetRacesLabel: byId('target-races-label'), startButton: byId('start-session'),
  saveSessionButton: byId('save-session'), cancelSession: byId('cancel-session'), cancelSessionEdit: byId('cancel-session-edit'), sessionPlayerEditor: byId('session-player-editor'), sessionPlayers: byId('session-players'), sessionPanel: byId('session-panel'), sessionTitle: byId('session-title'),
  newSessionCard: byId('new-session-card'),
  entryPanel: byId('entry-panel'), savedList: byId('saved-list'), homeSummary: byId('home-summary'),
  statistics: byId('statistics'),
  gamesList: byId('games-list'), gameForm: byId('game-form'), gameName: byId('game-name'),
  addGame: byId('add-game'), playMode: byId('play-mode'), scoreCategories: byId('score-categories'), addScoreCategory: byId('add-score-category'), categoryScoring: byId('category-scoring'), gameSearch: byId('game-search'),
  entryMode: byId('entry-mode'), ranking: byId('ranking'), rankingLabel: byId('ranking-label'), editingGameId: byId('editing-game-id'),
  saveGame: byId('save-game'), cancelEdit: byId('cancel-game-edit'), error: byId('app-error'),
  language: byId('language'),
  tabButtons: document.querySelectorAll('.tab'),
  views: { home: byId('view-home'), 'new-session': byId('view-new-session'), history: byId('view-history'), statistics: byId('view-statistics'), games: byId('view-games') },
};
const gameRepository = new LocalGameRepository(localStorage);
const sessionRepository = new LocalSessionRepository(localStorage);
const state = { activeSession: null, activeEditorState: { draft: {}, editingRoundId: null }, editingSessionId: null, games: [], sessions: [], historyGrouped: false, gameFilters: { query: '' }, draftScoreCategories: [], competitiveEntryMode: null, autoSavingSession: false };
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
  updateTargetRacesVisibility();
}

function isMarioKart(game) { return game?.scoring?.engineId === 'mario-kart-8'; }

function historicalMarioKartPlayers() {
  return [...new Set(state.sessions
    .filter((session) => session.scoring?.engineId === 'mario-kart-8')
    .flatMap((session) => (session.participants ?? []).map((participant) => participant.displayName)))];
}

function updateTargetRacesVisibility() {
  const marioKart = isMarioKart(findGame(state.games, dom.gameSelect.value));
  dom.targetRaces.classList.toggle('hidden', !marioKart);
  dom.targetRacesLabel.classList.toggle('hidden', !marioKart);
  dom.playersLabel.classList.toggle('hidden', marioKart);
  dom.playersInput.classList.toggle('hidden', marioKart);
}

function handleEditorState(engine, editorState, event = {}) {
  state.activeEditorState = editorState;
  const sessionComplete = engine.id === 'mario-kart-8'
    && !state.editingSessionId
    && state.activeSession
    && state.activeSession.entries.races.length >= Number(state.activeSession.targetRaces);
  if (sessionComplete && !state.autoSavingSession) {
    state.autoSavingSession = true;
    void run(async () => { try { await saveActiveSession(); } finally { state.autoSavingSession = false; } });
  }
}

function renderDynamic() {
  populateGameSelect();
  const playerNames = [...new Set(state.sessions.flatMap((session) => (session.participants ?? []).map((participant) => participant.displayName)))].sort((a, b) => a.localeCompare(b));
  dom.playerSuggestions.replaceChildren(...playerNames.map((name) => { const option = document.createElement('option'); option.value = name; return option; }));
  renderHomeSummary(dom.homeSummary, state.sessions, state.games, i18n);
  renderSavedSessions(dom.savedList, state.sessions, state.games, {
    onDelete: async (id) => { await sessionRepository.delete(id); await refresh(); },
    onEdit: editSavedSession,
    onExport: () => run(exportSessions),
    onExportSession: (sessionId) => run(() => exportSavedSession(sessionId)),
    onImport: (file) => run(() => importSessions(file)),
  }, i18n, state.historyGrouped, (grouped) => {
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
  }, i18n, state.gameFilters);
  if (dom.editingGameId.value) dom.saveGame.textContent = i18n.t('games.saveChanges');
  if (state.activeSession) {
    const game = findGame(state.games, state.activeSession.gameId);
    const gameName = game ? getGameName(game, i18n.locale) : state.activeSession.gameNameAtPlay;
    dom.sessionTitle.textContent = i18n.t('session.title', { game: gameName });
    const engine = getScoringEngine(state.activeSession.scoring.engineId);
    const editor = engine.id === 'mario-kart-8' ? renderMarioKartEditor : renderEngineEditor;
    editor(dom.entryPanel, state.activeSession, engine, (key) => alert(localized(key)), i18n, state.activeEditorState, (editorState, event) => handleEditorState(engine, editorState, event));
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
  const selectedGame = findGame(state.games, dom.gameSelect.value);
  const parsed = isMarioKart(selectedGame) ? { valid: true, participants: [] } : parseParticipants(dom.playersInput.value);
  if (!parsed.valid) return alert(localized(parsed.error));
  const game = selectedGame;
  if (!game) return alert(localized('errors.gameInvalid'));
  const targetRaces = isMarioKart(game) ? Number(dom.targetRaces.value) : undefined;
  if (isMarioKart(game) && (!Number.isInteger(targetRaces) || targetRaces < 1 || targetRaces > 99)) return alert(localized('errors.marioKartTargetRaces'));
  const engine = getScoringEngine(game.scoring.engineId);
  state.activeSession = {
    schemaVersion: 3, id: createId('session'), gameId: game.id, gameNameAtPlay: getGameName(game, i18n.locale), playMode: game.playMode, ...(isMarioKart(game) ? { targetRaces } : {}),
    scoreCategories: [...(game.scoreCategories ?? [])], categoryScoring: game.categoryScoring, participants: parsed.participants, scoring: { ...game.scoring }, entries: engine.initialEntries(), totals: {}, categoryTotals: {}, createdAt: new Date().toISOString(),
  };
  state.activeEditorState = { draft: {}, editingRoundId: null, marioAvailablePlayers: historicalMarioKartPlayers() }; state.editingSessionId = null;
  dom.sessionPlayerEditor.classList.add('hidden'); dom.cancelSession.classList.remove('hidden'); dom.cancelSessionEdit.classList.add('hidden');
  dom.saveSessionButton.textContent = i18n.t('session.save');
  dom.newSessionCard.classList.add('hidden'); dom.sessionPanel.classList.remove('hidden'); dom.sessionTitle.textContent = i18n.t('session.title', { game: getGameName(game, i18n.locale) });
  const editor = engine.id === 'mario-kart-8' ? renderMarioKartEditor : renderEngineEditor;
  editor(dom.entryPanel, state.activeSession, engine, (key) => alert(localized(key)), i18n, state.activeEditorState, (editorState, event) => handleEditorState(engine, editorState, event));
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
  state.activeEditorState = { draft: {}, editingRoundId: null, marioAvailablePlayers: historicalMarioKartPlayers() };
  dom.sessionPlayers.value = session.participants.map((participant) => participant.displayName).join(', ');
  dom.sessionPlayerEditor.classList.remove('hidden'); dom.cancelSession.classList.add('hidden'); dom.cancelSessionEdit.classList.remove('hidden'); dom.newSessionCard.classList.add('hidden'); dom.sessionPanel.classList.remove('hidden');
  const engine = getScoringEngine(state.activeSession.scoring.engineId);
  dom.saveSessionButton.textContent = i18n.t('session.saveChanges');
  const editor = engine.id === 'mario-kart-8' ? renderMarioKartEditor : renderEngineEditor;
  editor(dom.entryPanel, state.activeSession, engine, (key) => alert(localized(key)), i18n, state.activeEditorState, (editorState, event) => handleEditorState(engine, editorState, event));
  showView('new-session', dom.views, dom.tabButtons);
  renderDynamic();
}

async function exportSessions() {
  const backup = await exportBackup(localStorage);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'scoresheets-backup.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

async function exportSavedSession(sessionId) {
  const backup = await exportSessionBackup(localStorage, sessionId);
  const session = backup.sessions[0];
  const game = session ? findGame(state.games, session.gameId) : null;
  const filename = `${getGameName(game, 'en').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game'}-session-${sessionId}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click();
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
  dom.playMode.value = game.playMode ?? 'competitive'; state.competitiveEntryMode = null; state.draftScoreCategories = [...(game.scoreCategories ?? [])]; dom.categoryScoring.value = game.categoryScoring ?? 'per-round'; renderScoreCategoryInputs();
  dom.entryMode.value = game.scoring.engineId; dom.ranking.value = game.scoring.ranking;
  updateGameModeControls();
  dom.gameForm.classList.remove('hidden'); dom.addGame.classList.add('hidden'); dom.saveGame.textContent = i18n.t('games.saveChanges'); dom.cancelEdit.classList.remove('hidden'); dom.gameName.focus();
}

function clearGameForm() {
  dom.gameForm.reset(); dom.editingGameId.value = ''; state.competitiveEntryMode = null; state.draftScoreCategories = []; renderScoreCategoryInputs(); updateRankingControl(); dom.saveGame.textContent = i18n.t('games.create'); dom.cancelEdit.classList.add('hidden'); dom.gameForm.classList.add('hidden'); dom.addGame.classList.remove('hidden');
}

function openCreateGame() { clearGameForm(); dom.gameForm.classList.remove('hidden'); dom.addGame.classList.add('hidden'); dom.gameName.focus(); }

function renderScoreCategoryInputs() {
  dom.scoreCategories.replaceChildren();
  state.draftScoreCategories.forEach((category, index) => { const row = document.createElement('div'); row.className = 'score-category-row'; const input = document.createElement('input'); input.value = category; input.maxLength = 40; input.setAttribute('aria-label', `${i18n.t('games.scoreCategory')} ${index + 1}`); input.addEventListener('input', () => { state.draftScoreCategories[index] = input.value; }); const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary'; remove.textContent = '−'; remove.title = i18n.t('games.removeScoreCategory'); remove.setAttribute('aria-label', remove.title); remove.addEventListener('click', () => { state.draftScoreCategories.splice(index, 1); renderScoreCategoryInputs(); }); row.append(input, remove); dom.scoreCategories.append(row); });
  dom.categoryScoring.disabled = !state.draftScoreCategories.length;
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
  if (cooperative) {
    if (dom.entryMode.value !== 'winner-only') state.competitiveEntryMode = dom.entryMode.value;
    dom.entryMode.value = 'winner-only';
  } else if (dom.entryMode.value === 'winner-only' && state.competitiveEntryMode) {
    dom.entryMode.value = state.competitiveEntryMode;
  }
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
    const data = { name: dom.gameName.value, playMode: dom.playMode.value, scoreCategories: state.draftScoreCategories, categoryScoring: dom.categoryScoring.value, scoring: { engineId: dom.entryMode.value, ranking: dom.entryMode.value === 'winner-only' ? 'selected' : dom.ranking.value } };
    if (dom.editingGameId.value) await gameRepository.update(dom.editingGameId.value, data); else await gameRepository.create(data);
    clearGameForm(); await refresh();
  });
});
dom.cancelEdit.addEventListener('click', clearGameForm);
dom.addGame.addEventListener('click', openCreateGame);
dom.addScoreCategory.addEventListener('click', () => { state.draftScoreCategories.push(''); renderScoreCategoryInputs(); });
dom.gameSearch.addEventListener('input', () => { state.gameFilters.query = dom.gameSearch.value; renderDynamic(); });
dom.entryMode.addEventListener('change', updateGameModeControls);
dom.playMode.addEventListener('change', updateGameModeControls);
wireTabNavigation(dom.tabButtons, dom.views, (nextView) => {
  reportError('');
  if (nextView === 'new-session' && !state.activeSession) dom.newSessionCard.classList.remove('hidden');
  showView(nextView, dom.views, dom.tabButtons);
});
dom.startButton.addEventListener('click', startSession);
dom.gameSelect.addEventListener('change', updateTargetRacesVisibility);
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
