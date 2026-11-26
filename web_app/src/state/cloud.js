import { BUILTIN_GAMES, getGameName } from '../data/games.js';
import { createId, validateGameName } from './repositories.js';

const DATABASE = 'scoresheets-groups';
const SIGN_OUT = 'scoresheets-sign-out';
let database;

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('browser');
      request.result.createObjectStore('groups');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    database = null;
    throw error;
  });
  return database;
}

async function transaction(storeName, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error ?? new Error('cloud.storageError'));
    action(store, (value) => { result = value; });
  });
}

function read(store, key) {
  return transaction(store, 'readonly', (table, complete) => {
    const request = table.get(key);
    request.onsuccess = () => complete(request.result);
  });
}

function write(store, key, value) {
  return transaction(store, 'readwrite', (table) => {
    if (value === null) table.delete(key);
    else table.put(value, key);
  });
}

const empty = () => ({ snapshot: null, operations: [] });

function updateGroup(accountId, groupId, update) {
  const key = [accountId, groupId];
  return transaction('groups', 'readwrite', (table, complete) => {
    const request = table.get(key);
    request.onsuccess = () => {
      const result = update(request.result ?? empty());
      table.put(result, key);
      complete(result);
    };
  });
}

export const readBrowser = () => read('browser', 'session');
export const writeBrowser = (value) => write('browser', 'session', value);
export const signingOut = () => Boolean(localStorage.getItem(SIGN_OUT));

export class ApiError extends Error {
  constructor(status, key) {
    super(key);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, accountId } = {}) {
  const headers = {};
  if (accountId) headers['X-Scoresheets-Account'] = accountId;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(`/api/${path}`, {
      method, headers, credentials: 'same-origin', cache: 'no-store',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'cloud.offline');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new ApiError(response.status, result?.error ?? 'cloud.authUnavailable');
  return result;
}

export async function pendingGroups(accountId) {
  const range = IDBKeyRange.bound([accountId], [accountId, []], false, true);
  return transaction('groups', 'readonly', (table, complete) => {
    const result = [];
    const request = table.openCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return complete(result);
      if (cursor.value.operations.length) result.push({ groupId: cursor.key[1], operations: cursor.value.operations });
      cursor.continue();
    };
  });
}

export async function purgeSnapshots(accountId, active) {
  const range = IDBKeyRange.bound([accountId], [accountId, []], false, true);
  return transaction('groups', 'readwrite', (table) => {
    const request = table.openCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (!active?.has(cursor.key[1])) {
        const { operations } = cursor.value;
        if (!operations.length) cursor.delete();
        else cursor.update({
          snapshot: null,
          operations: active ? operations.map((op) => ({ ...op, error: 'cloud.membershipRequired' })) : operations,
        });
      } else if (cursor.value.operations.some((op) => op.error === 'cloud.membershipRequired')) {
        cursor.update({ ...cursor.value, operations: cursor.value.operations.map((op) =>
          op.error === 'cloud.membershipRequired' ? { ...op, error: undefined } : op) });
      }
      cursor.continue();
    };
  });
}

export async function finishSignOut() {
  const finish = async () => {
    const accountId = localStorage.getItem(SIGN_OUT);
    if (!accountId) return;
    // Keep the account identifier until both IndexedDB cleanup and online
    // cookie revocation succeed, so a restart can complete an interrupted logout.
    await purgeSnapshots(accountId);
    await writeBrowser(null);
    await api('auth/sign-out', { method: 'POST', accountId });
    if (localStorage.getItem(SIGN_OUT) === accountId) localStorage.removeItem(SIGN_OUT);
  };
  if (navigator.locks) return navigator.locks.request('scoresheets:sign-out', finish);
  return finish();
}

export async function signOut(accountId) {
  localStorage.setItem(SIGN_OUT, accountId);
  try { await finishSignOut(); } catch { /* Retry cleanup and revocation on the next connection. */ }
}

export function visibleMatches(snapshot, operations, accountId) {
  const byId = new Map((snapshot?.sessions ?? []).map((match) => [match.id, match]));
  const blocked = new Map(operations.filter(({ error }) => error).map(({ id, error }) => [id, error]));
  for (const op of operations) {
    if (op.type === 'delete') byId.delete(op.id);
    else byId.set(op.id, {
      ...op.match,
      createdBy: op.match.createdBy ?? accountId,
      revision: op.expectedRevision + 1,
      syncError: blocked.get(op.id),
      pending: true,
    });
  }
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export class GroupRepository {
  constructor(accountId, groupId) {
    this.accountId = accountId;
    this.groupId = groupId;
  }
  request(resource, options = {}) {
    if (signingOut()) throw new ApiError(401, 'cloud.signInRequired');
    return api(`groups/${this.groupId}/${resource}`, { ...options, accountId: this.accountId });
  }
  read() { return read('groups', [this.accountId, this.groupId]).then((result) => result ?? empty()); }
  update(action) { return updateGroup(this.accountId, this.groupId, action); }
  block() {
    return this.update((state) => ({
      snapshot: null,
      operations: state.operations.map((op) => ({ ...op, error: 'cloud.membershipRequired' })),
    }));
  }
  async download() {
    const { games, members } = await this.request('data');
    const sessions = [];
    let query = '';
    do {
      const page = await this.request(`matches${query}`);
      sessions.push(...page.sessions);
      query = page.next ? `?${new URLSearchParams(page.next)}` : '';
    } while (query);
    const snapshot = { games, members, sessions };
    if (signingOut()) return;
    await this.update((state) => ({ ...state, snapshot }));
  }
  async queue(type, id, expectedRevision, match) {
    const operation = { operationId: createId('op'), type, id, expectedRevision, ...(match ? { match } : {}) };
    const result = await this.update((state) => {
      if (!state.snapshot || signingOut()) return state;
      return { ...state, operations: [...state.operations, operation] };
    });
    if (!result.operations.some((op) => op.operationId === operation.operationId)) throw new ApiError(403, 'cloud.membershipRequired');
    return operation;
  }
  async flush() {
    const { operations } = await this.read();
    const stopped = new Set(operations.filter((op) => op.error).map((op) => op.id));
    for (const op of operations) {
      if (stopped.has(op.id)) continue;
      const { error, ...body } = op;
      try {
        const ack = await this.request('sync', { method: 'POST', body });
        await this.update((state) => {
          const known = state.operations.some((item) => item.operationId === op.operationId);
          if (!known) return state;
          const snapshot = state.snapshot;
          // Retain the acknowledged record through a failed history refresh.
          if (snapshot) {
            const existing = snapshot.sessions.find((match) => match.id === op.id);
            if (!existing || existing.revision < ack.revision) {
              snapshot.sessions = snapshot.sessions.filter((match) => match.id !== op.id);
              if (!ack.deleted) snapshot.sessions.push({ ...op.match, createdBy: op.match.createdBy ?? this.accountId, revision: ack.revision });
            }
          }
          return { snapshot, operations: state.operations.filter((item) => item.operationId !== op.operationId) };
        });
      } catch (error) {
        if (error.status === 403 && error.message === 'cloud.membershipRequired') await this.block();
        if (!error.status || error.status === 401 || error.status >= 500 || error.message === 'cloud.membershipRequired') throw error;
        stopped.add(op.id);
        await this.update((state) => ({
          ...state,
          operations: state.operations.map((item) => item.operationId === op.operationId ? { ...item, error: error.message } : item),
        }));
      }
    }
  }
  discard(id) {
    return this.update((state) => ({ ...state, operations: state.operations.filter((op) => op.id !== id) }));
  }
  retryLocal(id, revision, type, match) {
    return this.update((state) => {
      if (!state.snapshot || signingOut()) return state;
      const operation = { operationId: createId('op'), type, id: match?.id ?? id, expectedRevision: revision, ...(match ? { match } : {}) };
      return { ...state, operations: [...state.operations.filter((op) => op.id !== id), operation] };
    });
  }
}

export class GroupGameRepository {
  constructor(group) { this.group = group; }
  async list() { return [...BUILTIN_GAMES, ...((await this.group.read()).snapshot?.games ?? [])]; }
  create(input) { return this.group.request('games', { method: 'POST', body: input }); }
  async update(id, changes) {
    const game = (await this.list()).find((item) => item.id === id);
    return this.group.request(`games/${id}`, { method: 'PUT', body: { ...changes, revision: changes.revision ?? game?.revision } });
  }
  async delete(id, revision) {
    const expected = revision ?? (await this.list()).find((game) => game.id === id)?.revision;
    return this.group.request(`games/${id}?revision=${expected}`, { method: 'DELETE' });
  }
  async duplicate(id, locale, copyName) {
    const games = await this.list();
    const source = games.find((game) => game.id === id);
    if (!source) throw new Error('errors.gameNotFound');
    const sourceName = getGameName(source, locale);
    let number = 1;
    let name = copyName(sourceName, number);
    while (!validateGameName(name, games).valid) name = copyName(sourceName, ++number);
    return this.create({ ...source, name });
  }
}

export class GroupSessionRepository {
  constructor(group) { this.group = group; }
  async list() {
    const { snapshot, operations } = await this.group.read();
    return snapshot ? visibleMatches(snapshot, operations, this.group.accountId) : [];
  }
  async save(match) {
    const { pending, syncError, ...payload } = match;
    return this.group.queue('save', match.id, match.revision ?? 0, payload);
  }
  delete(match) { return this.group.queue('delete', match.id, match.revision); }
}
