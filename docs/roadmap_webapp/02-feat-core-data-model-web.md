# Branch: feat/core-data-model-web

## Goal
Define shared entities and local persistence foundations for the web app.

## Tasks

1. Define entities for games, sessions, players, and score entries.
2. Seed local game catalog with:
- Take 5! (per-round)
- Pick-omino (total-only)
3. Add persistence layer using browser storage (localStorage or IndexedDB).
4. Add total and winner calculation helpers.
5. Add unit tests for pure score utilities.

## Done when

1. Both games are selectable from local catalog.
2. Utility calculations are covered by passing tests.
3. Session data structure is persisted locally and survives page reload.
