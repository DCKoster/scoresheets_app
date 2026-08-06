# Manage Games and Scoring Improvements

## Goal

Make the Manage Games tab easier to scan and more expressive without breaking existing games or saved sessions. Games can have an optional category and support either competitive or cooperative play. The tab presents games as attractive cards with compact tags instead of a dense list of controls.

## Game model

Extend custom and built-in game definitions with optional presentation and play-mode metadata:

```js
{
  schemaVersion: 3,
  id: 'game-id',
  name: 'My Game',
  origin: 'custom',
  category: 'Card game', // optional trimmed display string
  playMode: 'competitive', // 'competitive' | 'cooperative'
  scoring: { engineId: 'round-sum', ranking: 'lowest' }
}
```

- Missing `category` is treated as uncategorized; it must never prevent a game from being saved or selected.
- Missing `playMode` defaults to `competitive`, preserving every existing game and session.
- Categories are free-text, trimmed, case-insensitive for filtering, and capped at a short UI-safe length (for example, 40 characters). They are game metadata, not a separate persisted category collection.
- `gameNameAtPlay`, `scoring`, and the resolved `playMode` must be copied into a new session snapshot. Editing a game later must not change past sessions.

## Scoring engines and cooperative sessions

Keep the current competitive engines unchanged:

- `round-sum`: each participant receives a score per round and the configured high/low ranking determines the winner.
- `final-total`: each participant receives one final score.
- `winner-only`: one participant, or nobody, is selected as winner.

Add one cooperative engine, `cooperative-result`:

```js
{
  engineId: 'cooperative-result',
  ranking: 'team-result'
}
```

- A cooperative session records one required team result: `success` or `failure`, plus an optional numeric team score. There is no individual winner, ranking, or player leaderboard contribution.
- Participants remain required because they identify who played together. Statistics count these sessions as games played for every participant, but do not add wins, win rates, or average individual scores.
- Cooperative games use `playMode: 'cooperative'` and must use `cooperative-result`. Competitive games cannot select that engine.
- The game form derives the scoring engine from play mode: competitive reveals the existing entry-mode/ranking controls; cooperative shows only the team-result explanation. This prevents invalid combinations.
- Backup import validates the new engine/session shape and continues accepting version-2 competitive records. Export writes the current schema version.

## Manage Games experience

Replace the flat game rows with a responsive card grid.

- Put the create/edit form behind a prominent “Add game” button or expandable panel. Keep it open only while creating or editing so the gallery is the primary view.
- Each card shows the game name, a category tag when present, a play-mode tag, and a scoring tag. Built-in games also receive a subtle “Built-in” tag.
- Use visual tag variants consistently: category is neutral, competitive/co-op is distinct by color and icon, and scoring is a muted informational tag. Cards have a gentle border, shadow, hover lift, and strong keyboard focus state; color is never the only cue.
- Display primary actions as compact icon buttons (edit, duplicate, delete) with accessible labels and tooltips. Built-in cards only expose Duplicate.
- Add a small search field and category filter above the grid. “All categories” is the default; uncategorized is available as a filter. Search matches game name and category case-insensitively.
- On small screens, use a single-column card list with actions remaining visible and touch-sized. Do not hide game details behind hover-only UI.

## Migration and validation

- Read schema-v2 games as schema-v3 defaults (`playMode: 'competitive'`, no category) and write normalized schema-v3 custom games after their next create/update/import operation.
- Built-in game data receives explicit defaults in source; custom local-storage records are normalized on read without a destructive bulk migration.
- Validate category text, `playMode`, engine/ranking compatibility, and the cooperative session entry before any repository write. Invalid backup data leaves storage unchanged.
- Existing statistics and history continue rendering legacy sessions. History labels cooperative records with a success/failure tag and optional team score rather than a winner or ranked totals.

## Acceptance checks

1. Existing local games and sessions load unchanged after the update.
2. A custom competitive game can be created with or without a category and appears correctly in search/filter results and its card tags.
3. A cooperative game can be created, saved as success or failure, edited, exported, restored, and displayed without a participant ranking.
4. Cooperative sessions count participation but do not distort competitive wins, win rates, or individual-score averages.
5. Built-in games remain read-only, duplicate correctly, and render with their appropriate tags.
6. Keyboard navigation, translated labels, narrow-screen layouts, backup validation, and scoring-engine validation are covered by tests.
