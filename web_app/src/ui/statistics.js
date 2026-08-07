import { getGameName } from '../data/games.js';
import { MARIO_KART_CC_OPTIONS, MARIO_KART_ITEMS, MARIO_KART_ITEM_PRESETS, itemPresetName } from '../data/mario-kart.js';

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
      const winnerIds = Array.isArray(session.entries?.winnerIds) ? session.entries.winnerIds : session.entries?.winnerId == null ? [] : [session.entries.winnerId];
      if ((!Object.hasOwn(session.entries ?? {}, 'winnerIds') && !Object.hasOwn(session.entries ?? {}, 'winnerId')) || winnerIds.some((id) => !participants.some((participant) => participant.id === id))) continue;
      const gameSummary = ensureGame();
      for (const participant of participants) {
        const key = normalizePlayerName(participant.displayName);
        let summary = players.get(key);
        if (!summary) {
          summary = makeSummary(key, String(participant.displayName).trim());
          players.set(key, summary);
        }
        const won = winnerIds.includes(participant.id);
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

function marioKartRecords(sessions) {
  const records = [];
  sessions.filter((session) => session?.scoring?.engineId === 'mario-kart-8').forEach((session) => {
    const names = new Map((session.participants ?? []).map((participant) => [participant.id, participant.displayName]));
    const totals = session.totals ?? {};
    const totalScores = (session.participants ?? [])
      .map((participant) => Number(totals[participant.id]))
      .filter((score) => Number.isFinite(score));
    const winningTotal = totalScores.length ? Math.max(...totalScores) : null;
    const sessionWinners = new Set((session.participants ?? [])
      .filter((participant) => winningTotal !== null && Number(totals[participant.id]) === winningTotal)
      .map((participant) => participant.id));
    (session.entries?.races ?? []).forEach((race) => {
      race.participantIds?.forEach((id) => {
        if (!names.has(id)) return;
        records.push({
          player: names.get(id), playerKey: normalizePlayerName(names.get(id)),
          sessionId: session.id, sessionWon: sessionWinners.has(id),
          cc: race.cc, itemSet: race.itemSet, itemSetName: itemPresetName(race.itemSet), itemIds: race.itemIds ?? [],
          placement: Number(race.placements?.[id]), points: Number(race.points?.[id] ?? 0),
        });
      });
    });
  });
  return records;
}

function finishMarioStats(records) {
  const players = new Map();
  records.forEach((record) => {
    let summary = players.get(record.playerKey);
    if (!summary) { summary = { playerKey: record.playerKey, displayName: record.player, races: 0, wins: 0, sessions: 0, sessionWins: 0, sessionIds: new Set(), totalPoints: 0, totalPlacement: 0 }; players.set(record.playerKey, summary); }
    summary.races += 1; summary.wins += record.placement === 1 ? 1 : 0; summary.totalPoints += record.points; summary.totalPlacement += record.placement;
    if (!summary.sessionIds.has(record.sessionId)) {
      summary.sessionIds.add(record.sessionId);
      summary.sessions += 1;
      if (record.sessionWon) summary.sessionWins += 1;
    }
  });
  return [...players.values()].map((summary) => ({ ...summary, sessionIds: undefined, winRate: summary.wins / summary.races, sessionWinRate: summary.sessionWins / summary.sessions, averagePoints: summary.totalPoints / summary.races, averagePlacement: summary.totalPlacement / summary.races })).sort((a, b) => b.totalPoints - a.totalPoints || b.sessionWinRate - a.sessionWinRate || b.winRate - a.winRate || a.displayName.localeCompare(b.displayName));
}

export function calculateMarioKartStatistics(sessions = [], filters = {}) {
  const records = marioKartRecords(sessions).filter((record) => (!filters.player || record.playerKey === normalizePlayerName(filters.player))
    && (!filters.cc || record.cc === filters.cc) && (!filters.itemSet || record.itemSet === filters.itemSet) && (!filters.item || record.itemIds.includes(filters.item)));
  const players = finishMarioStats(records);
  const conditions = new Map();
  records.forEach((record) => {
    const key = `${record.cc}|${record.itemSet}`; let condition = conditions.get(key);
    if (!condition) { condition = { cc: record.cc, itemSet: record.itemSet, itemSetName: record.itemSetName, races: 0, points: 0, wins: 0 }; conditions.set(key, condition); }
    condition.races += 1; condition.points += record.points; condition.wins += record.placement === 1 ? 1 : 0;
  });
  return { records, players, conditions: [...conditions.values()].map((condition) => ({ ...condition, winRate: condition.wins / condition.races, averagePoints: condition.points / condition.races })) };
}

function renderMarioKartDashboard(container, sessions, i18n) {
  const allRecords = marioKartRecords(sessions);
  const filters = { player: '', cc: '', itemSet: '', item: '' };
  const controls = element('div', '', 'statistics-filters');
  const addFilter = (label, values, key, labelFor = (value) => value) => {
    const wrapper = element('label', label); const select = document.createElement('select'); select.id = `mario-stat-${key}`;
    const all = element('option', i18n.t('statistics.all')); all.value = ''; select.append(all); selectOptions(select, values, labelFor); select.addEventListener('change', () => { filters[key] = select.value; render(); }); wrapper.append(select); controls.append(wrapper);
  };
  const selectOptions = (select, values, labelFor) => values.forEach((value) => { const option = element('option', labelFor(value)); option.value = value; select.append(option); });
  const playerNames = [...new Map(allRecords.map((record) => [record.playerKey, record.player])).values()].sort((a, b) => a.localeCompare(b));
  addFilter(i18n.t('statistics.player'), playerNames, 'player'); addFilter(i18n.t('marioKart.cc'), MARIO_KART_CC_OPTIONS, 'cc', (value) => i18n.t(`marioKart.cc.${value}`)); addFilter(i18n.t('marioKart.itemSet'), Object.keys(MARIO_KART_ITEM_PRESETS), 'itemSet', itemPresetName); addFilter(i18n.t('statistics.item'), MARIO_KART_ITEMS, 'item');
  const content = element('div'); container.append(controls, content);
  const render = () => {
    const statistics = calculateMarioKartStatistics(sessions, filters); content.replaceChildren();
    if (!statistics.records.length) return content.append(element('p', i18n.t('statistics.noMatchingRaces')));
    content.append(element('p', i18n.t('statistics.raceCount', { count: statistics.records.length })));
    const table = element('table', '', 'statistics-leaderboard'); const header = document.createElement('thead'); const headerRow = document.createElement('tr');
    [i18n.t('statistics.player'), i18n.t('statistics.races'), i18n.t('statistics.wins'), i18n.t('statistics.raceWinRate'), i18n.t('statistics.averagePoints'), i18n.t('statistics.averagePlacement'), i18n.t('statistics.totalPoints')].forEach((label) => headerRow.append(element('th', label))); header.append(headerRow); table.append(header);
    const body = document.createElement('tbody'); statistics.players.forEach((player) => { const row = document.createElement('tr'); [player.displayName, player.races, player.wins, formatPercent(player.winRate, i18n.locale), formatScore(player.averagePoints, i18n.locale), formatScore(player.averagePlacement, i18n.locale), player.totalPoints].forEach((value) => row.append(element('td', String(value)))); body.append(row); }); table.append(body); content.append(table);
    const chart = element('div', '', 'mario-win-chart'); content.append(element('h3', i18n.t('statistics.sessionWinRate')), chart);
    const maxRate = Math.max(...statistics.players.map((player) => player.sessionWinRate), 0.01); statistics.players.forEach((player) => { const row = element('div', '', 'mario-chart-row'); row.append(element('span', player.displayName)); const bar = element('div', '', 'mario-chart-bar'); bar.style.width = `${(player.sessionWinRate / maxRate) * 100}%`; bar.title = i18n.t('statistics.sessionWinRateTooltip', { sessionWins: player.sessionWins, sessions: player.sessions, sessionWinRate: formatPercent(player.sessionWinRate, i18n.locale), raceWinRate: formatPercent(player.winRate, i18n.locale) }); bar.setAttribute('aria-label', bar.title); row.append(bar); chart.append(row); });
    const conditionTable = element('table', '', 'statistics-leaderboard'); conditionTable.append(element('caption', i18n.t('statistics.byCondition'))); const conditionBody = document.createElement('tbody'); statistics.conditions.sort((a, b) => b.races - a.races).forEach((condition) => { const row = document.createElement('tr'); [i18n.t(`marioKart.cc.${condition.cc}`), condition.itemSetName, condition.races, formatPercent(condition.winRate, i18n.locale), formatScore(condition.averagePoints, i18n.locale)].forEach((value) => row.append(element('td', String(value)))); conditionBody.append(row); }); conditionTable.append(conditionBody); content.append(conditionTable);
  };
  render();
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

const element = node;

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
  const marioSessions = sessions.filter((session) => session?.scoring?.engineId === 'mario-kart-8');
  let marioPanel;
  if (marioSessions.length) { marioPanel = addTab('mario-kart', i18n.t('statistics.tabMarioKart')); renderMarioKartDashboard(marioPanel, marioSessions, i18n); }
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
  if (marioPanel) container.append(marioPanel);
  selectTab('overview');
}
