import {
  breakStreak,
  getHolderBalance,
  getStreak,
  getTokenState,
  upsertStreak,
} from "../db/queries.js";
import { TIERS, tierForMarketCap } from "@pulse/shared";
import { daysBetween } from "../utils/timewindow.js";
import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";

/**
 * Recompute one wallet's streak after a trade.
 *  - If balance now < tier threshold → break.
 *  - Otherwise increment streak based on last_checked_at.
 */
export async function updateStreakOnTrade(wallet: string): Promise<void> {
  const balance = await getHolderBalance(wallet);
  if (!balance) return;
  const state = await getTokenState();
  if (!state) return;
  const price = Number(state.price_usd);
  if (price <= 0) return;

  const balanceUsd = Number(balance.balance) * price;
  const mcap = Number(state.market_cap_usd);
  const currentTier = tierForMarketCap(mcap);
  const minHoldUsd = currentTier.snapshotMinUsdBalance || TIERS[1]!.snapshotMinUsdBalance;

  const existing = await getStreak(wallet);

  if (balanceUsd < minHoldUsd) {
    if (existing && existing.current_days > 0) await breakStreak(wallet);
    return;
  }

  if (!existing) {
    await upsertStreak(wallet, currentTier.id, 1);
    return;
  }

  const since = daysBetween(existing.last_checked_at, new Date());
  const increment = Math.floor(since);
  const newDays = Number(existing.current_days) + increment;
  if (increment > 0) await upsertStreak(wallet, currentTier.id, newDays);
}

/**
 * Daily cron: recalculate all active streaks.
 */
export async function recomputeAllStreaks(): Promise<void> {
  const state = await getTokenState();
  if (!state) return;
  const price = Number(state.price_usd);
  if (price <= 0) return;
  const mcap = Number(state.market_cap_usd);
  const tier = tierForMarketCap(mcap);
  const minHoldUsd = tier.snapshotMinUsdBalance || TIERS[1]!.snapshotMinUsdBalance;
  const minTokens = minHoldUsd / price;

  const r = await pool.query<{ wallet: string }>(
    "SELECT wallet FROM holder_balances WHERE balance >= $1",
    [minTokens],
  );

  let touched = 0;
  for (const row of r.rows) {
    const existing = await getStreak(row.wallet);
    const newDays = Number(existing?.current_days ?? 0) + 1;
    await upsertStreak(row.wallet, tier.id, newDays);
    touched++;
  }
  logger.info({ touched }, "daily streak refresh complete");
}
