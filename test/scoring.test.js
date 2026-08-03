import test from 'node:test';
import assert from 'node:assert/strict';
import { finalTotalEngine, rankTotals, roundSumEngine } from '../web_app/src/scoring/engines.js';

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
