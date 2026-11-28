import { createId } from '../state/repositories.js';
import { validateGroupPlayers } from './group-players.js';

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function option(value, label) {
  const node = element('option', label);
  node.value = value;
  return node;
}

export function openCopySession(session, destinations, { i18n, repository, viewHistory }) {
  const { t, formatDateTime } = i18n;
  const dialog = element('dialog');
  dialog.className = 'session-copy-dialog';
  const title = element('h2', t('cloud.copySession'));
  title.id = 'copy-session-title';
  dialog.setAttribute('aria-labelledby', title.id);
  const summary = element('p', `${session.gameNameAtPlay} · ${formatDateTime(session.createdAt)}`);
  const form = element('form');
  const targetLabel = element('label', t('cloud.copyDestination'));
  const target = element('select');
  target.required = true;
  target.append(option('', t('cloud.chooseGroup')), ...destinations.map(({ id, name }) => option(id, name)));
  targetLabel.append(target);

  const players = element('fieldset');
  players.className = 'cloud-players';
  players.append(element('legend', t('cloud.players')));
  const selectors = session.participants.map(({ displayName }, index) => {
    const label = element('label', displayName);
    const select = element('select');
    select.setAttribute('aria-label', t('cloud.copyPlayer', { name: displayName, number: index + 1 }));
    label.append(select);
    players.append(label);
    return select;
  });

  const status = element('p');
  status.setAttribute('role', 'status');
  const retry = element('button', t('cloud.retryRoster'));
  retry.type = 'button';
  retry.className = 'secondary hidden';
  const actions = element('div');
  actions.className = 'button-row';
  const save = element('button', t('cloud.copySession'));
  save.type = 'submit';
  const close = element('button', t('games.cancel'));
  close.type = 'button';
  close.className = 'secondary';
  close.addEventListener('click', () => dialog.close());
  actions.append(save, close);
  form.append(targetLabel, players, retry, status, actions);
  dialog.append(title, summary, form);

  let current;
  let saving = false;
  let ready = false;
  const feedback = (key, parameters) => {
    status.textContent = key ? t(key === 'cloud.offline' ? 'cloud.copyOffline' : key, parameters) : '';
  };
  const enablePlayers = () => {
    players.disabled = !ready || saving;
    save.disabled = !ready || saving;
  };
  function setMembers(members, selections = []) {
    selectors.forEach((select, index) => {
      select.replaceChildren(option('', t('cloud.guest')), ...members.map(({ id, username, name }) =>
        option(id, username ? `${name} (${username})` : name)));
      if (members.some(({ id }) => id === selections[index])) select.value = selections[index];
    });
  }
  async function loadMembers({ keepLinks = false } = {}) {
    const selections = keepLinks ? selectors.map(({ value }) => value) : [];
    const destination = target.value ? repository(target.value) : null;
    current = destination;
    ready = false;
    enablePlayers();
    retry.classList.add('hidden');
    setMembers([]);
    feedback(destination ? 'cloud.loadingRoster' : '');
    if (!destination) return;
    try {
      const { members } = await destination.request('data');
      if (current !== destination || !dialog.open) return;
      setMembers(members.filter(({ status }) => !status || status === 'active'), selections);
      ready = true;
      feedback('');
      enablePlayers();
    } catch (error) {
      if (current !== destination || !dialog.open) return;
      feedback(error.message);
      retry.classList.remove('hidden');
    }
  }
  setMembers([]);
  enablePlayers();
  target.addEventListener('change', () => void loadMembers());
  retry.addEventListener('click', () => void loadMembers());
  dialog.addEventListener('cancel', (event) => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!ready || saving) return;
    const destination = current;
    const group = destinations.find(({ id }) => id === destination.groupId);
    const validation = validateGroupPlayers(session.participants.map((player, index) => ({
      ...player, userId: selectors[index].value || null,
    })));
    if (!validation.valid) return feedback(validation.error);
    saving = target.disabled = close.disabled = true;
    enablePlayers();
    feedback('cloud.copying');
    try {
      const { alreadyPresent } = await destination.request('sync', { method: 'POST', body: {
        type: 'import', operationId: createId('operation'), expectedRevision: 0,
        match: { ...session, participants: validation.participants },
      } });
      feedback(alreadyPresent ? 'cloud.alreadyCopied' : 'cloud.copied', { group: group.name });
      targetLabel.classList.add('hidden');
      players.classList.add('hidden');
      const history = element('button', t('cloud.openGroupHistory'));
      history.type = 'button';
      history.addEventListener('click', () => {
        dialog.close();
        void viewHistory(group.id);
      });
      save.replaceWith(history);
      close.textContent = t('cloud.close');
      history.focus();
      ready = false;
    } catch (error) {
      if (error.message === 'cloud.participantOutsideGroup') {
        await loadMembers({ keepLinks: true });
        if (ready) feedback(error.message);
      } else {
        feedback(error.message);
      }
    } finally {
      saving = target.disabled = close.disabled = false;
      enablePlayers();
    }
  });
  document.body.append(dialog);
  dialog.showModal();
}
