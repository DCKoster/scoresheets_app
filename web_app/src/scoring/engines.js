import { MARIO_KART_CC_OPTIONS, MARIO_KART_ITEMS, MARIO_KART_ITEM_PRESETS, MARIO_KART_POINTS, MARIO_KART_TRACKS } from '../data/mario-kart.js';

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? { valid: true, value } : { valid: false, error: 'errors.scoreFinite' };
  if (typeof value !== 'string' || value.trim() === '') return { valid: false, error: 'errors.scoreRequired' };
  const number = Number(value);
  return Number.isFinite(number) ? { valid: true, value: number } : { valid: false, error: 'errors.scoreFinite' };
}

function isFormulaNumber(value) {
  return typeof value === 'number' && (value === 0 || (Math.abs(value) >= 1e-6 && Math.abs(value) < 1e21));
}

function parseFormula(value) {
  // Bypass the parser for numbers with a decimal representation in its grammar.
  if (isFormulaNumber(value)) {
    return { valid: true, value: value || 0 };
  }
  const source = String(value).trim();
  if (!source) return { valid: false, error: 'errors.scoreRequired' };
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(source)) {
    const number = Number(source);
    return Number.isFinite(number) ? { valid: true, value: number } : { valid: false, error: 'errors.scoreFormula' };
  }
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

function sumPlayerScores(value, categories) {
  if (!categories.length || !value || typeof value !== 'object') return Number(value) || 0;
  let total = 0;
  for (const category of categories) total += Number(value[category]) || 0;
  return total;
}

function aggregateCategoryScores(source, participants, categories) {
  return participants.reduce((totals, participant) => {
    totals[participant.id] = sumPlayerScores(source?.[participant.id], categories);
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
  scorecard(rounds, participants, categories = []) {
    if (!rounds.length) return { valid: false, error: 'errors.roundRequired' };
    const names = scoreCategoriesFor(categories);
    const ids = participants.map(({ id }) => id);
    const totalsByPlayer = new Float64Array(ids.length);
    const totalsByCategory = names.map(() => new Float64Array(ids.length));
    const scored = [];
    const width = Math.max(1, names.length);
    for (const round of rounds) {
      const scores = new Array(1 + ids.length * width);
      scores[0] = round.id;
      for (let player = 0; player < ids.length; player += 1) {
        const id = ids[player];
        const input = round.scores?.[id];
        if (!names.length) {
          const result = parseFormula(input);
          if (!result.valid) return result;
          scores[player + 1] = result.value;
          totalsByPlayer[player] += result.value;
          continue;
        }
        if (!input || typeof input !== 'object') return { valid: false, error: 'errors.scoreRequired' };
        const offset = 1 + player * width;
        let roundTotal = 0;
        for (let index = 0; index < names.length; index += 1) {
          const category = names[index];
          let score = input[category];
          if (!isFormulaNumber(score)) {
            const result = parseFormula(score);
            if (!result.valid) return result;
            score = result.value;
          } else {
            score ||= 0;
          }
          scores[offset + index] = score;
          roundTotal += score;
          totalsByCategory[index][player] += score;
        }
        totalsByPlayer[player] += roundTotal;
      }
      scored.push(scores);
    }
    const totalMap = (values) => Object.fromEntries(ids.map((id, index) => [id, values[index]]));
    return {
      valid: true,
      entries: { roundScores: scored },
      totals: totalMap(totalsByPlayer),
      categoryTotals: Object.fromEntries(names.map((category, index) => [category, totalMap(totalsByCategory[index])])),
    };
  },
  calculateTotals(entries, participants, categories = []) {
    const names = scoreCategoriesFor(categories);
    return participants.reduce((totals, participant) => {
      totals[participant.id] = (entries.rounds ?? []).reduce((sum, round) => sum + sumPlayerScores(round.scores?.[participant.id], names), 0);
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

function marioKartParticipants(race, participants) {
  const ids = Array.isArray(race?.participantIds) ? race.participantIds : [];
  return ids.map((id) => participants.find((participant) => participant.id === id)).filter(Boolean);
}

export const marioKartEngine = {
  id: 'mario-kart-8',
  initialEntries: () => ({ races: [] }),
  validateEntry(race, participants) {
    const racers = marioKartParticipants(race, participants);
    if (racers.length < 2 || racers.length !== new Set(race?.participantIds ?? []).size || racers.length !== (race?.participantIds ?? []).length) return { valid: false, error: 'errors.marioKartPlayersRequired' };
    if (!MARIO_KART_CC_OPTIONS.includes(race?.cc)) return { valid: false, error: 'errors.marioKartCcRequired' };
    if (race?.track && !MARIO_KART_TRACKS.includes(race.track)) return { valid: false, error: 'errors.marioKartTrackInvalid' };
    if (!MARIO_KART_ITEM_PRESETS[race?.itemSet]) return { valid: false, error: 'errors.marioKartItemSetRequired' };
    const placements = racers.map((participant) => Number(race.placements?.[participant.id]));
    if (placements.some((placement) => !Number.isInteger(placement) || placement < 1 || placement > 12)) return { valid: false, error: 'errors.marioKartPlacementRequired' };
    if (new Set(placements).size !== placements.length) return { valid: false, error: 'errors.marioKartPlacementDuplicate' };
    const itemIds = Array.isArray(race.itemIds) ? race.itemIds : [];
    if (race.itemSet === 'custom' && (!itemIds.length || itemIds.some((item) => !MARIO_KART_ITEMS.includes(item)))) return { valid: false, error: 'errors.marioKartItemsRequired' };
    const normalizedPlacements = {};
    const points = {};
    for (const [index, participant] of racers.entries()) {
      const placement = placements[index];
      normalizedPlacements[participant.id] = placement;
      points[participant.id] = MARIO_KART_POINTS[placement - 1];
    }
    if (race.points && racers.some((participant) => Number(race.points[participant.id]) !== points[participant.id])) return { valid: false, error: 'errors.marioKartPointsInvalid' };
    return { valid: true, entry: { ...race, track: race.track ?? '', participantIds: racers.map((participant) => participant.id), placements: normalizedPlacements, itemIds: [...new Set(itemIds)], points } };
  },
  validateSession(entries, participants) {
    if (!Array.isArray(entries?.races) || !entries.races.length) return { valid: false, error: 'errors.marioKartRaceRequired' };
    if (!entries.races.every((race) => this.validateEntry(race, participants).valid)) return { valid: false, error: 'errors.marioKartRaceInvalid' };
    return this.validateRules(entries.races);
  },
  validateRules(races) {
    if (!races.length) return { valid: false, error: 'errors.marioKartRaceRequired' };
    const first = races[0];
    const itemKey = (ids) => JSON.stringify([...(ids ?? [])].sort());
    const firstItems = itemKey(first.itemIds);
    return races.every((race) => race.cc === first.cc && race.itemSet === first.itemSet && itemKey(race.itemIds) === firstItems)
      ? { valid: true } : { valid: false, error: 'errors.marioKartRulesLocked' };
  },
  calculateTotals(entries, participants) {
    return participants.reduce((totals, participant) => {
      totals[participant.id] = (entries?.races ?? []).reduce((sum, race) => sum + Number(race.points?.[participant.id] ?? 0), 0);
      return totals;
    }, {});
  },
};

export const scoringEngines = new Map([
  [roundSumEngine.id, roundSumEngine],
  [finalTotalEngine.id, finalTotalEngine],
  [winnerOnlyEngine.id, winnerOnlyEngine],
  [marioKartEngine.id, marioKartEngine],
]);

export function getScoringEngine(id) {
  const engine = scoringEngines.get(id);
  if (!engine) throw Object.assign(new Error('errors.engineUnknown'), { parameters: { id } });
  return engine;
}
