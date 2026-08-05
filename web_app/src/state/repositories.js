import { BUILTIN_GAMES, getAllGameNames, getGameName } from '../data/games.js';

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
  if (!Array.isArray(parsed)) throw new Error('errors.storedDataInvalid');
  return parsed;
}

export function validateGameName(name, games, exceptId = null) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return { valid: false, error: 'errors.gameNameRequired' };
  const duplicate = games.some(
    (game) => game.id !== exceptId && getAllGameNames(game).some((name) => name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase()),
  );
  return duplicate
    ? { valid: false, error: 'errors.gameNameDuplicate' }
    : { valid: true, name: trimmed };
}

function validateScoring(scoring) {
  if (!['round-sum', 'final-total', 'winner-only'].includes(scoring?.engineId)) throw new Error('errors.scoringEngineUnknown');
  const validRanking = scoring.engineId === 'winner-only'
    ? scoring.ranking === 'selected'
    : ['highest', 'lowest'].includes(scoring.ranking);
  if (!validRanking) throw new Error('errors.rankingUnknown');
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
    if (!existing) throw new Error('errors.gameNotFound');
    if (existing.origin !== 'custom') throw new Error('errors.builtinReadOnly');
    const result = validateGameName(changes.name, games, id);
    if (!result.valid) throw new Error(result.error);
    validateScoring(changes.scoring);
    const updated = { ...existing, name: result.name, scoring: { ...changes.scoring } };
    const custom = games.filter((game) => game.origin === 'custom').map((game) => game.id === id ? updated : game);
    this.storage.setItem(CUSTOM_GAMES_KEY, JSON.stringify(custom));
    return updated;
  }
  async duplicate(id, locale = 'en', copyName = (name, number) => number === 1 ? `${name} copy` : `${name} copy ${number}`) {
    const games = await this.list();
    const source = games.find((game) => game.id === id);
    if (!source) throw new Error('errors.gameNotFound');
    const sourceName = getGameName(source, locale);
    let name = copyName(sourceName, 1);
    let number = 2;
    while (!validateGameName(name, games).valid) name = copyName(sourceName, number++);
    return this.create({ name, scoring: source.scoring });
  }
  async delete(id) {
    const games = await this.list();
    const existing = games.find((game) => game.id === id);
    if (!existing) return false;
    if (existing.origin !== 'custom') throw new Error('errors.builtinCannotDelete');
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
    if (!Number.isFinite(Number(value))) throw new Error('errors.legacyScoreInvalid');
    result[participant.id] = Number(value);
  });
  return result;
}

export function migrateLegacySessions(legacy) {
  if (!Array.isArray(legacy)) throw new Error('errors.legacyDataInvalid');
  return legacy.map((old) => {
    const names = Array.isArray(old.players) ? old.players : Object.keys(old.totals ?? {});
    if (names.length < 2 || names.some((name) => !String(name).trim())) throw new Error('errors.legacyPlayersInvalid');
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
    if (storage.getItem(SESSIONS_KEY) !== serialized) throw new Error('errors.migrationVerify');
    storage.removeItem(LEGACY_KEY);
    return { migrated: true, count: migrated.length };
  } catch (error) {
    try { storage.removeItem(SESSIONS_KEY); } catch { /* Preserve the original migration error. */ }
    return { migrated: false, error: 'errors.migration', parameters: { message: error.message } };
  }
}
