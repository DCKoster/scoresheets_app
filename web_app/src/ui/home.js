export function renderHomeSummary(homeSummary, sessions) {
  if (sessions.length === 0) {
    homeSummary.innerHTML = '<p>No sessions yet. Start one from New Session.</p>';
    return;
  }

  const latest = sessions[0];
  homeSummary.innerHTML = `
    <p><strong>Total saved sessions:</strong> ${sessions.length}</p>
    <p><strong>Most recent:</strong> ${latest.gameName} on ${new Date(latest.createdAt).toLocaleDateString()}</p>
  `;
}
