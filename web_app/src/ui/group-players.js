import { createId } from '../state/repositories.js';

export function groupPlayerKey(participant) {
  const name = String(participant?.displayName ?? '').trim().toLocaleLowerCase();
  if (participant?.userId) return `member:${participant.userId}`;
  return name && participant && Object.hasOwn(participant, 'userId') ? `guest:${name}` : name;
}

export function playerPicker(container, { members, players, onChange, fixed = false }, i18n) {
  container.replaceChildren();
  const field = document.createElement('fieldset');
  field.className = 'cloud-players';
  const legend = document.createElement('legend');
  legend.textContent = i18n.t('cloud.players');
  field.append(legend);
  const options = [{ id: '', name: i18n.t('cloud.guest') }, ...members];
  const addButton = (text, callback) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = text;
    button.addEventListener('click', callback);
    return button;
  };
  const draw = () => playerPicker(container, { members, players, onChange, fixed }, i18n);
  players.forEach((player, index) => {
    const row = document.createElement('div');
    row.className = 'cloud-player-row';
    const select = document.createElement('select');
    select.setAttribute('aria-label', i18n.t('cloud.playerType', { number: index + 1 }));
    const available = player.userId && !options.some(({ id }) => id === player.userId)
      ? [...options, { id: player.userId, name: player.displayName }]
      : options;
    for (const member of available) {
      const option = document.createElement('option');
      option.value = member.id;
      option.textContent = member.name;
      select.append(option);
    }
    select.value = player.userId ?? '';
    select.addEventListener('change', () => {
      player.userId = select.value || null;
      player.displayName = available.find(({ id }) => id === select.value && id)?.name ?? '';
      onChange();
      draw();
    });
    row.append(select);
    if (!player.userId) {
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 100;
      input.setAttribute('aria-label', i18n.t('cloud.guestName'));
      input.setAttribute('list', 'group-guest-suggestions');
      input.value = player.displayName;
      input.addEventListener('input', () => {
        player.displayName = input.value;
        onChange();
      });
      row.append(input);
    }
    if (!fixed && players.length > 2) row.append(addButton(i18n.t('cloud.removePlayer'), () => {
      players.splice(index, 1);
      onChange();
      draw();
    }));
    field.append(row);
  });
  if (!fixed && players.length < 30) field.append(addButton(i18n.t('cloud.addPlayer'), () => {
    players.push(blankPlayer());
    onChange();
    draw();
  }));
  container.append(field);
}

export function blankPlayer() {
  return { id: createId('participant'), userId: null, displayName: '' };
}

export function validateGroupPlayers(players) {
  const participants = players.map((part) => ({ ...part, displayName: part.displayName.trim() }));
  if (participants.length < 2 || participants.some(({ displayName }) => !displayName)) return { valid: false, error: 'errors.playersMinimum' };
  if (new Set(participants.map(groupPlayerKey)).size !== participants.length) return { valid: false, error: 'errors.playersUnique' };
  return { valid: true, participants };
}
