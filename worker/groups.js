import { BUILTIN_GAMES } from '../web_app/src/data/games.js';
import { validateGameName, validateMetadata, validateScoring } from '../web_app/src/state/repositories.js';
import { bind, first, HttpError, identifier, json, now, readJson, requireValue, revision, rows, string } from './http.js';
import { accountUsername, contactEmail, newCode, rotateCode } from './auth.js';

export function requireOwner(user) {
  requireValue(user.role === 'owner', 'cloud.ownerRequired', 403);
}

export async function requireMember(db, groupId, userId) {
  const member = await first(db, `SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND removed_at IS NULL`, groupId, userId);
  requireValue(member, 'cloud.membershipRequired', 403);
}

export async function listGroups(db, user) {
  return json({ user, groups: await rows(db, `SELECT g.id, g.name FROM group_members m JOIN groups g ON g.id = m.group_id
    WHERE m.user_id = ? AND m.removed_at IS NULL ORDER BY g.name, g.id`, user.id) });
}

export async function createGroup(request, db, user) {
  requireOwner(user);
  const name = string((await readJson(request, 4096)).name);
  const id = crypto.randomUUID();
  const timestamp = now();
  await db.batch([
    bind(db, 'INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?)', id, name, timestamp),
    bind(db, 'INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)', id, user.id, timestamp),
  ]);
  return json({ id, name }, 201);
}

export function roster(db, groupId, owner) {
  const fields = owner ? ', u.username, u.email, u.role, u.status, (u.code_fingerprint IS NOT NULL) AS codeReady' : '';
  const statuses = owner ? "u.status != 'disabled'" : "u.status = 'active'";
  return rows(db, `SELECT u.id, u.name${fields} FROM group_members m JOIN users u ON u.id = m.user_id
    WHERE m.group_id = ? AND m.removed_at IS NULL AND ${statuses} ORDER BY u.name, u.id`, groupId);
}

export async function addMember(request, db, user, groupId) {
  requireOwner(user);
  const body = await readJson(request, 4096);
  const username = accountUsername(body.username);
  const name = typeof body.name === 'string' && body.name.trim() ? string(body.name) : null;
  const email = contactEmail(body.email);
  const timestamp = now();
  const id = crypto.randomUUID();
  const { code, fingerprint } = await newCode();
  // Only the request that creates the account returns its code. An existing
  // username can be added to another group without touching its credential.
  const [created, , lookup] = await db.batch([
    bind(db, `INSERT INTO users
      (id, legacy_email, email, username, name, "createdAt", "updatedAt", status, code_fingerprint)
      SELECT ?, ?, ?, ?, ?, ?, ?, 'active', ? WHERE ? IS NOT NULL ON CONFLICT(username) DO NOTHING`,
    id, id, email, username, name, timestamp, timestamp, fingerprint, name),
    bind(db, `INSERT INTO group_members (group_id, user_id, joined_at)
      SELECT ?, id, ? FROM users WHERE username = ? AND status != 'disabled'
      ON CONFLICT(group_id, user_id) DO UPDATE SET removed_at = NULL, joined_at = excluded.joined_at
      WHERE group_members.removed_at IS NOT NULL`, groupId, timestamp, username),
    bind(db, 'SELECT id, status FROM users WHERE username = ?', username),
  ]);
  const account = lookup.results[0];
  requireValue(account, 'cloud.displayNameRequired');
  requireValue(account.status !== 'disabled', 'cloud.accountDisabled', 409);
  return created.meta.changes ? json({ userId: account.id, username, code }, 201) : json({ userId: account.id });
}

export async function removeMember(db, user, groupId, memberId) {
  requireOwner(user);
  requireValue(memberId !== user.id, 'cloud.cannotRemoveOwner', 409);
  await bind(db, 'UPDATE group_members SET removed_at = ? WHERE group_id = ? AND user_id = ? AND removed_at IS NULL', now(), groupId, memberId).run();
  return json({ ok: true });
}

export async function replaceMemberCode(db, user, groupId, memberId) {
  requireOwner(user);
  await requireMember(db, groupId, memberId);
  const code = await rotateCode(db, memberId, groupId);
  requireValue(code, 'cloud.accountDisabled', 409);
  return json({ code });
}

export async function listTemplates(db, groupId) {
  const templates = await rows(db, `SELECT v.definition FROM games g JOIN game_versions v
    ON v.group_id = g.group_id AND v.game_id = g.id AND v.revision = g.current_revision
    WHERE g.group_id = ? AND g.archived_at IS NULL ORDER BY g.name_key`, groupId);
  return templates.map(({ definition }) => JSON.parse(definition));
}

export async function saveTemplate(request, db, user, groupId, templateId) {
  requireOwner(user);
  const input = await readJson(request, 16384);
  const name = string(input.name);
  const id = templateId ?? crypto.randomUUID();
  const existing = templateId ? await first(db, 'SELECT current_revision FROM games WHERE group_id = ? AND id = ? AND archived_at IS NULL', groupId, id) : null;
  requireValue(!templateId || existing, 'errors.gameNotFound', 404);
  const expected = templateId ? revision(input.revision, 1) : 0;
  requireValue(!existing || expected === existing.current_revision, 'cloud.templateConflict', 409);
  requireValue(!input.scoreCategories || (Array.isArray(input.scoreCategories) && input.scoreCategories.length <= 12
    && input.scoreCategories.every((value) => typeof value === 'string' && !['__proto__', 'constructor', 'prototype'].includes(value.trim()))));
  const scoring = { engineId: input.scoring?.engineId, ranking: input.scoring?.ranking };
  let metadata;
  try {
    validateScoring(scoring);
    metadata = validateMetadata({ ...input, scoring });
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  const valid = validateGameName(name, [...BUILTIN_GAMES, ...await listTemplates(db, groupId)], id);
  requireValue(valid.valid, valid.error, 409);
  const game = { schemaVersion: 3, id, name, origin: 'custom', revision: expected + 1, scoring, ...metadata };
  const nameKey = name.toLowerCase();
  const definition = JSON.stringify(game);
  try {
    if (templateId) {
      const [inserted] = await db.batch([
        bind(db, `INSERT INTO game_versions
          SELECT group_id, id, ?, ? FROM games WHERE group_id = ? AND id = ? AND current_revision = ? AND archived_at IS NULL`,
        game.revision, definition, groupId, id, expected),
        bind(db, `UPDATE games SET name = ?, name_key = ?, current_revision = ?
          WHERE group_id = ? AND id = ? AND current_revision = ? AND archived_at IS NULL`, name, nameKey, game.revision, groupId, id, expected),
      ]);
      requireValue(inserted.meta.changes === 1, 'cloud.templateConflict', 409);
    } else {
      await db.batch([
        bind(db, 'INSERT INTO games (group_id, id, name, name_key, current_revision) VALUES (?, ?, ?, ?, 1)', groupId, id, name, nameKey),
        bind(db, 'INSERT INTO game_versions (group_id, game_id, revision, definition) VALUES (?, ?, 1, ?)', groupId, id, definition),
      ]);
    }
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed: games.group_id, games.name_key')) throw new HttpError(409, 'errors.gameNameDuplicate');
    throw error;
  }
  return json(game, templateId ? 200 : 201);
}

export async function archiveTemplate(url, db, user, groupId, id) {
  requireOwner(user);
  const expected = revision(Number(url.searchParams.get('revision')), 1);
  const updated = await bind(db, `UPDATE games SET archived_at = ? WHERE group_id = ? AND id = ? AND current_revision = ? AND archived_at IS NULL`,
    now(), groupId, identifier(id), expected).run();
  requireValue(updated.meta.changes === 1, 'cloud.templateConflict', 409);
  return json({ ok: true });
}
