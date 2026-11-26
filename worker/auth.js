import { bind, digest, first, hex, json, now, readJson, requireValue, string } from './http.js';

const sessionSeconds = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

function randomHex(size) {
  return hex(crypto.getRandomValues(new Uint8Array(size)));
}

export function normalizeUsername(value) {
  const username = typeof value === 'string' ? value.trim() : '';
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(username) ? username.toLowerCase() : null;
}

export function accountUsername(value) {
  const username = normalizeUsername(value);
  requireValue(username, 'cloud.invalidUsername');
  return username;
}

export function contactEmail(value) {
  if (value == null || value === '') return null;
  const email = string(value, 254).toLowerCase();
  requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  return email;
}

export async function newCode() {
  const code = randomHex(16);
  return { code, fingerprint: await digest(code) };
}

const accountFields = 'u.id, u.username, u.email, u.name, u.role, u.status';

function cookieName(url) {
  return url.protocol === 'https:' ? '__Host-scoresheets_session' : 'scoresheets_session';
}

function sessionCookie(url, token, maxAge) {
  return `${cookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${url.protocol === 'https:' ? '; Secure' : ''}`;
}

async function cookieFingerprint(request, url) {
  const prefix = cookieName(url) + '=';
  const value = request.headers.get('Cookie')?.split(';').map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix))?.slice(prefix.length);
  return /^[a-f0-9]{64}$/.test(value ?? '') ? digest(value) : null;
}

export async function currentUser(request, url, db, groupId = null) {
  const fingerprint = await cookieFingerprint(request, url);
  if (!fingerprint) return null;
  const user = await first(db, `SELECT ${accountFields}${groupId ? ', m.user_id AS membership' : ''}
    FROM login_sessions s JOIN users u ON u.id = s.user_id
    ${groupId ? 'LEFT JOIN group_members m ON m.group_id = ? AND m.user_id = u.id AND m.removed_at IS NULL' : ''}
    WHERE s.fingerprint = ? AND s.expires_at > ? AND u.status = 'active'`,
  ...(groupId ? [groupId] : []), fingerprint, Date.now());
  return user && { ...user, fingerprint };
}

function incrementLimit(db, key, window, limit) {
  return bind(db, `INSERT INTO sign_in_limits (key, window_start, attempts)
    VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN window_start = excluded.window_start THEN attempts + 1 ELSE 1 END,
      window_start = excluded.window_start
    WHERE window_start != excluded.window_start OR attempts <= ?
    RETURNING attempts`, key, window, limit);
}

export async function signIn(request, url, db) {
  const { username: input, code: value } = await readJson(request, 4096);
  const username = normalizeUsername(input);
  const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
  requireValue(username && /^[a-f0-9]{32}$/.test(code), 'cloud.invalidLogin', 401);

  const time = Date.now();
  const window = Math.floor(time / 900000) * 900000;
  const token = randomHex(32);
  const expected = request.headers.get('X-Scoresheets-Account');
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const [codeFingerprint, fingerprint, ipKey, usernameKey] = await Promise.all([
    digest(code), digest(token), digest(`login:ip:${ip}`), digest(`login:username:${username}`),
  ]);
  // The credential check and session insert share the transaction with the
  // rate limits. Code rotation can therefore never leave a session minted by the old code.
  const [byIp, byAccount, , account] = await db.batch([
    incrementLimit(db, ipKey, window, 20),
    incrementLimit(db, usernameKey, window, 10),
    bind(db, `INSERT INTO login_sessions (fingerprint, user_id, expires_at)
      SELECT ?, id, ? FROM users WHERE username = ? AND code_fingerprint = ? AND status = 'active'
        AND (SELECT attempts FROM sign_in_limits WHERE key = ?) <= 20
        AND (SELECT attempts FROM sign_in_limits WHERE key = ?) <= 10
        AND (? IS NULL OR id = ?)`,
    fingerprint, time + sessionSeconds * 1000, username, codeFingerprint, ipKey, usernameKey, expected, expected),
    bind(db, `SELECT ${accountFields} FROM login_sessions s JOIN users u ON u.id = s.user_id WHERE s.fingerprint = ?`, fingerprint),
  ]);
  requireValue(byIp.results[0]?.attempts <= 20 && byAccount.results[0]?.attempts <= 10, 'cloud.rateLimited', 429);
  const user = account.results[0];
  requireValue(user, 'cloud.invalidLogin', 401);
  const response = json({ user });
  response.headers.set('Set-Cookie', sessionCookie(url, token, sessionSeconds));
  return response;
}

export async function signOut(request, url, db) {
  const fingerprint = await cookieFingerprint(request, url);
  const expected = request.headers.get('X-Scoresheets-Account');
  if (fingerprint) {
    const result = await bind(db, `DELETE FROM login_sessions WHERE fingerprint = ?${expected ? ' AND user_id = ?' : ''}`,
      fingerprint, ...(expected ? [expected] : [])).run();
    if (expected && !result.meta.changes) {
      const other = await first(db, 'SELECT 1 FROM login_sessions WHERE fingerprint = ? AND expires_at > ?', fingerprint, Date.now());
      if (other) return json({ ok: true });
    }
  }
  const response = json({ ok: true });
  response.headers.set('Set-Cookie', sessionCookie(url, '', 0));
  return response;
}

export async function rotateCode(db, userId, groupId = null) {
  const { code, fingerprint } = await newCode();
  const [updated] = await db.batch([
    bind(db, `UPDATE users SET code_fingerprint = ?, status = 'active', "updatedAt" = ?
      WHERE id = ? AND ${groupId ? `status != 'disabled' AND EXISTS (
        SELECT 1 FROM group_members WHERE group_id = ? AND user_id = users.id AND removed_at IS NULL)` : "role = 'owner'"}`,
    fingerprint, now(), userId, ...(groupId ? [groupId] : [])),
    bind(db, `DELETE FROM login_sessions WHERE user_id = ? AND EXISTS (
      SELECT 1 FROM users WHERE id = ? AND code_fingerprint = ?)`, userId, userId, fingerprint),
  ]);
  return updated.meta.changes ? code : null;
}

export async function recoverOwner(request, env) {
  const secret = env.OWNER_RECOVERY_KEY;
  requireValue(secret?.length >= 32, 'cloud.notFound', 404);
  const { key, username: input, name, email } = await readJson(request, 4096);
  requireValue(typeof key === 'string' && crypto.subtle.timingSafeEqual(
    encoder.encode(await digest(key)), encoder.encode(await digest(secret)),
  ), 'cloud.notFound', 404);
  const db = env.DB;
  const existing = await first(db, "SELECT id, username FROM users WHERE role = 'owner'");
  if (existing) {
    const code = await rotateCode(db, existing.id);
    return json({ userId: existing.id, username: existing.username, code });
  }
  const username = accountUsername(input);
  const id = crypto.randomUUID();
  const timestamp = now();
  const { code, fingerprint } = await newCode();
  const created = await bind(db, `INSERT INTO users
    (id, legacy_email, email, username, name, "createdAt", "updatedAt", role, status, code_fingerprint)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'owner', 'active', ?) ON CONFLICT DO NOTHING`,
  id, id, contactEmail(email), username, string(name), timestamp, timestamp, fingerprint).run();
  requireValue(created.meta.changes, 'cloud.usernameUnavailable', 409);
  return json({ userId: id, username, code }, 201);
}
