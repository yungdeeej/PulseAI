-- ============================================================
-- Fable features: Talk-to-PULSE chat, vote debates
-- ============================================================

-- Chat sessions: a wallet signs once to mint a bearer token that
-- authenticates subsequent chat messages at its holder tier.
CREATE TABLE IF NOT EXISTS chat_sessions (
  token       TEXT PRIMARY KEY,
  wallet      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_wallet ON chat_sessions (wallet);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_expires ON chat_sessions (expires_at);

-- Chat transcript. identity = wallet address for holder sessions, or an
-- anonymized "ip:<hash>" key for anonymous users (quota tracking only,
-- raw IPs are never stored).
CREATE TABLE IF NOT EXISTS chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  identity    TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_identity
  ON chat_messages (identity, created_at DESC);

-- AI-authored debate for each Treasury Decision: the consciousness argues
-- the case for every ballot option, then reveals its lean.
ALTER TABLE active_votes ADD COLUMN IF NOT EXISTS debate JSONB;
ALTER TABLE vote_history ADD COLUMN IF NOT EXISTS debate JSONB;
