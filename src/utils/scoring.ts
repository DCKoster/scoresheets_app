import { RoundScores } from '../types/session';

export function calculateTake5Totals(players: string[], rounds: RoundScores[]): Record<string, number> {
  return rounds.reduce<Record<string, number>>((totals, round) => {
    for (const player of players) {
      totals[player] = (totals[player] ?? 0) + (round.scores[player] ?? 0);
    }
    return totals;
  }, {});
}

export function rankByLowestScore(totals: Record<string, number>): Array<{ player: string; score: number }> {
  return Object.entries(totals)
    .map(([player, score]) => ({ player, score }))
    .sort((a, b) => a.score - b.score);
}

export function rankByHighestScore(totals: Record<string, number>): Array<{ player: string; score: number }> {
  return Object.entries(totals)
    .map(([player, score]) => ({ player, score }))
    .sort((a, b) => b.score - a.score);
}
