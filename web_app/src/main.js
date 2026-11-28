import { findGame, getGameName } from './data/games.js';
import { latestCustomItemIds } from './data/mario-kart.js';
import { applyStaticTranslations, createTranslator, resolveLocale, saveLocale } from './i18n.js';
import { getScoringEngine } from './scoring/engines.js';
import { LocalGameRepository, LocalSessionRepository, createId, exportBackup, exportSessionBackup, importBackup, migrateStorage } from './state/repositories.js';
import { GroupGameRepository, GroupRepository, GroupSessionRepository } from './state/cloud.js';
import { blankPlayer, playerPicker, validateGroupPlayers } from './ui/group-players.js';
import { installGroups } from './ui/groups.js';
import { openCopySession } from './ui/copy-session.js';
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
  gameSelect: byId('game'), playersLabel: byId('players-label'), playersInput: byId('players'), playerSuggestions: byId('player-suggestions'), startButton: byId('start-session'),
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
const localGames = new LocalGameRepository(localStorage);
const localSessions = new LocalSessionRepository(localStorage);
let gameRepository = localGames;
let sessionRepository = localSessions;
let group = { repository: null, snapshot: null, account: null, groups: [], online: false };
let newGroupPlayers = [];
let editingGameRevision;
let savingSession = false;
const state = { activeSession: null, activeEditorState: { draft: {}, editingRoundId: null }, editingSessionId: null, games: [], sessions: [], historyGrouped: false, gameFilters: { query: '' }, draftScoreCategories: [], competitiveEntryMode: null };
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
  dom.playersLabel.classList.toggle('hidden', marioKart || Boolean(group.repository));
  dom.playersInput.classList.toggle('hidden', marioKart || Boolean(group.repository));
}

function handleEditorState(engine, editorState, event = {}) {
  state.activeEditorState = editorState;
}

function availablePlayers() {
  return {
    members: (group.snapshot?.members ?? []).filter((part) => !part.status || part.status === 'active'),
  };
}

function renderGroupPlayers() {
  const container = byId('group-players');
  container.classList.toggle('hidden', !group.snapshot);
  if (group.snapshot) playerPicker(container, { ...availablePlayers(), players: newGroupPlayers, onChange: () => {} }, i18n);
  else container.replaceChildren();
}

function renderDynamic(renderEditor = false) {
  populateGameSelect();
  const playerNames = [...new Set(state.sessions.flatMap((session) => (session.participants ?? []).map((participant) => participant.displayName)))].sort((a, b) => a.localeCompare(b));
  const guestNames = group.repository ? [...new Set(state.sessions.flatMap((session) => session.participants ?? [])
    .filter((part) => !part.userId).map((part) => part.displayName))].sort((a, b) => a.localeCompare(b)) : [];
  byId('group-guest-suggestions').replaceChildren(...guestNames.map((name) => {
    const option = document.createElement('option');
    option.value = name;
    return option;
  }));
  dom.playerSuggestions.replaceChildren(...playerNames.map((name) => { const option = document.createElement('option'); option.value = name; return option; }));
  renderHomeSummary(dom.homeSummary, state.sessions, state.games, i18n);
  const canManageGames = !group.repository || (group.online && group.snapshot && group.account?.role === 'owner');
  dom.addGame.classList.toggle('hidden', !canManageGames || !dom.gameForm.classList.contains('hidden'));
  dom.gameForm.querySelectorAll('button[type=submit]').forEach((button) => { button.disabled = !canManageGames; });
  dom.startButton.disabled = Boolean(group.repository && !group.snapshot);
  renderSavedSessions(dom.savedList, state.sessions, state.games, {
    onDelete: (id, session) => run(async () => {
      await sessionRepository.delete(group.repository ? session : id);
      if (group.repository) await groups.changed(); else await refresh();
    }),
    canEdit: (session) => !group.repository || (!session.syncError && (session.createdBy === group.account.id || group.account.role === 'owner')),
    onEdit: editSavedSession,
    onExport: group.repository ? null : () => run(exportSessions),
    onExportSession: group.repository ? null : (sessionId) => run(() => exportSavedSession(sessionId)),
    onImport: group.repository ? null : (file) => run(() => importSessions(file)),
    onCopy: !group.repository && group.account && group.groups.length ? copyLocalSession : null,
  }, i18n, state.historyGrouped, (grouped) => {
    state.historyGrouped = grouped;
    renderDynamic();
  });
  renderStatistics(dom.statistics, state.sessions, state.games, i18n);
  renderGameManager(dom.gamesList, state.games, canManageGames ? {
    duplicate: async (id) => run(async () => {
      const copyName = (name, number) => i18n.t(number === 1 ? 'games.copy' : 'games.copyNumber', { name, number });
      await gameRepository.duplicate(id, i18n.locale, copyName); if (group.repository) await groups.sync(); else await refresh();
    }),
    edit: beginEdit,
    delete: async (game) => {
      if (confirm(i18n.t('games.deleteConfirm', { game: getGameName(game, i18n.locale) }))) await run(async () => { await gameRepository.delete(game.id, game.revision); if (group.repository) await groups.sync(); else await refresh(); });
    },
  } : {}, i18n, state.gameFilters);
  if (dom.editingGameId.value) dom.saveGame.textContent = i18n.t('games.saveChanges');
  if (renderEditor && state.activeSession) {
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
  const games = gameRepository;
  const sessions = sessionRepository;
  const result = await Promise.all([games.list(), sessions.list()]);
  if (games !== gameRepository || sessions !== sessionRepository) return;
  [state.games, state.sessions] = result;
  renderDynamic();
}

async function run(action) { try { reportError(''); await action(); } catch (error) { reportError(localized(error.message, error.parameters)); } }

function startSession() {
  reportError('');
  const selectedGame = findGame(state.games, dom.gameSelect.value);
  if (group.repository && !group.snapshot) return;
  const parsed = group.repository ? validateGroupPlayers(newGroupPlayers)
    : isMarioKart(selectedGame) ? { valid: true, participants: [] } : parseParticipants(dom.playersInput.value);
  if (!parsed.valid) return alert(localized(parsed.error));
  const game = selectedGame;
  if (!game) return alert(localized('errors.gameInvalid'));
  const engine = getScoringEngine(game.scoring.engineId);
  state.activeSession = {
    schemaVersion: 3, id: createId('session'), gameId: game.id, ...(group.repository ? { gameRevision: game.revision ?? null, locale: i18n.locale } : {}), gameNameAtPlay: getGameName(game, i18n.locale), playMode: game.playMode,
    scoreCategories: [...(game.scoreCategories ?? [])], categoryScoring: game.categoryScoring, participants: parsed.participants, scoring: { ...game.scoring }, entries: engine.initialEntries(), totals: {}, categoryTotals: {}, createdAt: new Date().toISOString(),
  };
  state.activeEditorState = { draft: {}, editingRoundId: null, marioAvailablePlayers: historicalMarioKartPlayers(), marioFixedRoster: Boolean(group.repository), marioCustomItemIds: latestCustomItemIds(state.sessions) }; state.editingSessionId = null;
  dom.sessionPlayerEditor.classList.add('hidden'); dom.cancelSession.classList.remove('hidden'); dom.cancelSessionEdit.classList.add('hidden');
  dom.saveSessionButton.textContent = i18n.t('session.save');
  dom.newSessionCard.classList.add('hidden'); dom.sessionPanel.classList.remove('hidden'); dom.sessionTitle.textContent = i18n.t('session.title', { game: getGameName(game, i18n.locale) });
  const editor = engine.id === 'mario-kart-8' ? renderMarioKartEditor : renderEngineEditor;
  editor(dom.entryPanel, state.activeSession, engine, (key) => alert(localized(key)), i18n, state.activeEditorState, (editorState, event) => handleEditorState(engine, editorState, event));
  showView('new-session', dom.views, dom.tabButtons);
}

async function saveActiveSession() {
  if (!state.activeSession || savingSession) return;
  const active = state.activeSession;
  const repository = sessionRepository;
  if (state.editingSessionId) {
    const parsed = group.repository ? validateGroupPlayers(active.participants) : parseParticipants(dom.sessionPlayers.value);
    if (!parsed.valid) return alert(localized(parsed.error));
    if (parsed.participants.length !== active.participants.length) return alert(localized('errors.playerCountUnchanged'));
    active.participants = group.repository ? parsed.participants : active.participants.map((participant, index) => ({ ...participant, displayName: parsed.participants[index].displayName }));
  }
  const result = finalizeEditor(active, getScoringEngine(active.scoring.engineId));
  if (!result.valid) return alert(localized(result.error));
  savingSession = true;
  dom.saveSessionButton.disabled = true;
  try {
    await repository.save(active);
    if (state.activeSession !== active) return;
    closeActiveSession();
    if (group.repository) await groups.changed(); else await refresh();
    showView('history', dom.views, dom.tabButtons);
  } finally {
    savingSession = false;
    dom.saveSessionButton.disabled = false;
  }
}

function closeActiveSession() {
  byId('group-edit-players').classList.add('hidden');
  byId('group-edit-players').replaceChildren();
  state.activeSession = null; state.activeEditorState = { draft: {}, editingRoundId: null }; state.editingSessionId = null;
  dom.sessionPanel.classList.add('hidden'); dom.newSessionCard.classList.remove('hidden'); dom.sessionPlayerEditor.classList.add('hidden'); dom.cancelSession.classList.add('hidden'); dom.cancelSessionEdit.classList.add('hidden'); dom.saveSessionButton.textContent = i18n.t('session.save');
}

function editSavedSession(session) {
  state.activeSession = structuredClone(session);
  state.editingSessionId = session.id;
  state.activeEditorState = { draft: {}, editingRoundId: null, marioAvailablePlayers: historicalMarioKartPlayers(), marioFixedRoster: Boolean(group.repository) };
  dom.sessionPlayers.value = session.participants.map((participant) => participant.displayName).join(', ');
  dom.sessionPlayerEditor.classList.toggle('hidden', Boolean(group.repository));
  if (group.repository) {
    const container = byId('group-edit-players');
    container.classList.remove('hidden');
    playerPicker(container, {
      ...availablePlayers(), players: state.activeSession.participants, fixed: true,
      onChange: () => renderDynamic(true),
    }, i18n);
  }
  dom.cancelSession.classList.add('hidden'); dom.cancelSessionEdit.classList.remove('hidden'); dom.newSessionCard.classList.add('hidden'); dom.sessionPanel.classList.remove('hidden');
  const engine = getScoringEngine(state.activeSession.scoring.engineId);
  dom.saveSessionButton.textContent = i18n.t('session.saveChanges');
  const editor = engine.id === 'mario-kart-8' ? renderMarioKartEditor : renderEngineEditor;
  editor(dom.entryPanel, state.activeSession, engine, (key) => alert(localized(key)), i18n, state.activeEditorState, (editorState, event) => handleEditorState(engine, editorState, event));
  showView('new-session', dom.views, dom.tabButtons);
  renderDynamic();
}

function copyLocalSession(session) {
  const accountId = group.account.id;
  openCopySession(session, group.groups, {
    i18n,
    repository: (groupId) => new GroupRepository(accountId, groupId),
    viewHistory: (groupId) => run(async () => {
      if (group.account?.id !== accountId) throw new Error('cloud.signInRequired');
      if (!group.groups.some(({ id }) => id === groupId)) throw new Error('cloud.membershipRequired');
      await groups.select(groupId);
      showView('history', dom.views, dom.tabButtons);
    }),
  });
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
  editingGameRevision = game.revision;
  dom.editingGameId.value = game.id; dom.gameName.value = game.name;
  dom.playMode.value = game.playMode ?? 'competitive'; state.competitiveEntryMode = null; state.draftScoreCategories = [...(game.scoreCategories ?? [])]; dom.categoryScoring.value = game.categoryScoring ?? 'per-round'; renderScoreCategoryInputs();
  dom.entryMode.value = game.scoring.engineId; dom.ranking.value = game.scoring.ranking;
  updateGameModeControls();
  dom.gameForm.classList.remove('hidden'); dom.addGame.classList.add('hidden'); dom.saveGame.textContent = i18n.t('games.saveChanges'); dom.cancelEdit.classList.remove('hidden'); dom.gameName.focus();
}

function clearGameForm() {
  editingGameRevision = undefined;
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
    const data = { revision: editingGameRevision, name: dom.gameName.value, playMode: dom.playMode.value, scoreCategories: state.draftScoreCategories, categoryScoring: dom.categoryScoring.value, scoring: { engineId: dom.entryMode.value, ranking: dom.entryMode.value === 'winner-only' ? 'selected' : dom.ranking.value } };
    if (dom.editingGameId.value) await gameRepository.update(dom.editingGameId.value, data); else await gameRepository.create(data);
    clearGameForm(); if (group.repository) await groups.sync(); else await refresh();
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
  renderGroupPlayers();
  groups.draw();
  renderDynamic(true);
});

const groups = installGroups({
  i18n: () => i18n,
  report: (error) => reportError(localized(error)),
  canSwitch: () => !savingSession && (!state.activeSession || confirm(i18n.t('session.cancelConfirm'))),
  async show(context) {
    const previous = group;
    group = context;
    const switched = previous.repository?.groupId !== group.repository?.groupId
      || previous.repository?.accountId !== group.repository?.accountId;
    if (switched) {
      closeActiveSession();
      clearGameForm();
      state.sessions = [];
      state.games = [];
      dom.playersInput.value = '';
      newGroupPlayers = [blankPlayer(), blankPlayer()];
      gameRepository = group.repository ? new GroupGameRepository(group.repository) : localGames;
      sessionRepository = group.repository ? new GroupSessionRepository(group.repository) : localSessions;
      renderDynamic();
    }
    if (switched || JSON.stringify(previous.snapshot?.members) !== JSON.stringify(group.snapshot?.members)) renderGroupPlayers();
    await refresh();
  },
});

await run(async () => {
  applyStaticTranslations(document, i18n);
  updateLanguageButton();
  const migration = await migrateStorage(localStorage);
  if (migration.error) reportError(localized(migration.error, migration.parameters));
  await groups.start();
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => { /* The app works without offline support. */ });
showView('home', dom.views, dom.tabButtons);
