import { getGameName } from '../data/games.js';

/**
 * Participant ids belong to one saved session only. A normalized display name
 * is therefore the best available identity for local, cross-session stats.
 */
export function normalizePlayerName(name) {
  return String(name ?? '').trim().toLocaleLowerCase();
}

function scoreFor(session, participant) {
  const score = Number(session?.totals?.[participant.id]);
  return Number.isFinite(score) ? score : null;
}

function winnerScore(scores, ranking) {
  if (!scores.length) return null;
  return ranking === 'lowest'
    ? Math.min(...scores.map((item) => item.score))
    : Math.max(...scores.map((item) => item.score));
}

function makeSummary(key, displayName) {
  return { key, displayName, gamesPlayed: 0, wins: 0, totalScore: 0, scoreCount: 0, averageScore: null, winRate: 0, games: new Map() };
}

function addResult(summary, game, score, won) {
  summary.gamesPlayed += 1;
  if (Number.isFinite(score)) {
    summary.totalScore += score;
    summary.scoreCount += 1;
  }
  if (won) summary.wins += 1;

  let gameSummary = summary.games.get(game.id);
  if (!gameSummary) {
    gameSummary = { gameId: game.id, gameNameAtPlay: game.name, gamesPlayed: 0, wins: 0, totalScore: 0, scoreCount: 0, averageScore: null, winRate: 0 };
    summary.games.set(game.id, gameSummary);
  }
  gameSummary.gamesPlayed += 1;
  if (Number.isFinite(score)) {
    gameSummary.totalScore += score;
    gameSummary.scoreCount += 1;
  }
  if (won) gameSummary.wins += 1;
}

function finishSummary(summary) {
  return {
    ...summary,
    averageScore: summary.scoreCount ? summary.totalScore / summary.scoreCount : null,
    winRate: summary.wins / summary.gamesPlayed,
    games: [...summary.games.values()].map((game) => ({
      ...game,
      averageScore: game.scoreCount ? game.totalScore / game.scoreCount : null,
      winRate: game.wins / game.gamesPlayed,
    })).sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.gameNameAtPlay.localeCompare(b.gameNameAtPlay)),
  };
}

function sortStandings(players) {
  return players.sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.gamesPlayed - a.gamesPlayed || a.displayName.localeCompare(b.displayName));
}

/**
 * Return a display-ready, data-only summary of saved sessions.
 * A tied best score counts as a win for every tied participant.
 */
export function calculateStatistics(sessions = []) {
  const players = new Map();
  const games = new Map();

  for (const session of sessions) {
    if (!Array.isArray(session?.participants)) continue;
    const game = { id: String(session.gameId ?? session.gameNameAtPlay ?? ''), name: session.gameNameAtPlay || session.gameId || '' };
    const ensureGame = () => {
      let gameSummary = games.get(game.id);
      if (!gameSummary) {
        gameSummary = { gameId: game.id, gameNameAtPlay: game.name, sessionCount: 0, players: new Map() };
        games.set(game.id, gameSummary);
      }
      gameSummary.sessionCount += 1;
      return gameSummary;
    };

    if (session.scoring?.engineId === 'winner-only') {
      const participants = session.participants.filter((participant) => normalizePlayerName(participant?.displayName));
      const winnerId = session.entries?.winnerId;
      if (!Object.hasOwn(session.entries ?? {}, 'winnerId') || (winnerId !== null && !participants.some((participant) => participant.id === winnerId))) continue;
      const gameSummary = ensureGame();
      for (const participant of participants) {
        const key = normalizePlayerName(participant.displayName);
        let summary = players.get(key);
        if (!summary) {
          summary = makeSummary(key, String(participant.displayName).trim());
          players.set(key, summary);
        }
        const won = participant.id === winnerId;
        addResult(summary, game, null, won);

        let gamePlayer = gameSummary.players.get(key);
        if (!gamePlayer) {
          gamePlayer = makeSummary(key, String(participant.displayName).trim());
          gameSummary.players.set(key, gamePlayer);
        }
        addResult(gamePlayer, game, null, won);
      }
      continue;
    }

    const scores = session.participants
      .map((participant) => ({ participant, score: scoreFor(session, participant) }))
      .filter(({ participant, score }) => normalizePlayerName(participant?.displayName) && score !== null);
    const winningScore = winnerScore(scores, session?.scoring?.ranking);
    if (winningScore === null) continue;

    const gameSummary = ensureGame();
    for (const { participant, score } of scores) {
      const key = normalizePlayerName(participant.displayName);
      let summary = players.get(key);
      if (!summary) {
        summary = makeSummary(key, String(participant.displayName).trim());
        players.set(key, summary);
      }
      addResult(summary, game, score, score === winningScore);

      let gamePlayer = gameSummary.players.get(key);
      if (!gamePlayer) {
        gamePlayer = makeSummary(key, String(participant.displayName).trim());
        gameSummary.players.set(key, gamePlayer);
      }
      addResult(gamePlayer, game, score, score === winningScore);
    }
  }

  const result = sortStandings([...players.values()].map(finishSummary));
  const gameResults = [...games.values()].map((game) => ({
    gameId: game.gameId,
    gameNameAtPlay: game.gameNameAtPlay,
    sessionCount: game.sessionCount,
    players: sortStandings([...game.players.values()].map((player) => {
      const result = finishSummary(player);
      return { key: result.key, displayName: result.displayName, gamesPlayed: result.gamesPlayed, wins: result.wins, winRate: result.winRate, averageScore: result.averageScore };
    })),
  })).sort((a, b) => b.sessionCount - a.sessionCount || a.gameNameAtPlay.localeCompare(b.gameNameAtPlay));

  return { sessionCount: sessions.length, gameCount: gameResults.length, players: result, games: gameResults };
}

// A descriptive alias for callers that only need player-level results.
export const calculatePlayerStatistics = (sessions = []) => calculateStatistics(sessions).players;

function node(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function formatPercent(value, locale) {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);
}

function formatScore(value, locale) {
  return value === null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function currentGameName(gameId, savedName, games, locale) {
  const game = games.find((item) => item.id === gameId);
  return game ? getGameName(game, locale) : savedName;
}

function renderLeaderboard(container, players, i18n, showGameDetails = false, games = [], showAverageScore = false) {
  const table = node('table', '', 'statistics-leaderboard');
  const caption = node('caption', i18n.t('statistics.leaderboard'));
  const header = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const headers = [i18n.t('statistics.rank'), i18n.t('statistics.player'), i18n.t('statistics.wins'), i18n.t('statistics.winRate'), i18n.t('statistics.gamesPlayed')];
  if (showAverageScore) headers.push(i18n.t('statistics.averageScore'));
  headers.forEach((label) => headerRow.append(node('th', label)));
  header.append(headerRow);
  table.append(caption, header);

  const body = document.createElement('tbody');
  players.forEach((player, index) => {
    const row = document.createElement('tr');
    const values = [index + 1, player.displayName, player.wins, formatPercent(player.winRate, i18n.locale), player.gamesPlayed];
    if (showAverageScore) values.push(formatScore(player.averageScore, i18n.locale));
    values.forEach((value, cellIndex) => {
      const cell = node('td', String(value));
      cell.dataset.label = headers[cellIndex];
      row.append(cell);
    });
    body.append(row);

    if (showGameDetails) {
      const detailRow = node('tr', '', 'statistics-detail-row');
      const detailCell = document.createElement('td');
      detailCell.colSpan = headers.length;
      const details = node('details', '');
      details.append(node('summary', i18n.t('statistics.byGame')));
      const gameList = node('ul', '', 'statistics-game-list');
      for (const game of player.games) {
        const name = currentGameName(game.gameId, game.gameNameAtPlay, games, i18n.locale);
        gameList.append(node('li', i18n.t('statistics.gameResult', {
          game: name, played: game.gamesPlayed, wins: game.wins, winRate: formatPercent(game.winRate, i18n.locale),
        })));
      }
      details.append(gameList);
      detailCell.append(details);
      detailRow.append(detailCell);
      body.append(detailRow);
    }
  });
  table.append(body);
  container.append(table);
}

/** Render the Statistics tab using the already-loaded session history. */
export function renderStatistics(container, sessions, games, i18n) {
  container.replaceChildren();
  const statistics = calculateStatistics(sessions);
  if (!statistics.players.length) {
    container.append(node('p', i18n.t('statistics.empty')));
    return;
  }

  const tabList = node('div', '', 'statistics-tabs');
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', i18n.t('statistics.tabsLabel'));
  const panels = new Map();
  const tabs = new Map();
  const addTab = (id, label) => {
    const button = node('button', label, 'statistics-tab');
    button.type = 'button'; button.id = `statistics-tab-${id}`; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `statistics-panel-${id}`);
    const panel = node('section', '', 'statistics-panel');
    panel.id = `statistics-panel-${id}`; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id);
    tabList.append(button); tabs.set(id, button); panels.set(id, panel);
    button.addEventListener('click', () => selectTab(id));
    button.addEventListener('keydown', (event) => {
      const tabIds = [...tabs.keys()];
      const currentIndex = tabIds.indexOf(id);
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabIds.length;
      if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabIds.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      const nextId = tabIds[nextIndex];
      selectTab(nextId); tabs.get(nextId).focus();
    });
    return panel;
  };
  const selectTab = (id) => {
    panels.forEach((panel, key) => { panel.hidden = key !== id; });
    tabs.forEach((tab, key) => { const selected = key === id; tab.classList.toggle('is-active', selected); tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
  };

  const overviewPanel = addTab('overview', i18n.t('statistics.tabOverview'));
  const playersPanel = addTab('players', i18n.t('statistics.tabPlayers'));
  const gamesPanel = addTab('games', i18n.t('statistics.tabGames'));
  const overview = node('div', '', 'statistics-overview');
  for (const [label, value] of [
    [i18n.t('statistics.sessions'), statistics.sessionCount],
    [i18n.t('statistics.games'), statistics.gameCount],
    [i18n.t('statistics.players'), statistics.players.length],
  ]) {
    const metric = node('div', '', 'statistics-overview-item');
    metric.append(node('strong', String(value)), node('span', label));
    overview.append(metric);
  }
  overviewPanel.append(overview);
  renderLeaderboard(playersPanel, statistics.players, i18n, true, games);

  const gameLabel = node('label', i18n.t('statistics.chooseGame'));
  gameLabel.htmlFor = 'statistics-game-select';
  const gameSelect = document.createElement('select');
  gameSelect.id = 'statistics-game-select';
  statistics.games.forEach((game) => {
    const option = document.createElement('option'); option.value = game.gameId;
    option.textContent = currentGameName(game.gameId, game.gameNameAtPlay, games, i18n.locale);
    gameSelect.append(option);
  });
  const gameResults = node('div', '', 'statistics-game-results');
  const showGame = (gameId) => {
    const game = statistics.games.find((item) => item.gameId === gameId);
    gameResults.replaceChildren();
    if (!game) return;
    gameResults.append(node('p', i18n.t('statistics.gameSessions', { count: game.sessionCount })));
    renderLeaderboard(gameResults, game.players, i18n, false, [], game.players.some((player) => player.averageScore !== null));
  };
  gameSelect.addEventListener('change', () => showGame(gameSelect.value));
  gamesPanel.append(gameLabel, gameSelect, gameResults);
  showGame(gameSelect.value);

  container.append(tabList, overviewPanel, playersPanel, gamesPanel);
  selectTab('overview');
}
