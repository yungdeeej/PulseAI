import { pool } from "../db/pool.js";
import { getBotConfig, getTokenState, getVault } from "../db/queries.js";
import { MM_BUY_OFFSETS_PCT, MM_SELL_OFFSETS_PCT } from "../config/constants.js";
import { logger } from "../utils/logger.js";

interface Wall {
  side: "buy" | "sell";
  offset_pct: number;
  price: number;
  size_sol: number;
}

/**
 * Active market maker — Tier 2+. Maintains buy walls at -2/-5/-10% from Defense
 * Vault and sell walls at +3/+7/+15% from held PULSE inventory.
 *
 * For the bot's first deployment we treat MM as a public state surface: we
 * compute the desired walls and publish them to mm_state so the dashboard can
 * render them. The actual on-chain order placement (Phoenix / OpenBook orders
 * or seeded LP positions) is left as a follow-up integration once the team
 * picks a venue; the placement hook is `placeWall` below.
 */
export async function mmTick(): Promise<void> {
  const cfg = await getBotConfig();
  if (cfg.paused || !cfg.mm_enabled) return;

  const state = await getTokenState();
  if (!state || Number(state.price_usd) <= 0) return;

  const defense = await getVault("DEFENSE");
  if (!defense) return;
  const defenseSol = Number(defense.balance_sol);
  const inventoryPulse = Number(defense.balance_pulse);

  const buyWalls: Wall[] = MM_BUY_OFFSETS_PCT.map((offset, i) => ({
    side: "buy",
    offset_pct: offset,
    price: Number(state.price_usd) * (1 + offset / 100),
    size_sol: defenseSol * walletFraction(i),
  }));
  const sellWalls: Wall[] = MM_SELL_OFFSETS_PCT.map((offset, i) => ({
    side: "sell",
    offset_pct: offset,
    price: Number(state.price_usd) * (1 + offset / 100),
    size_sol: inventoryPulse * walletFraction(i),
  }));

  await pool.query(
    `UPDATE mm_state SET buy_walls = $1::jsonb, sell_walls = $2::jsonb,
                          inventory_pulse = $3, inventory_sol = $4,
                          spread_bps = 150, updated_at = NOW()
       WHERE id = 1`,
    [JSON.stringify(buyWalls), JSON.stringify(sellWalls), inventoryPulse, defenseSol],
  );

  for (const w of [...buyWalls, ...sellWalls]) {
    await placeWall(w).catch((err) =>
      logger.warn({ err, wall: w }, "wall placement failed"),
    );
  }
}

function walletFraction(idx: number): number {
  // 50% closest, 30% middle, 20% farthest.
  return [0.5, 0.3, 0.2][idx] ?? 0;
}

async function placeWall(wall: Wall): Promise<void> {
  // Venue-specific order placement is wired here once the team selects
  // a market venue (Phoenix order book, OpenBook v2, seeded Raydium LP).
  // For now the wall is only published to mm_state for dashboard display.
  logger.debug({ wall }, "mm wall ready (dashboard only — venue not wired)");
}
