import { api, finishSignOut, GroupRepository, pendingGroups, purgeSnapshots, readBrowser, signOut, signingOut, writeBrowser } from '../state/cloud.js';
import { createId } from '../state/repositories.js';

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, callback) {
  const node = element('button', label);
  node.type = 'button';
  node.className = 'secondary';
  node.addEventListener('click', callback);
  return node;
}

export function installGroups({ i18n, show, report, canSwitch }) {
  const byId = (id) => document.getElementById(id);
  const choice = byId('group-choice');
  const login = byId('group-login');
  const credentials = byId('group-account');
  const owner = byId('group-admin');
  const status = byId('group-status');
  const pending = byId('group-pending');
  const issued = byId('group-issued-code');
  let account = null;
  let groups = [];
  let selected = '';
  let repository = null;
  let snapshot = null;
  let pendingWork = [];
  let connection = navigator.onLine ? 'online' : 'offline';
  let issue = '';
  let syncing = null;
  let switching = false;
  let loginOpen = false;
  const t = (key, data) => i18n().t(key, data);

  const handle = async (action) => {
    try { await action(); } catch (error) { report(error.message); }
  };

  function showCode(code = '', username = '') {
    issued.value = code;
    byId('group-issued-username').textContent = username;
    byId('group-issued').classList.toggle('hidden', !code);
  }

  async function loadLocal() {
    const active = repository;
    const user = account;
    const local = active ? (await active.read()).snapshot : null;
    const work = user ? await pendingGroups(user.id) : [];
    if (active !== repository || user !== account) return;
    snapshot = local;
    pendingWork = work;
    await show({ account, repository, snapshot, online: connection === 'online', switching });
    draw();
  }

  function draw() {
    const online = connection === 'online';
    const ownerActive = account?.role === 'owner' && online;
    owner.classList.toggle('hidden', !ownerActive || byId('group-admin-toggle').getAttribute('aria-expanded') !== 'true');
    byId('group-members-form').classList.toggle('hidden', !snapshot);
    byId('group-admin-toggle').classList.toggle('hidden', !ownerActive);
    byId('group-refresh').classList.toggle('hidden', !account || !online);
    byId('group-sign-out').classList.toggle('hidden', !account);
    byId('group-show-login').classList.toggle('hidden', Boolean(account) && connection !== 'expired' || loginOpen);
    credentials.textContent = account?.name ?? '';
    choice.classList.toggle('hidden', !account);
    byId('group-choice-label').classList.toggle('hidden', !account);
    choice.replaceChildren(...[
      { id: '', name: t('cloud.local') }, ...groups,
    ].map(({ id, name }) => {
      const option = element('option', name);
      option.value = id;
      return option;
    }));
    choice.value = selected;
    login.classList.toggle('hidden', !loginOpen);
    status.textContent = issue ? t(issue) : account && connection !== 'online' ? t(`cloud.${connection}`) : '';
    renderMembers();
    renderPending();
  }

  function renderMembers() {
    const fragment = document.createDocumentFragment();
    if (account?.role === 'owner') {
      for (const member of snapshot?.members ?? []) {
        const row = element('li');
        const identity = [member.username, member.email].filter(Boolean).join(' · ');
        row.append(element('span', identity ? `${member.name} (${identity})` : member.name));
        row.append(button(t(member.codeReady ? 'cloud.replaceCode' : 'cloud.issueCode'), () => handle(async () => {
          if (member.codeReady && !confirm(t('cloud.replaceCodeConfirm', { name: member.name }))) return;
          const active = repository;
          const user = account;
          const { code } = await active.request(`codes/${member.id}`, { method: 'POST' });
          if (active === repository && user === account) showCode(code, member.username);
          await sync();
        })));
        if (member.id !== account.id) row.append(button(t('cloud.removeMember'), () => handle(async () => {
          if (!confirm(t('cloud.removeConfirm', { name: member.name }))) return;
          await repository.request(`members/${member.id}`, { method: 'DELETE' });
          await sync();
        })));
        fragment.append(row);
      }
    }
    byId('group-members').replaceChildren(fragment);
  }

  function renderPending() {
    const count = pendingWork.reduce((sum, item) => sum + item.operations.length, 0);
    const open = pending.open;
    pending.replaceChildren();
    pending.classList.toggle('hidden', !count);
    if (!count) return;
    pending.append(element('summary', t('cloud.pendingCount', { count })));
    pending.open = open;
    for (const { groupId, operations } of pendingWork) {
      const byMatch = new Map();
      for (const op of operations) {
        const previous = byMatch.get(op.id);
        byMatch.set(op.id, { op, error: previous?.error ?? op.error, match: op.match ?? previous?.match });
      }
      for (const [id, { op, error, match }] of byMatch) {
        const group = new GroupRepository(account.id, groupId);
        const remote = groupId === selected ? snapshot?.sessions.find((item) => item.id === id) : null;
        const name = match?.gameNameAtPlay ?? remote?.gameNameAtPlay ?? t('cloud.match');
        const row = element('div');
        row.className = 'pending-change';
        row.append(element('span', `${name} · ${t(error ?? 'cloud.pending')}`));
        if (error) {
          if (match) row.append(button(t('cloud.downloadDraft'), () => {
            const link = element('a');
            link.href = URL.createObjectURL(new Blob([JSON.stringify(match, null, 2)], { type: 'application/json' }));
            link.download = `scoresheets-${id}.json`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 0);
          }));
          row.append(button(t('cloud.discard'), () => handle(async () => {
            if (!confirm(t('cloud.discardConfirm'))) return;
            await group.discard(id);
            await loadLocal();
          })));
          if (error === 'cloud.conflict' && groupId === selected && snapshot) {
            if (remote) row.append(element('p', t('cloud.conflictVersion', { revision: remote.revision, date: i18n().formatDateTime(remote.updatedAt) })));
            if (remote || op.type === 'save') {
              row.append(button(t(remote ? 'cloud.applyDraft' : 'cloud.saveAsNew'), () => handle(async () => {
                if (!confirm(t('cloud.applyConfirm'))) return;
                const edited = op.type === 'save' && !remote ? { ...op.match, id: createId('session'), createdBy: account.id } : op.match;
                await group.retryLocal(id, remote?.revision ?? 0, op.type, edited);
                await loadLocal();
                void sync();
              })));
            }
          }
        }
        pending.append(row);
      }
    }
  }

  async function switchTo(id) {
    if (switching || id === selected) return;
    if (!canSwitch()) { choice.value = selected; return; }
    switching = true;
    try {
      selected = id;
      repository = id ? new GroupRepository(account.id, id) : null;
      showCode();
      issue = '';
      if (account) await writeBrowser({ account, groups, selected });
      await loadLocal();
    } finally {
      switching = false;
    }
    if (syncing) await syncing;
    void sync();
  }

  function sync() {
    if (syncing) return syncing;
    if (!account) return finishSignOut().catch(() => {});
    const activeAccount = account;
    syncing = (async () => {
      try {
        const response = await api('groups', { accountId: activeAccount.id });
        if (account !== activeAccount || signingOut()) return;
        await purgeSnapshots(activeAccount.id, new Set(response.groups.map(({ id }) => id)));
        if (account !== activeAccount || signingOut()) return;
        Object.assign(activeAccount, response.user);
        groups = response.groups;
        if (issue !== 'cloud.membershipRequired') issue = '';
        connection = 'online';
        if (selected && !groups.some(({ id }) => id === selected)) {
          issue = 'cloud.membershipRequired';
          selected = '';
          repository = null;
          switching = true;
        }
        await writeBrowser({ account, groups, selected });
        const work = new Set((await pendingGroups(activeAccount.id)).map(({ groupId }) => groupId));
        if (selected) work.add(selected);
        for (const { id } of groups) {
          if (account !== activeAccount || signingOut()) return;
          if (!work.has(id)) continue;
          const target = new GroupRepository(activeAccount.id, id);
          try {
            const refreshGroup = async () => {
              await target.flush();
              if (id === selected) await target.download();
            };
            if (navigator.locks) await navigator.locks.request(`scoresheets:${activeAccount.id}:${id}`, refreshGroup);
            else await refreshGroup();
          } catch (error) {
            if (error.message !== 'cloud.membershipRequired') throw error;
            await target.block();
            groups = groups.filter((group) => group.id !== id);
            if (selected === id) {
              selected = '';
              repository = null;
              switching = true;
              issue = 'cloud.membershipRequired';
            }
            await writeBrowser({ account, groups, selected });
          }
        }
      } catch (error) {
        if (account !== activeAccount || signingOut()) return;
        // Keep a cached group usable while its browser session is renewed.
        connection = error.status === 401 ? 'expired' : 'offline';
        if (connection === 'expired') loginOpen = true;
        if (error.status && error.status !== 401) issue = error.message;
        else issue = '';
      } finally {
        if (account === activeAccount) {
          try { await loadLocal(); } finally { switching = false; }
        }
      }
    })().catch((error) => report(error.message)).finally(() => { syncing = null; });
    return syncing;
  }

  byId('group-show-login').addEventListener('click', () => {
    loginOpen = true;
    login.elements.username.value = account?.username ?? '';
    draw();
    (account?.username ? login.elements.code : login.elements.username).focus();
  });
  byId('group-cancel-login').addEventListener('click', () => { loginOpen = false; login.reset(); draw(); });
  choice.addEventListener('change', () => handle(() => switchTo(choice.value)));
  byId('group-refresh').addEventListener('click', () => sync());
  byId('group-admin-toggle').addEventListener('click', (event) => {
    const toggle = event.currentTarget;
    toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') !== 'true'));
    draw();
  });
  issued.addEventListener('focus', () => issued.select());
  byId('group-dismiss-code').addEventListener('click', () => showCode());

  login.addEventListener('submit', (event) => {
    event.preventDefault();
    void handle(async () => {
      login.querySelector('button[type=submit]').disabled = true;
      try {
        await finishSignOut();
        await syncing;
        const body = Object.fromEntries(new FormData(login));
        if (account?.username && body.username.trim().toLowerCase() !== account.username) throw new Error('cloud.switchAccount');
        const signedIn = await api('auth/sign-in', { method: 'POST', body, accountId: account?.id });
        account = signedIn.user;
        login.reset();
        showCode();
        loginOpen = false;
        await sync();
        if (!selected && groups.length) await switchTo(groups[0].id);
      } finally {
        login.querySelector('button[type=submit]').disabled = false;
      }
    });
  });

  byId('group-sign-out').addEventListener('click', () => handle(async () => {
    const id = account?.id;
    if (!id || !canSwitch()) return;
    const work = await pendingGroups(id);
    if (work.length && !confirm(t('cloud.signOutPending'))) return;
    account = null;
    groups = [];
    selected = '';
    repository = null;
    loginOpen = false;
    issue = '';
    showCode();
    switching = true;
    try {
      const cleanup = signOut(id);
      await loadLocal();
      await cleanup;
    } finally {
      switching = false;
    }
  }));

  const creation = byId('group-create');
  creation.addEventListener('submit', (event) => {
    event.preventDefault();
    void handle(async () => {
      const body = Object.fromEntries(new FormData(creation));
      const created = await api('groups', { method: 'POST', accountId: account.id, body });
      creation.reset();
      await sync();
      await switchTo(created.id);
    });
  });

  const members = byId('group-members-form');
  members.addEventListener('submit', (event) => {
    event.preventDefault();
    void handle(async () => {
      const active = repository;
      const body = Object.fromEntries(new FormData(members));
      const submit = members.querySelector('button[type=submit]');
      submit.disabled = true;
      try {
        const { code, username } = await active.request('members', { method: 'POST', body });
        if (active === repository) showCode(code, username);
        members.reset();
        await sync();
      } finally {
        submit.disabled = false;
      }
    });
  });

  window.addEventListener('online', sync);
  window.addEventListener('offline', () => { connection = 'offline'; void handle(loadLocal); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void sync(); });
  window.addEventListener('storage', (event) => {
    if (event.key !== 'scoresheets-sign-out' || !event.newValue) return;
    account = null;
    groups = [];
    selected = '';
    repository = null;
    loginOpen = false;
    showCode();
    void handle(loadLocal);
  });

  return {
    async start() {
      if (!signingOut()) {
        const browser = await readBrowser().catch(() => null);
        account = browser?.account ?? null;
        groups = browser?.groups ?? [];
        selected = browser?.selected ?? '';
        repository = selected && account ? new GroupRepository(account.id, selected) : null;
      }
      await loadLocal();
      void sync();
    },
    draw,
    sync,
    async changed() {
      await loadLocal();
      if (syncing) void syncing.then(sync);
      else void sync();
    },
  };
}
