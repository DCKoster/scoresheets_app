# Scoresheets database and account choices

## Storage and sync

Cloudflare D1 stores accounts, groups, memberships, shared templates, and matches. We chose D1 because Scoresheets was already hosted on Cloudflare, so the database fits the existing deployment. Local development uses Wrangler's local database, and preview and production each use a separate Cloudflare D1 database. Wrangler applies the versioned SQL migrations. [Database migrations](../migrations/)

Each account has a stable ID, a unique case-insensitive username, and an optional contact email. An account can belong to several groups. Composite foreign keys keep match creators, linked participants, and custom game revisions within the match's group. Removed memberships stay in the database so older matches can still reference them.

Built-in games live in the app. Custom games are scoped to a group and have immutable revisions. Each match stores a snapshot of the scoring rules alongside its entries and calculated totals. Participants have match-local IDs and keep their display names as played. A linked account ID identifies the same player across matches.

D1 commits each match change and its sync receipt in one transaction so a retried request can reuse the original result. Edits and deletes check the match revision to catch conflicts. Deleted matches are kept as records so a stale offline edit cannot restore one.

**Local scoresheets** uses browser local storage, including for backup imports. For private groups, IndexedDB keeps downloaded group data and pending match changes by account and group. After a group has been loaded, a member can keep scoring offline. Pending changes upload when the same account can reach the Worker again. Signing out clears cached group history while keeping pending changes.

## Accounts and access

Owner-issued codes keep setup and recovery simple for private groups because the owner can create accounts and replace lost codes without an email service or an external identity provider. Each code is generated with 128 bits of randomness, so the Worker can verify its fingerprint and avoid the password-hashing cost observed on Workers Free.

Each database has one Scoresheets owner. The owner creates groups and accounts, manages memberships and group templates, and issues or replaces login codes. Active members can view group data and record matches in their groups. A match can be edited or deleted by its creator or by the owner with access to that group. Cloudflare permissions govern direct database access and control over deployment secrets, including the temporary owner recovery secret.

D1 stores SHA-256 fingerprints of login codes and session tokens. The browser receives a seven-day session token in an HttpOnly cookie that is Secure on HTTPS. Replacing a code updates its fingerprint and revokes all sessions for that account in one transaction. The owner shares each newly issued code privately.
