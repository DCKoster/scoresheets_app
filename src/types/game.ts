export type ScoreMode = 'per-round' | 'total-only';

export interface GameDefinition {
  id: string;
  name: string;
  scoreMode: ScoreMode;
  minPlayers: number;
  maxPlayers: number;
}
