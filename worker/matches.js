import { BUILTIN_GAMES, getGameName } from '../web_app/src/data/games.js';
import { MARIO_KART_ITEM_PRESETS } from '../web_app/src/data/mario-kart.js';
import { getScoringEngine } from '../web_app/src/scoring/engines.js';
import { validateMetadata, validateScoring } from '../web_app/src/state/repositories.js';
import { bind, digest, first, HttpError, identifier, json, now, readJson, requireValue, revision, rows, string } from './http.js';
import { currentUser } from './auth.js';

const fields = `s.*, (SELECT json_group_array(json_object('id', participant_id, 'userId', user_id, 'displayName', display_name))
  FROM (SELECT participant_id, user_id, display_name FROM session_participants p
    WHERE p.group_id = s.group_id AND p.session_id = s.id ORDER BY position)) AS participants`;

function readEntries(source, participants, categories = []) {
  const entries = JSON.parse(source);
  if (!entries.roundScores) return entries;
  const width = Math.max(1, categories.length);
  const rounds = entries.roundScores.map((numbers) => {
    const scores = {};
    for (let player = 0; player < participants.length; player += 1) {
      const id = participants[player].id;
      const offset = 1 + player * width;
      if (!categories.length) {
        scores[id] = numbers[offset];
        continue;
      }
      const values = {};
      for (let index = 0; index < categories.length; index += 1) {
        values[categories[index]] = numbers[offset + index];
      }
      scores[id] = values;
    }
    return { id: numbers[0], scores };
  });
  return { rounds };
}

function serialize(row) {
  const snapshot = JSON.parse(row.scoring_snapshot);
  const participants = JSON.parse(row.participants);
  return {
    schemaVersion: 3,
    id: row.id,
    gameId: row.builtin_game_id ?? row.custom_game_id,
    gameRevision: row.game_revision,
    createdBy: row.created_by,
    createdAt: row.played_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    ...snapshot,
    participants,
    entries: readEntries(row.entries, participants, snapshot.scoreCategories),
    totals: JSON.parse(row.totals),
    categoryTotals: JSON.parse(row.category_totals),
  };
}

function playedAt(value) {
  const time = Date.parse(value);
  requireValue(typeof value === 'string' && Number.isFinite(time) && new Date(time).toISOString() === value);
  return value;
}

export async function history(url, db, groupId) {
  const limit = 10;
  const after = url.searchParams.get('after');
  const values = after ? [groupId, playedAt(after), identifier(url.searchParams.get('id'))] : [groupId];
  const result = await rows(db, `SELECT ${fields} FROM game_sessions s
    WHERE s.group_id = ? AND s.deleted_at IS NULL ${after ? 'AND (s.played_at, s.id) < (?, ?)' : ''}
    ORDER BY s.played_at DESC, s.id DESC LIMIT ${limit + 1}`, ...values);
  const sessions = result.slice(0, limit).map(serialize);
  const next = result.length > limit ? { after: sessions.at(-1).createdAt, id: sessions.at(-1).id } : null;
  return json({ sessions, next });
}

function normalizeParticipants(input) {
  requireValue(Array.isArray(input) && input.length >= 2 && input.length <= 30, 'errors.playersMinimum');
  const participants = input.map((part) => ({
    id: identifier(part?.id),
    userId: part.userId == null ? null : identifier(part.userId),
    displayName: string(part.displayName, 100),
  }));
  const keys = participants.map(({ userId, displayName }) => userId ? `member:${userId}` : `guest:${displayName.toLowerCase()}`);
  requireValue(new Set(keys).size === keys.length && new Set(participants.map(({ id }) => id)).size === participants.length, 'errors.playersUnique');
  return participants;
}

async function validateLinks(db, groupId, participants, previous, date) {
  const linkedIds = participants.filter(({ userId, id }) => userId && !previous.some((part) => part.id === id && part.userId === userId)).map(({ userId }) => userId);
  if (!linkedIds.length) return;
  const membership = date === null ? 'm.removed_at IS NULL' : '(m.removed_at IS NULL OR m.removed_at >= ?)';
  const links = await rows(db, `SELECT m.user_id FROM group_members m JOIN users u ON u.id = m.user_id
    WHERE m.group_id = ? AND ${membership} AND u.status = 'active'
      AND m.user_id IN (${linkedIds.map(() => '?').join(',')})`, groupId, ...(date === null ? [] : [date]), ...linkedIds);
  requireValue(links.length === linkedIds.length, 'cloud.participantOutsideGroup', 422);
}

function checkedScorecard(source, engine, participants, categories) {
  requireValue(source && typeof source === 'object' && !Array.isArray(source));
  let entries;
  if (engine.id === 'round-sum' || engine.id === 'mario-kart-8') {
    const field = engine.id === 'round-sum' ? 'rounds' : 'races';
    const list = source[field];
    requireValue(Array.isArray(list) && list.length <= 100);
    const ids = new Set();
    entries = { [field]: list.map((entry) => {
      const id = identifier(entry?.id);
      requireValue(!ids.has(id));
      ids.add(id);
      if (field === 'rounds') return { id, scores: entry.scores };
      requireValue(Array.isArray(entry.participantIds) && entry.participantIds.length <= 12
        && Array.isArray(entry.itemIds) && entry.itemIds.length <= 32
        && typeof entry.itemSet === 'string' && Object.hasOwn(MARIO_KART_ITEM_PRESETS, entry.itemSet));
      const { track, cc, itemSet, itemIds, participantIds, placements } = entry;
      const result = engine.validateEntry({ id, track, cc, itemSet, itemIds, participantIds, placements }, participants);
      requireValue(result.valid, result.error);
      return result.entry;
    }) };
    if (field === 'rounds') {
      const result = engine.scorecard(entries.rounds, participants, categories);
      requireValue(result.valid, result.error);
      return result;
    }
  } else if (engine.id === 'final-total') {
    const result = engine.validateEntry(source.values, participants, categories);
    requireValue(result.valid, result.error);
    entries = { values: result.entry };
  } else {
    requireValue(Array.isArray(source.winnerIds) && source.winnerIds.length <= participants.length, 'errors.winnerInvalid');
    entries = { winnerIds: source.winnerIds };
  }
  if (engine.id !== 'final-total') {
    const valid = engine.id === 'mario-kart-8' ? engine.validateRules(entries.races) : engine.validateSession(entries, participants, categories);
    requireValue(valid.valid, valid.error);
  }
  return {
    entries, totals: engine.calculateTotals(entries, participants, categories),
    categoryTotals: engine.calculateCategoryTotals?.(entries, participants, categories) ?? {},
  };
}

async function scoreMatch(db, groupId, input, current) {
  requireValue(input && typeof input === 'object');
  const gameId = identifier(input.gameId);
  const builtin = BUILTIN_GAMES.find((game) => game.id === gameId);
  const gameRevision = builtin ? null : revision(input.gameRevision, 1);
  requireValue(!current || (gameId === (current.builtin_game_id ?? current.custom_game_id)
    && gameRevision === current.game_revision), 'cloud.scoringLocked', 409);
  const date = current?.played_at ?? playedAt(input.createdAt);
  const participants = normalizeParticipants(input.participants);
  const previous = current ? JSON.parse(current.participants) : [];
  const [version, linkError] = await Promise.all([
    !current && !builtin && first(db, 'SELECT definition FROM game_versions WHERE group_id = ? AND game_id = ? AND revision = ?', groupId, gameId, gameRevision),
    validateLinks(db, groupId, participants, previous, date).then(() => null, (error) => error),
  ]);
  requireValue(current || builtin || version, 'cloud.templateMissing', 422);
  if (linkError) throw linkError;
  const game = builtin ?? (version && JSON.parse(version.definition));
  const snapshot = current ? JSON.parse(current.scoring_snapshot) : {
    gameNameAtPlay: getGameName(game, input.locale === 'nl' ? 'nl' : 'en'),
    playMode: game.playMode, scoring: game.scoring, scoreCategories: game.scoreCategories, categoryScoring: game.categoryScoring,
  };
  const scores = scoreEntries(input.entries, participants, snapshot);
  return { builtinId: builtin?.id ?? null, customId: builtin ? null : gameId, gameRevision, date, snapshot, ...scores, participants };
}

function scoreEntries(input, participants, snapshot) {
  const engine = getScoringEngine(snapshot.scoring.engineId);
  const result = checkedScorecard(input, engine, participants, snapshot.scoreCategories);
  requireValue([...Object.values(result.totals), ...Object.values(result.categoryTotals).flatMap(Object.values)].every(Number.isFinite), 'errors.scoreFinite');
  return result;
}

async function scoreImport(db, groupId, input) {
  string(input.gameId, 512);
  const builtinId = BUILTIN_GAMES.find(({ id }) => id === input.gameId)?.id ?? null;
  const gameNameAtPlay = string(input.gameNameAtPlay);
  const time = typeof input.createdAt === 'string' ? Date.parse(input.createdAt) : NaN;
  requireValue(Number.isFinite(time));
  const participants = normalizeParticipants(input.participants);
  const scoring = { engineId: input.scoring?.engineId, ranking: input.scoring?.ranking };
  const categories = input.scoreCategories ?? [];
  requireValue(Array.isArray(categories) && categories.length <= 12 && categories.every(
    (name) => typeof name === 'string' && name.trim() && !['__proto__', 'constructor', 'prototype'].includes(name.trim()),
  ));
  let metadata;
  try {
    validateScoring(scoring);
    metadata = validateMetadata({ ...input, scoring, scoreCategories: categories, playMode: input.playMode ?? 'competitive' });
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  const snapshot = { gameNameAtPlay, scoring, ...metadata };
  let entries = input.entries;
  if (scoring.engineId === 'winner-only' && entries && !Object.hasOwn(entries, 'winnerIds') && Object.hasOwn(entries, 'winnerId')) {
    entries = { winnerIds: entries.winnerId === null ? [] : [entries.winnerId] };
  }
  const scores = scoreEntries(entries, participants, snapshot);
  const customId = builtinId ? null : `history-${await digest(input.gameId)}`;
  await validateLinks(db, groupId, participants, [], null);
  return {
    builtinId, customId, gameRevision: null, date: new Date(time).toISOString(),
    snapshot, ...scores, participants,
    definition: customId ? JSON.stringify({ scoring, ...metadata }) : null,
  };
}

function importedMatchResult(id, existing) {
  requireValue(!existing.deleted_at, 'cloud.importDeleted', 409);
  return json({ id, revision: existing.revision, deleted: false, alreadyPresent: true });
}

function historicalGameStatements(db, groupId, match, gate, gateParams) {
  const { customId, definition, snapshot } = match;
  return [
    bind(db, `INSERT INTO games (group_id, id, name, name_key, current_revision, archived_at)
      SELECT ?, ?, ?, ?, 1, ? WHERE ${gate}
      ON CONFLICT(group_id, id) DO NOTHING`,
    groupId, customId, snapshot.gameNameAtPlay, snapshot.gameNameAtPlay.toLowerCase(), now(), ...gateParams),
    bind(db, `INSERT INTO game_versions (group_id, game_id, revision, definition)
      SELECT ?, ?, 1 + COALESCE((SELECT MAX(revision) FROM game_versions WHERE group_id = ? AND game_id = ?), 0), ?
      WHERE ${gate} AND NOT EXISTS (SELECT 1 FROM game_versions WHERE group_id = ? AND game_id = ? AND definition = ?)`,
    groupId, customId, groupId, customId, definition, ...gateParams, groupId, customId, definition),
  ];
}

export async function syncMatch(request, db, user, groupId) {
  const input = await readJson(request);
  const operationId = identifier(input.operationId);
  const expected = revision(input.expectedRevision);
  const importing = input.type === 'import';
  requireValue(input.type === 'save' || (importing && expected === 0) || (input.type === 'delete' && expected > 0));
  if (importing) string(input.match?.id, 512);
  const id = importing ? `import-${await digest(input.match.id)}` : identifier(input.id);
  requireValue(importing || expected > 0 || !/^import-[a-f0-9]{64}$/.test(id));
  const requestDigest = await digest(JSON.stringify(input));
  const receiptParams = [groupId, user.id, operationId];
  const findReceipt = () => first(db, 'SELECT result, request_digest FROM sync_receipts WHERE group_id = ? AND user_id = ? AND operation_id = ?', ...receiptParams);
  const fromReceipt = (receipt) => {
    requireValue(receipt.request_digest === requestDigest, 'cloud.operationReused', 409);
    return new Response(receipt.result, { headers: { 'Content-Type': 'application/json' } });
  };
  // A single snapshot gives retries precedence over revision checks and skips
  // match data entirely when the operation already has a receipt.
  const lookup = await first(db, `SELECT r.result, r.request_digest, s.created_by, s.deleted_at, s.revision, s.played_at,
    s.builtin_game_id, s.custom_game_id, s.game_revision,
    CASE WHEN ? AND s.revision = ? THEN s.scoring_snapshot END AS scoring_snapshot,
    CASE WHEN ? AND s.revision = ? THEN (SELECT json_group_array(json_object('id', participant_id, 'userId', user_id))
      FROM session_participants WHERE group_id = s.group_id AND session_id = s.id AND user_id IS NOT NULL) END AS participants
    FROM (SELECT 1)
    LEFT JOIN sync_receipts r ON r.group_id = ? AND r.user_id = ? AND r.operation_id = ?
    LEFT JOIN game_sessions s ON r.result IS NULL AND s.group_id = ? AND s.id = ?`,
  input.type === 'save', expected, input.type === 'save', expected, ...receiptParams, groupId, id);
  if (lookup.result !== null) return fromReceipt(lookup);
  const current = lookup.revision == null ? null : lookup;
  if (importing && current) return importedMatchResult(id, current);
  requireValue(!current || current.created_by === user.id || user.role === 'owner', 'cloud.matchOwnerRequired', 403);
  if (current?.deleted_at || (current?.revision ?? 0) !== expected) {
    throw new HttpError(409, 'cloud.conflict');
  }
  const timestamp = now();
  const nextRevision = expected + 1;
  const deletion = input.type === 'delete';
  const match = deletion ? null : importing ? await scoreImport(db, groupId, input.match) : await scoreMatch(db, groupId, input.match, current);
  const attempt = crypto.randomUUID();
  const result = { id, revision: nextRevision, deleted: deletion };
  const target = expected === 0
    ? 'NOT EXISTS (SELECT 1 FROM game_sessions WHERE group_id = ? AND id = ?)'
    : 'EXISTS (SELECT 1 FROM game_sessions WHERE group_id = ? AND id = ? AND revision = ? AND deleted_at IS NULL)';
  const gate = 'EXISTS (SELECT 1 FROM sync_receipts WHERE group_id = ? AND user_id = ? AND operation_id = ? AND attempt_id = ?)';
  const gateParams = [...receiptParams, attempt];
  const importedLinks = importing ? match.participants.flatMap(({ userId }) => userId ? [userId] : []) : [];
  const linksGate = importedLinks.length ? `AND NOT EXISTS (
    SELECT 1 FROM json_each(?) AS link WHERE NOT EXISTS (
      SELECT 1 FROM group_members m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ? AND m.user_id = link.value AND m.removed_at IS NULL AND u.status = 'active'))` : '';
  // The receipt can only be claimed at the requested revision with an active session and membership.
  // Every mutation is guarded by this batch's claim, including when another device already retried it.
  const statements = [bind(db, `INSERT INTO sync_receipts
    SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${target} AND EXISTS (
      SELECT 1 FROM group_members m JOIN users u ON u.id = m.user_id
        JOIN login_sessions s ON s.fingerprint = ? AND s.user_id = u.id AND s.expires_at > ?
        WHERE m.group_id = ? AND m.user_id = ? AND m.removed_at IS NULL AND u.status = 'active') ${linksGate}
    ON CONFLICT(group_id, user_id, operation_id) DO NOTHING`,
  ...receiptParams, attempt, requestDigest, JSON.stringify(result), timestamp, groupId, id, ...(expected ? [expected] : []),
  user.fingerprint, Date.now(), groupId, user.id, ...(importedLinks.length ? [JSON.stringify(importedLinks), groupId] : []))];
  if (deletion) {
    statements.push(bind(db, `UPDATE game_sessions SET deleted_at = ?, updated_at = ?, revision = ?
      WHERE group_id = ? AND id = ? AND ${gate}`, timestamp, timestamp, nextRevision, groupId, id, ...gateParams));
  } else {
    const data = [match.entries, match.totals, match.categoryTotals].map((value) => JSON.stringify(value));
    if (expected) {
      statements.push(bind(db, `UPDATE game_sessions SET updated_at = ?, revision = ?, entries = ?, totals = ?, category_totals = ?
        WHERE group_id = ? AND id = ? AND ${gate}`, timestamp, nextRevision, ...data, groupId, id, ...gateParams));
      statements.push(bind(db, `DELETE FROM session_participants WHERE group_id = ? AND session_id = ? AND ${gate}`, groupId, id, ...gateParams));
    } else {
      const historical = importing && match.customId;
      if (historical) statements.push(...historicalGameStatements(db, groupId, match, gate, gateParams));
      const gameRevision = historical
        ? '(SELECT revision FROM game_versions WHERE group_id = ? AND game_id = ? AND definition = ?)'
        : '?';
      const versionParams = historical ? [groupId, match.customId, match.definition] : [match.gameRevision];
      statements.push(bind(db, `INSERT INTO game_sessions
        (group_id, id, builtin_game_id, custom_game_id, game_revision, created_by, played_at, updated_at, revision, scoring_snapshot, entries, totals, category_totals)
        SELECT ?, ?, ?, ?, ${gameRevision}, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${gate}`,
      groupId, id, match.builtinId, match.customId, ...versionParams, user.id, match.date, timestamp, nextRevision, JSON.stringify(match.snapshot), ...data, ...gateParams));
    }
    const participants = JSON.stringify(match.participants);
    statements.push(bind(db, `INSERT INTO session_participants (group_id, session_id, participant_id, user_id, position, display_name)
      SELECT ?, ?, json_extract(value,'$.id'), json_extract(value,'$.userId'), key, json_extract(value,'$.displayName')
      FROM json_each(?) WHERE ${gate}`, groupId, id, participants, ...gateParams));
  }
  const [claim] = await db.batch(statements);
  if (claim.meta.changes) return json(result);
  const latest = await currentUser(request, new URL(request.url), db, groupId);
  requireValue(latest?.id === user.id, 'cloud.signInRequired', 401);
  requireValue(latest.membership, 'cloud.membershipRequired', 403);
  const duplicate = await findReceipt();
  if (duplicate) return fromReceipt(duplicate);
  if (importing) {
    const existing = await first(db, 'SELECT revision, deleted_at FROM game_sessions WHERE group_id = ? AND id = ?', groupId, id);
    if (existing) return importedMatchResult(id, existing);
    if (importedLinks.length) await validateLinks(db, groupId, match.participants, [], null);
  }
  throw new HttpError(409, 'cloud.conflict');
}
