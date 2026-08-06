import { BUILTIN_GAMES, getAllGameNames, getGameName } from '../data/games.js';
import { getScoringEngine } from '../scoring/engines.js';

export const CUSTOM_GAMES_KEY = 'scoresheets-web-games-v2';
export const SESSIONS_KEY = 'scoresheets-web-sessions-v2';
export const LEGACY_KEY = 'scoresheets-web-v1';
export const BACKUP_SCHEMA_VERSION = 1;
export const CATEGORY_MAX_LENGTH = 40;

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

export function normalizeCategory(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || undefined;
}

function normalizeScoreCategories(categories) {
  if (!Array.isArray(categories)) return [];
  return categories.map((value) => String(value ?? '').trim()).filter(Boolean);
}

function validateMetadata(input) {
  const category = normalizeCategory(input.category);
  const scoreCategories = normalizeScoreCategories(input.scoreCategories);
  if (category && category.length > CATEGORY_MAX_LENGTH) throw new Error('errors.categoryTooLong');
  if (scoreCategories.some((value) => value.length > CATEGORY_MAX_LENGTH)) throw new Error('errors.scoreCategoryTooLong');
  if (new Set(scoreCategories.map(normalizedName)).size !== scoreCategories.length) throw new Error('errors.scoreCategoryDuplicate');
  const playMode = input.playMode === 'cooperative' ? 'cooperative' : input.playMode === 'competitive' ? 'competitive' : undefined;
  if (!playMode) throw new Error('errors.playModeUnknown');
  const categoryScoring = scoreCategories.length ? input.categoryScoring : undefined;
  if (scoreCategories.length && !['per-round', 'final-total'].includes(categoryScoring)) throw new Error('errors.categoryScoringUnknown');
  if (scoreCategories.length && ((categoryScoring === 'per-round' && input.scoring?.engineId !== 'round-sum') || (categoryScoring === 'final-total' && input.scoring?.engineId !== 'final-total'))) throw new Error('errors.categoryScoringMismatch');
  if (scoreCategories.length && input.scoring?.engineId === 'winner-only') throw new Error('errors.categoryEngineInvalid');
  if (playMode === 'cooperative' && input.scoring?.engineId !== 'winner-only') throw new Error('errors.cooperativeEngineInvalid');
  return { ...(category ? { category } : {}), playMode, scoreCategories, ...(categoryScoring ? { categoryScoring } : {}) };
}

function normalizeStoredGame(game) {
  if (!game || typeof game !== 'object') return game;
  const category = normalizeCategory(game.category);
  const scoreCategories = normalizeScoreCategories(game.scoreCategories ?? (game.categories === true ? [] : game.categories));
  const normalized = { ...game, schemaVersion: game.schemaVersion ?? 2, category: category, playMode: game.playMode === 'cooperative' ? 'cooperative' : 'competitive', scoreCategories };
  if (!category) delete normalized.category;
  if (scoreCategories.length) normalized.categoryScoring = game.categoryScoring ?? (game.scoring?.engineId === 'round-sum' ? 'per-round' : 'final-total');
  else delete normalized.categoryScoring;
  return normalized;
}

function normalizedName(name) { return String(name ?? '').trim().toLocaleLowerCase(); }

function validParticipants(participants) {
  if (!Array.isArray(participants) || participants.length < 2) return false;
  const ids = participants.map((participant) => participant?.id);
  const names = participants.map((participant) => String(participant?.displayName ?? '').trim());
  return ids.every((id) => typeof id === 'string' && id) && names.every(Boolean)
    && new Set(ids).size === ids.length && new Set(names.map(normalizedName)).size === names.length;
}

function validateBackupSession(session) {
  if (!session || typeof session !== 'object' || typeof session.id !== 'string' || !session.id
    || typeof session.gameId !== 'string' || typeof session.gameNameAtPlay !== 'string'
    || typeof session.createdAt !== 'string' || !validParticipants(session.participants)) return false;
  try {
    validateScoring(session.scoring);
    if (session.playMode === 'cooperative' && session.scoring.engineId !== 'winner-only') return false;
    const engine = getScoringEngine(session.scoring.engineId);
    const scoreCategories = Array.isArray(session.scoreCategories) ? session.scoreCategories : [];
    if (scoreCategories.length && (!['round-sum', 'final-total'].includes(session.scoring.engineId) || !['per-round', 'final-total'].includes(session.categoryScoring))) return false;
    if (!engine.validateSession(session.entries, session.participants, scoreCategories).valid) return false;
    if (session.scoring.engineId === 'round-sum'
      && (!session.entries.rounds.every((round) => typeof round?.id === 'string' && round.id)
        || new Set(session.entries.rounds.map((round) => round.id)).size !== session.entries.rounds.length
        || !session.entries.rounds.every((round) => engine.validateEntry(round.scores ?? {}, session.participants, scoreCategories).valid))) return false;
    if (session.scoring.engineId === 'final-total' && !engine.validateEntry(session.entries.values ?? {}, session.participants, scoreCategories).valid) return false;
    const totals = engine.calculateTotals(session.entries, session.participants, scoreCategories);
    if (!session.totals || typeof session.totals !== 'object' || Object.keys(session.totals).length !== Object.keys(totals).length) return false;
    return Object.entries(totals).every(([id, total]) => Number.isFinite(total) && session.totals[id] === total);
  } catch { return false; }
}

function validateBackupGame(game) {
  try {
    return !!game && typeof game === 'object' && typeof game.id === 'string' && game.id
      && typeof game.name === 'string' && !!game.name.trim() && game.origin === 'custom'
      && (validateScoring(game.scoring), validateMetadata({ ...game, playMode: game.playMode ?? 'competitive' }), true);
  } catch { return false; }
}

export async function exportBackup(storage) {
  const games = readArray(storage, CUSTOM_GAMES_KEY).filter((game) => game?.origin === 'custom').map(normalizeStoredGame);
  const sessions = readArray(storage, SESSIONS_KEY);
  return { schemaVersion: BACKUP_SCHEMA_VERSION, sessions, customGames: games };
}

export async function importBackup(storage, backup) {
  if (!backup || typeof backup !== 'object' || backup.schemaVersion !== BACKUP_SCHEMA_VERSION
    || !Array.isArray(backup.sessions) || !Array.isArray(backup.customGames)
    || !backup.sessions.every(validateBackupSession) || !backup.customGames.every(validateBackupGame)) {
    throw new Error('errors.backupInvalid');
  }
  const localSessions = readArray(storage, SESSIONS_KEY);
  const localCustomGames = readArray(storage, CUSTOM_GAMES_KEY);
  const sessionIds = new Set(localSessions.map((session) => session.id));
  const gameIds = new Set([...BUILTIN_GAMES, ...localCustomGames].map((game) => game.id));
  const gameNames = new Set([...BUILTIN_GAMES, ...localCustomGames].flatMap(getAllGameNames).map(normalizedName));
  const sessions = [];
  const games = [];
  let skippedSessions = 0;
  let skippedGames = 0;
  for (const session of backup.sessions) {
    if (sessionIds.has(session.id)) skippedSessions += 1;
    else { sessionIds.add(session.id); sessions.push(session); }
  }
  for (const game of backup.customGames) {
    if (gameIds.has(game.id) || gameNames.has(normalizedName(game.name))) skippedGames += 1;
    else {
      gameIds.add(game.id); gameNames.add(normalizedName(game.name));
      const metadata = validateMetadata({ ...game, playMode: game.playMode ?? 'competitive' });
      games.push({ ...game, schemaVersion: 3, origin: 'custom', scoring: { ...game.scoring }, ...metadata });
    }
  }
  if (sessions.length) storage.setItem(SESSIONS_KEY, JSON.stringify([...sessions, ...localSessions]));
  if (games.length) storage.setItem(CUSTOM_GAMES_KEY, JSON.stringify([...localCustomGames, ...games]));
  return { imported: { sessions: sessions.length, games: games.length }, skipped: { sessions: skippedSessions, games: skippedGames } };
}

export class LocalGameRepository {
  constructor(storage) { this.storage = storage; }
  async list() { return [...BUILTIN_GAMES, ...readArray(this.storage, CUSTOM_GAMES_KEY).map(normalizeStoredGame)]; }
  async create(input) {
    const games = await this.list();
    const result = validateGameName(input.name, games);
    if (!result.valid) throw new Error(result.error);
    validateScoring(input.scoring);
    const metadata = validateMetadata({ ...input, playMode: input.playMode ?? 'competitive' });
    const game = { schemaVersion: 3, id: createId('game'), name: result.name, origin: 'custom', scoring: { ...input.scoring }, ...metadata };
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
    const metadata = validateMetadata({ ...existing, ...changes, playMode: changes.playMode ?? existing.playMode ?? 'competitive' });
    const updated = { ...existing, schemaVersion: 3, name: result.name, scoring: { ...changes.scoring }, ...metadata };
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
    return this.create({ name, scoring: source.scoring, category: source.category, playMode: source.playMode, scoreCategories: source.scoreCategories, categoryScoring: source.categoryScoring });
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
