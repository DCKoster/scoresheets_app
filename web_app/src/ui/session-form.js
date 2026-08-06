import { rankTotals } from '../scoring/engines.js';
import { createId } from '../state/repositories.js';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function scoreInputs(participants, values = {}, onChange = () => {}, allowFormula = false) {
  const container = element('div');
  participants.forEach((participant) => {
    const row = element('div', undefined, 'inline-grid');
    row.append(element('span', participant.displayName));
    const input = element('input');
    input.type = allowFormula ? 'text' : 'number'; input.inputMode = 'decimal'; input.dataset.participantId = participant.id;
    input.value = values[participant.id] ?? '';
    input.addEventListener('input', () => onChange(readInputs(container)));
    row.append(input); container.append(row);
  });
  return container;
}

function readInputs(container) {
  return Object.fromEntries([...container.querySelectorAll('input')].map((input) => [input.dataset.participantId, input.value]));
}

function renderTotals(container, session, engine, i18n) {
  container.replaceChildren(element('h3', i18n.t('session.totals')));
  const totals = engine.calculateTotals(session.entries, session.participants);
  session.totals = totals;
  const names = new Map(session.participants.map((participant) => [participant.id, participant.displayName]));
  rankTotals(totals, session.scoring.ranking).forEach(([id, score]) => container.append(element('div', `${names.get(id)}: ${score}`)));
}

function renderWinnerPicker(panel, session, i18n) {
  panel.append(element('p', i18n.t('session.winnerHelp')));
  const fieldset = element('fieldset', undefined, 'winner-picker');
  fieldset.append(element('legend', i18n.t('session.winner')));
  const groupName = `winner-${session.id}`;
  const addOption = (id, label, value) => {
    const option = element('label', undefined, 'winner-option');
    const input = element('input');
    input.type = 'radio'; input.name = groupName; input.id = id; input.value = value;
    input.checked = Object.hasOwn(session.entries, 'winnerId') && session.entries.winnerId === (value === '__none__' ? null : value);
    input.addEventListener('change', () => { session.entries.winnerId = input.value === '__none__' ? null : input.value; });
    option.append(input, element('span', label)); fieldset.append(option);
  };
  session.participants.forEach((participant) => addOption(`winner-${session.id}-${participant.id}`, participant.displayName, participant.id));
  addOption(`winner-${session.id}-none`, i18n.t('session.noWinner'), '__none__');
  panel.append(fieldset);
}

export function renderEngineEditor(panel, session, engine, reportError, i18n, editorState = {}, onStateChange = () => {}) {
  panel.replaceChildren();
  if (engine.id === 'winner-only') {
    renderWinnerPicker(panel, session, i18n);
    return;
  }
  panel.append(element('p', i18n.t(engine.id === 'round-sum' ? 'session.roundHelp' : 'session.finalHelp')));
  if (engine.id === 'round-sum') {
    let currentDraft = editorState.draft ?? {};
    let editingRoundId = editorState.editingRoundId ?? null;
    const setState = () => onStateChange({ draft: currentDraft, editingRoundId });
    let inputs = scoreInputs(session.participants, currentDraft, (values) => { currentDraft = values; setState(); }, true);
    const rounds = element('div');
    const totals = element('div');
    const saveButton = element('button', i18n.t(editingRoundId ? 'session.updateRound' : 'session.addRound')); saveButton.type = 'button';
    const cancelButton = element('button', i18n.t('session.cancelRoundEdit'), 'secondary'); cancelButton.type = 'button';
    if (!editingRoundId) cancelButton.classList.add('hidden');
    const buttonRow = element('div', undefined, 'button-row'); buttonRow.append(saveButton, cancelButton);
    panel.append(inputs, buttonRow, rounds, totals);
    const update = () => {
      rounds.replaceChildren(element('h3', i18n.t('session.rounds')));
      if (!session.entries.rounds.length) rounds.append(element('p', i18n.t('session.noRounds')));
      session.entries.rounds.forEach((round, index) => {
        const scores = session.participants.map((p) => `${p.displayName} ${round.scores[p.id]}`).join(' | ');
        const row = element('div', undefined, 'round-row');
        row.append(element('span', i18n.t('session.round', { number: index + 1, scores })));
        const edit = element('button', i18n.t('session.editRound'), 'secondary round-edit'); edit.type = 'button';
        edit.addEventListener('click', () => {
          editingRoundId = round.id; currentDraft = { ...round.scores }; setState();
          renderEngineEditor(panel, session, engine, reportError, i18n, { draft: currentDraft, editingRoundId }, onStateChange);
        });
        row.append(edit); rounds.append(row);
      });
      renderTotals(totals, session, engine, i18n);
    };
    saveButton.addEventListener('click', () => {
      const result = engine.validateEntry(readInputs(inputs), session.participants);
      if (!result.valid) return reportError(result.error);
      if (editingRoundId) {
        const round = session.entries.rounds.find((item) => item.id === editingRoundId);
        if (round) round.scores = result.entry;
      } else session.entries.rounds.push({ id: createId('round'), scores: result.entry });
      currentDraft = {}; editingRoundId = null; setState();
      renderEngineEditor(panel, session, engine, reportError, i18n, { draft: currentDraft, editingRoundId }, onStateChange);
    });
    cancelButton.addEventListener('click', () => { currentDraft = {}; editingRoundId = null; setState(); renderEngineEditor(panel, session, engine, reportError, i18n, { draft: currentDraft, editingRoundId }, onStateChange); });
    update();
  } else {
    const inputs = scoreInputs(session.participants, session.entries.values, (values) => { session.entries.values = values; onStateChange({ draft: values, editingRoundId: null }); });
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
