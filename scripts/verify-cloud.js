import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { readRecoveryKey } from './recover-owner.js';

const [url, keyFile, fixtureFile] = process.argv.slice(2);
assert(url && keyFile && fixtureFile, 'Usage: npm run verify:cloud -- <origin> <owner-recovery-key-file> <fixture-file>');
const origin = new URL(url).origin;
const key = await readRecoveryKey(keyFile);
const suffix = randomUUID().slice(0, 8);
const signInPath = '/api/auth/sign-in';
const recoverPath = '/api/owner/recover';

async function client(path, { method = 'GET', body, actor, status = 200, requestOrigin = origin, account = actor?.id } = {}) {
  const response = await fetch(origin + path, {
    method,
    redirect: 'manual',
    headers: {
      ...(method === 'GET' ? {} : { Origin: requestOrigin }),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(actor?.cookie ? { Cookie: actor.cookie } : {}),
      ...(account ? { 'X-Scoresheets-Account': account } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  assert((Array.isArray(status) ? status : [status]).includes(response.status), `${method} ${path} returned ${response.status} (${result?.error ?? 'unexpected response'})`);
  if (response.status !== 503 || result) assert.match(response.headers.get('Cache-Control'), /no-store/);
  return { response, result };
}

async function login(identity) {
  const { response, result } = await client(signInPath, {
    method: 'POST', body: { username: identity.username.toUpperCase(), code: identity.code },
  });
  assert(!Object.hasOwn(result, 'token') && !Object.hasOwn(result.user, 'code_fingerprint'));
  const cookie = response.headers.getSetCookie().find((value) => /scoresheets_session=/.test(value));
  assert.match(cookie, /httponly/i);
  assert.match(cookie, /samesite=lax/i);
  assert.match(cookie, /max-age=604800/i);
  if (origin.startsWith('https:')) assert.match(cookie, /; secure/i);
  return { id: result.user.id, cookie: cookie.split(';')[0], user: result.user };
}

const ownerProfile = { username: `owner-${suffix}`, name: 'Owner' };
await client(recoverPath, { method: 'POST', body: { ...ownerProfile, key: 'wrong' }, status: 404 });
const { result: initialOwner } = await client(recoverPath, { method: 'POST', body: { ...ownerProfile, key }, status: [200, 201] });
const firstOwner = await login(initialOwner);
const { result: ownerIdentity } = await client(recoverPath, { method: 'POST', body: { key } });
assert.equal(ownerIdentity.userId, firstOwner.id);
assert.equal(ownerIdentity.username, initialOwner.username);
assert.notEqual(ownerIdentity.code, initialOwner.code);
await client('/api/groups', { actor: firstOwner, status: 401 });
await client(signInPath, { method: 'POST', body: initialOwner, status: 401 });
const owner = await login(ownerIdentity);
const { result: groupA } = await client('/api/groups', { method: 'POST', actor: owner, body: { name: `A ${suffix}` }, status: 201 });
const { result: groupB } = await client('/api/groups', { method: 'POST', actor: owner, body: { name: `B ${suffix}` }, status: 201 });
const groupPath = (group, route) => `/api/groups/${group.id}/${route}`;

async function add(group, username, name, status, email) {
  const { result } = await client(groupPath(group, 'members'), {
    method: 'POST', body: { username: username.toUpperCase(), name, email }, actor: owner, status,
  });
  if (status === 201) {
    assert.match(result.code, /^[0-9a-f]{32}$/);
    assert.equal(result.username, username);
  } else assert(!Object.hasOwn(result, 'code'));
  return result;
}

const aliceUsername = `alice-${suffix}`;
const bobUsername = `bob-${suffix}`;
const contact = `Alice+${suffix}@example.test`;
const aliceIdentity = await add(groupA, aliceUsername, 'Alice', 201, contact);
const bobIdentity = await add(groupA, bobUsername, 'Bob', 201);
const alice = await login(aliceIdentity);
const aliceSecondSession = await login(aliceIdentity);
const bob = await login(bobIdentity);
assert.equal(alice.user.email, contact.toLowerCase());
assert.equal(bob.user.email, null);
assert.equal((await add(groupB, bobUsername, undefined, 200)).userId, bob.id);
const bobAgain = await login(bobIdentity);
assert.equal(bobAgain.id, bob.id);
await client(signInPath, { method: 'POST', body: bobIdentity, account: alice.id, status: 401 });
await client(signInPath, { method: 'POST', body: { ...bobIdentity, username: `missing-${suffix}` }, status: 401 });
await client('/api/setup', { method: 'POST', body: {}, status: 404 });
await client('/api/auth/sign-in/email', { method: 'POST', body: {}, status: 404 });
await client(groupPath(groupA, `codes/${bob.id}`), { method: 'POST', actor: alice, status: 403 });
const { result: aliceGroups } = await client('/api/groups', { actor: alice });
assert(aliceGroups.groups.some(({ id }) => id === groupA.id));
assert(!aliceGroups.groups.some(({ id }) => id === groupB.id));
await client('/api/groups', { method: 'POST', actor: alice, body: { name: 'Denied' }, status: 403 });
await client(groupPath(groupA, 'members'), { method: 'POST', actor: alice, body: { username: 'denied' }, status: 403 });
await client(groupPath(groupA, 'games'), { method: 'POST', actor: alice, body: {}, status: 403 });
await client(groupPath(groupB, 'matches'), { actor: alice, status: 403 });
await client(groupPath(groupA, 'matches'), { status: 401 });
await client('/api/auth/sign-up/email', { method: 'POST', body: aliceIdentity, status: 404 });
await client('/api/groups', { method: 'POST', actor: owner, body: { name: 'Denied' }, requestOrigin: 'https://example.test', status: 403 });

const template = {
  name: `Custom ${suffix}`, playMode: 'competitive', scoreCategories: [],
  scoring: { engineId: 'final-total', ranking: 'highest' },
};
const { result: game } = await client(groupPath(groupA, 'games'), { actor: owner, method: 'POST', body: template, status: 201 });
const { result: revised } = await client(groupPath(groupA, `games/${game.id}`), {
  actor: owner, method: 'PUT', body: { ...template, revision: 1, scoring: { ...template.scoring, ranking: 'lowest' } },
});
assert.equal(revised.revision, 2);

function matchFor(gameId, gameRevision, accountId) {
  return {
    id: randomUUID(), gameId, gameRevision, createdAt: new Date().toISOString(),
    participants: [{ id: 'guest', displayName: 'Guest' }, { id: 'player', displayName: 'Alice', userId: accountId }],
    entries: { values: { guest: 3, player: 7 } }, totals: { guest: 999, player: 999 },
  };
}
const save = (match, expectedRevision = 0) => ({ type: 'save', operationId: randomUUID(), id: match.id, expectedRevision, match });
const submit = (group, actor, op, status = 200, account) => client(groupPath(group, 'sync'), { method: 'POST', body: op, actor, status, account });

const match = matchFor(game.id, 1, alice.id);
const operation = save(match);
await submit(groupB, alice, operation, 403);
await submit(groupB, bob, operation, 422);
await submit(groupB, bob, save(matchFor('regenwormen', null, alice.id)), 422);
await submit(groupA, bob, operation, 401, alice.id);
const [first, duplicate] = await Promise.all([submit(groupA, alice, operation), submit(groupA, alice, operation)]);
assert.deepEqual(first.result, duplicate.result);
assert.equal(first.result.revision, 1);

const { result: history } = await client(groupPath(groupA, 'matches'), { actor: bob });
assert.equal(history.sessions.filter(({ id }) => id === match.id).length, 1);
const recorded = history.sessions.find(({ id }) => id === match.id);
assert.equal(recorded.gameRevision, 1);
assert.equal(recorded.scoring.ranking, 'highest');
assert.deepEqual(recorded.totals, { guest: 3, player: 7 });
assert.equal(recorded.participants[1].userId, alice.id);
await submit(groupA, bob, save(match, 1), 403);

const ownerEdit = save({ ...match, entries: { values: { guest: 2, player: 5 } } }, 1);
const aliceEdit = save({ ...match, entries: { values: { guest: 9, player: 1 } } }, 1);
await submit(groupA, owner, ownerEdit);
await submit(groupA, alice, aliceEdit, 409);
await submit(groupA, alice, { type: 'delete', operationId: randomUUID(), id: match.id, expectedRevision: 1 }, 409);
const otherMatch = matchFor('regenwormen', null, alice.id);
await submit(groupA, alice, save({ ...otherMatch, entries: { values: { guest: null, player: 7 } } }), 400);
await submit(groupA, alice, save(otherMatch));
const deletion = { type: 'delete', operationId: randomUUID(), id: otherMatch.id, expectedRevision: 1 };
const deleted = await submit(groupA, alice, deletion);
assert.equal(deleted.result.deleted, true);
assert.deepEqual((await submit(groupA, alice, deletion)).result, deleted.result);
const { result: afterDeletion } = await client(groupPath(groupA, 'matches'), { actor: bob });
assert(!afterDeletion.sessions.some(({ id }) => id === otherMatch.id));

const roundMatch = {
  ...matchFor('take-5', null, alice.id),
  entries: { rounds: [{ id: 'r1', scores: { guest: '2 * 3', player: '1 - 4' } }] },
};
await submit(groupA, alice, save(roundMatch));
const { result: roundHistory } = await client(groupPath(groupA, 'matches'), { actor: bob });
const scoredRound = roundHistory.sessions.find(({ id }) => id === roundMatch.id);
assert.deepEqual(scoredRound.entries.rounds, [{ id: 'r1', scores: { guest: 6, player: -3 } }]);
assert.deepEqual(scoredRound.totals, { guest: 6, player: -3 });

const { result: replacement } = await client(groupPath(groupA, `codes/${alice.id}`), { actor: owner, method: 'POST' });
const newIdentity = { ...aliceIdentity, code: replacement.code };
assert.notEqual(newIdentity.code, aliceIdentity.code);
await client(signInPath, { method: 'POST', body: aliceIdentity, status: 401 });
await submit(groupA, alice, aliceEdit, 401);
await client('/api/groups', { actor: aliceSecondSession, status: 401 });
const renewed = await login(newIdentity);
assert.equal(renewed.id, alice.id);
await client(groupPath(groupA, `members/${alice.id}`), { actor: owner, method: 'DELETE' });
await submit(groupA, renewed, aliceEdit, 403);
await client(groupPath(groupA, 'data'), { actor: renewed, status: 403 });
await add(groupA, newIdentity.username, undefined, 200);
await client('/api/auth/sign-out', { method: 'POST', actor: renewed });
await client('/api/groups', { actor: renewed, status: 401 });

await writeFile(fixtureFile, JSON.stringify({
  identities: [ownerIdentity, newIdentity, bobIdentity], groupA, groupB, game, revised,
  accounts: { owner: { id: owner.id, cookie: owner.cookie }, alice: { id: renewed.id }, bob: { id: bob.id, cookie: bob.cookie } },
}), { mode: 0o600 });
console.log('Cloud API verified with two groups and three accounts.');
