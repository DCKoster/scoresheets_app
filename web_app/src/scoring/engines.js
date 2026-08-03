function parseNumber(value) {
  if (String(value).trim() === '') return { valid: false, error: 'Every score is required.' };
  const number = Number(value);
  return Number.isFinite(number) ? { valid: true, value: number } : { valid: false, error: 'Scores must be finite numbers.' };
}

export function rankTotals(totals, ranking) {
  return Object.entries(totals).sort((a, b) => ranking === 'highest' ? b[1] - a[1] : a[1] - b[1]);
}

export const roundSumEngine = {
  id: 'round-sum', label: 'Scores by round',
  initialEntries: () => ({ rounds: [] }),
  validateEntry(values, participants) {
    const round = {};
    for (const participant of participants) {
      const parsed = parseNumber(values[participant.id]);
      if (!parsed.valid) return parsed;
      round[participant.id] = parsed.value;
    }
    return { valid: true, entry: round };
  },
  validateSession(entries) { return entries?.rounds?.length ? { valid: true } : { valid: false, error: 'Add at least one round before saving.' }; },
  calculateTotals(entries, participants) {
    return participants.reduce((totals, participant) => {
      totals[participant.id] = (entries.rounds ?? []).reduce((sum, round) => sum + (round.scores?.[participant.id] ?? 0), 0);
      return totals;
    }, {});
  },
};

export const finalTotalEngine = {
  id: 'final-total', label: 'One final total',
  initialEntries: () => ({ values: {} }),
  validateEntry(values, participants) {
    const result = {};
    for (const participant of participants) {
      const parsed = parseNumber(values[participant.id]);
      if (!parsed.valid) return parsed;
      result[participant.id] = parsed.value;
    }
    return { valid: true, entry: result };
  },
  validateSession(entries, participants) { return this.validateEntry(entries?.values ?? {}, participants).valid ? { valid: true } : { valid: false, error: 'Enter a score for every player.' }; },
  calculateTotals(entries) { return { ...(entries.values ?? {}) }; },
};

export const scoringEngines = new Map([[roundSumEngine.id, roundSumEngine], [finalTotalEngine.id, finalTotalEngine]]);

export function getScoringEngine(id) {
  const engine = scoringEngines.get(id);
  if (!engine) throw new Error(`Scoring engine “${id}” is not registered.`);
  return engine;
}
