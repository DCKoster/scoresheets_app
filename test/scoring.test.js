import test from 'node:test';
import assert from 'node:assert/strict';
import { finalTotalEngine, marioKartEngine, rankTotals, roundSumEngine, winnerOnlyEngine } from '../web_app/src/scoring/engines.js';
import { latestCustomItemIds, MARIO_KART_ITEM_PRESETS, MARIO_KART_TRACKS } from '../web_app/src/data/mario-kart.js';

const players = [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }];

test('round-sum calculates negative values and preserves ties', () => {
  const totals = roundSumEngine.calculateTotals({ rounds: [{ id: 'r1', scores: { a: 4, b: -2 } }, { id: 'r2', scores: { a: -6, b: 0 } }] }, players);
  assert.deepEqual(totals, { a: -2, b: -2 });
  assert.deepEqual(rankTotals(totals, 'lowest'), [['a', -2], ['b', -2]]);
  assert.deepEqual(rankTotals({ a: 1, b: 3 }, 'highest'), [['b', 3], ['a', 1]]);
});

test('engines reject blanks and non-finite values', () => {
  assert.equal(roundSumEngine.validateEntry({ a: '', b: 2 }, players).valid, false);
  assert.equal(finalTotalEngine.validateEntry({ a: 'Infinity', b: 2 }, players).valid, false);
  assert.equal(roundSumEngine.validateSession({ rounds: [] }).valid, false);
  assert.deepEqual(finalTotalEngine.validateEntry({ a: '-4', b: '5.5' }, players).entry, { a: -4, b: 5.5 });
});

test('round-sum accepts safe arithmetic formulas while final totals remain numeric', () => {
  assert.deepEqual(roundSumEngine.validateEntry({ a: '30+40', b: '(5 + 3) * 2' }, players).entry, { a: 70, b: 16 });
  assert.deepEqual(roundSumEngine.validateEntry({ a: '10 / 0', b: 2 }, players), { valid: false, error: 'errors.scoreFormula' });
  assert.deepEqual(roundSumEngine.validateEntry({ a: '2 + nope', b: 2 }, players), { valid: false, error: 'errors.scoreFormula' });
  assert.equal(finalTotalEngine.validateEntry({ a: '30+40', b: 2 }, players).valid, false);
});

test('numeric engines support named score categories and aggregate totals', () => {
  const categories = ['Red', 'Blue'];
  const round = roundSumEngine.validateEntry({ a: { Red: '2', Blue: '3' }, b: { Red: '-1', Blue: '4' } }, players, categories);
  assert.deepEqual(round.entry, { a: { Red: 2, Blue: 3 }, b: { Red: -1, Blue: 4 } });
  const entries = { rounds: [{ id: 'r', scores: round.entry }] };
  assert.deepEqual(roundSumEngine.calculateTotals(entries, players, categories), { a: 5, b: 3 });
  assert.deepEqual(roundSumEngine.calculateCategoryTotals(entries, players, categories), { Red: { a: 2, b: -1 }, Blue: { a: 3, b: 4 } });
  const final = finalTotalEngine.validateEntry({ a: { Red: '5', Blue: '1' }, b: { Red: '2', Blue: '7' } }, players, categories);
  assert.deepEqual(finalTotalEngine.calculateTotals({ values: final.entry }, players, categories), { a: 6, b: 9 });
});

test('round scorecard normalizes entries and keeps the existing totals and validation', () => {
  const categories = ['Red', 'Blue'];
  const rounds = [
    { id: 'r1', scores: { a: { Red: '2 * 3', Blue: 2.5 }, b: { Red: '-2', Blue: 4 }, extra: 50 } },
    { id: 'r2', scores: { a: { Red: 1, Blue: -3 }, b: { Red: '1 / 2', Blue: '0' } } },
  ];
  const entries = { rounds: rounds.map(({ id, scores }) => ({
    id, scores: roundSumEngine.validateEntry(scores, players, categories).entry,
  })) };
  assert.deepEqual(roundSumEngine.scorecard(rounds, players, categories), {
    valid: true,
    entries: { roundScores: [['r1', 6, 2.5, -2, 4], ['r2', 1, -3, 0.5, 0]] },
    totals: roundSumEngine.calculateTotals(entries, players, categories),
    categoryTotals: roundSumEngine.calculateCategoryTotals(entries, players, categories),
  });
  assert.deepEqual(roundSumEngine.scorecard([{ id: 'invalid', scores: { a: '1 / 0', b: 4 } }], players),
    { valid: false, error: 'errors.scoreFormula' });
});

test('winner-only engine accepts multiple winners and legacy results', () => {
  assert.equal(winnerOnlyEngine.validateSession({}, players).valid, false);
  assert.equal(winnerOnlyEngine.validateSession({ winnerIds: [] }, players).valid, true);
  assert.equal(winnerOnlyEngine.validateSession({ winnerIds: ['a', 'b'] }, players).valid, true);
  assert.equal(winnerOnlyEngine.validateSession({ winnerIds: ['a', 'a'] }, players).valid, false);
  assert.equal(winnerOnlyEngine.validateSession({ winnerId: null }, players).valid, true);
  assert.equal(winnerOnlyEngine.validateSession({ winnerId: 'a' }, players).valid, true);
  assert.equal(winnerOnlyEngine.validateSession({ winnerId: 'missing' }, players).valid, false);
  assert.deepEqual(winnerOnlyEngine.calculateTotals(), {});
});

test('Mario Kart engine converts unique placements to standard points', () => {
  const players = [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }, { id: 'c', displayName: 'C' }, { id: 'd', displayName: 'D' }];
  const result = marioKartEngine.validateEntry({ cc: '200cc', itemSet: 'custom', itemIds: ['Mushroom'], participantIds: ['a', 'b', 'c', 'd'], placements: { a: 1, b: 5, c: 8, d: 12 } }, players);
  assert.equal(result.valid, true);
  assert.equal(MARIO_KART_TRACKS.length, 96);
  assert.deepEqual(result.entry.points, { a: 15, b: 8, c: 5, d: 1 });
  assert.equal(marioKartEngine.validateEntry({ cc: '200cc', itemSet: 'custom', itemIds: ['Mushroom'], participantIds: ['a', 'b'], placements: { a: 1, b: 1 } }, players).valid, false);
  assert.equal(marioKartEngine.validateEntry({ track: 'Mario Kart Stadium', cc: '200cc', itemSet: 'custom', itemIds: ['Mushroom'], participantIds: ['a', 'b'], placements: { a: 1, b: 2 } }, players).entry.track, 'Mario Kart Stadium');
  assert.equal(marioKartEngine.validateEntry({ track: 'Not a track', cc: '200cc', itemSet: 'custom', itemIds: ['Mushroom'], participantIds: ['a', 'b'], placements: { a: 1, b: 2 } }, players).valid, false);
  const secondRace = { ...result.entry, cc: '150cc' };
  assert.equal(marioKartEngine.validateSession({ races: [result.entry, secondRace] }, players).valid, false);
  assert.deepEqual(marioKartEngine.calculateTotals({ races: [result.entry] }, players), { a: 15, b: 8, c: 5, d: 1 });
});

test('Mario Kart supports empty-item presets and restores the latest custom selection', () => {
  const baseRace = { cc: '150cc', participantIds: ['a', 'b'], placements: { a: 1, b: 2 }, itemIds: [] };
  assert.deepEqual(MARIO_KART_ITEM_PRESETS['no-items'].items, []);
  assert.deepEqual(MARIO_KART_ITEM_PRESETS['no-items-or-coins'].items, []);
  assert.equal(marioKartEngine.validateEntry({ ...baseRace, itemSet: 'no-items' }, players).valid, true);
  assert.equal(marioKartEngine.validateEntry({ ...baseRace, itemSet: 'no-items-or-coins' }, players).valid, true);
  assert.equal(marioKartEngine.validateEntry({ ...baseRace, itemSet: 'custom' }, players).valid, false);
  const sessions = [
    { createdAt: '2026-01-01', scoring: { engineId: 'mario-kart-8' }, entries: { races: [{ itemSet: 'custom', itemIds: ['Banana'] }] } },
    { createdAt: '2026-02-01', scoring: { engineId: 'mario-kart-8' }, marioKartSetup: { itemSet: 'custom', itemIds: ['Mushroom', 'Boo'] }, entries: { races: [] } },
  ];
  assert.deepEqual(latestCustomItemIds(sessions), ['Mushroom', 'Boo']);
});
