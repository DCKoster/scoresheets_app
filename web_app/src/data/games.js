export const BUILTIN_GAMES = Object.freeze([
  Object.freeze({
    schemaVersion: 2,
    id: 'take-5',
    name: 'Take 5!',
    origin: 'builtin',
    scoring: Object.freeze({ engineId: 'round-sum', ranking: 'lowest' }),
  }),
  Object.freeze({
    schemaVersion: 2,
    id: 'regenwormen',
    name: 'Regenwormen',
    origin: 'builtin',
    scoring: Object.freeze({ engineId: 'final-total', ranking: 'highest' }),
  }),
]);

export function findGame(games, gameId) {
  return games.find((game) => game.id === gameId);
}
