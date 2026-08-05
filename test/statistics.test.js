import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStatistics, normalizePlayerName } from '../web_app/src/ui/statistics.js';
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
