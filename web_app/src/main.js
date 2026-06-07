import { loadSessions, saveSessions } from './state/store.js';
import { parsePlayers } from './utils/players.js';
import { showView, wireTabNavigation } from './ui/navigation.js';
import { renderHomeSummary } from './ui/home.js';
import { renderSavedSessions } from './ui/history.js';
import { collectRegenwormenTotals, renderRegenwormenEntry, renderTake5Entry } from './ui/session-form.js';
import { getAllGames, getGameById, getGameType } from './data/games.js';

const dom = {
  gameSelect: document.getElementById('game'),
  playersInput: document.getElementById('players'),
  startButton: document.getElementById('start-session'),
  saveSessionButton: document.getElementById('save-session'),
  sessionPanel: document.getElementById('session-panel'),
  sessionTitle: document.getElementById('session-title'),
  entryPanel: document.getElementById('entry-panel'),
  savedList: document.getElementById('saved-list'),
  homeSummary: document.getElementById('home-summary'),
  tabButtons: document.querySelectorAll('.tab'),
  views: {
    home: document.getElementById('view-home'),
    'new-session': document.getElementById('view-new-session'),
    history: document.getElementById('view-history'),
  },
};

const state = {
  activeSession: null,
};

function refreshSummaryAndHistory() {
  const sessions = loadSessions();

  renderSavedSessions(dom.savedList, sessions, (index) => {
    const nextSessions = loadSessions();
    nextSessions.splice(index, 1);
    saveSessions(nextSessions);
    refreshSummaryAndHistory();
  });

  renderHomeSummary(dom.homeSummary, sessions);
}

function startSession() {
  const players = parsePlayers(dom.playersInput.value);
  if (players.length < 2) {
    alert('Enter at least 2 players.');
    return;
  }

  const gameId = dom.gameSelect.value;
  const game = getGameById(gameId);

  if (!game) {
    alert('Invalid game selected.');
    return;
  }

  state.activeSession = {
    gameId,
    gameName: game.name,
    gameType: game.type,
    players,
    rounds: [],
    totals: {},
    createdAt: new Date().toISOString(),
  };

  dom.sessionPanel.classList.remove('hidden');
  dom.sessionTitle.textContent = `${game.name} session`;

  if (game.type === 'per-round') {
    renderTake5Entry(dom.entryPanel, state);
  } else if (game.type === 'final-total') {
    renderRegenwormenEntry(dom.entryPanel, players);
  }

  showView('new-session', dom.views, dom.tabButtons);
}

function saveActiveSession() {
  if (!state.activeSession) {
    return;
  }

  if (state.activeSession.gameType === 'final-total') {
    const { valid, totals } = collectRegenwormenTotals(dom.entryPanel);

    if (!valid) {
      alert('Please type a number for each player.');
      return;
    }

    state.activeSession.totals = totals;
  }

  if (state.activeSession.gameType === 'per-round' && state.activeSession.rounds.length === 0) {
    alert('Add at least one round before saving.');
    return;
  }

  const sessions = loadSessions();
  sessions.unshift(state.activeSession);
  saveSessions(sessions);

  state.activeSession = null;
  dom.sessionPanel.classList.add('hidden');
  refreshSummaryAndHistory();
  showView('history', dom.views, dom.tabButtons);
}

wireTabNavigation(dom.tabButtons, dom.views, (nextView) => {
  showView(nextView, dom.views, dom.tabButtons);
});

dom.startButton.addEventListener('click', startSession);

dom.saveSessionButton.addEventListener('click', saveActiveSession);

// Populate game select from config
getAllGames().forEach((game) => {
  const option = document.createElement('option');
  option.value = game.id;
  option.textContent = `${game.name} (${getGameType(game.type).name})`;
  dom.gameSelect.appendChild(option);
});

refreshSummaryAndHistory();
showView('home', dom.views, dom.tabButtons);
