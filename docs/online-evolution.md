# Deferred Online Evolution

The local v2 model prepares for an online edition through stable game, participant, and session IDs and asynchronous repository boundaries. It does not implement networking or accounts.

An online design must separately introduce authentication; account-linked participants; session ownership and membership; invitations; server-side authorization; server-backed game and session repositories; offline synchronization and conflict handling; and privacy-aware statistics aggregation. Local display participants must not be assumed to be accounts, and server authorization must not rely on client-side ownership fields.
