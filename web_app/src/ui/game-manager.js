import { scoringEngines } from '../scoring/engines.js';

function node(tag, text, className) { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (className) value.className = className; return value; }

export function renderGameManager(container, games, actions) {
  container.replaceChildren();
  games.forEach((game) => {
    const row = node('div', '', 'list-item game-row');
    row.append(node('strong', game.name), node('span', ` — ${scoringEngines.get(game.scoring.engineId)?.label}, ${game.scoring.ranking} wins`));
    const buttons = node('div', '', 'button-row');
    const duplicate = node('button', 'Duplicate'); duplicate.type = 'button'; duplicate.addEventListener('click', () => actions.duplicate(game.id)); buttons.append(duplicate);
    if (game.origin === 'custom') {
      const edit = node('button', 'Edit'); edit.type = 'button'; edit.addEventListener('click', () => actions.edit(game));
      const remove = node('button', 'Delete', 'delete'); remove.type = 'button'; remove.addEventListener('click', () => actions.delete(game));
      buttons.append(edit, remove);
    }
    row.append(buttons); container.append(row);
  });
}
