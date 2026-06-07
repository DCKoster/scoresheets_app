/**
 * Game types and example games that use them.
 * Scoring type: The mechanism (per-round, final-total, etc.)
 * Games: Examples of games that use this scoring type.
 */

export const GAME_TYPES = {
  'per-round': {
    name: 'Per-Round Scoring',
    description: 'Add one round at a time. Lower total wins.',
    examples: ['Take 5!'],
  },
  'final-total': {
    name: 'Final Total Scoring',
    description: 'Enter final totals once. Highest total wins.',
    examples: ['Regenwormen', 'Koehandel'],
  },
};

export const GAMES = [
  {
    id: 'take-5',
    name: 'Take 5!',
    type: 'per-round',
    description: 'Card game, lowest total wins.',
  },
  {
    id: 'regenwormen',
    name: 'Regenwormen',
    type: 'final-total',
    description: 'Tile-laying game, highest total wins.',
  },
];

export function getGameById(gameId) {
  return GAMES.find((g) => g.id === gameId);
}

export function getGameType(typeId) {
  return GAME_TYPES[typeId];
}

export function getAllGames() {
  return GAMES;
}
