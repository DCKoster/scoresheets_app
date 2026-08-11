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
  let normalSessionCount = 0;

  for (const session of sessions) {
    if (session?.scoring?.engineId === 'mario-kart-8') continue;
    normalSessionCount += 1;
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

  return { sessionCount: normalSessionCount, gameCount: gameResults.length, players: result, games: gameResults };
}

// A descriptive alias for callers that only need player-level results.
export const calculatePlayerStatistics = (sessions = []) => calculateStatistics(sessions).players;

function chartSessionLabel(session, index, locale) {
  const date = new Date(session.createdAt);
  return Number.isNaN(date.getTime())
    ? String(index + 1)
    : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}

/** Return chronological, normal-engine series for the statistics charts. */
export function calculateChartData(sessions = [], gameId = '', locale = 'en') {
  const selectedSessions = sessions
    .filter((session) => session?.scoring?.engineId !== 'mario-kart-8' && (!gameId || String(session.gameId ?? session.gameNameAtPlay ?? '') === gameId))
    .map((session, index) => ({ session, originalIndex: index }))
    .sort((a, b) => {
      const first = new Date(a.session.createdAt).getTime();
      const second = new Date(b.session.createdAt).getTime();
      const firstTime = Number.isFinite(first) ? first : Number.POSITIVE_INFINITY;
      const secondTime = Number.isFinite(second) ? second : Number.POSITIVE_INFINITY;
      return firstTime - secondTime || a.originalIndex - b.originalIndex;
    })
    .map(({ session }, index) => ({
      id: session.id,
      label: chartSessionLabel(session, index, locale),
      engineId: session.scoring?.engineId,
      ranking: session.scoring?.ranking,
      participants: session.participants ?? [],
      scores: Object.fromEntries((session.participants ?? []).map((participant) => [
        normalizePlayerName(participant.displayName), Number(session.totals?.[participant.id]),
      ]).filter(([, score]) => Number.isFinite(score))),
      rounds: session.scoring?.engineId === 'round-sum'
        ? (session.entries?.rounds ?? []).map((round) => Object.fromEntries((session.participants ?? []).map((participant) => {
          const value = round.scores?.[participant.id];
          const score = value && typeof value === 'object'
            ? Object.values(value).reduce((total, categoryScore) => total + (Number(categoryScore) || 0), 0)
            : Number(value);
          return [normalizePlayerName(participant.displayName), Number.isFinite(score) ? score : null];
        })))
        : [],
    }));
  const playerNames = [...new Map(selectedSessions.flatMap((item) => item.participants.map((participant) => [normalizePlayerName(participant.displayName), String(participant.displayName).trim()]))).entries()];
  return { sessions: selectedSessions, players: playerNames.map(([key, displayName]) => ({ key, displayName })) };
}

/** Data used by the engine-specific statistics dashboard. */
export function calculateGameAnalytics(sessions = [], gameId = '', locale = 'en') {
  const data = calculateChartData(sessions, gameId, locale);
  const players = data.players;
  const winnerMatrix = Object.fromEntries(players.map((row) => [row.key, Object.fromEntries(players.map((column) => [column.key, 0]))]));
  const cumulativeWins = Object.fromEntries(players.map((player) => [player.key, []]));
  const winTotals = Object.fromEntries(players.map((player) => [player.key, 0]));
  data.sessions.forEach((item) => {
    const winnerIds = sessions.find((session) => session.id === item.id)?.entries;
    const winners = new Set(Array.isArray(winnerIds?.winnerIds) ? winnerIds.winnerIds : winnerIds?.winnerId == null ? [] : [winnerIds.winnerId]);
    const winnerKeys = new Set((sessions.find((session) => session.id === item.id)?.participants ?? []).filter((participant) => winners.has(participant.id)).map((participant) => normalizePlayerName(participant.displayName)));
    players.forEach((player) => {
      if (winnerKeys.has(player.key)) winTotals[player.key] += 1;
      cumulativeWins[player.key].push(winTotals[player.key]);
    });
    winnerKeys.forEach((winner) => players.forEach((opponent) => {
      if (winner !== opponent.key && !winnerKeys.has(opponent.key) && winnerMatrix[winner]?.[opponent.key] !== undefined) winnerMatrix[winner][opponent.key] += 1;
    }));
  });
  const distributions = Object.fromEntries(players.map((player) => [player.key, data.sessions.map((item) => item.scores[player.key]).filter(Number.isFinite)]));
  const latestRoundSession = [...data.sessions].reverse().find((item) => item.rounds.length);
  const roundScores = latestRoundSession?.rounds ?? [];
  return { ...data, cumulativeWins, winnerMatrix, distributions, latestRoundSession, roundScores };
}

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

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgNode(tag, attributes = {}) {
  const value = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, attribute]) => value.setAttribute(key, String(attribute)));
  return value;
}

function renderOutcomeChart(container, players, i18n) {
  const chart = node('div', '', 'statistics-bar-chart');
  players.forEach((player) => {
    const row = node('div', '', 'statistics-bar-row');
    row.append(node('span', player.displayName, 'statistics-bar-label'));
    const bars = node('div', '', 'statistics-bar-values');
    const winBar = node('div', '', 'statistics-bar');
    winBar.style.width = `${players.length ? (player.wins / Math.max(...players.map((item) => item.wins), 1)) * 100 : 0}%`;
    winBar.title = i18n.t('statistics.chartWinsTooltip', { player: player.displayName, value: player.wins });
    winBar.setAttribute('aria-label', winBar.title);
    const rateBar = node('div', '', 'statistics-bar statistics-bar-rate');
    rateBar.style.width = `${player.winRate * 100}%`;
    rateBar.title = i18n.t('statistics.chartWinRateTooltip', { player: player.displayName, value: formatPercent(player.winRate, i18n.locale) });
    rateBar.setAttribute('aria-label', rateBar.title);
    bars.append(winBar, rateBar); row.append(bars); chart.append(row);
  });
  const legend = node('p', `${i18n.t('statistics.wins')} · ${i18n.t('statistics.winRate')}`, 'statistics-chart-legend');
  container.append(chart, legend);
}

function renderLineChart(container, title, series, i18n, xLabel) {
  if (!series.length || !series.some((item) => item.points.some((point) => point !== null))) return;
  const width = 760; const height = 300; const left = 48; const right = 18; const top = 24; const bottom = 42;
  const values = series.flatMap((item) => item.points).filter((value) => value !== null);
  let min = Math.min(...values); let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const xCount = Math.max(...series.map((item) => item.points.length), 1);
  const x = (index) => left + (index / Math.max(xCount - 1, 1)) * (width - left - right);
  const y = (value) => top + ((max - value) / (max - min)) * (height - top - bottom);
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title, class: 'statistics-line-svg' });
  const zero = svgNode('line', { x1: left, x2: width - right, y1: y(0), y2: y(0), class: 'statistics-axis' }); svg.append(zero);
  const axis = svgNode('line', { x1: left, x2: left, y1: top, y2: height - bottom, class: 'statistics-axis' }); svg.append(axis);
  [max, min].forEach((value) => { const label = svgNode('text', { x: 4, y: y(value) + 4, class: 'statistics-axis-label' }); label.textContent = formatScore(value, i18n.locale); svg.append(label); });
  series.forEach((item, seriesIndex) => {
    let segment = [];
    const flush = () => {
      if (segment.length < 2) { segment = []; return; }
      svg.append(svgNode('polyline', { points: segment.join(' '), class: `statistics-line statistics-line-${seriesIndex % 6}` })); segment = [];
    };
    item.points.forEach((value, index) => {
      if (value === null) { flush(); return; }
      const point = `${x(index)},${y(value)}`; segment.push(point);
      svg.append(svgNode('circle', { cx: x(index), cy: y(value), r: 3.5, class: `statistics-point statistics-line-${seriesIndex % 6}` }));
    });
    flush();
  });
  const labels = series[0]?.labels ?? [];
  if (labels.length) { [0, labels.length - 1].filter((value, index, all) => all.indexOf(value) === index).forEach((index) => { const label = svgNode('text', { x: x(index), y: height - 12, 'text-anchor': index ? 'end' : 'start', class: 'statistics-axis-label' }); label.textContent = labels[index]; svg.append(label); }); }
  const legend = node('div', '', 'statistics-line-legend');
  series.forEach((item, index) => { const label = node('span', item.name, `statistics-legend-item statistics-line-${index % 6}`); legend.append(label); });
  const figure = node('figure', '', 'statistics-chart'); figure.append(node('figcaption', title), svg, legend);
  if (xLabel) figure.append(node('small', xLabel, 'statistics-chart-axis-note'));
  container.append(figure);
}

function renderAverageBars(container, title, players, distributions, i18n) {
  const values = players.map((player) => {
    const scores = distributions[player.key] ?? [];
    return { ...player, average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null };
  }).filter((player) => player.average !== null);
  if (!values.length) return;
  const chart = node('div', '', 'statistics-bar-chart');
  const max = Math.max(...values.map((player) => Math.abs(player.average)), 1);
  values.forEach((player) => {
    const row = node('div', '', 'statistics-bar-row'); row.append(node('span', player.displayName, 'statistics-bar-label'));
    const track = node('div', '', 'statistics-bar-values'); const bar = node('div', '', 'statistics-bar');
    bar.style.width = `${Math.max(2, (Math.abs(player.average) / max) * 100)}%`; bar.title = `${player.displayName}: ${formatScore(player.average, i18n.locale)}`; bar.setAttribute('aria-label', bar.title);
    track.append(bar, node('small', formatScore(player.average, i18n.locale))); row.append(track); chart.append(row);
  });
  const figure = node('figure', '', 'statistics-chart'); figure.append(node('figcaption', title), chart); container.append(figure);
}

function quartiles(values) {
  const sorted = [...values].sort((a, b) => a - b); if (!sorted.length) return null;
  const percentile = (fraction) => { const position = (sorted.length - 1) * fraction; const lower = Math.floor(position); const upper = Math.ceil(position); return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower); };
  return { min: sorted[0], q1: percentile(.25), median: percentile(.5), q3: percentile(.75), max: sorted.at(-1) };
}

function renderBoxPlot(container, title, players, distributions, i18n) {
  const boxes = players.map((player) => ({ ...player, stats: quartiles(distributions[player.key] ?? []) })).filter((player) => player.stats);
  if (!boxes.length) return;
  const width = 760; const rowHeight = 48; const height = Math.max(120, boxes.length * rowHeight + 44); const left = 125; const right = 18;
  const all = boxes.flatMap((box) => Object.values(box.stats)); let min = Math.min(...all); let max = Math.max(...all); if (min === max) { min -= 1; max += 1; }
  const x = (value) => left + ((value - min) / (max - min)) * (width - left - right);
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title, class: 'statistics-line-svg statistics-box-svg' });
  boxes.forEach((box, index) => { const y = 28 + index * rowHeight; const stats = box.stats;
    svg.append(svgNode('text', { x: left - 8, y: y + 5, 'text-anchor': 'end', class: 'statistics-axis-label' })); svg.lastChild.textContent = box.displayName;
    svg.append(svgNode('line', { x1: x(stats.min), x2: x(stats.max), y1: y, y2: y, class: 'statistics-box-whisker' }), svgNode('line', { x1: x(stats.min), x2: x(stats.min), y1: y - 8, y2: y + 8, class: 'statistics-box-whisker' }), svgNode('line', { x1: x(stats.max), x2: x(stats.max), y1: y - 8, y2: y + 8, class: 'statistics-box-whisker' }), svgNode('rect', { x: x(stats.q1), y: y - 11, width: Math.max(2, x(stats.q3) - x(stats.q1)), height: 22, class: 'statistics-box' }), svgNode('line', { x1: x(stats.median), x2: x(stats.median), y1: y - 11, y2: y + 11, class: 'statistics-box-median' }));
  });
  svg.append(svgNode('text', { x: left, y: height - 10, class: 'statistics-axis-label' })); svg.lastChild.textContent = formatScore(min, i18n.locale);
  svg.append(svgNode('text', { x: width - right, y: height - 10, 'text-anchor': 'end', class: 'statistics-axis-label' })); svg.lastChild.textContent = formatScore(max, i18n.locale);
  const figure = node('figure', '', 'statistics-chart'); figure.append(node('figcaption', title), svg); container.append(figure);
}

function renderHeadToHead(container, title, players, matrix, i18n) {
  const table = node('table', '', 'statistics-leaderboard statistics-matrix'); table.append(node('caption', title));
  const head = document.createElement('thead'); const row = document.createElement('tr'); row.append(node('th', i18n.t('statistics.player'))); players.forEach((player) => row.append(node('th', player.displayName))); head.append(row); table.append(head);
  const body = document.createElement('tbody'); players.forEach((player) => { const tr = document.createElement('tr'); tr.append(node('th', player.displayName)); players.forEach((opponent) => tr.append(node('td', player.key === opponent.key ? '—' : String(matrix[player.key]?.[opponent.key] ?? 0)))); body.append(tr); }); table.append(body); container.append(table);
}

function renderGroupedRoundBars(container, title, players, rounds, i18n) {
  if (!rounds.length) return;
  const chart = node('div', '', 'statistics-round-bars'); const max = Math.max(...rounds.flatMap((round) => players.map((player) => round[player.key] ?? 0)), 1);
  rounds.forEach((round, index) => { const group = node('div', '', 'statistics-round-group'); group.append(node('strong', `${i18n.t('session.round', { number: index + 1, scores: '' }).replace(/: $/, '')}`)); const bars = node('div', '', 'statistics-round-bars-inner'); players.forEach((player) => { const score = round[player.key]; const wrapper = node('div', '', 'statistics-round-bar-wrap'); const bar = node('div', ``, `statistics-round-bar statistics-line-${players.indexOf(player) % 6}`); bar.style.height = `${Math.max(2, (Math.abs(score ?? 0) / max) * 100)}%`; bar.title = `${player.displayName}: ${formatScore(score, i18n.locale)}`; bar.setAttribute('aria-label', bar.title); wrapper.append(bar, node('small', player.displayName)); bars.append(wrapper); }); group.append(bars); chart.append(group); });
  const figure = node('figure', '', 'statistics-chart'); figure.append(node('figcaption', title), chart); container.append(figure);
}

function renderRoundLeaders(container, title, players, rounds, i18n, ranking = 'highest') {
  if (!rounds.length) return;
  const table = node('table', '', 'statistics-leaderboard'); table.append(node('caption', title)); const body = document.createElement('tbody');
  rounds.forEach((round, index) => { const scores = players.map((player) => ({ name: player.displayName, score: round[player.key] })).filter((item) => Number.isFinite(item.score)); const best = scores.length ? (ranking === 'lowest' ? Math.min(...scores.map((item) => item.score)) : Math.max(...scores.map((item) => item.score))) : null; const leaders = scores.filter((item) => item.score === best).map((item) => item.name).join(', ') || '—'; const row = document.createElement('tr'); [index + 1, leaders, best === null ? '—' : formatScore(best, i18n.locale)].forEach((value) => row.append(node('td', String(value)))); body.append(row); }); table.append(body); container.append(table);
}

function renderNormalCharts(container, sessions, statistics, games, i18n) {
  if (!statistics.games.length) return;

  const label = node('label', i18n.t('statistics.chooseGame')); label.htmlFor = 'statistics-chart-game-select';
  const select = document.createElement('select'); select.id = 'statistics-chart-game-select';
  statistics.games.forEach((game) => { const option = document.createElement('option'); option.value = game.gameId; option.textContent = currentGameName(game.gameId, game.gameNameAtPlay, games, i18n.locale); select.append(option); });
  const trendContent = node('div', '', 'statistics-trend-content');
  const render = () => {
    trendContent.replaceChildren();
    const chartData = calculateGameAnalytics(sessions, select.value, i18n.locale);
    const engine = sessions.find((session) => String(session.gameId ?? session.gameNameAtPlay ?? '') === select.value)?.scoring?.engineId;
    if (engine === 'winner-only') {
      renderLineChart(trendContent, i18n.t('statistics.chartWinsOverTime'), chartData.players.map((player) => ({ name: player.displayName, labels: chartData.sessions.map((item) => item.label), points: chartData.cumulativeWins[player.key] })), i18n, i18n.t('statistics.chartSessionAxis'));
      renderHeadToHead(trendContent, i18n.t('statistics.chartHeadToHead'), chartData.players, chartData.winnerMatrix, i18n);
    } else if (engine === 'round-sum') {
      const latestRoundSession = chartData.latestRoundSession;
      if (latestRoundSession) {
        renderLineChart(trendContent, i18n.t('statistics.chartScoreProgression'), chartData.players.map((player) => { let total = 0; return { name: player.displayName, labels: latestRoundSession.rounds.map((_, index) => String(index + 1)), points: latestRoundSession.rounds.map((round) => { const score = round[player.key]; if (!Number.isFinite(score)) return null; total += score; return total; }) }; }), i18n, i18n.t('statistics.chartRoundAxis'));
        renderGroupedRoundBars(trendContent, i18n.t('statistics.chartScorePerRound'), chartData.players, chartData.roundScores, i18n);
        renderRoundLeaders(trendContent, i18n.t('statistics.chartLeaderByRound'), chartData.players, chartData.roundScores, i18n, latestRoundSession.ranking);
      } else trendContent.append(node('p', i18n.t('statistics.noNumericScores')));
    } else {
      const numericSessions = chartData.sessions.filter((item) => Object.keys(item.scores).length);
      renderBoxPlot(trendContent, i18n.t('statistics.chartScoreDistribution'), chartData.players, chartData.distributions, i18n);
      renderAverageBars(trendContent, i18n.t('statistics.chartAverageScore'), chartData.players, chartData.distributions, i18n);
      if (numericSessions.length) renderLineChart(trendContent, i18n.t('statistics.chartScoresBySession'), chartData.players.map((player) => ({ name: player.displayName, labels: numericSessions.map((item) => item.label), points: numericSessions.map((item) => item.scores[player.key] ?? null) })), i18n, i18n.t('statistics.chartSessionAxis'));
      else trendContent.append(node('p', i18n.t('statistics.noNumericScores')));
    }
  };
  select.addEventListener('change', render);
  container.append(label, select, trendContent); render();
}

/** Render the Statistics tab using the already-loaded session history. */
export function renderStatistics(container, sessions, games, i18n) {
  container.replaceChildren();
  const statistics = calculateStatistics(sessions);
  const marioSessions = sessions.filter((session) => session?.scoring?.engineId === 'mario-kart-8');
  if (!statistics.players.length && !marioSessions.length) {
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

  let overviewPanel; let playersPanel; let gamesPanel; let chartsPanel;
  if (statistics.players.length) {
    overviewPanel = addTab('overview', i18n.t('statistics.tabOverview'));
    playersPanel = addTab('players', i18n.t('statistics.tabPlayers'));
    gamesPanel = addTab('games', i18n.t('statistics.tabGames'));
    chartsPanel = addTab('charts', i18n.t('statistics.tabCharts'));
    renderNormalCharts(chartsPanel, sessions, statistics, games, i18n);
  }
  let marioPanel;
  if (marioSessions.length) { marioPanel = addTab('mario-kart', i18n.t('statistics.tabMarioKart')); renderMarioKartDashboard(marioPanel, marioSessions, i18n); }
  if (statistics.players.length) {
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
  }

  container.append(tabList);
  if (overviewPanel) container.append(overviewPanel, playersPanel, gamesPanel, chartsPanel);
  if (marioPanel) container.append(marioPanel);
  selectTab(statistics.players.length ? 'overview' : 'mario-kart');
}
