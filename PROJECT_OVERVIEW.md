# Scoresheets Project Overview

Scoresheets is a framework-free, offline-first browser score tracker. It supports built-in read-only games and user-created local game templates, while preserving historical scoring behavior when templates change or are deleted. Application data stays in browser `localStorage`; the app has no networking or account layer.

## Architecture

A **game definition** has a stable ID, origin, display name, play mode, and scoring configuration. The configuration selects a registered **scoring engine**, an **entry mode**, and its ranking objective. The built-in engines are:

- `round-sum`: repeated numeric entries summed per participant.
- `final-total`: one numeric total per participant.
- `winner-only`: one or more selected winners, including cooperative or no-winner results.
- `mario-kart-8`: race placements converted to standard points with Mario Kart-specific setup and history.

Round-sum and final-total templates may define named score categories. Round entries accept finite numbers or safe arithmetic expressions; final totals remain numeric. The application resolves engines by engine ID, so game names and IDs do not control scoring behavior. A saved session contains a **session scoring snapshot**, engine-owned raw entries, and persisted calculated totals. Editing a template therefore affects new sessions only.

`LocalGameRepository` and `LocalSessionRepository` are asynchronous boundaries. Their current implementations serialize separate custom-game and session collections under versioned browser `localStorage` keys. Current game and session records use schema version 3, while migration retains compatible legacy data. Stable IDs are used for games, sessions, participants, rounds, and races, with score maps keyed by participant ID.

## Features

- Start games with at least two uniquely named players.
- Use the complete interface in English or Dutch, with a remembered browser-local preference.
- Score Take 5!, Pick-omino/Regenwormen, Dirty Pigs/Moddervarkens or custom round/final-total/winning only games.
- Record Mario Kart 8 races with tracks, CC, item rules, variable racers, placements, and points.
- Rank highest or lowest totals while retaining ties and accepting negative scores.
- Use named score categories, round formulas, competitive or cooperative templates, and winner-only results.
- Create and edit custom templates; duplicate any template; delete custom templates.
- Edit or delete saved sessions, export a full backup or one session, and import validated non-conflicting records.
- Filter and sort player, game, round, and Mario Kart statistics using saved local history.
- Keep history usable after a template is changed or deleted.
- Render user-provided names through DOM text properties.

Built-ins are read-only. User-authored templates can select registered engines only; custom JavaScript and user-defined scoring engines are not supported.

## Backup and Offline Shell

Backup export produces versioned JSON containing saved sessions and custom games. Single-session export includes that session and its custom game when needed. Import validates the complete backup before writing, merges records with new IDs and game names, and reports conflicts that were skipped.

`web_app/manifest.webmanifest` defines the installable application metadata and icon. `web_app/service-worker.js` maintains a versioned application-shell cache containing the root document, styles, manifest, icon, and JavaScript modules. Navigations use the cached root after the first successful shell load; same-origin static assets use cache-first behavior with a network fallback. Activation removes older Scoresheets caches. `test/pwa.test.js` verifies the manifest reference, versioned shell entries, navigation handling, and cache cleanup.

## Repository Layout

The active app is in `web_app/`. `src/scoring/engines.js` owns reusable scoring behavior, `src/state/repositories.js` owns persistence and migration, `src/data/games.js` owns built-in definitions, and `src/ui/` contains DOM renderers. `main.js` is the composition root. 

Serve the repository with `npm start`, then open <http://localhost:8000>. Run automated tests with:

```bash
npm test
```

## Deferred Work

More advanced composable scoring—such as reusable section definitions, repeated sections, bonuses/penalties, and lookup calculations—is described in [docs/composable-scoring-architecture.md](docs/composable-scoring-architecture.md). Authentication, account-linked participants, ownership, invitations, authorization, server-backed repositories, cross-device synchronization, conflict handling, and privacy-aware online aggregation remain deferred in [docs/online-evolution.md](docs/online-evolution.md). No networking, accounts, server authorization, or remote synchronization is implemented.
