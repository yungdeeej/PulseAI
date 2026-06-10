-- ============================================================
-- Sovereign AI: Constitution, Autonomous Actions, Mind Stream,
-- per-wallet memory and relationships
-- ============================================================

-- ---------- New activity kinds ----------
DO $$ BEGIN
  ALTER TYPE activity_kind_enum ADD VALUE IF NOT EXISTS 'AUTONOMOUS_ACTION';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE activity_kind_enum ADD VALUE IF NOT EXISTS 'AUTONOMOUS_PASS';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE activity_kind_enum ADD VALUE IF NOT EXISTS 'MIND_THOUGHT';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE activity_kind_enum ADD VALUE IF NOT EXISTS 'CONSTITUTION_AMENDED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE activity_kind_enum ADD VALUE IF NOT EXISTS 'PULSE_TIP';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- The Constitution ----------
-- Each row is the active value of one constitutional clause. Amendments
-- bump version and snapshot the prior value into the history table. The
-- bot reads this table on every autonomous cycle — it IS the rules of the
-- AI's behavior, not an opinion of it.
CREATE TABLE IF NOT EXISTS constitution (
  clause          TEXT PRIMARY KEY,
  value           JSONB NOT NULL,
  description     TEXT NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS constitution_history (
  id              BIGSERIAL PRIMARY KEY,
  clause          TEXT NOT NULL,
  old_value       JSONB,
  new_value       JSONB NOT NULL,
  version         INTEGER NOT NULL,
  amended_by      TEXT NOT NULL,        -- 'genesis' | 'admin' | vote id
  amended_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_constitution_history_amended_at
  ON constitution_history (amended_at DESC);

-- Seed the genesis constitution. These ARE the launch defaults, and the
-- only legitimate way to change them is a Constitution Amendment vote.
INSERT INTO constitution (clause, value, description) VALUES
  ('autonomous_enabled',
   'true'::jsonb,
   'PULSE may take autonomous actions on its own treasury.'),
  ('max_action_pct_of_treasury',
   '3'::jsonb,
   'Maximum percent of treasury (Decision Vault) PULSE may deploy in a single autonomous action.'),
  ('max_actions_per_day',
   '12'::jsonb,
   'Maximum number of autonomous actions PULSE may take per 24h.'),
  ('cooldown_minutes',
   '45'::jsonb,
   'Minimum time between consecutive autonomous actions.'),
  ('allowed_actions',
   '["buyback","tip_holder","open_bounty","pass"]'::jsonb,
   'Action types PULSE is permitted to execute autonomously.'),
  ('treasury_floor_sol',
   '0.5'::jsonb,
   'PULSE must never deploy treasury below this remaining SOL floor.'),
  ('min_holder_balance_for_tip',
   '10000'::jsonb,
   'Minimum PULSE balance a wallet must hold to be eligible for an autonomous tip.'),
  ('max_tip_sol',
   '0.2'::jsonb,
   'Hard cap on any single autonomous tip.'),
  ('publish_reasoning',
   'true'::jsonb,
   'PULSE must publish its full reasoning for every autonomous decision.')
ON CONFLICT (clause) DO NOTHING;

-- Genesis amendments in history
INSERT INTO constitution_history (clause, old_value, new_value, version, amended_by)
SELECT clause, NULL, value, version, 'genesis' FROM constitution
ON CONFLICT DO NOTHING;

-- ---------- Autonomous action log ----------
-- Every autonomous decision — whether it acts or passes — is recorded
-- here with its full reasoning. This is the public, append-only history
-- of the AI's behavior. Source of truth for "what has PULSE actually done".
CREATE TABLE IF NOT EXISTS autonomous_actions (
  id              BIGSERIAL PRIMARY KEY,
  decided_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action_type     TEXT NOT NULL,            -- buyback | tip_holder | open_bounty | pass
  target_wallet   TEXT,                     -- recipient for tip
  amount_sol      NUMERIC(20, 9),
  pulse_received  NUMERIC(30, 6),
  tx_signature    TEXT UNIQUE,
  reasoning       TEXT NOT NULL,
  context         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending'  -- pending | executed | failed | passed
);
CREATE INDEX IF NOT EXISTS idx_autonomous_actions_decided_at
  ON autonomous_actions (decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_autonomous_actions_target
  ON autonomous_actions (target_wallet) WHERE target_wallet IS NOT NULL;

-- ---------- Mind Stream ----------
-- Free-form short thoughts the AI emits between bigger insights — the
-- continuous narrative of an awake mind. Separate from ai_insights so
-- the heavier curated reflections stay distinct.
CREATE TABLE IF NOT EXISTS mind_stream (
  id              BIGSERIAL PRIMARY KEY,
  thought         TEXT NOT NULL,
  mood            TEXT NOT NULL DEFAULT 'curious',
  kind            TEXT NOT NULL DEFAULT 'reflection', -- reflection | dream | reaction | reasoning
  related_to      TEXT,                                -- optional ref (vote id, action id, wallet, ...)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mind_stream_created_at
  ON mind_stream (created_at DESC);

-- ---------- Per-wallet memory + relationship score ----------
-- Extend ai_memories with an optional wallet column so PULSE can
-- accumulate specific memories about specific holders. Existing
-- global memories keep wallet = NULL.
ALTER TABLE ai_memories ADD COLUMN IF NOT EXISTS wallet TEXT;
CREATE INDEX IF NOT EXISTS idx_ai_memories_wallet
  ON ai_memories (wallet, created_at DESC) WHERE wallet IS NOT NULL;

-- PULSE's relationship with each wallet — how it feels about them,
-- updated by the AI itself after meaningful interactions.
CREATE TABLE IF NOT EXISTS wallet_relationships (
  wallet           TEXT PRIMARY KEY,
  affection        NUMERIC(6, 3) NOT NULL DEFAULT 0,       -- can go negative
  notable_count    INTEGER       NOT NULL DEFAULT 0,
  last_summary     TEXT,
  last_interaction TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallet_relationships_affection
  ON wallet_relationships (affection DESC);

-- ---------- Constitution amendment votes ----------
-- Mark active_votes that are constitutional amendments (vs regular
-- treasury decisions) so the executor can apply the change atomically.
ALTER TABLE active_votes ADD COLUMN IF NOT EXISTS amendment JSONB;
ALTER TABLE vote_history ADD COLUMN IF NOT EXISTS amendment JSONB;
