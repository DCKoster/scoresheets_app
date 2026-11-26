import { groupPlayerKey } from './group-players.js';
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

function normalizedPlayerKeys(values = []) {
  return [...new Set(values.map(normalizePlayerName).filter(Boolean))];
}

function sessionPlayerKeys(session) {
  return new Set((session?.participants ?? []).map((participant) => groupPlayerKey(participant)).filter(Boolean));
}

export function filterStatisticsSessions(sessions = [], filters = {}) {
  const playerKeys = normalizedPlayerKeys(filters.playerKeys);
  const from = filters.from ? new Date(filters.from).getTime() : null;
  const to = filters.to ? new Date(filters.to).getTime() : null;
  return sessions.filter((session) => {
    const createdAt = new Date(session?.createdAt).getTime();
    if (from !== null && (!Number.isFinite(createdAt) || createdAt < from)) return false;
    if (to !== null && (!Number.isFinite(createdAt) || createdAt > to)) return false;
    if (!playerKeys.length) return true;
    const present = sessionPlayerKeys(session);
    return filters.sharedOnly ? playerKeys.every((key) => present.has(key)) : playerKeys.some((key) => present.has(key));
  });
}

/**
 * Return a display-ready, data-only summary of saved sessions.
 * A tied best score counts as a win for every tied participant.
 */
export function calculateStatistics(sessions = [], filters = {}) {
  const playerFilter = new Set(normalizedPlayerKeys(filters.playerKeys));
  const players = new Map();
  const games = new Map();
  let normalSessionCount = 0;

  for (const session of filterStatisticsSessions(sessions, filters)) {
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
      const participants = session.participants.filter((participant) => groupPlayerKey(participant));
      const winnerIds = Array.isArray(session.entries?.winnerIds) ? session.entries.winnerIds : session.entries?.winnerId == null ? [] : [session.entries.winnerId];
      if ((!Object.hasOwn(session.entries ?? {}, 'winnerIds') && !Object.hasOwn(session.entries ?? {}, 'winnerId')) || winnerIds.some((id) => !participants.some((participant) => participant.id === id))) continue;
      const gameSummary = ensureGame();
      for (const participant of participants) {
        const key = groupPlayerKey(participant);
        if (playerFilter.size && !playerFilter.has(key)) continue;
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
      .filter(({ participant, score }) => groupPlayerKey(participant) && score !== null);
    const winningScore = winnerScore(scores, session?.scoring?.ranking);
    if (winningScore === null) continue;

    const gameSummary = ensureGame();
    for (const { participant, score } of scores) {
      const key = groupPlayerKey(participant);
      if (playerFilter.size && !playerFilter.has(key)) continue;
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
export const calculatePlayerStatistics = (sessions = [], filters = {}) => calculateStatistics(sessions, filters).players;

export function calculateCompetitionInsights(sessions = [], filters = {}) {
  const statistics = calculateStatistics(sessions, filters);
  const chronological = filterStatisticsSessions(sessions, filters).filter((session) => session?.scoring?.engineId !== 'mario-kart-8').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const streaks = new Map();
  chronological.forEach((session) => {
    const winners = winnerPlayerKeys(session); const present = sessionPlayerKeys(session);
    statistics.players.forEach((player) => { if (!present.has(player.key)) return; streaks.set(player.key, winners.has(player.key) ? (streaks.get(player.key) ?? 0) + 1 : 0); });
  });
  const mostWins = [...statistics.players].sort((a, b) => b.wins - a.wins || b.winRate - a.winRate)[0] ?? null;
  const bestWinRate = [...statistics.players].filter((player) => player.gamesPlayed >= 3).sort((a, b) => b.winRate - a.winRate || b.gamesPlayed - a.gamesPlayed)[0] ?? null;
  const bestStreak = [...statistics.players].map((player) => ({ ...player, streak: streaks.get(player.key) ?? 0 })).sort((a, b) => b.streak - a.streak || b.winRate - a.winRate)[0] ?? null;
  const selected = normalizedPlayerKeys(filters.playerKeys); let headToHead = null;
  if (selected.length === 2) {
    const [first, second] = selected; let sharedSessions = 0; let firstWins = 0; let secondWins = 0; let ties = 0;
    filterStatisticsSessions(sessions, { ...filters, sharedOnly: false, playerKeys: [] }).filter((session) => session?.scoring?.engineId !== 'mario-kart-8').forEach((session) => {
      const present = sessionPlayerKeys(session); if (!present.has(first) || !present.has(second)) return; sharedSessions += 1; const winners = winnerPlayerKeys(session); const firstWon = winners.has(first); const secondWon = winners.has(second);
      if (firstWon && !secondWon) firstWins += 1; else if (secondWon && !firstWon) secondWins += 1; else ties += 1;
    });
    headToHead = { first, second, sharedSessions, firstWins, secondWins, ties };
  }
  return { statistics, mostWins, bestWinRate, bestStreak, headToHead };
}

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
        groupPlayerKey(participant), Number(session.totals?.[participant.id]),
      ]).filter(([, score]) => Number.isFinite(score))),
      rounds: session.scoring?.engineId === 'round-sum'
        ? (session.entries?.rounds ?? []).map((round) => Object.fromEntries((session.participants ?? []).map((participant) => {
          const value = round.scores?.[participant.id];
          const score = value && typeof value === 'object'
            ? Object.values(value).reduce((total, categoryScore) => total + (Number(categoryScore) || 0), 0)
            : Number(value);
          return [groupPlayerKey(participant), Number.isFinite(score) ? score : null];
        })))
        : [],
    }));
  const playerNames = [...new Map(selectedSessions.flatMap((item) => item.participants.map((participant) => [groupPlayerKey(participant), String(participant.displayName).trim()]))).entries()];
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
    const winnerKeys = new Set((sessions.find((session) => session.id === item.id)?.participants ?? []).filter((participant) => winners.has(participant.id)).map((participant) => groupPlayerKey(participant)));
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

export function winnerPlayerKeys(session) {
  const participants = session?.participants ?? [];
  if (session?.scoring?.engineId === 'winner-only') {
    const ids = Array.isArray(session.entries?.winnerIds) ? session.entries.winnerIds : session.entries?.winnerId == null ? [] : [session.entries.winnerId];
    return new Set(participants.filter((participant) => ids.includes(participant.id)).map((participant) => groupPlayerKey(participant)));
  }
  const scores = participants.map((participant) => ({ key: groupPlayerKey(participant), score: scoreFor(session, participant) })).filter((item) => item.key && item.score !== null);
  const best = winnerScore(scores, session?.scoring?.ranking);
  return new Set(scores.filter((item) => item.score === best).map((item) => item.key));
}

export function calculateRoundAnalytics(sessions = [], gameId = '', filters = {}) {
  const selected = new Set(normalizedPlayerKeys(filters.playerKeys));
  const chart = calculateChartData(filterStatisticsSessions(sessions, filters), gameId);
  const summaries = new Map(); let leadChanges = 0; let analyzedSessions = 0;
  const ensure = (key, displayName) => { if (!summaries.has(key)) summaries.set(key, { key, displayName, roundScores: [], halfwayLeads: 0, halfwayWins: 0, comebackWins: 0 }); return summaries.get(key); };
  chart.sessions.filter((session) => session.rounds.length).forEach((session) => {
    const visiblePlayers = session.participants.map((participant) => ({ key: groupPlayerKey(participant), displayName: String(participant.displayName).trim() })).filter((player) => player.key && (!selected.size || selected.has(player.key)));
    if (!visiblePlayers.length) return;
    analyzedSessions += 1;
    const cumulative = Object.fromEntries(session.participants.map((participant) => [groupPlayerKey(participant), 0]));
    let previousLeaders = '';
    let halfwayLeaders = new Set();
    session.rounds.forEach((round, index) => {
      Object.entries(round).forEach(([key, score]) => { if (Number.isFinite(score)) cumulative[key] = (cumulative[key] ?? 0) + score; });
      visiblePlayers.forEach((player) => { const score = round[player.key]; if (Number.isFinite(score)) ensure(player.key, player.displayName).roundScores.push(score); });
      const ranked = session.participants.map((participant) => groupPlayerKey(participant)).filter((key) => Number.isFinite(cumulative[key]));
      const best = ranked.length ? (session.ranking === 'lowest' ? Math.min(...ranked.map((key) => cumulative[key])) : Math.max(...ranked.map((key) => cumulative[key]))) : null;
      const leaders = ranked.filter((key) => cumulative[key] === best).sort(); const leaderKey = leaders.join('|');
      if (index && leaderKey !== previousLeaders) leadChanges += 1;
      previousLeaders = leaderKey;
      if (index === Math.ceil(session.rounds.length / 2) - 1) halfwayLeaders = new Set(leaders);
    });
    const original = sessions.find((item) => item.id === session.id); const winners = winnerPlayerKeys(original);
    visiblePlayers.forEach((player) => {
      const summary = ensure(player.key, player.displayName);
      if (halfwayLeaders.has(player.key)) { summary.halfwayLeads += 1; if (winners.has(player.key)) summary.halfwayWins += 1; }
      if (winners.has(player.key) && !halfwayLeaders.has(player.key)) summary.comebackWins += 1;
    });
  });
  const players = [...summaries.values()].map((summary) => {
    const averageRoundScore = summary.roundScores.length ? summary.roundScores.reduce((total, score) => total + score, 0) / summary.roundScores.length : null;
    const variance = averageRoundScore === null ? null : summary.roundScores.reduce((total, score) => total + ((score - averageRoundScore) ** 2), 0) / summary.roundScores.length;
    return { ...summary, roundScores: undefined, roundsPlayed: summary.roundScores.length, averageRoundScore, consistency: variance === null ? null : Math.sqrt(variance), halfwayConversion: summary.halfwayLeads ? summary.halfwayWins / summary.halfwayLeads : null };
  }).sort((a, b) => b.comebackWins - a.comebackWins || (b.averageRoundScore ?? 0) - (a.averageRoundScore ?? 0));
  return { players, sessionCount: analyzedSessions, averageLeadChanges: analyzedSessions ? leadChanges / analyzedSessions : 0 };
}

export function marioKartRecords(sessions) {
  const records = [];
  sessions.filter((session) => session?.scoring?.engineId === 'mario-kart-8').forEach((session) => {
    const participants = new Map((session.participants ?? []).map((participant) => [participant.id, participant]));
    const totals = session.totals ?? {};
    const totalScores = (session.participants ?? [])
      .map((participant) => Number(totals[participant.id]))
      .filter((score) => Number.isFinite(score));
    const winningTotal = totalScores.length ? Math.max(...totalScores) : null;
    const sessionWinners = new Set((session.participants ?? [])
      .filter((participant) => winningTotal !== null && Number(totals[participant.id]) === winningTotal)
      .map((participant) => participant.id));
    (session.entries?.races ?? []).forEach((race, raceIndex) => {
      const raceKey = `${session.id}:${race.id ?? raceIndex}`;
      race.participantIds?.forEach((id) => {
        const participant = participants.get(id);
        if (!participant) return;
        records.push({
          player: participant.displayName, playerKey: groupPlayerKey(participant),
          sessionId: session.id, raceKey, createdAt: session.createdAt, sessionWon: sessionWinners.has(id),
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
  const playerKeys = normalizedPlayerKeys(filters.playerKeys?.length ? filters.playerKeys : filters.player ? [filters.player] : []);
  let records = marioKartRecords(filterStatisticsSessions(sessions, { ...filters, playerKeys, sharedOnly: false }))
    .filter((record) => (!filters.cc || record.cc === filters.cc) && (!filters.itemSet || record.itemSet === filters.itemSet) && (!filters.item || record.itemIds.includes(filters.item)));
  if (filters.sharedOnly && playerKeys.length > 1) {
    const racePlayers = new Map();
    records.forEach((record) => {
      if (!racePlayers.has(record.raceKey)) racePlayers.set(record.raceKey, new Set());
      racePlayers.get(record.raceKey).add(record.playerKey);
    });
    const sharedRaces = new Set([...racePlayers].filter(([, players]) => playerKeys.every((key) => players.has(key))).map(([raceKey]) => raceKey));
    records = records.filter((record) => sharedRaces.has(record.raceKey));
  }
  if (playerKeys.length) records = records.filter((record) => playerKeys.includes(record.playerKey));
  const players = finishMarioStats(records);
  const conditions = new Map();
  records.forEach((record) => {
    const key = `${record.cc}|${record.itemSet}`; let condition = conditions.get(key);
    if (!condition) { condition = { cc: record.cc, itemSet: record.itemSet, itemSetName: record.itemSetName, raceKeys: new Set(), entries: 0, points: 0, placement: 0, wins: 0 }; conditions.set(key, condition); }
    condition.raceKeys.add(record.raceKey); condition.entries += 1; condition.points += record.points; condition.placement += record.placement; condition.wins += record.placement === 1 ? 1 : 0;
  });
  const raceCount = new Set(records.map((record) => record.raceKey)).size;
  const sessionCount = new Set(records.map((record) => record.sessionId)).size;
  return { records, players, raceCount, sessionCount, conditions: [...conditions.values()].map((condition) => ({
    ...condition, raceKeys: undefined, races: condition.raceKeys.size, winRate: condition.wins / condition.entries,
    averagePoints: condition.points / condition.entries, averagePlacement: condition.placement / condition.entries,
  })) };
}

function renderMarioKartDashboard(container, sessions, i18n, globalFilters = {}) {
  const filters = { cc: '', itemSet: '', item: '' };
  const controls = element('div', '', 'statistics-filters');
  const addFilter = (label, values, key, labelFor = (value) => value) => {
    const wrapper = element('label', label); const select = document.createElement('select'); select.id = `mario-stat-${key}`;
    const all = element('option', i18n.t('statistics.all')); all.value = ''; select.append(all); selectOptions(select, values, labelFor); select.addEventListener('change', () => { filters[key] = select.value; render(); }); wrapper.append(select); controls.append(wrapper);
  };
  const selectOptions = (select, values, labelFor) => values.forEach((value) => { const option = element('option', labelFor(value)); option.value = value; select.append(option); });
  addFilter(i18n.t('marioKart.cc'), MARIO_KART_CC_OPTIONS, 'cc', (value) => i18n.t(`marioKart.cc.${value}`)); addFilter(i18n.t('marioKart.itemSet'), Object.keys(MARIO_KART_ITEM_PRESETS), 'itemSet', itemPresetName); addFilter(i18n.t('statistics.item'), MARIO_KART_ITEMS, 'item');
  const content = element('div'); container.append(controls, content);
  const render = () => {
    const statistics = calculateMarioKartStatistics(sessions, { ...globalFilters, ...filters }); content.replaceChildren();
    if (!statistics.records.length) return content.append(element('p', i18n.t('statistics.noMatchingRaces')));
    content.append(element('p', i18n.t('statistics.marioSummary', { races: statistics.raceCount, sessions: statistics.sessionCount })));
    renderSortableTable(content, [
      { key: 'displayName', type: 'text', label: i18n.t('statistics.player') }, { key: 'races', label: i18n.t('statistics.races') }, { key: 'wins', label: i18n.t('statistics.wins') },
      { key: 'winRate', label: i18n.t('statistics.raceWinRate'), render: (player) => formatPercent(player.winRate, i18n.locale) }, { key: 'sessionWins', label: i18n.t('statistics.sessionWins') },
      { key: 'sessionWinRate', label: i18n.t('statistics.sessionWinRate'), render: (player) => formatPercent(player.sessionWinRate, i18n.locale) },
      { key: 'averagePoints', label: i18n.t('statistics.averagePoints'), render: (player) => formatScore(player.averagePoints, i18n.locale) }, { key: 'averagePlacement', label: i18n.t('statistics.averagePlacement'), render: (player) => formatScore(player.averagePlacement, i18n.locale) }, { key: 'totalPoints', label: i18n.t('statistics.totalPoints') },
    ], statistics.players, i18n, { defaultKey: 'winRate' });
    const chart = element('div', '', 'mario-win-chart'); content.append(element('h3', i18n.t('statistics.sessionWinRate')), chart);
    const maxRate = Math.max(...statistics.players.map((player) => player.sessionWinRate), 0.01); statistics.players.forEach((player) => { const row = element('div', '', 'mario-chart-row'); row.append(element('span', player.displayName)); const bar = element('div', '', 'mario-chart-bar'); bar.style.width = `${(player.sessionWinRate / maxRate) * 100}%`; bar.title = i18n.t('statistics.sessionWinRateTooltip', { sessionWins: player.sessionWins, sessions: player.sessions, sessionWinRate: formatPercent(player.sessionWinRate, i18n.locale), raceWinRate: formatPercent(player.winRate, i18n.locale) }); bar.setAttribute('aria-label', bar.title); row.append(bar); chart.append(row); });
    const selectedPlayers = normalizedPlayerKeys(globalFilters.playerKeys);
    const conditionColumns = [
      { key: 'cc', type: 'text', label: i18n.t('marioKart.cc'), render: (condition) => i18n.t(`marioKart.cc.${condition.cc}`) }, { key: 'itemSetName', type: 'text', label: i18n.t('marioKart.itemSet') }, { key: 'races', label: i18n.t('statistics.races') },
    ];
    if (selectedPlayers.length) conditionColumns.push({ key: 'winRate', label: i18n.t('statistics.raceWinRate'), render: (condition) => formatPercent(condition.winRate, i18n.locale) }, { key: 'averagePoints', label: i18n.t('statistics.averagePoints'), render: (condition) => formatScore(condition.averagePoints, i18n.locale) }, { key: 'averagePlacement', label: i18n.t('statistics.averagePlacement'), render: (condition) => formatScore(condition.averagePlacement, i18n.locale) });
    else conditionColumns.push({ key: 'raceShare', label: i18n.t('statistics.raceShare'), render: (condition) => formatPercent(condition.raceShare, i18n.locale) });
    const conditionRows = statistics.conditions.map((condition) => ({ ...condition, raceShare: condition.races / statistics.raceCount }));
    renderSortableTable(content, conditionColumns, conditionRows, i18n, { caption: i18n.t('statistics.byCondition'), defaultKey: 'races' });
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

function compareRows(first, second, key, direction) {
  const a = first[key]; const b = second[key];
  let result;
  if (typeof a === 'number' || typeof b === 'number') result = (Number(a) || 0) - (Number(b) || 0);
  else result = String(a ?? '').localeCompare(String(b ?? ''));
  return (direction === 'ascending' ? result : -result) || String(first.displayName ?? first.itemSetName ?? '').localeCompare(String(second.displayName ?? second.itemSetName ?? ''));
}

function renderSortableTable(container, columns, rows, i18n, { caption = '', defaultKey = columns[0].key, defaultDirection = 'descending' } = {}) {
  const wrapper = node('div', '', 'statistics-table-scroll');
  const table = node('table', '', 'statistics-leaderboard');
  if (caption) table.append(node('caption', caption));
  const head = document.createElement('thead'); const headRow = document.createElement('tr'); const body = document.createElement('tbody'); head.append(headRow); table.append(head, body); wrapper.append(table); container.append(wrapper);
  let sortKey = defaultKey; let direction = defaultDirection;
  const renderRows = () => {
    body.replaceChildren();
    [...rows].sort((a, b) => compareRows(a, b, sortKey, direction)).forEach((item) => {
      const row = document.createElement('tr'); columns.forEach((column) => { const value = column.render ? column.render(item) : item[column.key]; const cell = node('td', String(value)); cell.dataset.label = column.label; row.append(cell); }); body.append(row);
    });
  };
  const renderHead = () => {
    headRow.replaceChildren(); columns.forEach((column) => { const th = document.createElement('th'); if (column.key === sortKey) th.setAttribute('aria-sort', direction); const button = node('button', column.label, 'statistics-sort-button'); button.type = 'button'; button.addEventListener('click', () => { if (sortKey === column.key) direction = direction === 'ascending' ? 'descending' : 'ascending'; else { sortKey = column.key; direction = column.type === 'text' ? 'ascending' : 'descending'; } renderHead(); renderRows(); }); th.append(button); headRow.append(th); });
  };
  renderHead(); renderRows(); return table;
}

function renderLeaderboard(container, players, i18n, showGameDetails = false, games = [], showAverageScore = false) {
  const table = node('table', '', 'statistics-leaderboard');
  const caption = node('caption', i18n.t('statistics.leaderboard'));
  const header = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const columns = [
    { key: 'rank', label: i18n.t('statistics.rank') },
    { key: 'displayName', label: i18n.t('statistics.player') },
    { key: 'wins', label: i18n.t('statistics.wins') },
    { key: 'winRate', label: i18n.t('statistics.winRate') },
    { key: 'gamesPlayed', label: i18n.t('statistics.gamesPlayed') },
  ];
  if (showAverageScore) columns.push({ key: 'averageScore', label: i18n.t('statistics.averageScore') });
  header.append(headerRow);
  table.append(caption, header);

  const body = document.createElement('tbody');
  table.append(body);
  const wrapper = node('div', '', 'statistics-table-scroll'); wrapper.append(table); container.append(wrapper);
  let sortKey = 'wins'; let direction = 'descending';
  const renderRows = () => {
    body.replaceChildren();
    const sorted = [...players].sort((a, b) => compareRows(a, b, sortKey, direction));
    sorted.forEach((player, index) => {
      const row = document.createElement('tr');
      const values = [index + 1, player.displayName, player.wins, formatPercent(player.winRate, i18n.locale), player.gamesPlayed];
      if (showAverageScore) values.push(formatScore(player.averageScore, i18n.locale));
      values.forEach((value, cellIndex) => { const cell = node('td', String(value)); cell.dataset.label = columns[cellIndex].label; row.append(cell); });
      body.append(row);
      if (showGameDetails) {
        const detailRow = node('tr', '', 'statistics-detail-row'); const detailCell = document.createElement('td'); detailCell.colSpan = columns.length;
        const details = node('details', ''); details.append(node('summary', i18n.t('statistics.byGame'))); const gameList = node('ul', '', 'statistics-game-list');
        for (const game of player.games) { const name = currentGameName(game.gameId, game.gameNameAtPlay, games, i18n.locale); gameList.append(node('li', i18n.t('statistics.gameResult', { game: name, played: game.gamesPlayed, wins: game.wins, winRate: formatPercent(game.winRate, i18n.locale) }))); }
        details.append(gameList); detailCell.append(details); detailRow.append(detailCell); body.append(detailRow);
      }
    });
  };
  const renderHeaders = () => {
    headerRow.replaceChildren();
    columns.forEach((column) => {
      const th = document.createElement('th');
      if (column.key === 'rank') { th.textContent = column.label; headerRow.append(th); return; }
      if (column.key === sortKey) th.setAttribute('aria-sort', direction);
      const button = node('button', column.label, 'statistics-sort-button'); button.type = 'button';
      button.addEventListener('click', () => { if (sortKey === column.key) direction = direction === 'ascending' ? 'descending' : 'ascending'; else { sortKey = column.key; direction = column.key === 'displayName' ? 'ascending' : 'descending'; } renderHeaders(); renderRows(); });
      th.append(button); headerRow.append(th);
    });
  };
  renderHeaders(); renderRows();
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
      const circle = svgNode('circle', { cx: x(index), cy: y(value), r: 3.5, class: `statistics-point statistics-line-${seriesIndex % 6}` }); const pointTitle = svgNode('title'); pointTitle.textContent = `${item.name}, ${item.labels?.[index] ?? index + 1}: ${formatScore(value, i18n.locale)}`; circle.append(pointTitle); svg.append(circle);
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
  rounds.forEach((round, index) => { const group = node('div', '', 'statistics-round-group'); group.append(node('strong', `${i18n.t('session.round', { number: index + 1, scores: '' }).replace(/: $/, '')}`)); const bars = node('div', '', 'statistics-round-bars-inner'); players.forEach((player) => { const score = round[player.key]; const wrapper = node('div', '', 'statistics-round-bar-wrap'); const bar = node('div', ``, `statistics-round-bar statistics-line-${players.indexOf(player) % 6}`); bar.style.height = `${Math.max(2, (Math.abs(score ?? 0) / max) * 100)}%`; bar.title = `${player.displayName}: ${formatScore(score, i18n.locale)}`; bar.setAttribute('aria-label', bar.title); wrapper.append(node('span', formatScore(score, i18n.locale), 'statistics-round-value'), bar, node('small', player.displayName)); bars.append(wrapper); }); group.append(bars); chart.append(group); });
  const figure = node('figure', '', 'statistics-chart'); figure.append(node('figcaption', title), chart); container.append(figure);
}

function renderRoundStandings(container, title, players, rounds, i18n, ranking = 'highest') {
  if (!rounds.length) return;
  const wrapper = node('div', '', 'statistics-table-scroll'); const table = node('table', '', 'statistics-leaderboard'); table.append(node('caption', title));
  const head = document.createElement('thead'); const headRow = document.createElement('tr'); [i18n.t('statistics.round'), ...players.map((player) => player.displayName), i18n.t('statistics.leader')].forEach((label) => headRow.append(node('th', label))); head.append(headRow); table.append(head);
  const cumulative = Object.fromEntries(players.map((player) => [player.key, 0])); const body = document.createElement('tbody');
  rounds.forEach((round, index) => {
    players.forEach((player) => { if (Number.isFinite(round[player.key])) cumulative[player.key] += round[player.key]; });
    const scores = players.map((player) => ({ ...player, score: cumulative[player.key] })).filter((item) => Number.isFinite(item.score)); const best = scores.length ? (ranking === 'lowest' ? Math.min(...scores.map((item) => item.score)) : Math.max(...scores.map((item) => item.score))) : null; const leaders = scores.filter((item) => item.score === best);
    const row = document.createElement('tr'); row.append(node('td', String(index + 1))); players.forEach((player) => { const cell = node('td', formatScore(cumulative[player.key], i18n.locale)); if (leaders.some((leader) => leader.key === player.key)) cell.classList.add('is-leader'); row.append(cell); }); row.append(node('td', leaders.map((leader) => leader.displayName).join(', ') || '—')); body.append(row);
  });
  table.append(body); wrapper.append(table); container.append(wrapper);
}

function renderRoundAnalyticsSummary(container, analytics, i18n) {
  if (!analytics.players.length) return;
  const metrics = node('div', '', 'statistics-overview');
  [[i18n.t('statistics.roundSessions'), analytics.sessionCount], [i18n.t('statistics.averageLeadChanges'), formatScore(analytics.averageLeadChanges, i18n.locale)]].forEach(([label, value]) => { const item = node('div', '', 'statistics-overview-item'); item.append(node('strong', String(value)), node('span', label)); metrics.append(item); }); container.append(metrics);
  renderSortableTable(container, [
    { key: 'displayName', type: 'text', label: i18n.t('statistics.player') }, { key: 'roundsPlayed', label: i18n.t('statistics.roundsPlayed') },
    { key: 'averageRoundScore', label: i18n.t('statistics.averageRoundScore'), render: (player) => formatScore(player.averageRoundScore, i18n.locale) },
    { key: 'consistency', label: i18n.t('statistics.scoreConsistency'), render: (player) => formatScore(player.consistency, i18n.locale) },
    { key: 'halfwayConversion', label: i18n.t('statistics.halfwayConversion'), render: (player) => player.halfwayConversion === null ? '—' : formatPercent(player.halfwayConversion, i18n.locale) },
    { key: 'comebackWins', label: i18n.t('statistics.comebackWins') },
  ], analytics.players, i18n, { caption: i18n.t('statistics.roundInsights'), defaultKey: 'comebackWins' });
  container.append(node('p', i18n.t('statistics.consistencyHelp'), 'statistics-chart-note'));
}

function renderNormalCharts(container, sessions, statistics, games, i18n, globalFilters = {}) {
  if (!statistics.games.length) return;

  const label = node('label', i18n.t('statistics.chooseGame')); label.htmlFor = 'statistics-chart-game-select';
  const select = document.createElement('select'); select.id = 'statistics-chart-game-select';
  statistics.games.forEach((game) => { const option = document.createElement('option'); option.value = game.gameId; option.textContent = currentGameName(game.gameId, game.gameNameAtPlay, games, i18n.locale); select.append(option); });
  const trendContent = node('div', '', 'statistics-trend-content');
  const render = () => {
    trendContent.replaceChildren();
    const chartData = calculateGameAnalytics(sessions, select.value, i18n.locale);
    const selected = new Set(normalizedPlayerKeys(globalFilters.playerKeys));
    chartData.players = chartData.players.filter((player) => !selected.size || selected.has(player.key));
    const engine = sessions.find((session) => String(session.gameId ?? session.gameNameAtPlay ?? '') === select.value)?.scoring?.engineId;
    if (engine === 'winner-only') {
      const originalById = new Map(sessions.map((session) => [session.id, session]));
      const series = chartData.players.map((player) => { let played = 0; let wins = 0; return { name: player.displayName, labels: chartData.sessions.map((item) => item.label), points: chartData.sessions.map((item) => { const original = originalById.get(item.id); if (!sessionPlayerKeys(original).has(player.key)) return null; played += 1; if (winnerPlayerKeys(original).has(player.key)) wins += 1; return (wins / played) * 100; }) }; });
      renderLineChart(trendContent, i18n.t('statistics.chartWinRateOverTime'), series, i18n, i18n.t('statistics.chartSessionAxis'));
    } else if (engine === 'round-sum') {
      renderRoundAnalyticsSummary(trendContent, calculateRoundAnalytics(sessions, select.value, globalFilters), i18n);
      const roundSessions = chartData.sessions.filter((session) => session.rounds.length);
      if (!roundSessions.length) { trendContent.append(node('p', i18n.t('statistics.noNumericScores'))); return; }
      const sessionLabel = node('label', i18n.t('statistics.chooseSession')); const sessionSelect = document.createElement('select'); sessionLabel.append(sessionSelect); roundSessions.forEach((session) => { const option = node('option', session.label); option.value = session.id; sessionSelect.append(option); }); sessionSelect.value = roundSessions.at(-1).id;
      const explorer = node('div', '', 'statistics-session-explorer'); trendContent.append(node('h3', i18n.t('statistics.sessionExplorer')), sessionLabel, sessionSelect, explorer);
      const renderSession = () => { explorer.replaceChildren(); const selectedSession = roundSessions.find((session) => session.id === sessionSelect.value); if (!selectedSession) return; const players = selectedSession.participants.map((participant) => ({ key: groupPlayerKey(participant), displayName: String(participant.displayName).trim() })).filter((player) => !selected.size || selected.has(player.key));
        renderLineChart(explorer, i18n.t('statistics.chartScoreProgression'), players.map((player) => { let total = 0; return { name: player.displayName, labels: selectedSession.rounds.map((_, index) => String(index + 1)), points: selectedSession.rounds.map((round) => { const score = round[player.key]; if (!Number.isFinite(score)) return null; total += score; return total; }) }; }), i18n, i18n.t('statistics.chartRoundAxis'));
        renderGroupedRoundBars(explorer, i18n.t('statistics.chartScorePerRound'), players, selectedSession.rounds, i18n); renderRoundStandings(explorer, i18n.t('statistics.standingsByRound'), players, selectedSession.rounds, i18n, selectedSession.ranking); };
      sessionSelect.addEventListener('change', renderSession); renderSession();
    } else {
      const numericSessions = chartData.sessions.filter((item) => Object.keys(item.scores).length);
      if (numericSessions.length) renderLineChart(trendContent, i18n.t('statistics.chartScoresBySession'), chartData.players.map((player) => ({ name: player.displayName, labels: numericSessions.map((item) => item.label), points: numericSessions.map((item) => item.scores[player.key] ?? null) })), i18n, i18n.t('statistics.chartSessionAxis'));
      else trendContent.append(node('p', i18n.t('statistics.noNumericScores')));
    }
  };
  select.addEventListener('change', render);
  container.append(label, select, trendContent); render();
}

function renderStatisticsDashboard(container, sessions, games, i18n, filters) {
  container.replaceChildren();
  const insights = calculateCompetitionInsights(sessions, filters);
  const statistics = insights.statistics;
  const filteredSessions = filterStatisticsSessions(sessions, filters);
  const marioSessions = filteredSessions.filter((session) => session?.scoring?.engineId === 'mario-kart-8');
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
    renderNormalCharts(chartsPanel, filteredSessions, statistics, games, i18n, filters);
  }
  let marioPanel;
  if (marioSessions.length) { marioPanel = addTab('mario-kart', i18n.t('statistics.tabMarioKart')); renderMarioKartDashboard(marioPanel, marioSessions, i18n, filters); }
  if (statistics.players.length) {
  const overview = node('div', '', 'statistics-overview');
  for (const [label, value] of [
    [i18n.t('statistics.sessions'), statistics.sessionCount],
    [i18n.t('statistics.mostWins'), insights.mostWins ? `${insights.mostWins.displayName} · ${insights.mostWins.wins}` : '—'],
    [i18n.t('statistics.bestWinRate'), insights.bestWinRate ? `${insights.bestWinRate.displayName} · ${formatPercent(insights.bestWinRate.winRate, i18n.locale)} (${insights.bestWinRate.wins}/${insights.bestWinRate.gamesPlayed})` : i18n.t('statistics.notEnoughData')],
    [i18n.t('statistics.currentStreak'), insights.bestStreak?.streak ? `${insights.bestStreak.displayName} · ${insights.bestStreak.streak}` : '—'],
  ]) {
    const metric = node('div', '', 'statistics-overview-item');
    metric.append(node('strong', String(value)), node('span', label));
    overview.append(metric);
  }
  overviewPanel.append(overview);
  const selectedKeys = normalizedPlayerKeys(filters.playerKeys);
  if (insights.headToHead) {
    const names = new Map(sessions.flatMap((session) => (session.participants ?? []).map((participant) => [groupPlayerKey(participant), String(participant.displayName).trim()])));
    const head = node('section', '', 'statistics-head-to-head'); head.append(node('h3', i18n.t('statistics.headToHead')));
    const comparison = node('div', '', 'statistics-overview'); [[i18n.t('statistics.sharedSessions'), insights.headToHead.sharedSessions], [names.get(insights.headToHead.first) ?? insights.headToHead.first, insights.headToHead.firstWins], [names.get(insights.headToHead.second) ?? insights.headToHead.second, insights.headToHead.secondWins], [i18n.t('statistics.tiesNoWinner'), insights.headToHead.ties]].forEach(([label, value]) => { const item = node('div', '', 'statistics-overview-item'); item.append(node('strong', String(value)), node('span', label)); comparison.append(item); }); head.append(comparison); overviewPanel.append(head);
  } else overviewPanel.append(node('p', selectedKeys.length ? i18n.t('statistics.selectTwoPlayers') : i18n.t('statistics.headToHeadHint'), 'statistics-chart-note'));
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

function localDayBoundary(value, end = false) {
  if (!value) return null; const [year, month, day] = value.split('-').map(Number); const date = new Date(year, month - 1, day, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0); return date.getTime();
}

/** Render the Statistics tab using the already-loaded session history. */
export function renderStatistics(container, sessions, games, i18n) {
  container.replaceChildren();
  const playerNames = [...new Map(sessions.flatMap((session) => (session.participants ?? []).map((participant) => [groupPlayerKey(participant), String(participant.displayName).trim()]))).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const filters = { playerKeys: [], sharedOnly: false, from: null, to: null };
  const controls = node('section', '', 'statistics-filter-panel'); controls.setAttribute('aria-label', i18n.t('statistics.filters'));
  const filterGrid = node('div', '', 'statistics-global-filters');
  const periodLabel = node('label', i18n.t('statistics.period')); const period = document.createElement('select'); periodLabel.append(period);
  [['all', 'statistics.allTime'], ['30', 'statistics.last30Days'], ['90', 'statistics.last90Days'], ['year', 'statistics.thisYear'], ['custom', 'statistics.customRange']].forEach(([value, key]) => { const option = node('option', i18n.t(key)); option.value = value; period.append(option); });
  const players = node('details', '', 'statistics-player-filter'); const playerSummary = node('summary', i18n.t('statistics.allPlayers')); players.append(playerSummary); const playerList = node('fieldset', '', 'statistics-player-options'); playerList.append(node('legend', i18n.t('statistics.players')));
  const customDates = node('div', '', 'statistics-custom-dates hidden'); const fromLabel = node('label', i18n.t('statistics.from')); const fromInput = document.createElement('input'); fromInput.type = 'date'; fromLabel.append(fromInput); const toLabel = node('label', i18n.t('statistics.to')); const toInput = document.createElement('input'); toInput.type = 'date'; toLabel.append(toInput); customDates.append(fromLabel, toLabel);
  const sharedLabel = node('label', '', 'statistics-toggle'); const sharedInput = document.createElement('input'); sharedInput.type = 'checkbox'; sharedInput.disabled = true; sharedLabel.append(sharedInput, node('span', i18n.t('statistics.sharedOnly')));
  const clear = node('button', i18n.t('statistics.clearFilters'), 'secondary statistics-clear-filters'); clear.type = 'button'; const error = node('p', '', 'error hidden'); error.setAttribute('role', 'alert');
  const results = node('div');
  const updateSummary = () => { playerSummary.textContent = filters.playerKeys.length ? i18n.t('statistics.selectedPlayers', { count: filters.playerKeys.length }) : i18n.t('statistics.allPlayers'); sharedInput.disabled = filters.playerKeys.length < 2; if (sharedInput.disabled) { sharedInput.checked = false; filters.sharedOnly = false; } };
  const render = () => { updateSummary(); renderStatisticsDashboard(results, sessions, games, i18n, filters); };
  playerNames.forEach(([key, displayName]) => { const label = node('label', '', 'statistics-player-option'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = key; checkbox.addEventListener('change', () => { filters.playerKeys = [...playerList.querySelectorAll('input:checked')].map((input) => input.value); render(); }); label.append(checkbox, node('span', displayName)); playerList.append(label); }); players.append(playerList);
  const applyPeriod = () => { const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); filters.from = null; filters.to = null; customDates.classList.toggle('hidden', period.value !== 'custom'); if (period.value === '30' || period.value === '90') { const days = Number(period.value); filters.from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1).getTime(); filters.to = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).getTime(); } else if (period.value === 'year') { filters.from = new Date(today.getFullYear(), 0, 1).getTime(); filters.to = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999).getTime(); } else if (period.value === 'custom') { filters.from = localDayBoundary(fromInput.value); filters.to = localDayBoundary(toInput.value, true); } render(); };
  const applyCustom = () => { const from = localDayBoundary(fromInput.value); const to = localDayBoundary(toInput.value, true); const invalid = from !== null && to !== null && from > to; error.textContent = invalid ? i18n.t('statistics.invalidDateRange') : ''; error.classList.toggle('hidden', !invalid); if (invalid) return; filters.from = from; filters.to = to; render(); };
  period.addEventListener('change', applyPeriod); fromInput.addEventListener('change', applyCustom); toInput.addEventListener('change', applyCustom); sharedInput.addEventListener('change', () => { filters.sharedOnly = sharedInput.checked; render(); });
  clear.addEventListener('click', () => { period.value = 'all'; fromInput.value = ''; toInput.value = ''; playerList.querySelectorAll('input').forEach((input) => { input.checked = false; }); sharedInput.checked = false; Object.assign(filters, { playerKeys: [], sharedOnly: false, from: null, to: null }); customDates.classList.add('hidden'); error.classList.add('hidden'); render(); });
  filterGrid.append(periodLabel, players, sharedLabel, clear); controls.append(filterGrid, customDates, error); container.append(controls, results); render();
}
