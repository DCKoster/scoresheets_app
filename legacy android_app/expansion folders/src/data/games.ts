import { GameDefinition } from '../types/game';

export const games: GameDefinition[] = [
  {
    id: 'take-5',
    name: 'Take 5!',
    scoreMode: 'per-round',
    minPlayers: 2,
    maxPlayers: 10,
  },
  {
    id: 'pick-omino',
    name: 'Pick-omino',
    scoreMode: 'total-only',
    minPlayers: 2,
    maxPlayers: 7,
  },
];
