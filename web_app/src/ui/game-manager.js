import { getGameName } from '../data/games.js';

function node(tag, text, className) { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (className) value.className = className; return value; }
function iconButton(icon, label, action, className = '') { const button = node('button', icon, `game-action ${className}`); button.type = 'button'; button.title = label; button.setAttribute('aria-label', label); button.addEventListener('click', action); return button; }

export function renderGameManager(container, games, actions, i18n, filters = {}) {
  container.replaceChildren();
  const query = String(filters.query ?? '').trim().toLocaleLowerCase();
  const visible = games.filter((game) => !query || getGameName(game, i18n.locale).toLocaleLowerCase().includes(query));
  if (!visible.length) return container.append(node('p', i18n.t('games.noMatches')));
  const grid = node('div', '', 'game-grid');
  visible.forEach((game) => {
    const card = node('article', '', 'game-card'); card.tabIndex = 0;
    card.append(node('h3', getGameName(game, i18n.locale)));
    const tags = node('div', '', 'game-tags');
    tags.append(node('span', `${game.playMode === 'cooperative' ? '👥' : '⚔'} ${i18n.t(`games.playMode.${game.playMode}`)}`, `game-tag ${game.playMode === 'cooperative' ? 'cooperative-tag' : 'competitive-tag'}`));
    const engine = game.scoring.engineId === 'winner-only' ? i18n.t('games.engine.winner-only') : i18n.t('games.summary', { engine: i18n.t(`games.engine.${game.scoring.engineId}`), ranking: i18n.t(`games.ranking.${game.scoring.ranking}`) });
    tags.append(node('span', engine, 'game-tag scoring-tag'));
    if (game.scoreCategories?.length) tags.append(node('span', `${i18n.t('games.scoreCategories')}: ${game.scoreCategories.join(', ')}`, 'game-tag scoring-tag'));
    if (game.origin === 'builtin') tags.append(node('span', i18n.t('games.builtin'), 'game-tag builtin-tag'));
    const actionsRow = node('div', '', 'game-actions'); actionsRow.append(iconButton('⧉', i18n.t('games.duplicate'), () => actions.duplicate(game.id)));
    if (game.origin === 'custom') { actionsRow.append(iconButton('✎', i18n.t('games.edit'), () => actions.edit(game))); actionsRow.append(iconButton('🗑', i18n.t('games.delete'), () => actions.delete(game), 'delete')); }
    card.append(tags, actionsRow); grid.append(card);
  });
  container.append(grid);
}
