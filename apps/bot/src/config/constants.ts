// Reinforcement scoring (used by Conviction Score even with no defense vault)
export const REINFORCEMENT_WINDOW_MINUTES = 30;

// Loops (ms)
export const STATE_SYNC_INTERVAL_MS = 30_000;
export const VOLUME_BOT_MIN_INTERVAL_MS = 10 * 60_000;
export const VOLUME_BOT_MAX_INTERVAL_MS = 30 * 60_000;
export const BOT_CONFIG_POLL_MS = 30_000;
export const BETTERSTACK_PING_MS = 60_000;
export const TWEET_POLL_MS = 60 * 60_000; // hourly

// Trading
export const SLIPPAGE_BPS = 200; // 2%
export const MAX_TX_SOL = 5;
export const NOTABLE_BUY_SOL = 5;

// Rewards
export const REWARDS_MIN_BALANCE = 100_000; // PULSE
export const REWARDS_MIN_HOLD_DAYS = 3;
export const REWARDS_BATCH_SIZE = 20;

// Volume bot
export const VOLUME_BOT_MIN_SOL = 0.05;
export const VOLUME_BOT_MAX_SOL = 0.2;

// Burn / incinerator address (standard SPL token incinerator)
export const INCINERATOR_ADDRESS = "1nc1nerator11111111111111111111111111111111";

// Retry
export const RPC_RETRY_DELAYS_MS = [1_000, 3_000, 9_000];
