-- Add target_mint to active_votes / vote_history so Treasury Trade and
-- Pulse Wars executors know which mint to buy. Set by /admin/votes/:id/target
-- after the vote opens.
ALTER TABLE active_votes ADD COLUMN IF NOT EXISTS target_mint TEXT;
ALTER TABLE vote_history ADD COLUMN IF NOT EXISTS target_mint TEXT;
