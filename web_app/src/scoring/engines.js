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

function scoreCategoriesFor(categories) { return Array.isArray(categories) ? categories : []; }

function parseCategoryScores(values, participants, categories, parser) {
  const result = {};
  for (const participant of participants) {
    const source = values?.[participant.id];
    if (!categories.length) {
      const parsed = parser(source);
      if (!parsed.valid) return parsed;
      result[participant.id] = parsed.value;
      continue;
    }
    if (!source || typeof source !== 'object') return { valid: false, error: 'errors.scoreRequired' };
    result[participant.id] = {};
    for (const category of categories) {
      const parsed = parser(source[category]);
      if (!parsed.valid) return parsed;
      result[participant.id][category] = parsed.value;
    }
  }
  return { valid: true, entry: result };
}

function aggregateCategoryScores(source, participants, categories) {
  return participants.reduce((totals, participant) => {
    const value = source?.[participant.id];
    totals[participant.id] = categories.length && value && typeof value === 'object'
      ? categories.reduce((sum, category) => sum + (Number(value[category]) || 0), 0)
      : Number(value) || 0;
    return totals;
  }, {});
}

function categoryTotals(source, participants, categories) {
  return categories.reduce((all, category) => {
    all[category] = participants.reduce((totals, participant) => {
      const value = source?.[participant.id];
      totals[participant.id] = categories.length && value && typeof value === 'object' ? Number(value[category]) || 0 : 0;
      return totals;
    }, {});
    return all;
  }, {});
}

export const roundSumEngine = {
  id: 'round-sum',
  initialEntries: () => ({ rounds: [] }),
  validateEntry(values, participants, categories = []) {
    return parseCategoryScores(values, participants, scoreCategoriesFor(categories), parseFormula);
  },
  validateSession(entries) { return entries?.rounds?.length ? { valid: true } : { valid: false, error: 'errors.roundRequired' }; },
  calculateTotals(entries, participants, categories = []) {
    const names = scoreCategoriesFor(categories);
    return participants.reduce((totals, participant) => {
      totals[participant.id] = (entries.rounds ?? []).reduce((sum, round) => sum + aggregateCategoryScores(round.scores, [participant], names)[participant.id], 0);
      return totals;
    }, {});
  },
  calculateCategoryTotals(entries, participants, categories = []) {
    const names = scoreCategoriesFor(categories);
    return names.reduce((all, category) => {
      all[category] = participants.reduce((totals, participant) => {
        totals[participant.id] = (entries.rounds ?? []).reduce((sum, round) => sum + (round.scores?.[participant.id]?.[category] ?? 0), 0);
        return totals;
      }, {});
      return all;
    }, {});
  },
};

export const finalTotalEngine = {
  id: 'final-total',
  initialEntries: () => ({ values: {} }),
  validateEntry(values, participants, categories = []) {
    return parseCategoryScores(values, participants, scoreCategoriesFor(categories), parseNumber);
  },
  validateSession(entries, participants, categories = []) { return this.validateEntry(entries?.values ?? {}, participants, categories).valid ? { valid: true } : { valid: false, error: 'errors.playerScoresRequired' }; },
  calculateTotals(entries, participants, categories = []) { return aggregateCategoryScores(entries.values, participants, scoreCategoriesFor(categories)); },
  calculateCategoryTotals(entries, participants, categories = []) { return categoryTotals(entries.values, participants, scoreCategoriesFor(categories)); },
};

export const winnerOnlyEngine = {
  id: 'winner-only',
  initialEntries: () => ({ winnerIds: [] }),
  validateSession(entries, participants) {
    if (Array.isArray(entries?.winnerIds)) {
      return entries.winnerIds.every((id) => participants.some((participant) => participant.id === id)) && new Set(entries.winnerIds).size === entries.winnerIds.length
        ? { valid: true } : { valid: false, error: 'errors.winnerInvalid' };
    }
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
