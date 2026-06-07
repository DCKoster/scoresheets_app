function updateTake5Totals(players, rounds) {
  const totals = {};

  players.forEach((player) => {
    totals[player] = 0;
  });

  rounds.forEach((round) => {
    players.forEach((player) => {
      totals[player] += round[player] ?? 0;
    });
  });

  return totals;
}

export function renderTake5Entry(entryPanel, state) {
  const { players } = state.activeSession;

  entryPanel.innerHTML = `
    <p>Add one round at a time. Lower total wins.</p>
    <div id="take5-inputs"></div>
    <button id="add-round" type="button">Add round</button>
    <div id="take5-rounds"></div>
    <div id="take5-totals"></div>
  `;

  const inputsContainer = document.getElementById('take5-inputs');
  const roundsContainer = document.getElementById('take5-rounds');
  const totalsContainer = document.getElementById('take5-totals');

  function renderDraftInputs() {
    inputsContainer.innerHTML = players
      .map(
        (player) => `
          <div class="inline-grid">
            <span>${player}</span>
            <input type="number" inputmode="numeric" data-player="${player}" />
          </div>
        `
      )
      .join('');
  }

  function renderRoundsAndTotals() {
    const rounds = state.activeSession.rounds;

    roundsContainer.innerHTML =
      '<h3>Rounds</h3>' +
      (rounds.length === 0
        ? '<p>No rounds yet.</p>'
        : rounds
            .map(
              (round, idx) =>
                `<div>Round ${idx + 1}: ${players.map((player) => `${player} ${round[player]}`).join(' | ')}</div>`
            )
            .join(''));

    const totals = updateTake5Totals(players, rounds);
    state.activeSession.totals = totals;

    const ranking = Object.entries(totals).sort((a, b) => a[1] - b[1]);
    totalsContainer.innerHTML = '<h3>Totals</h3>' + ranking.map(([player, score]) => `<div>${player}: ${score}</div>`).join('');
  }

  renderDraftInputs();
  renderRoundsAndTotals();

  document.getElementById('add-round').addEventListener('click', () => {
    const nextRound = {};
    let valid = true;

    inputsContainer.querySelectorAll('input').forEach((input) => {
      const player = input.dataset.player;
      const value = Number(input.value);

      if (!player || Number.isNaN(value)) {
        valid = false;
        return;
      }

      nextRound[player] = value;
    });

    if (!valid) {
      alert('Please type a number for each player.');
      return;
    }

    state.activeSession.rounds.push(nextRound);
    renderDraftInputs();
    renderRoundsAndTotals();
  });
}

export function renderRegenwormenEntry(entryPanel, players) {
  entryPanel.innerHTML = `
    <p>Enter final totals once. Highest total wins.</p>
    <div id="regenwormen-inputs"></div>
  `;

  const inputsContainer = document.getElementById('regenwormen-inputs');
  inputsContainer.innerHTML = players
    .map(
      (player) => `
        <div class="inline-grid">
          <span>${player}</span>
          <input type="number" inputmode="numeric" data-player="${player}" />
        </div>
      `
    )
    .join('');
}

export function collectRegenwormenTotals(entryPanel) {
  const totals = {};
  let valid = true;

  entryPanel.querySelectorAll('input').forEach((input) => {
    const player = input.dataset.player;
    const value = Number(input.value);

    if (!player || Number.isNaN(value)) {
      valid = false;
      return;
    }

    totals[player] = value;
  });

  return { valid, totals };
}
