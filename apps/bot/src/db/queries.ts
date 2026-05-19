import type {
  ActivityKind,
  ActiveVote,
  BotConfig,
  BotActivity,
  DefenseLogRow,
  HolderBalance,
  StreakRow,
  Tier,
  TierHistoryRow,
  TokenState,
  TradeTapeRow,
  VaultKind,
  VaultRow,
  VoteOption,
  VoteRecord,
  WalletStatus,
} from "@pulse/shared";
import { query, queryOne, withTx } from "./pool.js";

// ----------------------------------------------------------------
// token_state (singleton)
// ----------------------------------------------------------------
export async function getTokenState(): Promise<TokenState | null> {
  const row = await queryOne<TokenState>("SELECT * FROM token_state WHERE id = 1");
  return row;
}

export interface TokenStatePatch {
  price_usd?: number;
  price_sol?: number;
  market_cap_usd?: number;
  holder_count?: number;
  volume_24h_usd?: number;
  trades_per_hour?: number;
  bpm?: number;
  current_tier?: Tier | string;
  mint_address?: string;
  total_supply?: number;
}

export async function patchTokenState(patch: TokenStatePatch): Promise<void> {
  const fields = Object.keys(patch);
  if (fields.length === 0) return;
  const sets = fields.map((f, i) => `${f} = $${i + 1}`);
  const values = fields.map((f) => (patch as Record<string, unknown>)[f]);
  await query(
    `UPDATE token_state
     SET ${sets.join(", ")}, updated_at = NOW()
     WHERE id = 1`,
    values,
  );
}

// ----------------------------------------------------------------
// bot_config (singleton)
// ----------------------------------------------------------------
export async function getBotConfig(): Promise<BotConfig> {
  const row = await queryOne<BotConfig>("SELECT * FROM bot_config WHERE id = 1");
  if (!row) throw new Error("bot_config row missing — did migrations run?");
  return row;
}

export async function patchBotConfig(patch: Partial<BotConfig>): Promise<void> {
  const fields = Object.keys(patch).filter((k) => k !== "id" && k !== "updated_at");
  if (fields.length === 0) return;
  const sets = fields.map((f, i) => `${f} = $${i + 1}`);
  const values = fields.map((f) => (patch as Record<string, unknown>)[f]);
  await query(
    `UPDATE bot_config SET ${sets.join(", ")}, updated_at = NOW() WHERE id = 1`,
    values,
  );
}

export async function tryReserveDailyBudget(amountSol: number): Promise<boolean> {
  // Atomic check-and-increment of daily_sol_deployed. Returns true on reservation.
  return withTx(async (client) => {
    const r = await client.query<BotConfig>("SELECT * FROM bot_config WHERE id = 1 FOR UPDATE");
    const cfg = r.rows[0];
    if (!cfg) throw new Error("bot_config missing");
    const now = new Date();
    const windowStart = new Date(cfg.daily_window_started_at);
    const stale = now.getTime() - windowStart.getTime() > 24 * 3600_000;
    const current = stale ? 0 : Number(cfg.daily_sol_deployed);
    const max = Number(cfg.max_daily_sol_deployed);
    if (current + amountSol > max) return false;
    await client.query(
      `UPDATE bot_config
       SET daily_sol_deployed = $1,
           daily_window_started_at = CASE WHEN $2 THEN NOW() ELSE daily_window_started_at END,
           updated_at = NOW()
       WHERE id = 1`,
      [current + amountSol, stale],
    );
    return true;
  });
}

// ----------------------------------------------------------------
// vaults
// ----------------------------------------------------------------
export async function listVaults(): Promise<VaultRow[]> {
  return query<VaultRow>("SELECT * FROM vaults ORDER BY kind");
}

export async function getVault(kind: VaultKind): Promise<VaultRow | null> {
  return queryOne<VaultRow>("SELECT * FROM vaults WHERE kind = $1", [kind]);
}

export async function updateVaultBalances(
  kind: VaultKind,
  balanceSol: number,
  balancePulse: number,
  address?: string,
): Promise<void> {
  if (address) {
    await query(
      `UPDATE vaults SET balance_sol = $1, balance_pulse = $2, address = $3, updated_at = NOW()
       WHERE kind = $4`,
      [balanceSol, balancePulse, address, kind],
    );
  } else {
    await query(
      `UPDATE vaults SET balance_sol = $1, balance_pulse = $2, updated_at = NOW()
       WHERE kind = $3`,
      [balanceSol, balancePulse, kind],
    );
  }
}

// ----------------------------------------------------------------
// bot_activity
// ----------------------------------------------------------------
export async function logActivity(
  kind: ActivityKind,
  summary: string,
  payload: unknown = {},
  txSignature: string | null = null,
): Promise<BotActivity> {
  const row = await queryOne<BotActivity>(
    `INSERT INTO bot_activity (kind, summary, payload, tx_signature)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (tx_signature) WHERE tx_signature IS NOT NULL
     DO UPDATE SET summary = EXCLUDED.summary
     RETURNING *`,
    [kind, summary, JSON.stringify(payload), txSignature],
  );
  if (!row) throw new Error("logActivity returned no row");
  return row;
}

// ----------------------------------------------------------------
// price_history
// ----------------------------------------------------------------
export async function insertPrice(
  priceUsd: number,
  priceSol: number,
  marketCapUsd: number,
  source = "helius",
): Promise<void> {
  await query(
    `INSERT INTO price_history (price_usd, price_sol, market_cap_usd, source)
     VALUES ($1, $2, $3, $4)`,
    [priceUsd, priceSol, marketCapUsd, source],
  );
}

export interface PriceSample {
  price_usd: number;
  observed_at: string;
}

export async function pricesInWindow(minutes: number): Promise<PriceSample[]> {
  return query<PriceSample>(
    `SELECT price_usd, observed_at FROM price_history
     WHERE observed_at >= NOW() - ($1 || ' minutes')::interval
     ORDER BY observed_at ASC`,
    [String(minutes)],
  );
}

// ----------------------------------------------------------------
// trade_tape
// ----------------------------------------------------------------
export interface InsertTradeArgs {
  signature: string;
  wallet: string;
  side: "BUY" | "SELL";
  solAmount: number;
  pulseAmount: number;
  priceUsd: number;
  botInitiated?: boolean;
  observedAt?: Date;
}

export async function insertTrade(t: InsertTradeArgs): Promise<TradeTapeRow | null> {
  return queryOne<TradeTapeRow>(
    `INSERT INTO trade_tape (signature, wallet, side, sol_amount, pulse_amount, price_usd, bot_initiated, observed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
     ON CONFLICT (signature) DO NOTHING
     RETURNING *`,
    [
      t.signature,
      t.wallet,
      t.side,
      t.solAmount,
      t.pulseAmount,
      t.priceUsd,
      t.botInitiated ?? false,
      t.observedAt ?? null,
    ],
  );
}

export async function tradesPerHour(): Promise<number> {
  const r = await queryOne<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM trade_tape
     WHERE observed_at >= NOW() - INTERVAL '60 minutes'`,
  );
  return Number(r?.c ?? 0);
}

export async function volumeUsd24h(): Promise<number> {
  // Each trade row stores price_usd as the per-PULSE price at trade time.
  // 24h volume = sum of pulse_amount × price_usd over the last 24 hours.
  const r = await queryOne<{ v: number }>(
    `SELECT COALESCE(SUM(pulse_amount * price_usd), 0) AS v
       FROM trade_tape
       WHERE observed_at >= NOW() - INTERVAL '24 hours'`,
  );
  return Number(r?.v ?? 0);
}

// ----------------------------------------------------------------
// holder_balances
// ----------------------------------------------------------------
export async function upsertHolderTrade(
  wallet: string,
  delta: number,
  observedAt: Date,
): Promise<HolderBalance> {
  const row = await queryOne<HolderBalance>(
    `INSERT INTO holder_balances (wallet, balance, first_seen_at, updated_at)
     VALUES ($1, GREATEST(0::numeric, $2::numeric), $3, $3)
     ON CONFLICT (wallet) DO UPDATE
       SET balance = GREATEST(0::numeric, holder_balances.balance + $2::numeric),
           updated_at = $3
     RETURNING *`,
    [wallet, delta, observedAt],
  );
  if (!row) throw new Error("upsertHolderTrade failed");
  return row;
}

export async function getHolderBalance(wallet: string): Promise<HolderBalance | null> {
  return queryOne<HolderBalance>("SELECT * FROM holder_balances WHERE wallet = $1", [wallet]);
}

export async function countActiveHolders(minBalance = 0): Promise<number> {
  const r = await queryOne<{ c: number }>(
    "SELECT COUNT(*)::int AS c FROM holder_balances WHERE balance > $1",
    [minBalance],
  );
  return Number(r?.c ?? 0);
}

export async function holdersWithBalanceAtLeast(min: number): Promise<HolderBalance[]> {
  return query<HolderBalance>(
    "SELECT * FROM holder_balances WHERE balance >= $1 ORDER BY balance DESC",
    [min],
  );
}

// ----------------------------------------------------------------
// holder_snapshots
// ----------------------------------------------------------------
export async function insertSnapshot(
  tier: Tier,
  rows: { wallet: string; balance: number; balance_usd: number }[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  rows.forEach((r, i) => {
    const base = i * 4;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    values.push(tier, r.wallet, r.balance, r.balance_usd);
  });
  const r = await query<{ id: string }>(
    `INSERT INTO holder_snapshots (tier_id, wallet, balance, balance_usd)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (tier_id, wallet) DO NOTHING
     RETURNING id`,
    values,
  );
  return r.length;
}

// ----------------------------------------------------------------
// wallet_status
// ----------------------------------------------------------------
export async function flagWalletStatus(
  wallet: string,
  flag: "pioneer" | "believer" | "conviction" | "ascendant",
): Promise<void> {
  await query(
    `INSERT INTO wallet_status (wallet, ${flag}) VALUES ($1, TRUE)
     ON CONFLICT (wallet) DO UPDATE SET ${flag} = TRUE, updated_at = NOW()`,
    [wallet],
  );
}

export async function getWalletStatus(wallet: string): Promise<WalletStatus | null> {
  return queryOne<WalletStatus>("SELECT * FROM wallet_status WHERE wallet = $1", [wallet]);
}

// ----------------------------------------------------------------
// tier_history
// ----------------------------------------------------------------
export async function insertTierTransition(
  fromTier: Tier | null,
  toTier: Tier,
  mcap: number,
): Promise<TierHistoryRow> {
  const row = await queryOne<TierHistoryRow>(
    `INSERT INTO tier_history (from_tier, to_tier, market_cap_usd)
     VALUES ($1, $2, $3) RETURNING *`,
    [fromTier === null ? null : tierEnum(fromTier), tierEnum(toTier), mcap],
  );
  if (!row) throw new Error("insertTierTransition failed");
  return row;
}

function tierEnum(tier: Tier): string {
  return ["DISCOVERY", "IGNITION", "MOMENTUM", "CONVICTION", "ASCENSION"][tier]!;
}

export async function lastTierTransition(): Promise<TierHistoryRow | null> {
  return queryOne<TierHistoryRow>(
    "SELECT * FROM tier_history ORDER BY occurred_at DESC LIMIT 1",
  );
}

// ----------------------------------------------------------------
// defense_log
// ----------------------------------------------------------------
export async function insertDefense(
  dropPercent: number,
  solDeployed: number,
  pulseReceived: number,
  txSignature: string | null,
  reinforcementWindowEndsAt: Date,
): Promise<DefenseLogRow> {
  const row = await queryOne<DefenseLogRow>(
    `INSERT INTO defense_log (drop_percent, sol_deployed, pulse_received, tx_signature, reinforcement_window_ends_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [dropPercent, solDeployed, pulseReceived, txSignature, reinforcementWindowEndsAt],
  );
  if (!row) throw new Error("insertDefense failed");
  return row;
}

export async function lastDefense(): Promise<DefenseLogRow | null> {
  return queryOne<DefenseLogRow>("SELECT * FROM defense_log ORDER BY triggered_at DESC LIMIT 1");
}

export async function activeReinforcementWindow(): Promise<DefenseLogRow | null> {
  return queryOne<DefenseLogRow>(
    `SELECT * FROM defense_log
     WHERE reinforcement_window_ends_at > NOW()
     ORDER BY triggered_at DESC LIMIT 1`,
  );
}

// ----------------------------------------------------------------
// reinforcement_log
// ----------------------------------------------------------------
export async function logReinforcement(
  defenseId: string,
  wallet: string,
  solSpent: number,
): Promise<void> {
  await query(
    `INSERT INTO reinforcement_log (defense_id, wallet, sol_spent)
     VALUES ($1, $2, $3)
     ON CONFLICT (defense_id, wallet) DO UPDATE
       SET sol_spent = reinforcement_log.sol_spent + EXCLUDED.sol_spent`,
    [defenseId, wallet, solSpent],
  );
}

export async function reinforcementCount(wallet: string): Promise<number> {
  const r = await queryOne<{ c: number }>(
    "SELECT COUNT(*)::int AS c FROM reinforcement_log WHERE wallet = $1",
    [wallet],
  );
  return Number(r?.c ?? 0);
}

// ----------------------------------------------------------------
// streaks
// ----------------------------------------------------------------
export async function getStreak(wallet: string): Promise<StreakRow | null> {
  return queryOne<StreakRow>("SELECT * FROM streaks WHERE wallet = $1", [wallet]);
}

export async function upsertStreak(
  wallet: string,
  tier: Tier,
  currentDays: number,
): Promise<void> {
  await query(
    `INSERT INTO streaks (wallet, tier_id, current_days, last_checked_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (wallet) DO UPDATE
       SET tier_id = EXCLUDED.tier_id,
           current_days = EXCLUDED.current_days,
           last_checked_at = NOW()`,
    [wallet, tierEnum(tier), currentDays],
  );
}

export async function breakStreak(wallet: string): Promise<void> {
  await query(
    `UPDATE streaks SET current_days = 0, started_at = NOW(), last_checked_at = NOW()
     WHERE wallet = $1`,
    [wallet],
  );
}

export async function topStreaks(limit = 10): Promise<StreakRow[]> {
  return query<StreakRow>(
    "SELECT * FROM streaks ORDER BY current_days DESC LIMIT $1",
    [limit],
  );
}

// ----------------------------------------------------------------
// votes
// ----------------------------------------------------------------
export async function openVoteRow(
  tier: Tier,
  options: readonly VoteOption[],
  poolSol: number,
  closesAt: Date,
): Promise<ActiveVote> {
  const row = await queryOne<ActiveVote>(
    `INSERT INTO active_votes (tier_id, options, decision_pool_sol, closes_at)
     VALUES ($1, $2::jsonb, $3, $4)
     RETURNING *`,
    [tierEnum(tier), JSON.stringify(options), poolSol, closesAt],
  );
  if (!row) throw new Error("openVoteRow failed");
  return row;
}

export async function getActiveVote(): Promise<ActiveVote | null> {
  return queryOne<ActiveVote>(
    `SELECT * FROM active_votes WHERE status = 'open' ORDER BY opens_at DESC LIMIT 1`,
  );
}

export async function getVote(id: string): Promise<ActiveVote | null> {
  return queryOne<ActiveVote>("SELECT * FROM active_votes WHERE id = $1", [id]);
}

export async function insertVoteRecord(
  voteId: string,
  wallet: string,
  option: VoteOption,
  convictionWeight: number,
  signature: string,
): Promise<VoteRecord> {
  const row = await queryOne<VoteRecord>(
    `INSERT INTO vote_records (vote_id, wallet, option, conviction_weight, signature)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (vote_id, wallet) DO UPDATE
       SET option = EXCLUDED.option,
           conviction_weight = EXCLUDED.conviction_weight,
           signature = EXCLUDED.signature,
           cast_at = NOW()
     RETURNING *`,
    [voteId, wallet, option, convictionWeight, signature],
  );
  if (!row) throw new Error("insertVoteRecord failed");
  return row;
}

export async function tallyVoteRecords(
  voteId: string,
): Promise<Record<string, number>> {
  const rows = await query<{ option: string; total: number }>(
    `SELECT option, SUM(conviction_weight)::float AS total
       FROM vote_records WHERE vote_id = $1 GROUP BY option`,
    [voteId],
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.option] = Number(r.total);
  return out;
}

export async function closeVote(
  voteId: string,
  winningOption: string | null,
  status: "closed" | "executed" | "failed" = "closed",
): Promise<void> {
  await query(
    "UPDATE active_votes SET status = $1, winning_option = $2 WHERE id = $3",
    [status, winningOption, voteId],
  );
}

export async function archiveVote(
  voteId: string,
  tallies: Record<string, number>,
  executionTx: string | null = null,
): Promise<void> {
  await query(
    `INSERT INTO vote_history (id, tier_id, options, tallies, decision_pool_sol, opens_at, closed_at, winning_option, execution_tx)
     SELECT id, tier_id, options, $2::jsonb, decision_pool_sol, opens_at, NOW(), winning_option, $3
       FROM active_votes WHERE id = $1
     ON CONFLICT (id) DO UPDATE
       SET tallies = EXCLUDED.tallies,
           closed_at = NOW(),
           winning_option = EXCLUDED.winning_option,
           execution_tx = EXCLUDED.execution_tx`,
    [voteId, JSON.stringify(tallies), executionTx],
  );
}
