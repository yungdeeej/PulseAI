-- ============================================================
-- $PULSE bot initial schema — Replit Hosted Postgres
-- ============================================================
-- This schema replaces the original Supabase variant:
--   * Row Level Security (RLS) is dropped — access control is
--     enforced at the application layer. Two DB roles are
--     provisioned at the end (pulse_bot, pulse_reader).
--   * Supabase Realtime publication is replaced by Postgres
--     LISTEN/NOTIFY on the channels the bot publishes to.
--   * gen_random_uuid() relies on pgcrypto.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE tier_enum AS ENUM ('DISCOVERY', 'IGNITION', 'MOMENTUM', 'CONVICTION', 'ASCENSION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vault_kind_enum AS ENUM ('DECISION', 'DEFENSE', 'REWARDS', 'LIQUIDITY', 'OPERATIONS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE activity_kind_enum AS ENUM (
    'TIER_UNLOCK','DEFENSE','MM_UPDATE','VOLUME_BOT','REWARDS_DISTRIBUTION',
    'VOTE_OPENED','VOTE_CLOSED','VOTE_EXECUTED','BUY_BURN','AIRDROP',
    'REINFORCE_MM','TREASURY_TRADE','PULSE_WARS','HOLD',
    'BOUNTY_OPENED','BOUNTY_FULFILLED','TWEET_BONUS_AWARDED','NOTABLE_BUY',
    'SAFETY_HALT','DRY_RUN_NOTICE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vote_status_enum AS ENUM ('open', 'closed', 'executed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE trade_side_enum AS ENUM ('BUY', 'SELL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tweet_multiplier_status_enum AS ENUM ('pending', 'active', 'expired', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- token_state (singleton) ----------
CREATE TABLE IF NOT EXISTS token_state (
  id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mint_address    TEXT,
  price_usd       NUMERIC(30, 12) NOT NULL DEFAULT 0,
  price_sol       NUMERIC(30, 18) NOT NULL DEFAULT 0,
  market_cap_usd  NUMERIC(30, 4)  NOT NULL DEFAULT 0,
  total_supply    NUMERIC(30, 0)  NOT NULL DEFAULT 1000000000,
  holder_count    INTEGER         NOT NULL DEFAULT 0,
  volume_24h_usd  NUMERIC(30, 4)  NOT NULL DEFAULT 0,
  trades_per_hour INTEGER         NOT NULL DEFAULT 0,
  current_tier    tier_enum       NOT NULL DEFAULT 'DISCOVERY',
  bpm             INTEGER         NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ---------- bot_config (singleton) ----------
CREATE TABLE IF NOT EXISTS bot_config (
  id                       SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  paused                   BOOLEAN  NOT NULL DEFAULT FALSE,
  dry_run                  BOOLEAN  NOT NULL DEFAULT TRUE,
  defense_enabled          BOOLEAN  NOT NULL DEFAULT FALSE,
  mm_enabled               BOOLEAN  NOT NULL DEFAULT FALSE,
  rewards_enabled          BOOLEAN  NOT NULL DEFAULT FALSE,
  volume_gen_enabled       BOOLEAN  NOT NULL DEFAULT FALSE,
  max_daily_sol_deployed   NUMERIC(20, 6) NOT NULL DEFAULT 50,
  daily_sol_deployed       NUMERIC(20, 6) NOT NULL DEFAULT 0,
  daily_window_started_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ---------- vaults ----------
CREATE TABLE IF NOT EXISTS vaults (
  kind          vault_kind_enum PRIMARY KEY,
  address       TEXT            NOT NULL,
  balance_sol   NUMERIC(20, 9)  NOT NULL DEFAULT 0,
  balance_pulse NUMERIC(30, 6)  NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ---------- bot_activity ----------
CREATE TABLE IF NOT EXISTS bot_activity (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         activity_kind_enum NOT NULL,
  summary      TEXT             NOT NULL,
  payload      JSONB            NOT NULL DEFAULT '{}'::jsonb,
  tx_signature TEXT,
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bot_activity_created_at ON bot_activity (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_activity_kind       ON bot_activity (kind, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_activity_tx   ON bot_activity (tx_signature) WHERE tx_signature IS NOT NULL;

-- ---------- price_history ----------
CREATE TABLE IF NOT EXISTS price_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_usd       NUMERIC(30, 12) NOT NULL,
  price_sol       NUMERIC(30, 18) NOT NULL,
  market_cap_usd  NUMERIC(30, 4)  NOT NULL,
  source          TEXT            NOT NULL DEFAULT 'helius',
  observed_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_history_observed_at ON price_history (observed_at DESC);

-- ---------- trade_tape ----------
CREATE TABLE IF NOT EXISTS trade_tape (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature     TEXT             NOT NULL UNIQUE,
  wallet        TEXT             NOT NULL,
  side          trade_side_enum  NOT NULL,
  sol_amount    NUMERIC(20, 9)   NOT NULL,
  pulse_amount NUMERIC(30, 6)   NOT NULL,
  price_usd     NUMERIC(30, 12)  NOT NULL,
  bot_initiated BOOLEAN          NOT NULL DEFAULT FALSE,
  observed_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trade_tape_observed_at ON trade_tape (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_tape_wallet      ON trade_tape (wallet, observed_at DESC);

-- ---------- holder_balances ----------
CREATE TABLE IF NOT EXISTS holder_balances (
  wallet        TEXT PRIMARY KEY,
  balance       NUMERIC(30, 6)  NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_holder_balances_balance ON holder_balances (balance DESC);

-- ---------- holder_snapshots ----------
CREATE TABLE IF NOT EXISTS holder_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id      tier_enum       NOT NULL,
  wallet       TEXT            NOT NULL,
  balance      NUMERIC(30, 6)  NOT NULL,
  balance_usd  NUMERIC(30, 4)  NOT NULL,
  snapshot_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  UNIQUE (tier_id, wallet)
);
CREATE INDEX IF NOT EXISTS idx_holder_snapshots_snapshot_at ON holder_snapshots (snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_holder_snapshots_wallet      ON holder_snapshots (wallet);

-- ---------- wallet_status ----------
CREATE TABLE IF NOT EXISTS wallet_status (
  wallet     TEXT PRIMARY KEY,
  pioneer    BOOLEAN NOT NULL DEFAULT FALSE,
  believer   BOOLEAN NOT NULL DEFAULT FALSE,
  conviction BOOLEAN NOT NULL DEFAULT FALSE,
  ascendant  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- tier_history ----------
CREATE TABLE IF NOT EXISTS tier_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_tier       tier_enum,
  to_tier         tier_enum       NOT NULL,
  market_cap_usd  NUMERIC(30, 4)  NOT NULL,
  occurred_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tier_history_occurred_at ON tier_history (occurred_at DESC);

-- ---------- defense_log ----------
CREATE TABLE IF NOT EXISTS defense_log (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  drop_percent                  NUMERIC(8, 4)   NOT NULL,
  sol_deployed                  NUMERIC(20, 9)  NOT NULL,
  pulse_received                NUMERIC(30, 6)  NOT NULL DEFAULT 0,
  tx_signature                  TEXT,
  reinforcement_window_ends_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_defense_log_triggered_at ON defense_log (triggered_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_defense_log_tx ON defense_log (tx_signature) WHERE tx_signature IS NOT NULL;

-- ---------- reinforcement_log ----------
CREATE TABLE IF NOT EXISTS reinforcement_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  defense_id   UUID NOT NULL REFERENCES defense_log(id) ON DELETE CASCADE,
  wallet       TEXT NOT NULL,
  sol_spent    NUMERIC(20, 9)  NOT NULL,
  observed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (defense_id, wallet)
);
CREATE INDEX IF NOT EXISTS idx_reinforcement_log_wallet ON reinforcement_log (wallet);

-- ---------- streaks ----------
CREATE TABLE IF NOT EXISTS streaks (
  wallet           TEXT PRIMARY KEY,
  tier_id          tier_enum   NOT NULL,
  current_days     INTEGER     NOT NULL DEFAULT 0,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_streaks_current_days ON streaks (current_days DESC);

-- ---------- active_votes / vote_records / vote_history ----------
CREATE TABLE IF NOT EXISTS active_votes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id             tier_enum       NOT NULL,
  options             JSONB           NOT NULL,
  decision_pool_sol   NUMERIC(20, 9)  NOT NULL,
  opens_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  closes_at           TIMESTAMPTZ     NOT NULL,
  status              vote_status_enum NOT NULL DEFAULT 'open',
  winning_option      TEXT
);
CREATE INDEX IF NOT EXISTS idx_active_votes_status   ON active_votes (status, closes_at DESC);
CREATE INDEX IF NOT EXISTS idx_active_votes_closes_at ON active_votes (closes_at DESC);

CREATE TABLE IF NOT EXISTS vote_records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id            UUID NOT NULL REFERENCES active_votes(id) ON DELETE CASCADE,
  wallet             TEXT NOT NULL,
  option             TEXT NOT NULL,
  conviction_weight  NUMERIC(40, 6) NOT NULL,
  signature          TEXT NOT NULL,
  cast_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vote_id, wallet)
);
CREATE INDEX IF NOT EXISTS idx_vote_records_vote_id ON vote_records (vote_id);

CREATE TABLE IF NOT EXISTS vote_history (
  id                  UUID PRIMARY KEY,
  tier_id             tier_enum       NOT NULL,
  options             JSONB           NOT NULL,
  tallies             JSONB           NOT NULL,
  decision_pool_sol   NUMERIC(20, 9)  NOT NULL,
  opens_at            TIMESTAMPTZ     NOT NULL,
  closed_at           TIMESTAMPTZ     NOT NULL,
  winning_option      TEXT,
  execution_tx        TEXT
);
CREATE INDEX IF NOT EXISTS idx_vote_history_closed_at ON vote_history (closed_at DESC);

-- ---------- bounties ----------
CREATE TABLE IF NOT EXISTS bounties (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              TEXT             NOT NULL,
  conditions        JSONB            NOT NULL,
  reward_sol        NUMERIC(20, 9)   NOT NULL,
  expires_at        TIMESTAMPTZ      NOT NULL,
  fulfilled_at      TIMESTAMPTZ,
  fulfilled_wallet  TEXT,
  created_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bounties_created_at ON bounties (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounties_open       ON bounties (expires_at) WHERE fulfilled_at IS NULL;

-- ---------- tweet_multipliers ----------
CREATE TABLE IF NOT EXISTS tweet_multipliers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet       TEXT NOT NULL,
  tweet_url    TEXT NOT NULL,
  tweet_id     TEXT NOT NULL UNIQUE,
  status       tweet_multiplier_status_enum NOT NULL DEFAULT 'pending',
  likes        INTEGER NOT NULL DEFAULT 0,
  awarded_at   TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tweet_multipliers_wallet     ON tweet_multipliers (wallet);
CREATE INDEX IF NOT EXISTS idx_tweet_multipliers_status     ON tweet_multipliers (status, expires_at);

-- ---------- mm_state (singleton) ----------
CREATE TABLE IF NOT EXISTS mm_state (
  id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  buy_walls       JSONB           NOT NULL DEFAULT '[]'::jsonb,
  sell_walls      JSONB           NOT NULL DEFAULT '[]'::jsonb,
  spread_bps      INTEGER         NOT NULL DEFAULT 150,
  inventory_pulse NUMERIC(30, 6)  NOT NULL DEFAULT 0,
  inventory_sol   NUMERIC(20, 9)  NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-prune price_history >7 days on insert (probabilistic — fires
-- roughly 1 in 100 inserts to avoid hammering on every trade).
CREATE OR REPLACE FUNCTION prune_price_history()
RETURNS TRIGGER AS $$
BEGIN
  IF (random() < 0.01) THEN
    DELETE FROM price_history
      WHERE observed_at < NOW() - INTERVAL '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prune_price_history ON price_history;
CREATE TRIGGER trg_prune_price_history
  AFTER INSERT ON price_history
  FOR EACH ROW EXECUTE FUNCTION prune_price_history();

-- Maintain trade_tape size ≤ 500: after every insert, delete the oldest rows beyond 500.
CREATE OR REPLACE FUNCTION cap_trade_tape()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM trade_tape
    WHERE id IN (
      SELECT id FROM trade_tape
      ORDER BY observed_at DESC
      OFFSET 500
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cap_trade_tape ON trade_tape;
CREATE TRIGGER trg_cap_trade_tape
  AFTER INSERT ON trade_tape
  FOR EACH ROW EXECUTE FUNCTION cap_trade_tape();

-- LISTEN/NOTIFY: announce inserts on tables a dashboard would subscribe to.
-- Channel name == table name. Payload is the row id (UUID/smallint) as text.
CREATE OR REPLACE FUNCTION notify_row_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(TG_TABLE_NAME, COALESCE(NEW.id::text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bot_activity', 'token_state', 'vaults', 'tier_history',
    'active_votes', 'trade_tape'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_notify_%I ON %I;', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_notify_%I AFTER INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION notify_row_change();',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================
-- Seed singletons + default vault rows
-- ============================================================
INSERT INTO token_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
INSERT INTO bot_config  (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
INSERT INTO mm_state    (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

INSERT INTO vaults (kind, address) VALUES
  ('DECISION',   ''),
  ('DEFENSE',    ''),
  ('REWARDS',    ''),
  ('LIQUIDITY',  ''),
  ('OPERATIONS', '')
ON CONFLICT (kind) DO NOTHING;

-- ============================================================
-- Roles (run as superuser; idempotent)
-- ============================================================
-- pulse_bot:    read/write — used by the bot's service-role connection
-- pulse_reader: SELECT-only — used by the dashboard
-- On Replit Hosted Postgres these are optional; you can also enforce
-- the same separation by using two distinct connection strings.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulse_bot') THEN
    CREATE ROLE pulse_bot LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulse_reader') THEN
    CREATE ROLE pulse_reader LOGIN;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping role creation (insufficient privilege).';
END $$;

-- Public-read tables: granted to pulse_reader
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'token_state', 'vaults', 'bot_activity', 'holder_snapshots',
    'tier_history', 'active_votes', 'vote_history', 'bounties',
    'wallet_status', 'streaks', 'mm_state', 'trade_tape'
  ] LOOP
    EXECUTE format('GRANT SELECT ON %I TO pulse_reader;', t);
  END LOOP;
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'Skipping read grants (role missing).';
END $$;

-- Bot role gets full access to everything
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pulse_bot;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pulse_bot;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO pulse_bot;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO pulse_bot;
