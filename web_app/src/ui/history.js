import { rankTotals } from '../scoring/engines.js';

function node(tag, text, className) { const value = document.createElement(tag); value.textContent = text; if (className) value.className = className; return value; }

export function renderSavedSessions(savedList, sessions, games, onDelete) {
  savedList.replaceChildren();
  if (!sessions.length) return savedList.append(node('p', 'No sessions saved yet.'));
  const currentNames = new Map(games.map((game) => [game.id, game.name]));
  sessions.forEach((session) => {
    const item = node('div', '', 'list-item');
    item.append(node('strong', currentNames.get(session.gameId) ?? session.gameNameAtPlay));
    item.append(document.createElement('br'), node('small', new Date(session.createdAt).toLocaleString()));
    const names = new Map(session.participants.map((participant) => [participant.id, participant.displayName]));
    const scores = rankTotals(session.totals, session.scoring.ranking).map(([id, score]) => `${names.get(id) ?? 'Unknown'}: ${score}`).join(' | ');
    item.append(node('p', scores));
    if (session.scoring.engineId === 'round-sum') {
      const details = node('details', ''); details.append(node('summary', 'Round details'));
      session.entries.rounds.forEach((round, index) => details.append(node('div', `Round ${index + 1}: ${session.participants.map((p) => `${p.displayName} ${round.scores[p.id]}`).join(' | ')}`)));
      item.append(details);
    }
    const button = node('button', 'Delete', 'delete'); button.type = 'button'; button.addEventListener('click', () => onDelete(session.id));
    item.append(button); savedList.append(item);
  });
}
