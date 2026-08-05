function parseNumber(value) {
  if (String(value).trim() === '') return { valid: false, error: 'errors.scoreRequired' };
  const number = Number(value);
  return Number.isFinite(number) ? { valid: true, value: number } : { valid: false, error: 'errors.scoreFinite' };
}

function parseFormula(value) {
  const source = String(value).trim();
  if (!source) return { valid: false, error: 'errors.scoreRequired' };
  let index = 0;
  const skipSpaces = () => { while (/\s/.test(source[index] ?? '')) index += 1; };
  const take = (character) => {
    skipSpaces();
    if (source[index] !== character) return false;
    index += 1;
    return true;
  };
  const primary = () => {
    skipSpaces();
    if (take('(')) {
      const value = expression();
      if (!take(')')) throw new Error('formula');
      return value;
    }
    const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) throw new Error('formula');
    index += match[0].length;
    return Number(match[0]);
  };
  const factor = () => {
    skipSpaces();
    if (take('+')) return factor();
    if (take('-')) return -factor();
    let result = primary();
    while (true) {
      if (take('*')) result *= factor();
      else if (take('/')) result /= factor();
      else return result;
    }
  };
  const expression = () => {
    let result = factor();
    while (true) {
      if (take('+')) result += factor();
      else if (take('-')) result -= factor();
      else return result;
    }
  };
  try {
    const result = expression();
    skipSpaces();
    return index === source.length && Number.isFinite(result)
      ? { valid: true, value: result }
      : { valid: false, error: 'errors.scoreFormula' };
  } catch {
    return { valid: false, error: 'errors.scoreFormula' };
  }
}

export function rankTotals(totals, ranking) {
  return Object.entries(totals).sort((a, b) => ranking === 'highest' ? b[1] - a[1] : a[1] - b[1]);
}

export const roundSumEngine = {
  id: 'round-sum',
  initialEntries: () => ({ rounds: [] }),
  validateEntry(values, participants) {
    const round = {};
    for (const participant of participants) {
      const parsed = parseFormula(values[participant.id]);
      if (!parsed.valid) return parsed;
      round[participant.id] = parsed.value;
    }
    return { valid: true, entry: round };
  },
  validateSession(entries) { return entries?.rounds?.length ? { valid: true } : { valid: false, error: 'errors.roundRequired' }; },
  calculateTotals(entries, participants) {
    return participants.reduce((totals, participant) => {
      totals[participant.id] = (entries.rounds ?? []).reduce((sum, round) => sum + (round.scores?.[participant.id] ?? 0), 0);
      return totals;
    }, {});
  },
};

export const finalTotalEngine = {
  id: 'final-total',
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
  validateSession(entries, participants) { return this.validateEntry(entries?.values ?? {}, participants).valid ? { valid: true } : { valid: false, error: 'errors.playerScoresRequired' }; },
  calculateTotals(entries) { return { ...(entries.values ?? {}) }; },
};

export const winnerOnlyEngine = {
  id: 'winner-only',
  initialEntries: () => ({}),
  validateSession(entries, participants) {
    if (!Object.hasOwn(entries ?? {}, 'winnerId')) return { valid: false, error: 'errors.winnerRequired' };
    if (entries.winnerId === null) return { valid: true };
    return participants.some((participant) => participant.id === entries.winnerId)
      ? { valid: true }
      : { valid: false, error: 'errors.winnerInvalid' };
  },
  calculateTotals: () => ({}),
};

export const scoringEngines = new Map([
  [roundSumEngine.id, roundSumEngine],
  [finalTotalEngine.id, finalTotalEngine],
  [winnerOnlyEngine.id, winnerOnlyEngine],
]);

export function getScoringEngine(id) {
  const engine = scoringEngines.get(id);
  if (!engine) throw Object.assign(new Error('errors.engineUnknown'), { parameters: { id } });
  return engine;
}
