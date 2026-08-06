import { rankTotals } from '../scoring/engines.js';
import { getGameName } from '../data/games.js';

function node(tag, text, className) { const value = document.createElement(tag); value.textContent = text; if (className) value.className = className; return value; }

export function groupSessionsByGame(sessions) {
  const groups = new Map();
  sessions.forEach((session) => {
    const id = String(session.gameId ?? session.gameNameAtPlay ?? '');
    if (!groups.has(id)) groups.set(id, { gameId: id, gameNameAtPlay: session.gameNameAtPlay || id, sessions: [] });
    groups.get(id).sessions.push(session);
  });
  return [...groups.values()];
}

function renderSession(session, currentNames, onDelete, onEdit, i18n) {
  const item = node('div', '', 'list-item');
  const heading = node('div', '', 'history-session-heading');
  heading.append(node('strong', currentNames.get(session.gameId) ?? session.gameNameAtPlay));
  const edit = node('button', '✎', 'secondary history-edit');
  edit.type = 'button'; edit.setAttribute('aria-label', i18n.t('session.edit')); edit.title = i18n.t('session.edit');
  edit.addEventListener('click', () => onEdit(session));
  const button = node('button', '🗑', 'delete history-delete');
  button.type = 'button'; button.setAttribute('aria-label', i18n.t('games.delete')); button.title = i18n.t('games.delete');
  button.addEventListener('click', () => onDelete(session.id));
  const actions = node('div', '', 'history-actions'); actions.append(edit, button); heading.append(actions);
  item.append(heading, node('small', i18n.formatDateTime(session.createdAt)));
  const names = new Map(session.participants.map((participant) => [participant.id, participant.displayName]));
  if (session.scoring.engineId === 'winner-only') {
    const winner = session.entries?.winnerId;
    item.append(node('p', winner === null ? i18n.t('session.noWinner') : i18n.t('session.winnerResult', { player: names.get(winner) ?? i18n.t('common.unknown') })));
  } else {
    const scores = rankTotals(session.totals, session.scoring.ranking).map(([id, score]) => `${names.get(id) ?? i18n.t('common.unknown')}: ${score}`).join(' | ');
    item.append(node('p', scores));
  }
  if (session.scoring.engineId === 'round-sum') {
    const details = node('details', ''); details.append(node('summary', i18n.t('session.roundDetails')));
    session.entries.rounds.forEach((round, index) => {
      const scores = session.participants.map((participant) => `${participant.displayName} ${round.scores[participant.id]}`).join(' | ');
      details.append(node('div', i18n.t('session.round', { number: index + 1, scores })));
    });
    item.append(details);
  }
  return item;
}

export function renderSavedSessions(savedList, sessions, games, { onDelete, onEdit, onExport, onImport }, i18n, grouped = false, onGroupChange = () => {}) {
  savedList.replaceChildren();
  const toggle = node('button', i18n.t('session.groupByGame'), 'secondary history-group-toggle');
  toggle.type = 'button'; toggle.setAttribute('aria-pressed', String(grouped));
  toggle.addEventListener('click', () => onGroupChange(!grouped));
  const exportButton = node('button', i18n.t('backup.export'), 'secondary history-export'); exportButton.type = 'button'; exportButton.addEventListener('click', onExport);
  const importLabel = node('label', i18n.t('backup.import'), 'secondary history-import');
  const importInput = document.createElement('input'); importInput.type = 'file'; importInput.accept = 'application/json,.json'; importInput.className = 'hidden';
  importInput.addEventListener('change', async () => { if (importInput.files?.[0]) await onImport(importInput.files[0]); importInput.value = ''; });
  importLabel.append(importInput);
  const controls = node('div', '', 'history-controls'); controls.append(toggle, exportButton, importLabel); savedList.append(controls);
  if (!sessions.length) return savedList.append(node('p', i18n.t('session.noneSaved')));

  const currentNames = new Map(games.map((game) => [game.id, getGameName(game, i18n.locale)]));
  if (!grouped) {
    sessions.forEach((session) => savedList.append(renderSession(session, currentNames, onDelete, onEdit, i18n)));
    return;
  }

  groupSessionsByGame(sessions).forEach((group) => {
    const details = node('details', '', 'history-game-group');
    const gameName = currentNames.get(group.gameId) ?? group.gameNameAtPlay;
    details.append(node('summary', i18n.t('session.gameGroup', { game: gameName, count: group.sessions.length })));
    group.sessions.forEach((session) => details.append(renderSession(session, currentNames, onDelete, onEdit, i18n)));
    savedList.append(details);
  });
}
