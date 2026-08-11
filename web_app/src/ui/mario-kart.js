import { MARIO_KART_CC_OPTIONS, MARIO_KART_ITEMS, MARIO_KART_ITEM_PRESETS, MARIO_KART_TRACKS, itemPresetName } from '../data/mario-kart.js';
import { createId } from '../state/repositories.js';
import { rankTotals } from '../scoring/engines.js';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function selectOptions(select, values, label = (value) => value) {
  values.forEach((value) => { const option = element('option', label(value)); option.value = value; select.append(option); });
}

function trackComboBox(draft, i18n, setState) {
  const combo = element('div', undefined, 'mario-track-combobox');
  const track = element('input');
  track.type = 'search';
  track.setAttribute('list', 'mario-track-options');
  track.setAttribute('autocomplete', 'off');
  track.placeholder = i18n.t('marioKart.chooseTrack');
  track.value = draft.track;
  track.addEventListener('input', () => { draft.track = track.value; setState(); });

  const options = element('datalist');
  options.id = 'mario-track-options';
  selectOptions(options, MARIO_KART_TRACKS);
  combo.append(track, options);
  return combo;
}

function draftFromRace(race, participants) {
  return {
    track: race?.track ?? '',
    cc: race?.cc ?? MARIO_KART_CC_OPTIONS[2],
    itemSet: race?.itemSet ?? 'normal',
    itemIds: [...(race?.itemIds ?? [])],
    participantIds: [...(race?.participantIds ?? participants.map((participant) => participant.id))],
    placements: { ...(race?.placements ?? {}) },
  };
}

function sessionRules(session) {
  if (session.marioKartSetup) return session.marioKartSetup;
  const firstRace = session.entries.races[0];
  return firstRace ? { cc: firstRace.cc, itemSet: firstRace.itemSet, itemIds: [...(firstRace.itemIds ?? [])] } : null;
}

function renderMarioKartSetup(panel, session, engine, reportError, i18n, editorState, onStateChange) {
  panel.replaceChildren();
  const draft = editorState.marioSetupDraft ?? { cc: MARIO_KART_CC_OPTIONS[2], itemSet: 'normal', itemIds: [...(MARIO_KART_ITEM_PRESETS.normal.items ?? [])] };
  const setup = element('section', undefined, 'mario-setup');
  setup.append(element('h3', i18n.t('marioKart.setup')));

  const controls = element('div', undefined, 'mario-race-controls');
  const ccLabel = element('label', i18n.t('marioKart.cc')); const cc = document.createElement('select');
  selectOptions(cc, MARIO_KART_CC_OPTIONS, (value) => i18n.t(`marioKart.cc.${value}`)); cc.value = draft.cc; cc.addEventListener('change', () => { draft.cc = cc.value; onStateChange({ ...editorState, marioSetupDraft: draft }); }); ccLabel.append(cc);
  const itemLabel = element('label', i18n.t('marioKart.itemSet')); const itemSet = document.createElement('select');
  selectOptions(itemSet, Object.keys(MARIO_KART_ITEM_PRESETS), itemPresetName); itemSet.value = draft.itemSet;
  const itemButtons = element('div');
  const refreshItems = () => { draft.itemIds = draft.itemSet === 'custom' ? draft.itemIds : [...(MARIO_KART_ITEM_PRESETS[draft.itemSet]?.items ?? [])]; renderItemButtons(itemButtons, draft, i18n, () => { onStateChange({ ...editorState, marioSetupDraft: draft }); }); };
  itemSet.addEventListener('change', () => { draft.itemSet = itemSet.value; refreshItems(); onStateChange({ ...editorState, marioSetupDraft: draft }); }); itemLabel.append(itemSet);
  controls.append(ccLabel, itemLabel); setup.append(controls, itemButtons); refreshItems();

  const roster = element('fieldset', undefined, 'mario-roster'); roster.append(element('legend', i18n.t('marioKart.racers')));
  const historical = [...new Set(editorState.marioAvailablePlayers ?? [])].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const selected = () => new Set(session.participants.map((participant) => participant.displayName.toLocaleLowerCase()));
  const renderRoster = () => {
    roster.querySelectorAll('.mario-new-player, .mario-roster-row').forEach((node) => node.remove());
    const addRow = element('div', undefined, 'mario-new-player'); const input = element('input'); input.placeholder = i18n.t('marioKart.newPlayer'); const add = element('button', i18n.t('marioKart.addPlayer'), 'secondary'); add.type = 'button';
    const addPlayer = () => { const name = input.value.trim(); if (!name) return; if (selected().has(name.toLocaleLowerCase())) return reportError('errors.playersUnique'); session.participants.push({ id: createId('participant'), displayName: name }); input.value = ''; renderRoster(); };
    add.addEventListener('click', addPlayer); input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addPlayer(); } }); addRow.append(input, add); roster.append(addRow);
    historical.forEach((name) => {
      const row = element('label', undefined, 'mario-roster-row'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected().has(name.toLocaleLowerCase());
      checkbox.addEventListener('change', () => { const existing = session.participants.find((participant) => participant.displayName.toLocaleLowerCase() === name.toLocaleLowerCase()); if (checkbox.checked && !existing) session.participants.push({ id: createId('participant'), displayName: name }); if (!checkbox.checked && existing) session.participants = session.participants.filter((participant) => participant.id !== existing.id); });
      row.append(checkbox, element('span', name)); roster.append(row);
    });
    session.participants.filter((participant) => !historical.some((name) => name.toLocaleLowerCase() === participant.displayName.toLocaleLowerCase())).forEach((participant) => {
      const row = element('label', undefined, 'mario-roster-row'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = true; checkbox.addEventListener('change', () => { if (!checkbox.checked) session.participants = session.participants.filter((item) => item.id !== participant.id); }); row.append(checkbox, element('span', participant.displayName)); roster.append(row);
    });
  };
  renderRoster(); setup.append(roster);
  const confirm = element('button', i18n.t('marioKart.confirmSetup'), 'accent'); confirm.type = 'button'; confirm.addEventListener('click', () => {
    if (session.participants.length < 2) return reportError('errors.marioKartPlayersRequired');
    session.marioKartSetup = { cc: draft.cc, itemSet: draft.itemSet, itemIds: [...draft.itemIds] };
    onStateChange({ ...editorState, marioSetupDraft: draft });
    renderMarioKartEditor(panel, session, engine, reportError, i18n, editorState, onStateChange);
  });
  setup.append(confirm); panel.append(setup);
}

function renderItemButtons(container, draft, i18n, onChange, locked = false) {
  container.replaceChildren();
  const available = draft.itemSet === 'custom' ? MARIO_KART_ITEMS : (MARIO_KART_ITEM_PRESETS[draft.itemSet]?.items ?? []);
  if (draft.itemSet !== 'custom') {
    container.append(element('p', i18n.t('marioKart.presetItems', { items: available.join(', ') }), 'muted'));
    return;
  }
  const grid = element('div', undefined, 'mario-item-grid');
  available.forEach((item) => {
    const button = element('button', item, `mario-item-button${draft.itemIds.includes(item) ? ' is-selected' : ''}`);
    button.type = 'button'; button.setAttribute('aria-pressed', String(draft.itemIds.includes(item)));
    button.disabled = locked;
    button.addEventListener('click', () => {
      const selected = !draft.itemIds.includes(item);
      draft.itemIds = selected ? [...draft.itemIds, item] : draft.itemIds.filter((value) => value !== item);
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      onChange();
    });
    grid.append(button);
  });
  container.append(grid);
}

function renderPlacementInputs(container, draft, session, i18n) {
  container.replaceChildren();
  session.participants.filter((participant) => draft.participantIds.includes(participant.id)).forEach((participant) => {
    const row = element('label', undefined, 'mario-placement-row');
    row.append(element('span', participant.displayName));
    const buttons = element('div', undefined, 'mario-placement-buttons');
    const selectedPlace = Number(draft.placements[participant.id]);
    const usedByOther = new Set(Object.entries(draft.placements).filter(([id]) => id !== participant.id).map(([, place]) => Number(place)));
    Array.from({ length: 12 }, (_, index) => index + 1).forEach((place) => {
      const button = element('button', String(place), `mario-place-button${selectedPlace === place ? ' is-selected' : ''}`);
      button.type = 'button'; button.setAttribute('aria-label', i18n.t('marioKart.place', { place })); button.setAttribute('aria-pressed', String(selectedPlace === place));
      button.disabled = usedByOther.has(place);
      button.addEventListener('click', () => { draft.placements[participant.id] = place; renderPlacementInputs(container, draft, session, i18n); });
      buttons.append(button);
    });
    row.append(buttons); container.append(row);
  });
}

function renderMarioTotals(container, session, engine, i18n) {
  container.replaceChildren(element('h3', i18n.t('session.totals')));
  session.totals = engine.calculateTotals(session.entries, session.participants);
  const names = new Map(session.participants.map((participant) => [participant.id, participant.displayName]));
  rankTotals(session.totals, 'highest').forEach(([id, score]) => container.append(element('div', `${names.get(id)}: ${score}`)));
}

export function renderMarioKartEditor(panel, session, engine, reportError, i18n, editorState = {}, onStateChange = () => {}) {
  if (!session.marioKartSetup && !session.entries.races.length) {
    renderMarioKartSetup(panel, session, engine, reportError, i18n, editorState, onStateChange);
    return;
  }
  panel.replaceChildren();
  let editingRaceId = editorState.marioEditingRaceId ?? null;
  let draft = editorState.marioDraft ?? draftFromRace(null, session.participants);
  const lockedRules = sessionRules(session);
  const rulesLocked = Boolean(lockedRules);
  if (rulesLocked && !editingRaceId) draft = { ...draft, ...lockedRules };
  const setState = () => onStateChange({ ...editorState, marioDraft: draft, marioEditingRaceId: editingRaceId });
  const raceForm = element('section', undefined, 'mario-race-form');
  raceForm.append(element('p', i18n.t('marioKart.raceProgress', { current: session.entries.races.length, target: session.targetRaces })));

  const controls = element('div', undefined, 'mario-race-controls');
  const trackLabel = element('label', i18n.t('marioKart.track')); const track = trackComboBox(draft, i18n, setState);
  trackLabel.append(track);
  const ccLabel = element('label', i18n.t('marioKart.cc')); const cc = document.createElement('select');
  selectOptions(cc, MARIO_KART_CC_OPTIONS, (value) => i18n.t(`marioKart.cc.${value}`)); cc.value = draft.cc;
  cc.disabled = rulesLocked; cc.addEventListener('change', () => { draft.cc = cc.value; setState(); }); ccLabel.append(cc);
  const itemLabel = element('label', i18n.t('marioKart.itemSet')); const itemSet = document.createElement('select');
  selectOptions(itemSet, Object.keys(MARIO_KART_ITEM_PRESETS), itemPresetName); itemSet.value = draft.itemSet;
  const itemButtons = element('div');
  const refreshItems = () => { if (!rulesLocked) draft.itemIds = draft.itemSet === 'custom' ? draft.itemIds : [...(MARIO_KART_ITEM_PRESETS[draft.itemSet]?.items ?? [])]; renderItemButtons(itemButtons, draft, i18n, () => { setState(); }, rulesLocked); };
  itemSet.disabled = rulesLocked; itemSet.addEventListener('change', () => { draft.itemSet = itemSet.value; refreshItems(); setState(); }); itemLabel.append(itemSet);
  controls.append(ccLabel, itemLabel); raceForm.append(controls);
  const lockedDetails = rulesLocked ? element('details', undefined, 'mario-locked-details') : null;
  if (lockedDetails) lockedDetails.append(element('summary', i18n.t('marioKart.raceDetails')));
  const appendRaceDetails = (...nodes) => (lockedDetails ?? raceForm).append(...nodes);
  appendRaceDetails(itemButtons); refreshItems();

  const roster = element('fieldset', undefined, 'mario-roster'); roster.append(element('legend', i18n.t('marioKart.racers')));
  const renderRoster = () => {
    roster.querySelectorAll('.mario-roster-row, .mario-add-player').forEach((node) => node.remove());
    session.participants.forEach((participant) => {
      const label = element('label', undefined, 'mario-roster-row'); const input = document.createElement('input'); input.type = 'checkbox'; input.checked = draft.participantIds.includes(participant.id);
      input.addEventListener('change', () => { draft.participantIds = [...roster.querySelectorAll('input:checked')].map((item) => item.value); renderPlacementInputs(placements, draft, session, i18n); setState(); });
      input.value = participant.id; label.append(input, element('span', participant.displayName)); roster.append(label);
    });
    const addRow = element('div', undefined, 'mario-add-player'); const input = element('input'); input.placeholder = i18n.t('marioKart.newPlayer'); const button = element('button', i18n.t('marioKart.addPlayer'), 'secondary'); button.type = 'button';
    const add = () => { const name = input.value.trim(); if (!name) return; if (session.participants.some((participant) => participant.displayName.toLocaleLowerCase() === name.toLocaleLowerCase())) return reportError('errors.playersUnique'); const participant = { id: createId('participant'), displayName: name }; session.participants.push(participant); draft.participantIds.push(participant.id); input.value = ''; renderRoster(); renderPlacementInputs(placements, draft, session, i18n); setState(); };
    button.addEventListener('click', add); input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }); addRow.append(input, button); roster.append(addRow);
  };
  appendRaceDetails(roster);
  if (rulesLocked) {
    controls.remove();
    lockedDetails?.remove();
  } else if (lockedDetails) raceForm.append(lockedDetails);
  raceForm.append(trackLabel);
  const placements = element('div', undefined, 'mario-placements'); raceForm.append(element('h3', i18n.t('marioKart.placements')), placements); renderRoster(); renderPlacementInputs(placements, draft, session, i18n);
  const buttons = element('div', undefined, 'button-row'); const save = element('button', i18n.t(editingRaceId ? 'marioKart.updateRace' : 'marioKart.addRace')); save.type = 'button'; const cancel = element('button', i18n.t('session.cancelRoundEdit'), 'secondary'); cancel.type = 'button'; if (!editingRaceId) cancel.classList.add('hidden'); buttons.append(save, cancel); raceForm.append(buttons);
  panel.append(raceForm);

  const races = element('div', undefined, 'mario-races'); const totals = element('div'); panel.append(races, totals);
  const renderRaces = () => {
    races.replaceChildren(element('h3', i18n.t('marioKart.races')));
    if (!session.entries.races.length) races.append(element('p', i18n.t('marioKart.noRaces')));
    session.entries.races.forEach((race, index) => {
      const row = element('div', undefined, 'round-row'); const names = session.participants.filter((participant) => race.participantIds.includes(participant.id)).map((participant) => `${participant.displayName} ${race.placements[participant.id]} (${race.points[participant.id]})`).join(' | ');
      row.append(element('span', i18n.t('marioKart.raceSummary', { number: index + 1, track: race.track || i18n.t('marioKart.trackNotSet'), cc: i18n.t(`marioKart.cc.${race.cc}`), itemSet: itemPresetName(race.itemSet), scores: names })));
      const edit = element('button', i18n.t('session.editRound'), 'secondary'); edit.type = 'button'; edit.addEventListener('click', () => { editingRaceId = race.id; draft = draftFromRace(race, session.participants); setState(); renderMarioKartEditor(panel, session, engine, reportError, i18n, { marioDraft: draft, marioEditingRaceId: editingRaceId }, onStateChange); });
      row.append(edit); races.append(row);
    });
    renderMarioTotals(totals, session, engine, i18n);
  };
  renderRaces();
  save.addEventListener('click', () => {
    const wasEditing = Boolean(editingRaceId);
    const result = engine.validateEntry({ ...draft, id: editingRaceId ?? createId('race') }, session.participants);
    if (!result.valid) return reportError(result.error);
    if (editingRaceId) { const race = session.entries.races.find((item) => item.id === editingRaceId); if (race) Object.assign(race, result.entry); }
    else session.entries.races.push(result.entry);
    editingRaceId = null; draft = draftFromRace(null, session.participants); setState(); onStateChange({ ...editorState, marioDraft: draft, marioEditingRaceId: null }, { raceAdded: !wasEditing }); renderMarioKartEditor(panel, session, engine, reportError, i18n, { marioDraft: draft }, onStateChange);
  });
  cancel.addEventListener('click', () => { editingRaceId = null; draft = draftFromRace(null, session.participants); setState(); renderMarioKartEditor(panel, session, engine, reportError, i18n, { marioDraft: draft }, onStateChange); });
}
