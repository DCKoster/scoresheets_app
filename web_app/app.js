const STORAGE_KEY = 'scoresheets-web-v1';

const gameSelect = document.getElementById('game');
const playersInput = document.getElementById('players');
const startButton = document.getElementById('start-session');
const saveSessionButton = document.getElementById('save-session');
const sessionPanel = document.getElementById('session-panel');
const sessionTitle = document.getElementById('session-title');
const entryPanel = document.getElementById('entry-panel');
const savedList = document.getElementById('saved-list');

let activeSession = null;

function loadSessions() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function parsePlayers(value) {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function renderSavedSessions() {
  const sessions = loadSessions();
  if (sessions.length === 0) {
    savedList.innerHTML = '<p>No sessions saved yet.</p>';
    return;
  }

  savedList.innerHTML = sessions
    .map((session, index) => {
      const scoreText = Object.entries(session.totals)
        .map(([player, score]) => `${player}: ${score}`)
        .join(' | ');
      return `
        <div class="list-item">
          <strong>${session.gameName}</strong><br>
          <small>${new Date(session.createdAt).toLocaleString()}</small>
          <p>${scoreText}</p>
          <button class="delete" data-index="${index}">Delete</button>
        </div>
      `;
    })
    .join('');

  savedList.querySelectorAll('button.delete').forEach((button) => {
    button.addEventListener('click', () => {
      const idx = Number(button.dataset.index);
      const sessionsNow = loadSessions();
      sessionsNow.splice(idx, 1);
      saveSessions(sessionsNow);
      renderSavedSessions();
    });
  });
}

function renderTake5Entry(players) {
  entryPanel.innerHTML = `
    <p>Add one round at a time. Lower total wins.</p>
    <div id="take5-inputs"></div>
    <button id="add-round">Add round</button>
    <div id="take5-rounds"></div>
    <div id="take5-totals"></div>
  `;

  const inputsContainer = document.getElementById('take5-inputs');
  const roundsContainer = document.getElementById('take5-rounds');
  const totalsContainer = document.getElementById('take5-totals');

  function renderDraftInputs() {
    inputsContainer.innerHTML = players
      .map(
        (player) => `
          <div class="inline-grid">
            <span>${player}</span>
            <input type="number" inputmode="numeric" data-player="${player}" />
          </div>
        `
      )
      .join('');
  }

  function updateTotalsView() {
    const totals = {};
    players.forEach((player) => {
      totals[player] = 0;
    });

    activeSession.rounds.forEach((round) => {
      players.forEach((player) => {
        totals[player] += round[player] ?? 0;
      });
    });

    activeSession.totals = totals;

    const ranking = Object.entries(totals).sort((a, b) => a[1] - b[1]);
    totalsContainer.innerHTML = '<h3>Totals</h3>' + ranking.map(([p, s]) => `<div>${p}: ${s}</div>`).join('');
  }

  function updateRoundsView() {
    roundsContainer.innerHTML =
      '<h3>Rounds</h3>' +
      (activeSession.rounds.length === 0
        ? '<p>No rounds yet.</p>'
        : activeSession.rounds
            .map((round, idx) => `<div>Round ${idx + 1}: ${players.map((p) => `${p} ${round[p]}`).join(' | ')}</div>`)
            .join(''));
  }

  renderDraftInputs();
  updateRoundsView();
  updateTotalsView();

  document.getElementById('add-round').addEventListener('click', () => {
    const nextRound = {};
    let valid = true;

    inputsContainer.querySelectorAll('input').forEach((input) => {
      const player = input.dataset.player;
      const value = Number(input.value);
      if (!player || Number.isNaN(value)) {
        valid = false;
        return;
      }
      nextRound[player] = value;
    });

    if (!valid) {
      alert('Please type a number for each player.');
      return;
    }

    activeSession.rounds.push(nextRound);
    renderDraftInputs();
    updateRoundsView();
    updateTotalsView();
  });
}

function renderPickominoEntry(players) {
  entryPanel.innerHTML = `
    <p>Enter final totals once. Highest total wins.</p>
    <div id="pick-inputs"></div>
  `;

  const inputsContainer = document.getElementById('pick-inputs');
  inputsContainer.innerHTML = players
    .map(
      (player) => `
        <div class="inline-grid">
          <span>${player}</span>
          <input type="number" inputmode="numeric" data-player="${player}" />
        </div>
      `
    )
    .join('');
}

startButton.addEventListener('click', () => {
  const players = parsePlayers(playersInput.value);
  if (players.length < 2) {
    alert('Enter at least 2 players.');
    return;
  }

  const gameId = gameSelect.value;
  const gameName = gameId === 'take-5' ? 'Take 5!' : 'Pick-omino';

  activeSession = {
    gameId,
    gameName,
    players,
    rounds: [],
    totals: {},
    createdAt: new Date().toISOString(),
  };

  sessionPanel.classList.remove('hidden');
  sessionTitle.textContent = `${gameName} session`;

  if (gameId === 'take-5') {
    renderTake5Entry(players);
  } else {
    renderPickominoEntry(players);
  }
});

saveSessionButton.addEventListener('click', () => {
  if (!activeSession) {
    return;
  }

  if (activeSession.gameId === 'pick-omino') {
    const totals = {};
    let valid = true;

    entryPanel.querySelectorAll('input').forEach((input) => {
      const player = input.dataset.player;
      const value = Number(input.value);
      if (!player || Number.isNaN(value)) {
        valid = false;
        return;
      }
      totals[player] = value;
    });

    if (!valid) {
      alert('Please type a number for each player.');
      return;
    }

    activeSession.totals = totals;
  }

  if (activeSession.gameId === 'take-5' && activeSession.rounds.length === 0) {
    alert('Add at least one round before saving.');
    return;
  }

  const sessions = loadSessions();
  sessions.unshift(activeSession);
  saveSessions(sessions);
  activeSession = null;
  sessionPanel.classList.add('hidden');
  renderSavedSessions();
});

renderSavedSessions();
