import { getGameName } from '../data/games.js';

function node(tag, text, className) { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (className) value.className = className; return value; }

export function renderGameManager(container, games, actions, i18n) {
  container.replaceChildren();
  games.forEach((game) => {
    const row = node('div', '', 'list-item game-row');
    const gameName = getGameName(game, i18n.locale);
    const summary = game.scoring.engineId === 'winner-only'
      ? i18n.t('games.engine.winner-only')
      : i18n.t('games.summary', {
        engine: i18n.t(`games.engine.${game.scoring.engineId}`),
        ranking: i18n.t(`games.ranking.${game.scoring.ranking}`),
      });
    row.append(node('strong', gameName), node('span', ` — ${summary}`));
    const buttons = node('div', '', 'button-row');
    const duplicate = node('button', i18n.t('games.duplicate')); duplicate.type = 'button'; duplicate.addEventListener('click', () => actions.duplicate(game.id)); buttons.append(duplicate);
    if (game.origin === 'custom') {
      const edit = node('button', i18n.t('games.edit')); edit.type = 'button'; edit.addEventListener('click', () => actions.edit(game));
      const remove = node('button', i18n.t('games.delete'), 'delete'); remove.type = 'button'; remove.addEventListener('click', () => actions.delete(game));
      buttons.append(edit, remove);
    }
    row.append(buttons); container.append(row);
  });
}
