-- Keep users in place so group memberships, match creators and participants
-- retain their foreign keys. New accounts use their ID in the legacy column.
ALTER TABLE users RENAME COLUMN email TO legacy_email;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN username TEXT NOT NULL DEFAULT '' COLLATE NOCASE;
ALTER TABLE users ADD COLUMN code_fingerprint TEXT;
UPDATE users SET email = legacy_email, legacy_email = id, username = 'account-' || lower(id);
CREATE UNIQUE INDEX users_by_username ON users(username);

DROP TABLE auth_credentials;
DROP TABLE auth_sessions;
DROP TABLE account_tokens;
DELETE FROM sign_in_limits;

CREATE TABLE login_sessions (
  fingerprint TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX login_sessions_by_user ON login_sessions(user_id);
