import { MARIO_KART_CC_OPTIONS, MARIO_KART_ITEMS, MARIO_KART_ITEM_PRESETS, MARIO_KART_POINTS, MARIO_KART_TRACKS } from '../data/mario-kart.js';

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

function marioKartParticipants(race, participants) {
  const ids = Array.isArray(race?.participantIds) ? race.participantIds : [];
  return ids.map((id) => participants.find((participant) => participant.id === id)).filter(Boolean);
}

function marioKartRacePoints(race, participants) {
  return marioKartParticipants(race, participants).reduce((points, participant) => {
    const placement = Number(race.placements?.[participant.id]);
    points[participant.id] = MARIO_KART_POINTS[placement - 1] ?? 0;
    return points;
  }, {});
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
    const normalizedPlacements = racers.reduce((result, participant) => { result[participant.id] = Number(race.placements[participant.id]); return result; }, {});
    const normalizedRace = { ...race, track: race.track ?? '', participantIds: racers.map((participant) => participant.id), placements: normalizedPlacements, itemIds: [...new Set(itemIds)] };
    const points = marioKartRacePoints(normalizedRace, participants);
    if (race.points && racers.some((participant) => Number(race.points[participant.id]) !== points[participant.id])) return { valid: false, error: 'errors.marioKartPointsInvalid' };
    return { valid: true, entry: { ...normalizedRace, points } };
  },
  validateSession(entries, participants) {
    if (!Array.isArray(entries?.races) || !entries.races.length) return { valid: false, error: 'errors.marioKartRaceRequired' };
    if (!entries.races.every((race) => this.validateEntry(race, participants).valid)) return { valid: false, error: 'errors.marioKartRaceInvalid' };
    const first = entries.races[0];
    const sameItems = (left, right) => JSON.stringify([...(left ?? [])].sort()) === JSON.stringify([...(right ?? [])].sort());
    return entries.races.every((race) => race.cc === first.cc && race.itemSet === first.itemSet && sameItems(race.itemIds, first.itemIds))
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
