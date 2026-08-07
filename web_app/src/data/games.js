export const BUILTIN_GAMES = Object.freeze([
  Object.freeze({
    schemaVersion: 3,
    id: 'take-5',
    names: Object.freeze({ en: 'Take 5!', nl: 'Take 5!' }),
    origin: 'builtin',
    scoring: Object.freeze({ engineId: 'round-sum', ranking: 'lowest' }),
    playMode: 'competitive', scoreCategories: Object.freeze([]),
  }),
  Object.freeze({
    schemaVersion: 3,
    id: 'regenwormen',
    names: Object.freeze({ en: 'Pick-omino', nl: 'Regenwormen' }),
    origin: 'builtin',
    scoring: Object.freeze({ engineId: 'final-total', ranking: 'highest' }),
    playMode: 'competitive', scoreCategories: Object.freeze([]),
  }),
  Object.freeze({
    schemaVersion: 3,
    id: 'dirty-pig',
    names: Object.freeze({ en: 'Dirty Pig', nl: 'Moddervarkens' }),
    origin: 'builtin',
    scoring: Object.freeze({ engineId: 'winner-only', ranking: 'selected' }),
    playMode: 'competitive', scoreCategories: Object.freeze([]),
  }),
  Object.freeze({
    schemaVersion: 3,
    id: 'mario-kart-8',
    names: Object.freeze({ en: 'Mario Kart 8', nl: 'Mario Kart 8' }),
    origin: 'builtin',
    scoring: Object.freeze({ engineId: 'mario-kart-8', ranking: 'highest' }),
    playMode: 'competitive', scoreCategories: Object.freeze([]),
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
