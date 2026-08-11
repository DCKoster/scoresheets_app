import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateChartData, calculateMarioKartStatistics, calculateStatistics, normalizePlayerName } from '../web_app/src/ui/statistics.js';
import { groupSessionsByGame } from '../web_app/src/ui/history.js';

const session = (id, ranking, scores, gameId = 'game') => ({
  id, gameId, gameNameAtPlay: gameId, scoring: { ranking },
  participants: Object.keys(scores).map((name, index) => ({ id: `${id}-${index}`, displayName: name })),
  totals: Object.fromEntries(Object.entries(scores).map(([name, score], index) => [`${id}-${index}`, score])),
});

test('statistics groups trimmed, case-insensitive player names and calculates averages', () => {
  const result = calculateStatistics([
    session('one', 'highest', { ' Daniel ': 10, Illy: 4 }, 'pickomino'),
    session('two', 'highest', { daniel: 2, Illy: 8 }, 'pickomino'),
  ]);
  assert.equal(normalizePlayerName(' Daniel '), 'daniel');
  assert.deepEqual(result.players.map(({ displayName, gamesPlayed, wins, averageScore }) => ({ displayName, gamesPlayed, wins, averageScore })), [
    { displayName: 'Daniel', gamesPlayed: 2, wins: 1, averageScore: 6 },
    { displayName: 'Illy', gamesPlayed: 2, wins: 1, averageScore: 6 },
  ]);
});

test('statistics respects lowest ranking and counts every tied winner', () => {
  const result = calculateStatistics([session('one', 'lowest', { A: 3, B: 3, C: 5 })]);
  assert.deepEqual(result.players.map(({ displayName, wins }) => [displayName, wins]), [['A', 1], ['B', 1], ['C', 0]]);
});

test('statistics calculates win rates and ranks equal wins by win rate', () => {
  const result = calculateStatistics([
    session('one', 'highest', { A: 10, B: 2 }),
    session('two', 'highest', { B: 10, C: 2 }),
    session('three', 'highest', { A: 1, C: 10 }),
  ]);
  assert.deepEqual(result.players.map(({ displayName, wins, winRate }) => [displayName, wins, winRate]), [
    ['A', 1, 0.5], ['B', 1, 0.5], ['C', 1, 0.5],
  ]);
  assert.equal(result.players[0].games[0].winRate, 0.5);
});

test('statistics returns game-specific standings using the saved game name', () => {
  const result = calculateStatistics([
    session('one', 'highest', { A: 10, B: 2 }, 'deleted-game'),
    session('two', 'highest', { A: 1, B: 8 }, 'deleted-game'),
  ]);
  assert.equal(result.games[0].gameId, 'deleted-game');
  assert.equal(result.games[0].sessionCount, 2);
  assert.deepEqual(result.games[0].players.map(({ displayName, wins, winRate }) => [displayName, wins, winRate]), [
    ['A', 1, 0.5], ['B', 1, 0.5],
  ]);
});

test('winner-only sessions count no-winner results as played without awarding a win', () => {
  const players = [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }];
  const winnerSession = { id: 'one', gameId: 'quick', gameNameAtPlay: 'Quick', participants: players, scoring: { engineId: 'winner-only', ranking: 'selected' }, entries: { winnerId: 'a' }, totals: {} };
  const noWinnerSession = { ...winnerSession, id: 'two', entries: { winnerId: null } };
  const result = calculateStatistics([winnerSession, noWinnerSession]);
  assert.deepEqual(result.players.map(({ displayName, gamesPlayed, wins, winRate }) => [displayName, gamesPlayed, wins, winRate]), [
    ['A', 2, 1, 0.5], ['B', 2, 0, 0],
  ]);
  assert.equal(result.games[0].sessionCount, 2);
  assert.equal(result.players[0].averageScore, null);
});

test('winner-only sessions award every selected winner', () => {
  const players = [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }];
  const session = { id: 'co-op', gameId: 'quick', gameNameAtPlay: 'Quick', participants: players, scoring: { engineId: 'winner-only', ranking: 'selected' }, entries: { winnerIds: ['a', 'b'] }, totals: {} };
  const result = calculateStatistics([session]);
  assert.deepEqual(result.players.map(({ displayName, wins }) => [displayName, wins]), [['A', 1], ['B', 1]]);
});

test('game standings average only numeric scores when game history includes winner-only sessions', () => {
  const numeric = session('one', 'highest', { A: 10, B: 4 }, 'quick');
  const winnerOnly = {
    id: 'two', gameId: 'quick', gameNameAtPlay: 'quick',
    participants: [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }],
    scoring: { engineId: 'winner-only', ranking: 'selected' }, entries: { winnerId: 'b' }, totals: {},
  };
  const result = calculateStatistics([numeric, winnerOnly]);
  assert.deepEqual(result.games[0].players.map(({ displayName, averageScore }) => [displayName, averageScore]), [['A', 10], ['B', 4]]);
});

test('history groups sessions by game while preserving their first-seen order', () => {
  const groups = groupSessionsByGame([
    { id: 'one', gameId: 'a', gameNameAtPlay: 'A' },
    { id: 'two', gameId: 'b', gameNameAtPlay: 'B' },
    { id: 'three', gameId: 'a', gameNameAtPlay: 'A' },
  ]);
  assert.deepEqual(groups.map(({ gameId, sessions }) => [gameId, sessions.map((session) => session.id)]), [
    ['a', ['one', 'three']], ['b', ['two']],
  ]);
});

test('Mario Kart statistics filter by CC and individual items with variable participation', () => {
  const session = {
    id: 'mk', gameId: 'mario-kart-8', gameNameAtPlay: 'Mario Kart 8', scoring: { engineId: 'mario-kart-8', ranking: 'highest' },
    participants: [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }, { id: 'c', displayName: 'C' }],
    entries: { races: [
      { cc: '200cc', itemSet: 'custom', itemIds: ['Mushroom'], participantIds: ['a', 'b'], placements: { a: 1, b: 2 }, points: { a: 15, b: 12 } },
      { cc: '150cc', itemSet: 'frantic', itemIds: ['Mushroom', 'Red Shell'], participantIds: ['a', 'c'], placements: { a: 3, c: 1 }, points: { a: 10, c: 15 } },
    ] }, totals: { a: 25, b: 12, c: 15 }, targetRaces: 2,
  };
  const result = calculateMarioKartStatistics([session], { cc: '200cc', item: 'Mushroom' });
  assert.deepEqual(result.players.map(({ displayName, races, wins, averagePoints }) => [displayName, races, wins, averagePoints]), [['A', 1, 1, 15], ['B', 1, 0, 12]]);
  assert.equal(calculateMarioKartStatistics([session], { item: 'Red Shell' }).players[0].displayName, 'C');
});

test('Mario Kart statistics distinguish race wins from session wins', () => {
  const session = {
    id: 'mk-session', gameId: 'mario-kart-8', gameNameAtPlay: 'Mario Kart 8', scoring: { engineId: 'mario-kart-8', ranking: 'highest' },
    participants: [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }],
    entries: { races: [
      { cc: '150cc', itemSet: 'normal', itemIds: [], participantIds: ['a', 'b'], placements: { a: 1, b: 2 }, points: { a: 15, b: 12 } },
      { cc: '150cc', itemSet: 'normal', itemIds: [], participantIds: ['a', 'b'], placements: { a: 2, b: 1 }, points: { a: 12, b: 15 } },
    ] },
    totals: { a: 27, b: 27 },
  };
  const result = calculateMarioKartStatistics([session]);
  assert.deepEqual(result.players.map(({ displayName, races, wins, winRate, sessions, sessionWins, sessionWinRate }) => [displayName, races, wins, winRate, sessions, sessionWins, sessionWinRate]), [
    ['A', 2, 1, 0.5, 1, 1, 1],
    ['B', 2, 1, 0.5, 1, 1, 1],
  ]);
});

test('normal statistics and chart data exclude Mario Kart sessions', () => {
  const normal = session('normal', 'highest', { A: 10, B: 2 }, 'scores');
  const mario = { ...normal, id: 'mario', gameId: 'mario-kart-8', scoring: { engineId: 'mario-kart-8', ranking: 'highest' }, entries: { races: [] } };
  const result = calculateStatistics([normal, mario]);
  assert.equal(result.sessionCount, 1);
  assert.equal(result.gameCount, 1);
  assert.deepEqual(result.players.map(({ displayName }) => displayName), ['A', 'B']);
  assert.equal(calculateChartData([normal, mario], 'scores').sessions.length, 1);
  assert.equal(calculateChartData([normal, mario], 'mario-kart-8').sessions.length, 0);
});

test('chart data calculates chronological final scores and cumulative category rounds', () => {
  const rounds = {
    id: 'rounds', gameId: 'rounds', gameNameAtPlay: 'Rounds', createdAt: '2026-01-02',
    scoring: { engineId: 'round-sum', ranking: 'highest' },
    participants: [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }],
    entries: { rounds: [
      { id: 'r1', scores: { a: { Red: 3, Blue: -1 }, b: { Red: 2, Blue: 2 } } },
      { id: 'r2', scores: { a: { Red: 4, Blue: 1 }, b: { Red: -2, Blue: 3 } } },
    ] },
    totals: { a: 7, b: 5 },
  };
  const earlier = { ...rounds, id: 'earlier', createdAt: '2026-01-01', totals: { a: 4, b: 1 }, entries: { rounds: [{ id: 'r1', scores: { a: 4, b: 1 } }] } };
  const result = calculateChartData([rounds, earlier], 'rounds');
  assert.deepEqual(result.sessions.map(({ id }) => id), ['earlier', 'rounds']);
  assert.deepEqual(result.sessions[1].scores, { a: 7, b: 5 });
  assert.deepEqual(result.sessions[1].rounds, [{ a: 2, b: 4 }, { a: 5, b: 1 }]);
});

test('winner-only chart data has participants but no numeric score series', () => {
  const winner = { id: 'winner', gameId: 'quick', gameNameAtPlay: 'Quick', createdAt: '2026-01-01', scoring: { engineId: 'winner-only', ranking: 'selected' }, participants: [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }], entries: { winnerId: 'a' }, totals: {} };
  const result = calculateChartData([winner], 'quick');
  assert.deepEqual(result.players.map(({ displayName }) => displayName), ['A', 'B']);
  assert.deepEqual(result.sessions[0].scores, {});
});
