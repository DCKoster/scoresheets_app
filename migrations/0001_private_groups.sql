CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email))),
  name TEXT NOT NULL,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled'))
);

CREATE UNIQUE INDEX one_owner ON users(role) WHERE role = 'owner';

-- Physical column names follow Better Auth's account and session models.
CREATE TABLE auth_credentials (
  id TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  password TEXT,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TEXT,
  "refreshTokenExpiresAt" TEXT,
  scope TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  UNIQUE ("userId", "providerId")
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  "expiresAt" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT
);

CREATE INDEX auth_sessions_by_user ON auth_sessions("userId");

CREATE TABLE account_tokens (
  digest TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('setup', 'reset')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  redemption_id TEXT
);

CREATE INDEX account_tokens_by_user ON account_tokens(user_id);

CREATE TABLE sign_in_limits (
  key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);

CREATE TABLE groups (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES groups(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  joined_at TEXT NOT NULL,
  removed_at TEXT,
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX active_groups_by_user ON group_members(user_id, group_id) WHERE removed_at IS NULL;
CREATE INDEX active_members_by_group ON group_members(group_id, joined_at) WHERE removed_at IS NULL;

CREATE TABLE games (
  group_id TEXT NOT NULL REFERENCES groups(id),
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  current_revision INTEGER NOT NULL CHECK (current_revision > 0),
  archived_at TEXT,
  PRIMARY KEY (group_id, id)
);

CREATE UNIQUE INDEX active_game_names ON games(group_id, name_key) WHERE archived_at IS NULL;

CREATE TABLE game_versions (
  group_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  definition TEXT NOT NULL,
  PRIMARY KEY (group_id, game_id, revision),
  FOREIGN KEY (group_id, game_id) REFERENCES games(group_id, id)
);

CREATE TABLE game_sessions (
  group_id TEXT NOT NULL,
  id TEXT NOT NULL,
  builtin_game_id TEXT,
  custom_game_id TEXT,
  game_revision INTEGER,
  created_by TEXT NOT NULL,
  played_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  scoring_snapshot TEXT NOT NULL,
  entries TEXT NOT NULL,
  totals TEXT NOT NULL,
  category_totals TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (group_id, id),
  CHECK ((builtin_game_id IS NOT NULL AND custom_game_id IS NULL AND game_revision IS NULL)
      OR (builtin_game_id IS NULL AND custom_game_id IS NOT NULL AND game_revision IS NOT NULL)),
  FOREIGN KEY (group_id, custom_game_id, game_revision) REFERENCES game_versions(group_id, game_id, revision),
  FOREIGN KEY (group_id, created_by) REFERENCES group_members(group_id, user_id)
);

CREATE INDEX group_match_history ON game_sessions(group_id, played_at DESC, id DESC) WHERE deleted_at IS NULL;

CREATE TABLE session_participants (
  group_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  user_id TEXT,
  position INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  PRIMARY KEY (group_id, session_id, participant_id),
  UNIQUE (group_id, session_id, position),
  UNIQUE (group_id, session_id, user_id),
  FOREIGN KEY (group_id, session_id) REFERENCES game_sessions(group_id, id),
  FOREIGN KEY (group_id, user_id) REFERENCES group_members(group_id, user_id)
);

CREATE TABLE sync_receipts (
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id, operation_id),
  FOREIGN KEY (group_id, user_id) REFERENCES group_members(group_id, user_id)
);
