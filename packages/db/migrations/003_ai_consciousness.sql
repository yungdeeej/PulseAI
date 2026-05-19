-- ============================================================
-- Sentient Token AI Consciousness
-- ============================================================
-- Stores LLM-generated commentary, strategic recommendations,
-- and a small "memory" of past observations the AI can reference.
-- ============================================================

-- Extend activity_kind_enum with AI_INSIGHT
DO $$ BEGIN
  ALTER TYPE activity_kind_enum ADD VALUE IF NOT EXISTS 'AI_INSIGHT';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS ai_insights (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  headline      TEXT        NOT NULL,
  commentary    TEXT        NOT NULL,
  mood          TEXT        NOT NULL,             -- one of blob emotions: excited, happy, curious, focused, ...
  vote_lean     TEXT,                             -- optional recommended vote option label
  vote_reason   TEXT,                             -- short justification for the lean
  confidence    NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  context       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  model         TEXT        NOT NULL DEFAULT 'gpt-5.4'
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_created_at
  ON ai_insights (created_at DESC);

-- Compact long-term memory the AI summarises about the token's journey.
-- Each row is a single notable observation (e.g. "first tier cross",
-- "defense triggered on -28% drop", "holders broke 1000"). Kept small
-- so we can always pass the full list into the prompt.
CREATE TABLE IF NOT EXISTS ai_memories (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind        TEXT        NOT NULL,    -- MILESTONE | DEFENSE | TIER | VOTE | GROWTH
  memory      TEXT        NOT NULL,
  weight      NUMERIC(4,2) NOT NULL DEFAULT 1.0
);

CREATE INDEX IF NOT EXISTS idx_ai_memories_created_at
  ON ai_memories (created_at DESC);
