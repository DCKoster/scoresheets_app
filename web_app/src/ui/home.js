export function renderHomeSummary(container, sessions, games) {
  container.replaceChildren();
  const paragraph = document.createElement('p');
  if (!sessions.length) paragraph.textContent = 'No sessions yet. Start one from New Session.';
  else {
    const gameName = games.find((game) => game.id === sessions[0].gameId)?.name ?? sessions[0].gameNameAtPlay;
    paragraph.textContent = `${sessions.length} saved session${sessions.length === 1 ? '' : 's'}. Most recent: ${gameName} on ${new Date(sessions[0].createdAt).toLocaleDateString()}.`;
  }
  container.append(paragraph);
}
