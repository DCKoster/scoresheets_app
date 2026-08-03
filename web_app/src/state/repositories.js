import { BUILTIN_GAMES } from '../data/games.js';

export const CUSTOM_GAMES_KEY = 'scoresheets-web-games-v2';
export const SESSIONS_KEY = 'scoresheets-web-sessions-v2';
export const LEGACY_KEY = 'scoresheets-web-v1';

export function createId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function readArray(storage, key) {
  const raw = storage.getItem(key);
  if (raw === null) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`Stored ${key} data is not a list.`);
  return parsed;
}

export function validateGameName(name, games, exceptId = null) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return { valid: false, error: 'Game name is required.' };
  const duplicate = games.some(
    (game) => game.id !== exceptId && game.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
  );
  return duplicate
    ? { valid: false, error: 'A game with that name already exists.' }
    : { valid: true, name: trimmed };
}

function validateScoring(scoring) {
  if (!['round-sum', 'final-total'].includes(scoring?.engineId)) throw new Error('Unknown scoring engine.');
  if (!['highest', 'lowest'].includes(scoring?.ranking)) throw new Error('Unknown ranking objective.');
}

export class LocalGameRepository {
  constructor(storage) { this.storage = storage; }
  async list() { return [...BUILTIN_GAMES, ...readArray(this.storage, CUSTOM_GAMES_KEY)]; }
  async create(input) {
    const games = await this.list();
    const result = validateGameName(input.name, games);
    if (!result.valid) throw new Error(result.error);
    validateScoring(input.scoring);
    const game = { schemaVersion: 2, id: createId('game'), name: result.name, origin: 'custom', scoring: { ...input.scoring } };
    const custom = games.filter((item) => item.origin === 'custom');
    this.storage.setItem(CUSTOM_GAMES_KEY, JSON.stringify([...custom, game]));
    return game;
  }
  async update(id, changes) {
    const games = await this.list();
    const existing = games.find((game) => game.id === id);
    if (!existing) throw new Error('Game not found.');
    if (existing.origin !== 'custom') throw new Error('Built-in games are read-only.');
    const result = validateGameName(changes.name, games, id);
    if (!result.valid) throw new Error(result.error);
    validateScoring(changes.scoring);
    const updated = { ...existing, name: result.name, scoring: { ...changes.scoring } };
    const custom = games.filter((game) => game.origin === 'custom').map((game) => game.id === id ? updated : game);
    this.storage.setItem(CUSTOM_GAMES_KEY, JSON.stringify(custom));
    return updated;
  }
  async duplicate(id) {
    const games = await this.list();
    const source = games.find((game) => game.id === id);
    if (!source) throw new Error('Game not found.');
    let name = `${source.name} copy`;
    let number = 2;
    while (!validateGameName(name, games).valid) name = `${source.name} copy ${number++}`;
    return this.create({ name, scoring: source.scoring });
  }
  async delete(id) {
    const games = await this.list();
    const existing = games.find((game) => game.id === id);
    if (!existing) return false;
    if (existing.origin !== 'custom') throw new Error('Built-in games cannot be deleted.');
    this.storage.setItem(CUSTOM_GAMES_KEY, JSON.stringify(games.filter((game) => game.origin === 'custom' && game.id !== id)));
    return true;
  }
}

export class LocalSessionRepository {
  constructor(storage) { this.storage = storage; }
  async list() { return readArray(this.storage, SESSIONS_KEY); }
  async save(session) {
    const sessions = await this.list();
    this.storage.setItem(SESSIONS_KEY, JSON.stringify([session, ...sessions.filter((item) => item.id !== session.id)]));
    return session;
  }
  async delete(id) {
    const sessions = await this.list();
    this.storage.setItem(SESSIONS_KEY, JSON.stringify(sessions.filter((session) => session.id !== id)));
  }
}

function numberMap(source, participants) {
  const result = {};
  participants.forEach((participant) => {
    const value = source?.[participant.displayName];
    if (!Number.isFinite(Number(value))) throw new Error('Legacy session contains an invalid score.');
    result[participant.id] = Number(value);
  });
  return result;
}

export function migrateLegacySessions(legacy) {
  if (!Array.isArray(legacy)) throw new Error('Legacy session data is not a list.');
  return legacy.map((old) => {
    const names = Array.isArray(old.players) ? old.players : Object.keys(old.totals ?? {});
    if (names.length < 2 || names.some((name) => !String(name).trim())) throw new Error('Legacy session has invalid players.');
    const participants = names.map((name) => ({ id: createId('participant'), displayName: String(name).trim() }));
    const isRound = old.gameId === 'take-5' || old.gameType === 'per-round' || old.gameType === 'round-sum';
    const engineId = isRound ? 'round-sum' : 'final-total';
    const entries = isRound
      ? { rounds: (old.rounds ?? []).map((round) => ({ id: createId('round'), scores: numberMap(round, participants) })) }
      : { values: numberMap(old.totals, participants) };
    const totals = isRound
      ? participants.reduce((all, participant) => ({ ...all, [participant.id]: entries.rounds.reduce((sum, round) => sum + round.scores[participant.id], 0) }), {})
      : { ...entries.values };
    return {
      schemaVersion: 2,
      id: old.id || createId('session'),
      gameId: old.gameId || (isRound ? 'take-5' : 'regenwormen'),
      gameNameAtPlay: old.gameNameAtPlay || old.gameName || (isRound ? 'Take 5!' : 'Regenwormen'),
      participants,
      scoring: { engineId, ranking: isRound ? 'lowest' : 'highest' },
      entries,
      totals,
      createdAt: old.createdAt || new Date().toISOString(),
    };
  });
}

export async function migrateStorage(storage) {
  if (storage.getItem(SESSIONS_KEY) !== null || storage.getItem(LEGACY_KEY) === null) return { migrated: false };
  try {
    const migrated = migrateLegacySessions(JSON.parse(storage.getItem(LEGACY_KEY)));
    const serialized = JSON.stringify(migrated);
    storage.setItem(SESSIONS_KEY, serialized);
    if (storage.getItem(SESSIONS_KEY) !== serialized) throw new Error('Could not verify migrated data.');
    storage.removeItem(LEGACY_KEY);
    return { migrated: true, count: migrated.length };
  } catch (error) {
    try { storage.removeItem(SESSIONS_KEY); } catch { /* Preserve the original migration error. */ }
    return { migrated: false, error: `Existing sessions could not be migrated: ${error.message}` };
  }
}
