# Scoresheets Project Overview

Scoresheets is a framework-free, offline-only browser score tracker. It supports built-in read-only games and user-created local game templates, while preserving historical scoring behavior when templates change or are deleted.

## Architecture

A **game definition** has a stable ID, origin, display name, and scoring configuration. The configuration selects a registered **scoring engine**, an **entry mode**, and a `highest` or `lowest` **ranking objective**. The built-in engines are:

- `round-sum`: repeated numeric entries summed per participant.
- `final-total`: one numeric total per participant.

The application resolves engines by engine ID; game names and game IDs do not control scoring behavior. A saved session contains a **session scoring snapshot** (engine ID and ranking objective), engine-owned raw entries, and persisted calculated totals. Editing a template therefore affects new sessions only.

`GameRepository` and `SessionRepository` are asynchronous boundaries. Their current implementations serialize separate v2 custom-game and session collections to browser `localStorage`. UI/controller code does not access storage directly. Stable IDs are used for games, sessions, participants, rounds/templates, with score maps keyed by participant ID.

## Features

- Start games with at least two uniquely named players.
- Score Take 5!, Regenwormen, or custom round/final-total games.
- Rank highest or lowest totals while retaining ties and accepting negative scores.
- Create and edit custom templates; duplicate any template; delete custom templates.
- Keep history usable after a template is changed or deleted.
- Migrate legacy `scoresheets-web-v1` sessions to v2 once, preserving malformed legacy data and showing an error.
- Render user-provided names through DOM text properties.

Built-ins are read-only. User-authored templates can select registered engines only; custom JavaScript and formulas are not supported.

## Repository Layout

The active app is in `web_app/`. `src/scoring/engines.js` owns reusable scoring behavior, `src/state/repositories.js` owns persistence and migration, `src/data/games.js` owns built-in definitions, and `src/ui/` contains DOM renderers. `main.js` is the composition root. 

Open `web_app/index.html` directly or serve the repository as static files. Run automated tests with:

```bash
npm test
```

## Deferred Work

Composable numeric categories, repeated sections, bonuses/penalties, and lookup calculations are described in [docs/composable-scoring-architecture.md](docs/composable-scoring-architecture.md). Authentication, account-linked participants, ownership, invitations, authorization, server repositories, synchronization, and aggregated statistics are described separately in [docs/online-evolution.md](docs/online-evolution.md). No networking, accounts, formulas, import/export, framework conversion, or PWA installation work is included yet.
