import type { ActivityKind } from "./activity.js";
import type { Tier } from "./tiers.js";
import type { VaultKind } from "./vaults.js";
import type { VoteOption, VoteStatus } from "./votes.js";

export interface TokenState {
  id: 1;
  mint_address: string | null;
  price_usd: number;
  price_sol: number;
  market_cap_usd: number;
  total_supply: number;
  holder_count: number;
  volume_24h_usd: number;
  trades_per_hour: number;
  current_tier: Tier;
  bpm: number;
  updated_at: string;
}

export interface BotConfig {
  id: 1;
  paused: boolean;
  dry_run: boolean;
  volume_gen_enabled: boolean;
  max_daily_sol_deployed: number;
  daily_sol_deployed: number;
  daily_window_started_at: string;
  updated_at: string;
}

export interface VaultRow {
  kind: VaultKind;
  address: string;
  balance_sol: number;
  balance_pulse: number;
  updated_at: string;
}

export interface BotActivity {
  id: string;
  kind: ActivityKind;
  summary: string;
  payload: unknown;
  tx_signature: string | null;
  created_at: string;
}

export interface PriceHistoryRow {
  id: string;
  price_usd: number;
  price_sol: number;
  market_cap_usd: number;
  source: string;
  observed_at: string;
}

export interface TradeTapeRow {
  id: string;
  signature: string;
  wallet: string;
  side: "BUY" | "SELL";
  sol_amount: number;
  pulse_amount: number;
  price_usd: number;
  bot_initiated: boolean;
  observed_at: string;
}

export interface HolderBalance {
  wallet: string;
  balance: number;
  first_seen_at: string;
  updated_at: string;
}

export interface HolderSnapshot {
  id: string;
  tier_id: Tier;
  wallet: string;
  balance: number;
  balance_usd: number;
  snapshot_at: string;
}

export interface WalletStatus {
  wallet: string;
  pioneer: boolean;
  believer: boolean;
  conviction: boolean;
  ascendant: boolean;
  updated_at: string;
}

export interface TierHistoryRow {
  id: string;
  from_tier: Tier | null;
  to_tier: Tier;
  market_cap_usd: number;
  occurred_at: string;
}

export interface DefenseLogRow {
  id: string;
  triggered_at: string;
  drop_percent: number;
  sol_deployed: number;
  pulse_received: number;
  tx_signature: string | null;
  reinforcement_window_ends_at: string;
}

export interface ReinforcementLog {
  id: string;
  defense_id: string;
  wallet: string;
  sol_spent: number;
  observed_at: string;
}

export interface StreakRow {
  wallet: string;
  tier_id: Tier;
  current_days: number;
  started_at: string;
  last_checked_at: string;
}

export interface ActiveVote {
  id: string;
  tier_id: Tier;
  options: readonly VoteOption[];
  decision_pool_sol: number;
  opens_at: string;
  closes_at: string;
  status: VoteStatus;
  winning_option: VoteOption | null;
}

export interface VoteRecord {
  id: string;
  vote_id: string;
  wallet: string;
  option: VoteOption;
  conviction_weight: number;
  signature: string;
  cast_at: string;
}

export interface BountyRow {
  id: string;
  kind: string;
  conditions: unknown;
  reward_sol: number;
  expires_at: string;
  fulfilled_at: string | null;
  fulfilled_wallet: string | null;
  created_at: string;
}

export interface TweetMultiplier {
  id: string;
  wallet: string;
  tweet_url: string;
  tweet_id: string;
  status: "pending" | "active" | "expired" | "rejected";
  likes: number;
  awarded_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface MMState {
  id: 1;
  buy_walls: unknown;
  sell_walls: unknown;
  spread_bps: number;
  inventory_pulse: number;
  inventory_sol: number;
  updated_at: string;
}
