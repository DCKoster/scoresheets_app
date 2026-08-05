import { getGameName } from '../data/games.js';

export function renderHomeSummary(container, sessions, games, i18n) {
  container.replaceChildren();
  const paragraph = document.createElement('p');
  if (!sessions.length) paragraph.textContent = i18n.t('home.empty');
  else {
    const game = games.find((item) => item.id === sessions[0].gameId);
    const gameName = game ? getGameName(game, i18n.locale) : sessions[0].gameNameAtPlay;
    paragraph.textContent = i18n.t('home.summary', { count: sessions.length, game: gameName, date: i18n.formatDate(sessions[0].createdAt) });
  }
  container.append(paragraph);
}
