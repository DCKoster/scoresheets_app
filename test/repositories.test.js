import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_GAMES_KEY, LEGACY_KEY, LocalGameRepository, LocalSessionRepository, SESSIONS_KEY, exportBackup, importBackup, migrateStorage } from '../web_app/src/state/repositories.js';

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('custom games validate, update, duplicate, delete, and reload', async () => {
  const storage = new MemoryStorage();
  const repository = new LocalGameRepository(storage);
  const game = await repository.create({ name: ' My Game ', scoring: { engineId: 'round-sum', ranking: 'highest' } });
  assert.equal(game.name, 'My Game');
  await assert.rejects(() => repository.create({ name: 'my game', scoring: game.scoring }), /errors\.gameNameDuplicate/);
  const updated = await repository.update(game.id, { name: 'Changed', scoring: { engineId: 'final-total', ranking: 'lowest' } });
  const copy = await repository.duplicate(updated.id);
  assert.equal(copy.name, 'Changed copy');
  await repository.delete(updated.id);
  assert.deepEqual((await new LocalGameRepository(storage).list()).filter((item) => item.origin === 'custom').map((item) => item.name), ['Changed copy']);
  await assert.rejects(() => repository.update('take-5', { name: 'No', scoring: { engineId: 'round-sum', ranking: 'lowest' } }), /errors\.builtinReadOnly/);
});

test('built-in aliases are reserved and duplicates use the active locale', async () => {
  const repository = new LocalGameRepository(new MemoryStorage());
  const scoring = { engineId: 'final-total', ranking: 'highest' };
  await assert.rejects(() => repository.create({ name: 'Pick-omino', scoring }), /errors\.gameNameDuplicate/);
  await assert.rejects(() => repository.create({ name: 'regenwormen', scoring }), /errors\.gameNameDuplicate/);
  const copy = await repository.duplicate('regenwormen', 'nl', (name) => `Kopie van ${name}`);
  assert.equal(copy.name, 'Kopie van Regenwormen');
  const dirtyPig = (await repository.list()).find((game) => game.id === 'dirty-pig');
  assert.deepEqual(dirtyPig.scoring, { engineId: 'winner-only', ranking: 'selected' });
  await assert.rejects(() => repository.create({ name: 'Moddervarkens', scoring }), /errors\.gameNameDuplicate/);
});

test('winner-only games use the selected-result ranking', async () => {
  const repository = new LocalGameRepository(new MemoryStorage());
  const game = await repository.create({ name: 'Quick round', scoring: { engineId: 'winner-only', ranking: 'selected' } });
  assert.deepEqual(game.scoring, { engineId: 'winner-only', ranking: 'selected' });
  await assert.rejects(() => repository.create({ name: 'Bad quick round', scoring: { engineId: 'winner-only', ranking: 'highest' } }), /errors\.rankingUnknown/);
});

test('games normalize metadata and preserve categories when duplicated', async () => {
  const repository = new LocalGameRepository(new MemoryStorage());
  const game = await repository.create({ name: 'Categorized game', category: '  Card game ', playMode: 'competitive', scoreCategories: ['Red', 'Blue'], categoryScoring: 'per-round', scoring: { engineId: 'round-sum', ranking: 'lowest' } });
  assert.deepEqual(game.scoreCategories, ['Red', 'Blue']);
  assert.equal(game.category, 'Card game');
  assert.equal((await repository.duplicate(game.id)).category, 'Card game');
  await assert.rejects(() => repository.create({ name: 'Invalid', category: 'x'.repeat(41), scoring: { engineId: 'final-total', ranking: 'highest' } }), /errors\.categoryTooLong/);
  await assert.rejects(() => repository.create({ name: 'Duplicate categories', scoreCategories: ['Red', 'red'], categoryScoring: 'final-total', scoring: { engineId: 'final-total', ranking: 'highest' } }), /errors\.scoreCategoryDuplicate/);
  await assert.rejects(() => repository.create({ name: 'Bad co-op', playMode: 'cooperative', scoring: { engineId: 'final-total', ranking: 'highest' } }), /errors\.cooperativeEngineInvalid/);
});

test('sessions serialize and retain snapshots independent of games', async () => {
  const storage = new MemoryStorage();
  const repository = new LocalSessionRepository(storage);
  const session = { schemaVersion: 2, id: 's', gameId: 'deleted', gameNameAtPlay: 'Old name', participants: [], scoring: { engineId: 'final-total', ranking: 'lowest' }, entries: { values: {} }, totals: { p: 8 }, createdAt: 'now' };
  await repository.save(session);
  assert.deepEqual(await new LocalSessionRepository(storage).list(), [session]);
});

test('backups export custom records and import only non-conflicting valid records', async () => {
  const source = new MemoryStorage();
  const gameRepository = new LocalGameRepository(source);
  const game = await gameRepository.create({ name: 'Custom game', scoring: { engineId: 'final-total', ranking: 'highest' } });
  const session = {
    schemaVersion: 2, id: 'session-1', gameId: game.id, gameNameAtPlay: game.name, createdAt: '2026-01-01T00:00:00.000Z',
    participants: [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }],
    scoring: { engineId: 'final-total', ranking: 'highest' }, entries: { values: { a: 3, b: 1 } }, totals: { a: 3, b: 1 },
  };
  await new LocalSessionRepository(source).save(session);
  const backup = await exportBackup(source);
  assert.equal(backup.sessions.length, 1);
  assert.deepEqual(backup.customGames.map((item) => item.id), [game.id]);
  assert.equal(backup.customGames.some((item) => item.id === 'take-5'), false);

  const target = new MemoryStorage();
  assert.deepEqual(await importBackup(target, backup), { imported: { sessions: 1, games: 1 }, skipped: { sessions: 0, games: 0 } });
  assert.deepEqual(await importBackup(target, backup), { imported: { sessions: 0, games: 0 }, skipped: { sessions: 1, games: 1 } });
  const prior = target.getItem(SESSIONS_KEY);
  await assert.rejects(() => importBackup(target, { schemaVersion: 1, sessions: [{}], customGames: [] }), /errors\.backupInvalid/);
  assert.equal(target.getItem(SESSIONS_KEY), prior);
});

test('migration converts round and final legacy shapes and is idempotent', async () => {
  const legacy = [
    { gameId: 'take-5', gameName: 'Take 5!', gameType: 'per-round', players: ['A', 'B'], rounds: [{ A: 2, B: 4 }, { A: -1, B: 3 }], totals: { A: 1, B: 7 }, createdAt: 'x' },
    { gameId: 'regenwormen', gameName: 'Regenwormen', players: ['A', 'B'], totals: { A: 5, B: 8 }, createdAt: 'y' },
  ];
  const storage = new MemoryStorage({ [LEGACY_KEY]: JSON.stringify(legacy) });
  assert.equal((await migrateStorage(storage)).migrated, true);
  const sessions = JSON.parse(storage.getItem(SESSIONS_KEY));
  assert.equal(sessions[0].entries.rounds.length, 2);
  assert.deepEqual(Object.values(sessions[0].totals), [1, 7]);
  assert.equal(sessions[1].scoring.engineId, 'final-total');
  assert.equal(storage.getItem(LEGACY_KEY), null);
  assert.equal((await migrateStorage(storage)).migrated, false);
});

test('malformed migration preserves legacy storage', async () => {
  const storage = new MemoryStorage({ [LEGACY_KEY]: '{bad json' });
  const result = await migrateStorage(storage);
  assert.equal(result.error, 'errors.migration');
  assert.ok(result.parameters.message);
  assert.equal(storage.getItem(LEGACY_KEY), '{bad json');
  assert.equal(storage.getItem(SESSIONS_KEY), null);
});
