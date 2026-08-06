export const BUILTIN_GAMES = Object.freeze([
  Object.freeze({
    schemaVersion: 3,
    id: 'take-5',
    names: Object.freeze({ en: 'Take 5!', nl: 'Take 5!' }),
    origin: 'builtin',
    scoring: Object.freeze({ engineId: 'round-sum', ranking: 'lowest' }),
    category: 'Card game', playMode: 'competitive', scoreCategories: Object.freeze([]),
  }),
  Object.freeze({
    schemaVersion: 3,
    id: 'regenwormen',
    names: Object.freeze({ en: 'Pick-omino', nl: 'Regenwormen' }),
    origin: 'builtin',
    scoring: Object.freeze({ engineId: 'final-total', ranking: 'highest' }),
    category: 'Dice game', playMode: 'competitive', scoreCategories: Object.freeze([]),
  }),
  Object.freeze({
    schemaVersion: 3,
    id: 'dirty-pig',
    names: Object.freeze({ en: 'Dirty Pig', nl: 'Moddervarkens' }),
    origin: 'builtin',
    scoring: Object.freeze({ engineId: 'winner-only', ranking: 'selected' }),
    category: 'Card game', playMode: 'competitive', scoreCategories: Object.freeze([]),
  }),
]);

export function findGame(games, gameId) {
  return games.find((game) => game.id === gameId);
}

export function getGameName(game, locale = 'en') {
  return game?.names?.[locale] ?? game?.names?.en ?? game?.name ?? '';
}

export function getAllGameNames(game) {
  return game?.names ? Object.values(game.names) : [game?.name ?? ''];
}
