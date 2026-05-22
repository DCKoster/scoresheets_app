export interface RoundScores {
  roundNumber: number;
  scores: Record<string, number>;
}

export interface Take5SessionState {
  players: string[];
  rounds: RoundScores[];
}

export interface PickominoSessionState {
  players: string[];
  totals: Record<string, number>;
}

export type StoredSession = {
  id: string;
  gameId: 'take-5' | 'pick-omino';
  gameName: 'Take 5!' | 'Pick-omino';
  createdAt: string;
  players: string[];
  rounds?: RoundScores[];
  totals: Record<string, number>;
};
