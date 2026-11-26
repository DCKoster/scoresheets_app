# Scoresheets Project Overview

Scoresheets is a framework-free, offline-first browser score tracker. People can play and save matches in **Local scoresheets** without an account. Owner-managed private groups share matches and templates across devices through Cloudflare Workers and D1.

## Architecture

A **game definition** has a stable ID, origin, display name, play mode, and scoring configuration. The configuration selects a registered **scoring engine**, an **entry mode**, and its ranking objective. The built-in engines are:

- `round-sum`: repeated numeric entries summed per participant.
- `final-total`: one numeric total per participant.
- `winner-only`: one or more selected winners, including cooperative or no-winner results.
- `mario-kart-8`: race placements converted to standard points with Mario Kart-specific setup and history.

Round-sum and final-total templates may define named score categories. Round entries accept finite numbers or safe arithmetic expressions; final totals remain numeric. The application resolves engines by engine ID, so game names and IDs do not control scoring behavior. A saved session contains a **session scoring snapshot**, engine-owned raw entries, and persisted calculated totals. Editing a template therefore affects new sessions only.

`LocalGameRepository` and `LocalSessionRepository` keep separate custom-game and session collections under versioned browser `localStorage` keys. Current game and session records use schema version 3, and migration retains compatible legacy data. Games, sessions, participants, rounds, and races have stable IDs, with score maps keyed by participant ID.

For private groups, the Worker checks the signed-in account and its group membership before serving data from D1. IndexedDB stores the browser's group cache and pending match changes so members can keep scoring offline after loading a group. Uploads resume when the same account can reach the Worker again. The Scoresheets owner manages group access, and Cloudflare permissions control direct access to the database and deployment secrets. See the [database and account design](docs/database-choices.md).

## Features

- Start games with at least two uniquely named players.
- Use the complete interface in English or Dutch, with a remembered browser-local preference.
- Score Take 5!, Pick-omino/Regenwormen, Dirty Pigs/Moddervarkens or custom round/final-total/winning only games.
- Record Mario Kart 8 races with tracks, CC, item rules, variable racers, placements, and points.
- Rank highest or lowest totals while retaining ties and accepting negative scores.
- Use named score categories, round formulas, competitive or cooperative templates, and winner-only results.
- Create and edit custom templates; duplicate any template; delete custom templates.
- Edit or delete saved sessions. In **Local scoresheets**, export a full backup or one session and import validated non-conflicting records.
- Filter and sort player, game, round, and Mario Kart statistics using the selected local or group history.
- Keep history usable after a template is changed or deleted.
- Render user-provided names through DOM text properties.

Built-ins are read-only. User-authored templates can select registered engines only; custom JavaScript and user-defined scoring engines are not supported.

## Backup and Offline Shell

**Local scoresheets** exports versioned JSON containing saved sessions and custom games. Single-session export includes that session and its custom game when needed. Import validates the complete backup first, merges records whose IDs and game names are new to the local library, and reports skipped conflicts. Imported records go into browser `localStorage`.

`web_app/manifest.webmanifest` defines the installable application metadata and icon. `web_app/service-worker.js` maintains a versioned application-shell cache containing the root document, styles, manifest, icon, and JavaScript modules. Navigations use the cached root after the first successful shell load; same-origin static assets use cache-first behavior with a network fallback. Activation removes older Scoresheets caches. `test/pwa.test.js` verifies the manifest reference, versioned shell entries, navigation handling, and cache cleanup.

## Repository Layout

The browser app is in `web_app/`. Its `src/scoring/engines.js` owns reusable scoring behavior, `src/state/repositories.js` handles local storage and backups, and `src/state/cloud.js` handles group data and offline queues. The group API lives in `worker/`, and the D1 schema is managed in `migrations/`.

Serve the repository with `npm start`, then open <http://localhost:8000>. Run automated tests with:

```bash
npm test
```

## Deferred Work

Direct backup import into a private group and linking old guest names to accounts remain deferred. For reusable scoring sections, repeated sections, bonuses and penalties, and lookup calculations, see the [composable scoring design](docs/composable-scoring-architecture.md).
