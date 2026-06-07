# Scoresheets Web App Branch Plan

This project is split into branch-focused steps so each pull request has one clear objective.

## Branch order

1. feat/web-pwa-setup
2. feat/core-data-model-web
3. feat/take5-round-scoring-web
4. feat/pickomino-total-scoring-web
5. feat/session-history-export-web
6. feat/test-release-pwa

## Scope lock for MVP

- Supported games: Take 5! and Pick-omino only.
- Input mode: typed numbers.
- Traffic expectation: low (about 5 to 50 sessions per game).
- Offline first: app must run without internet after first install/load.
- Sync: no cloud sync in v1.
- Deployment: static web hosting with HTTPS.
- Installability: user can install as a PWA on desktop and mobile.
