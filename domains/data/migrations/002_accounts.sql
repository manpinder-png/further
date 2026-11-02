-- Real local accounts are separate from pre-existing development learners.
-- Existing maps remain intact and are never claimed by matching an email/name.
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  learner_id uuid UNIQUE NOT NULL REFERENCES learners(id),
  email text UNIQUE NOT NULL CHECK(length(email) BETWEEN 3 AND 254 AND email = lower(email)),
  username text UNIQUE NOT NULL CHECK(username ~ '^[a-z0-9_]{3,24}$'),
  email_verified boolean NOT NULL DEFAULT false,
  provider text NOT NULL CHECK(provider IN ('password','google')),
  password_hash text,
  created_at bigint NOT NULL,
  CHECK((provider = 'password' AND password_hash IS NOT NULL) OR (provider = 'google' AND password_hash IS NULL))
);
CREATE TABLE IF NOT EXISTS account_identities (
  provider text NOT NULL CHECK(provider = 'google'),
  subject text NOT NULL,
  account_id uuid UNIQUE NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  PRIMARY KEY(provider, subject)
);
CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash text PRIMARY KEY CHECK(length(token_hash) = 64),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS account_sessions_expiry ON account_sessions(expires_at);
CREATE TABLE IF NOT EXISTS oauth_transactions (
  state_hash text PRIMARY KEY CHECK(length(state_hash) = 64),
  verifier text NOT NULL,
  nonce text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_attempts (
  bucket_key text PRIMARY KEY,
  attempts integer NOT NULL,
  window_start bigint NOT NULL
);
