function sessionScoreText(session) {
  return Object.entries(session.totals)
    .map(([player, score]) => `${player}: ${score}`)
    .join(' | ');
}

export function renderSavedSessions(savedList, sessions, onDelete) {
  if (sessions.length === 0) {
    savedList.innerHTML = '<p>No sessions saved yet.</p>';
    return;
  }

  savedList.innerHTML = sessions
    .map(
      (session, index) => `
        <div class="list-item">
          <strong>${session.gameName}</strong><br>
          <small>${new Date(session.createdAt).toLocaleString()}</small>
          <p>${sessionScoreText(session)}</p>
          <button class="delete" data-index="${index}" type="button">Delete</button>
        </div>
      `
    )
    .join('');

  savedList.querySelectorAll('button.delete').forEach((button) => {
    button.addEventListener('click', () => {
      const idx = Number(button.dataset.index);
      onDelete(idx);
    });
  });
}
