import { rankTotals } from '../scoring/engines.js';
import { createId } from '../state/repositories.js';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function scoreInputs(participants) {
  const container = element('div');
  participants.forEach((participant) => {
    const row = element('div', undefined, 'inline-grid');
    row.append(element('span', participant.displayName));
    const input = element('input');
    input.type = 'number'; input.inputMode = 'decimal'; input.dataset.participantId = participant.id;
    row.append(input); container.append(row);
  });
  return container;
}

function readInputs(container) {
  return Object.fromEntries([...container.querySelectorAll('input')].map((input) => [input.dataset.participantId, input.value]));
}

function renderTotals(container, session, engine) {
  container.replaceChildren(element('h3', 'Totals'));
  const totals = engine.calculateTotals(session.entries, session.participants);
  session.totals = totals;
  const names = new Map(session.participants.map((participant) => [participant.id, participant.displayName]));
  rankTotals(totals, session.scoring.ranking).forEach(([id, score]) => container.append(element('div', `${names.get(id)}: ${score}`)));
}

export function renderEngineEditor(panel, session, engine, reportError) {
  panel.replaceChildren();
  panel.append(element('p', engine.id === 'round-sum' ? 'Add one round at a time.' : 'Enter one final total for every player.'));
  if (engine.id === 'round-sum') {
    let inputs = scoreInputs(session.participants);
    const rounds = element('div');
    const totals = element('div');
    const addButton = element('button', 'Add round'); addButton.type = 'button';
    panel.append(inputs, addButton, rounds, totals);
    const update = () => {
      rounds.replaceChildren(element('h3', 'Rounds'));
      if (!session.entries.rounds.length) rounds.append(element('p', 'No rounds yet.'));
      session.entries.rounds.forEach((round, index) => {
        const scores = session.participants.map((p) => `${p.displayName} ${round.scores[p.id]}`).join(' | ');
        rounds.append(element('div', `Round ${index + 1}: ${scores}`));
      });
      renderTotals(totals, session, engine);
    };
    addButton.addEventListener('click', () => {
      const result = engine.validateEntry(readInputs(inputs), session.participants);
      if (!result.valid) return reportError(result.error);
      session.entries.rounds.push({ id: createId('round'), scores: result.entry });
      const replacement = scoreInputs(session.participants);
      inputs.replaceWith(replacement); inputs = replacement; update();
    });
    update();
  } else {
    const inputs = scoreInputs(session.participants);
    inputs.addEventListener('input', () => { session.entries.values = readInputs(inputs); });
    panel.append(inputs);
  }
}

export function finalizeEditor(session, engine) {
  if (engine.id === 'final-total') {
    const parsed = engine.validateEntry(session.entries.values, session.participants);
    if (!parsed.valid) return parsed;
    session.entries.values = parsed.entry;
  }
  const validation = engine.validateSession(session.entries, session.participants);
  if (!validation.valid) return validation;
  session.totals = engine.calculateTotals(session.entries, session.participants);
  return { valid: true };
}
