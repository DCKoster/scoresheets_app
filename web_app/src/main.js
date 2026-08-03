import { findGame } from './data/games.js';
import { getScoringEngine } from './scoring/engines.js';
import { LocalGameRepository, LocalSessionRepository, createId, migrateStorage } from './state/repositories.js';
import { parseParticipants } from './utils/players.js';
import { showView, wireTabNavigation } from './ui/navigation.js';
import { renderHomeSummary } from './ui/home.js';
import { renderSavedSessions } from './ui/history.js';
import { finalizeEditor, renderEngineEditor } from './ui/session-form.js';
import { renderGameManager } from './ui/game-manager.js';

const byId = (id) => document.getElementById(id);
const dom = {
  gameSelect: byId('game'), playersInput: byId('players'), startButton: byId('start-session'),
  saveSessionButton: byId('save-session'), sessionPanel: byId('session-panel'), sessionTitle: byId('session-title'),
  entryPanel: byId('entry-panel'), savedList: byId('saved-list'), homeSummary: byId('home-summary'),
  gamesList: byId('games-list'), gameForm: byId('game-form'), gameName: byId('game-name'),
  entryMode: byId('entry-mode'), ranking: byId('ranking'), editingGameId: byId('editing-game-id'),
  saveGame: byId('save-game'), cancelEdit: byId('cancel-game-edit'), error: byId('app-error'),
  tabButtons: document.querySelectorAll('.tab'),
  views: { home: byId('view-home'), 'new-session': byId('view-new-session'), history: byId('view-history'), games: byId('view-games') },
};
const gameRepository = new LocalGameRepository(localStorage);
const sessionRepository = new LocalSessionRepository(localStorage);
const state = { activeSession: null, games: [], sessions: [] };

function reportError(message) { dom.error.textContent = message; dom.error.classList.toggle('hidden', !message); }

function populateGameSelect() {
  const selected = dom.gameSelect.value;
  dom.gameSelect.replaceChildren();
  state.games.forEach((game) => {
    const option = document.createElement('option'); option.value = game.id;
    option.textContent = `${game.name} (${getScoringEngine(game.scoring.engineId).label})`;
    dom.gameSelect.append(option);
  });
  if (state.games.some((game) => game.id === selected)) dom.gameSelect.value = selected;
}

async function refresh() {
  [state.games, state.sessions] = await Promise.all([gameRepository.list(), sessionRepository.list()]);
  populateGameSelect();
  renderHomeSummary(dom.homeSummary, state.sessions, state.games);
  renderSavedSessions(dom.savedList, state.sessions, state.games, async (id) => { await sessionRepository.delete(id); await refresh(); });
  renderGameManager(dom.gamesList, state.games, {
    duplicate: async (id) => run(async () => { await gameRepository.duplicate(id); await refresh(); }),
    edit: beginEdit,
    delete: async (game) => {
      if (confirm(`Delete “${game.name}”? Saved sessions will remain available.`)) await run(async () => { await gameRepository.delete(game.id); await refresh(); });
    },
  });
}

async function run(action) { try { reportError(''); await action(); } catch (error) { reportError(error.message); } }

function startSession() {
  reportError('');
  const parsed = parseParticipants(dom.playersInput.value);
  if (!parsed.valid) return alert(parsed.error);
  const game = findGame(state.games, dom.gameSelect.value);
  if (!game) return alert('Invalid game selected.');
  const engine = getScoringEngine(game.scoring.engineId);
  state.activeSession = {
    schemaVersion: 2, id: createId('session'), gameId: game.id, gameNameAtPlay: game.name,
    participants: parsed.participants, scoring: { ...game.scoring }, entries: engine.initialEntries(), totals: {}, createdAt: new Date().toISOString(),
  };
  dom.sessionPanel.classList.remove('hidden'); dom.sessionTitle.textContent = `${game.name} session`;
  renderEngineEditor(dom.entryPanel, state.activeSession, engine, (message) => alert(message));
  showView('new-session', dom.views, dom.tabButtons);
}

async function saveActiveSession() {
  if (!state.activeSession) return;
  const engine = getScoringEngine(state.activeSession.scoring.engineId);
  const result = finalizeEditor(state.activeSession, engine);
  if (!result.valid) return alert(result.error);
  await sessionRepository.save(state.activeSession);
  state.activeSession = null; dom.sessionPanel.classList.add('hidden'); await refresh();
  showView('history', dom.views, dom.tabButtons);
}

function beginEdit(game) {
  dom.editingGameId.value = game.id; dom.gameName.value = game.name;
  dom.entryMode.value = game.scoring.engineId; dom.ranking.value = game.scoring.ranking;
  dom.saveGame.textContent = 'Save changes'; dom.cancelEdit.classList.remove('hidden'); dom.gameName.focus();
}

function clearGameForm() {
  dom.gameForm.reset(); dom.editingGameId.value = ''; dom.saveGame.textContent = 'Create game'; dom.cancelEdit.classList.add('hidden');
}

dom.gameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  run(async () => {
    const data = { name: dom.gameName.value, scoring: { engineId: dom.entryMode.value, ranking: dom.ranking.value } };
    if (dom.editingGameId.value) await gameRepository.update(dom.editingGameId.value, data); else await gameRepository.create(data);
    clearGameForm(); await refresh();
  });
});
dom.cancelEdit.addEventListener('click', clearGameForm);
wireTabNavigation(dom.tabButtons, dom.views, (nextView) => showView(nextView, dom.views, dom.tabButtons));
dom.startButton.addEventListener('click', startSession);
dom.saveSessionButton.addEventListener('click', () => run(saveActiveSession));

await run(async () => {
  const migration = await migrateStorage(localStorage);
  if (migration.error) reportError(migration.error);
  await refresh();
});
showView('home', dom.views, dom.tabButtons);
