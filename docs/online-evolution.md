# Deferred Online Evolution

The local v2 model prepares for an online edition through stable game, participant, and session IDs and asynchronous repository boundaries. It does not implement networking or accounts.

An online design must separately introduce authentication; account-linked participants; session ownership and membership; invitations; server-side authorization; server-backed game and session repositories; offline synchronization and conflict handling; and privacy-aware statistics aggregation. Local display participants must not be assumed to be accounts, and server authorization must not rely on client-side ownership fields.


# Optional Accounts and Shared Score History

  ## Summary

  Add optional Google sign-in using Firebase Authentication and Cloud Firestore. Guest mode remains unchanged and fully offline. Signed-in users can synchronize sessions, reusable players, and custom games across
  devices.

  Each session has one owner and one canonical database record. Accounts linked to participants receive view-only access to that record, preventing duplicate copies in everyone’s history.

  ## Implementation Changes

  - Add Firebase Authentication with Google sign-in, sign-out, authentication-state handling, and first-login username setup.
  - Introduce unique, immutable usernames using lowercase [a-z0-9_], 3–30 characters. Username lookup is exact and available only to authenticated users; email addresses remain private.
  - Add a signed-in-only Players screen:
      - Create and rename reusable players.
      - Mark one existing player manually as “me.”
      - Link a player to an exact username.
      - Prevent the same account or normalized player name from appearing twice in one owner’s player list.
      - Allow unlinking or correcting a link with confirmation.

  - Keep the existing comma-separated guest workflow. In account mode, entered names resolve to reusable players; unknown names create unlinked players.
  - When a player is linked, update every owned historical session referencing that player. Preserve the historical display name while adding the account identity and shared access.
  - Show owned and shared sessions together in history and statistics, deduplicated by session ID. Shared sessions display an ownership badge and have no edit/delete controls.
  - Aggregate statistics by linked account ID or reusable player ID, falling back to normalized names only for legacy/unlinked participants.
  - Synchronize custom game templates for their owner. Shared sessions retain their scoring snapshot, so viewers do not need access to the owner’s custom template.

  ## Data, Synchronization, and Security

  - Add Firestore records for private account profiles, exact-lookup username reservations, owner-scoped players, custom games, sessions, and per-account session-access references.
  - Extend participant snapshots with optional playerId and linkedUid; extend sessions with ownerUid, revision, and timestamps.
  - Add repository implementations for Firestore while retaining the existing local repositories. A repository selector switches modes based on authentication state; UI code remains storage-independent.
  - Add repository subscriptions so phone/laptop changes appear without reloading.
  - Enable Firestore IndexedDB persistence. New sessions and owner edits may be queued offline and synchronize after reconnection.
  - Require each update to increment revision. Firestore rules reject stale concurrent updates; the UI then reloads the newer record and reports the conflict instead of silently overwriting it.
  - Enforce server-side rules:
      - Only an owner may change or delete their sessions, games, and players.
      - A linked account may read a session only through its access record.
      - Viewers cannot modify session data.
      - Username collections deny listing and partial search.
      - Linking shares the owner’s relevant sessions but never grants access to the linked account’s private data.

  - On sign-out, terminate Firestore listeners, clear its persistent cache, and return to the unchanged guest dataset.
  - On first sign-in per account/device, offer to import local sessions and custom games. Import copies rather than deletes local data, preserves stable IDs, skips records already present, merges player names case-
    insensitively, and reports conflicts.

  - Exports from account mode include only owner-owned records; shared sessions are not duplicated into backups.

  ## Build and Deployment

  - Add the Firebase modular web SDK and Vite, bundling Firebase into the PWA rather than depending on runtime CDN files.
  - Replace the manually maintained application-shell list with generated PWA precaching so bundled code remains available offline.
  - Continue deploying through Cloudflare Pages using npm run build and the generated dist directory.
  - Add documented Firebase client configuration variables, Firestore indexes/rules, emulator configuration, and deployment scripts for Firebase backend configuration.
  - Authorize the production Cloudflare hostname in Firebase Authentication. Use Google popup sign-in with redirect fallback where popups are unavailable.

  ## Test Plan

  - Preserve all current repository, scoring, statistics, localization, backup, and PWA tests in guest mode.
  - Add repository contract tests covering both local and Firestore implementations.
  - Use Firebase Auth/Firestore emulators to test username uniqueness, exact lookup, owner-only writes, linked viewer reads, denied viewer edits, unlinking, and unauthorized access.
  - Test offline creation, reconnection synchronization, stale revision rejection, sign-out cache clearing, and returning to guest data.
  - Verify the Cloudflare production build on separate phone and laptop browser profiles: sign in with the same account, link a second username, save once, and confirm that both histories show one session while only
    the owner can edit it.

  ## Assumptions

  - Google is the only authentication provider in the first version.
  - Linking by username takes effect immediately without recipient acceptance.
  - Linked participants see the complete session, not only their own score.
  - Language and UI preferences remain device-local.
  - Independently created look-alike sessions are not automatically merged; deduplication is identity-based because content-based merging could destroy legitimate repeated games.
  - Invitations, partial-name search, collaborative editing, configurable roles, and non-Google accounts remain outside this version.