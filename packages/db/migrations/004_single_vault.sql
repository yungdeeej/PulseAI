-- ============================================================
-- Single Decision Vault + binary vote options
-- ============================================================
-- Collapses the five-vault treasury system down to a single
-- DECISION vault and strips out the deprecated activity kinds,
-- vote target_mint column, and bot_config feature flags that
-- powered the old defense / MM / rewards subsystems.
--
-- Postgres can't easily drop ENUM values without recreating
-- the type, so for the vault_kind / activity_kind enums we
-- recreate them in place. Idempotent: each guard checks for
-- prior state before mutating.
-- ============================================================

-- ---------- vaults: drop everything except DECISION ----------
DELETE FROM vaults WHERE kind <> 'DECISION';

-- ---------- bot_config: drop feature flags ----------
ALTER TABLE bot_config DROP COLUMN IF EXISTS defense_enabled;
ALTER TABLE bot_config DROP COLUMN IF EXISTS mm_enabled;
ALTER TABLE bot_config DROP COLUMN IF EXISTS rewards_enabled;

-- ---------- active_votes / vote_history: drop target_mint ----------
ALTER TABLE active_votes  DROP COLUMN IF EXISTS target_mint;
ALTER TABLE vote_history  DROP COLUMN IF EXISTS target_mint;

-- ---------- recreate vault_kind_enum with just DECISION ----------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'vault_kind_enum'
      AND e.enumlabel <> 'DECISION'
  ) THEN
    -- Switch column to text, drop old enum, create new, switch back.
    ALTER TABLE vaults ALTER COLUMN kind TYPE TEXT USING kind::text;
    DROP TYPE vault_kind_enum;
    CREATE TYPE vault_kind_enum AS ENUM ('DECISION');
    ALTER TABLE vaults ALTER COLUMN kind TYPE vault_kind_enum USING kind::vault_kind_enum;
  END IF;
END $$;

-- ---------- recreate activity_kind_enum without removed values ----------
DO $$
DECLARE
  needs_rebuild BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'activity_kind_enum'
      AND e.enumlabel IN (
        'DEFENSE','MM_UPDATE','REWARDS_DISTRIBUTION',
        'REINFORCE_MM','TREASURY_TRADE','PULSE_WARS','HOLD'
      )
  ) INTO needs_rebuild;

  IF needs_rebuild THEN
    -- Remove rows that reference activity kinds we no longer support so
    -- the column can be cast safely.
    DELETE FROM bot_activity WHERE kind::text IN (
      'DEFENSE','MM_UPDATE','REWARDS_DISTRIBUTION',
      'REINFORCE_MM','TREASURY_TRADE','PULSE_WARS','HOLD'
    );

    ALTER TABLE bot_activity ALTER COLUMN kind TYPE TEXT USING kind::text;
    DROP TYPE activity_kind_enum;
    CREATE TYPE activity_kind_enum AS ENUM (
      'TIER_UNLOCK',
      'VOTE_OPENED','VOTE_CLOSED','VOTE_EXECUTED',
      'BUY_BURN','AIRDROP','VOLUME_BOT',
      'BOUNTY_OPENED','BOUNTY_FULFILLED','TWEET_BONUS_AWARDED',
      'NOTABLE_BUY','SAFETY_HALT','DRY_RUN_NOTICE','AI_INSIGHT'
    );
    ALTER TABLE bot_activity ALTER COLUMN kind TYPE activity_kind_enum
      USING kind::activity_kind_enum;
  END IF;
END $$;
