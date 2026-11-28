import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const [url, fixtureFile, traceFile] = process.argv.slice(2);
assert(url && fixtureFile, 'Usage: npm run verify:browser -- <origin> <fixture-file> [new-cpu-trace-file]');
const origin = new URL(url).origin;
const fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));
const { groupA, game, accounts, identities } = fixture;
const [, alice, bob] = identities;
const groupPath = (resource) => `/api/groups/${groupA.id}/${resource}`;
const profile = await mkdtemp(join(tmpdir(), 'scoresheets-browser-'));
let context;
let page;
let replaying = false;
const samples = [];

async function request(path, actor, { method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(actor ? { Cookie: actor.cookie, 'X-Scoresheets-Account': actor.id } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data?.error)}`);
  return data;
}

async function open(offline = false) {
  context = await chromium.launchPersistentContext(profile, { locale: 'en-GB', offline });
  page = context.pages()[0];
  page.on('pageerror', (error) => console.error('Browser error:', error.message));
  page.on('dialog', (dialog) => dialog.accept());
  page.on('response', (response) => {
    if (!replaying || !new URL(response.url()).pathname.endsWith('/sync')) return;
    const ray = response.headers()['cf-ray'] ?? null;
    samples.push({ scenario: 'syncOfflineReplay', ray, status: response.status(), start: response.request().timing().startTime });
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
}

async function signIn(identity, targetPage = page) {
  const form = targetPage.locator('#group-login');
  if (!(await form.isVisible())) await targetPage.locator('#group-show-login').click();
  await form.locator('[name=username]').fill(identity.username);
  await form.locator('[name=code]').fill(identity.code);
  const reply = targetPage.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/sign-in');
  await form.getByRole('button', { name: 'Sign in' }).click();
  const response = await reply;
  assert.equal(response.status(), 200, 'Browser username and login code accepted');
  await targetPage.waitForFunction(() => document.querySelector('#group-login').classList.contains('hidden'));
}

async function selectGroup() {
  const control = page.locator('#group-choice');
  await control.selectOption(groupA.id);
  await page.getByRole('button', { name: 'New Session' }).click();
  await page.locator('#group-players').waitFor({ state: 'visible' });
}

async function record(guest, gameId = game.id) {
  await page.getByRole('button', { name: 'New Session' }).click();
  await page.locator('#game').selectOption(gameId);
  await page.getByRole('combobox', { name: 'Player 1' }).selectOption(accounts.alice.id);
  await page.getByLabel('Guest name').fill(guest);
  await page.getByRole('button', { name: 'Start session' }).click();
  const scores = page.locator('#entry-panel input[type=number]');
  await scores.nth(0).fill('7');
  await scores.nth(1).fill('11');
  await page.getByRole('button', { name: 'Save session' }).click();
  await page.locator('#view-history').getByText(guest, { exact: false }).waitFor();
}

async function status(text) {
  await page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ state: 'visible' });
}

async function cachedGroup() {
  return page.evaluate(async ({ accountId, groupId }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('scoresheets-groups', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('groups').objectStore('groups').get([accountId, groupId]);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, { accountId: accounts.alice.id, groupId: groupA.id });
}

async function countPending(expected) {
  const deadline = Date.now() + 20000;
  let actual;
  do {
    actual = (await cachedGroup())?.operations.length ?? 0;
    if (actual === expected) return;
    await delay(100);
  } while (Date.now() < deadline);
  assert.equal(actual, expected, 'IndexedDB pending operation count');
}

const history = () => request(groupPath('matches'), accounts.bob);
const find = async (guest) => (await history()).sessions.find(({ participants }) => participants.some(({ displayName }) => displayName === guest));

async function verifyCopy() {
  const localId = randomUUID();
  const guest = `Local guest ${localId.slice(0, 8)}`;
  const original = {
    schemaVersion: 3, id: localId, gameId: 'regenwormen', gameNameAtPlay: 'Pick-omino',
    createdAt: '2020-04-06T13:45:00.000Z', playMode: 'competitive', scoreCategories: [],
    scoring: { engineId: 'final-total', ranking: 'highest' },
    participants: [{ id: 'player', displayName: 'Daniël' }, { id: 'guest', displayName: guest }],
    entries: { values: { player: 7, guest: 3 } }, totals: { player: 7, guest: 3 },
  };
  const backup = {
    name: 'overlapping-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, sessions: [original], customGames: [] })),
  };

  async function review(targetPage) {
    await targetPage.locator('#group-choice').selectOption('');
    await targetPage.getByRole('button', { name: 'Session History' }).click();
    await targetPage.locator('#saved-list input[type=file]').setInputFiles(backup);
    const card = targetPage.locator('.list-item').filter({ hasText: guest });
    await card.getByRole('button', { name: 'Copy to group' }).click();
    const dialog = targetPage.getByRole('dialog', { name: 'Copy to group' });
    await dialog.getByLabel('Destination group').selectOption(groupA.id);
    const daniel = dialog.getByRole('combobox', { name: 'Link player 1 (Daniël)' });
    await daniel.locator(`option[value="${accounts.alice.id}"]`).waitFor({ state: 'attached' });
    assert.equal(await daniel.inputValue(), '', 'Accounts start unlinked');
    await daniel.selectOption(accounts.alice.id);
    return dialog;
  }

  const phoneProfile = await mkdtemp(join(tmpdir(), 'scoresheets-phone-'));
  let phone;
  try {
    phone = await chromium.launchPersistentContext(phoneProfile, { locale: 'en-GB', viewport: { width: 390, height: 844 } });
    const phonePage = phone.pages()[0];
    await phonePage.goto(origin, { waitUntil: 'domcontentloaded' });
    await signIn(alice, phonePage);
    const dialogs = await Promise.all([review(page), review(phonePage)]);
    await Promise.all(dialogs.map((dialog) => dialog.getByRole('button', { name: 'Copy to group' }).click()));
    await Promise.all(dialogs.map((dialog) => dialog.getByRole('button', { name: 'Open group history' }).waitFor()));
    const messages = await Promise.all(dialogs.map((dialog) => dialog.getByRole('status').textContent()));
    assert.deepEqual(messages.sort(), [`Already in ${groupA.name}.`, `Copied to ${groupA.name}.`]);
    const matching = (await history()).sessions.filter(({ participants }) => participants.some(({ displayName }) => displayName === guest));
    assert.equal(matching.length, 1);
    assert.equal(matching[0].createdAt, original.createdAt);
    assert.deepEqual(matching[0].totals, original.totals);
    assert.deepEqual(matching[0].participants, [
      { ...original.participants[0], userId: accounts.alice.id },
      { ...original.participants[1], userId: null },
    ]);
    await dialogs[0].getByRole('button', { name: 'Open group history' }).click();
    await page.locator('#saved-list').getByText(guest, { exact: false }).waitFor();
    assert.equal(await page.locator('#group-choice').inputValue(), groupA.id);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('scoresheets-web-sessions-v2')));
    assert.deepEqual(stored.find(({ id }) => id === localId), original);
  } finally {
    if (phone) await phone.close();
    await rm(phoneProfile, { recursive: true, force: true });
  }
}

try {
  await request(groupPath('members'), accounts.owner, { method: 'POST', body: { username: alice.username } });
  await open();
  await signIn(alice);
  await verifyCopy();
  await selectGroup();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const guest = `Offline ${randomUUID().slice(0, 7)}`;
  await context.setOffline(true);
  await record(guest);
  await countPending(1);
  await context.close();

  await open(true);
  await page.getByRole('button', { name: 'Session History' }).click();
  await status(guest);
  await status('Pending sync');
  await countPending(1);

  const { games } = await request(groupPath('data'), accounts.owner);
  const previous = games.find(({ id }) => id === game.id);
  await request(groupPath(`games/${game.id}`), accounts.owner, {
    method: 'PUT',
    body: { ...previous, scoring: { ...previous.scoring, ranking: previous.scoring.ranking === 'highest' ? 'lowest' : 'highest' } },
  });
  replaying = true;
  await context.setOffline(false);
  await countPending(0);
  replaying = false;
  const original = await find(guest);
  assert(original, 'A second account sees the synced match');
  assert.equal(original.gameRevision, previous.revision);
  assert.equal(original.scoring.ranking, previous.scoring.ranking);
  const cachesHaveApi = await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      if ((await (await caches.open(name)).keys()).some((request) => new URL(request.url).pathname.startsWith('/api/'))) return true;
    }
    return false;
  });
  assert.equal(cachesHaveApi, false, 'The service worker cache contains only app assets');

  await context.setOffline(true);
  const card = page.locator('.list-item').filter({ hasText: guest }).first();
  await card.getByRole('button', { name: 'Edit session' }).click();
  await page.locator('#entry-panel input[type=number]').first().fill('22');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await countPending(1);
  const remote = { ...original, entries: { values: { ...original.entries.values, [original.participants[0].id]: 19 } } };
  await request(groupPath('sync'), accounts.owner, {
    method: 'POST',
    body: { type: 'save', operationId: randomUUID(), id: remote.id, expectedRevision: remote.revision, match: remote },
  });
  await context.setOffline(false);
  await status('Sync conflict');
  const conflicted = page.locator('.list-item').filter({ hasText: guest }).first();
  await conflicted.getByText('Alice: 22', { exact: false }).waitFor();
  assert.equal((await find(guest)).totals[original.participants[0].id], 19);
  await page.locator('#group-pending summary').click();
  await page.getByRole('button', { name: 'Discard local change' }).click();
  await countPending(0);

  await context.setOffline(true);
  const duringExpiry = `Expiry ${randomUUID().slice(0, 7)}`;
  await record(duringExpiry, 'regenwormen');
  // A pre-migration browser has a cached account ID and email but no username.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const opening = indexedDB.open('scoresheets-groups', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('browser', 'readwrite');
      const store = tx.objectStore('browser');
      const request = store.get('session');
      request.onsuccess = () => {
        const session = request.result;
        delete session.account.username;
        store.put(session, 'session');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
  await context.close();
  await open(true);

  const { code } = await request(groupPath(`codes/${accounts.alice.id}`), accounts.owner, { method: 'POST' });
  alice.code = code;
  await writeFile(fixtureFile, JSON.stringify(fixture), { mode: 0o600 });
  await context.setOffline(false);
  await status('Sign in again to sync');
  await countPending(1);
  const pending = (await cachedGroup()).operations[0];
  const rejected = await fetch(origin + groupPath('sync'), {
    method: 'POST',
    headers: { Origin: origin, Cookie: accounts.bob.cookie, 'X-Scoresheets-Account': accounts.alice.id, 'Content-Type': 'application/json' },
    body: JSON.stringify(pending),
  });
  assert.equal(rejected.status, 401, "Another account cannot replay Alice's queued operation");
  assert.equal(await find(duringExpiry), undefined);
  await countPending(1);
  replaying = true;
  await signIn(alice);
  await countPending(0);
  replaying = false;
  assert(await find(duringExpiry));

  await context.setOffline(true);
  const whileRemoved = `Removal ${randomUUID().slice(0, 7)}`;
  await record(whileRemoved, 'regenwormen');
  await request(groupPath(`members/${accounts.alice.id}`), accounts.owner, { method: 'DELETE' });
  await context.setOffline(false);
  await status('You no longer have access to this group');
  await countPending(1);
  assert.equal(await find(whileRemoved), undefined);
  assert.equal((await cachedGroup()).snapshot, null);
  assert.equal(await page.locator('#group-choice').inputValue(), '');
  assert.equal(await page.locator('#saved-list').getByText(guest, { exact: false }).count(), 0);

  await context.setOffline(true);
  await page.locator('#group-sign-out').click();
  await page.locator('#group-sign-out').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => Boolean(localStorage.getItem('scoresheets-sign-out')));
  await context.close();
  await open(true);
  await page.locator('#group-show-login').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#group-choice').isVisible(), false);
  await context.setOffline(false);
  await page.waitForFunction(() => !localStorage.getItem('scoresheets-sign-out'));
  await signIn(bob);
  await page.locator('#group-choice').selectOption(groupA.id);
  await page.getByRole('button', { name: 'Session History' }).click();
  await status(guest);
  assert.equal(await page.locator('#group-pending').isVisible(), false);
  console.log('Browser verified copying and deduplication across profiles, restart, pending sync, template changes, conflicts, expiry, removal, and sign-out isolation.');
} finally {
  if (context) await context.close();
  if (traceFile) await writeFile(traceFile, JSON.stringify(samples), { mode: 0o600, flag: 'wx' });
  await rm(profile, { recursive: true, force: true });
}
