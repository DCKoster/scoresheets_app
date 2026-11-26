import { currentUser, recoverOwner, signIn, signOut } from './auth.js';
import { addMember, archiveTemplate, createGroup, listGroups, listTemplates, removeMember, replaceMemberCode, roster, saveTemplate } from './groups.js';
import { history, syncMatch } from './matches.js';
import { HttpError, identifier, json, requireValue } from './http.js';

async function api(request, env, url) {
  const { DB: db } = env;
  if (!db) throw new HttpError(503, 'cloud.authUnavailable');
  const { pathname, origin } = url;
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD') {
    requireValue(request.headers.get('Origin') === origin, 'cloud.originMismatch', 403);
  }
  if (method === 'POST' && pathname === '/api/owner/recover') return recoverOwner(request, env);
  if (pathname === '/api/auth/sign-in' && method === 'POST') return signIn(request, url, db);
  if (pathname === '/api/auth/sign-out' && method === 'POST') return signOut(request, url, db);
  if (pathname.startsWith('/api/auth/') || pathname === '/api/setup' || pathname === '/api/bootstrap') {
    throw new HttpError(404, 'cloud.notFound');
  }
  const scoped = pathname.match(/^\/api\/groups\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
  const groupId = scoped ? identifier(scoped[1]) : null;
  const user = await currentUser(request, url, db, groupId);
  requireValue(user, 'cloud.signInRequired', 401);
  if (request.headers.has('X-Scoresheets-Account')) {
    requireValue(request.headers.get('X-Scoresheets-Account') === user.id, 'cloud.accountMismatch', 401);
  }
  if (pathname === '/api/groups' && method === 'GET') {
    const { fingerprint, ...account } = user;
    return listGroups(db, account);
  }
  if (pathname === '/api/groups' && method === 'POST') return createGroup(request, db, user);
  if (!scoped) throw new HttpError(404, 'cloud.notFound');
  requireValue(user.membership, 'cloud.membershipRequired', 403);
  const [, , resource, item] = scoped;
  if (resource === 'data' && method === 'GET' && !item) {
    const [members, games] = await Promise.all([roster(db, groupId, user.role === 'owner'), listTemplates(db, groupId)]);
    return json({ members, games });
  }
  if (resource === 'matches' && method === 'GET' && !item) return history(url, db, groupId);
  if (resource === 'sync' && method === 'POST' && !item) {
    requireValue(request.headers.get('X-Scoresheets-Account') === user.id, 'cloud.accountMismatch', 401);
    return syncMatch(request, db, user, groupId);
  }
  if (resource === 'members' && method === 'POST' && !item) return addMember(request, db, user, groupId);
  if (resource === 'members' && method === 'DELETE' && item) return removeMember(db, user, groupId, identifier(item));
  if (resource === 'codes' && method === 'POST' && item) return replaceMemberCode(db, user, groupId, identifier(item));
  if (resource === 'games' && method === 'POST' && !item) return saveTemplate(request, db, user, groupId);
  if (resource === 'games' && method === 'PUT' && item) return saveTemplate(request, db, user, groupId, identifier(item));
  if (resource === 'games' && method === 'DELETE' && item) return archiveTemplate(url, db, user, groupId, item);
  throw new HttpError(404, 'cloud.notFound');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    let response;
    try {
      response = await api(request, env, url);
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('Scoresheets API request failed', error.name, error.code ?? '');
      response = error instanceof HttpError ? json({ error: error.message }, error.status) : json({ error: 'cloud.serverError' }, 500);
    }
    const safe = new Response(response.body, response);
    safe.headers.set('Cache-Control', 'private, no-store');
    safe.headers.set('X-Content-Type-Options', 'nosniff');
    return safe;
  },
};
