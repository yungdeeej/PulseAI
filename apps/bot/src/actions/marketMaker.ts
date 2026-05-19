import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import {
  getBotConfig,
  getTokenState,
  getVault,
  logActivity,
  tryReserveDailyBudget,
} from "../db/queries.js";
import {
  MM_BUY_OFFSETS_PCT,
  MM_SELL_OFFSETS_PCT,
} from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { buildSwapTx, getQuote, WSOL_MINT } from "../integrations/jupiter.js";
import { loadKeypair, sendBundledSwap } from "../integrations/wallets.js";
import { formatSol } from "../utils/format.js";
import { postTelegram } from "../integrations/telegram.js";

interface Wall {
  side: "buy" | "sell";
  offset_pct: number;
  price: number;
  size_sol: number;
}

/**
 * Active market maker — Tier 2+.
 *
 * Memecoin liquidity post-pump.fun-graduation lives in a Raydium AMM pool,
 * not on an order book. There's no Phoenix/OpenBook book with depth to
 * place limit orders against. So instead of trying to seed orderbook walls
 * — which would just sit idle — the MM works as **tiered reactive defense**:
 *
 *   - Publishes the desired wall plan to `mm_state` for dashboard display.
 *   - When price drops through each buy-wall level (-2 / -5 / -10 %) we
 *     execute a sized buy from the Defense Vault, with a per-wall cooldown
 *     so a single dump doesn't drain the whole budget at once.
 *   - Sell walls (+3 / +7 / +15 %) are display-only until the bot accrues
 *     PULSE inventory worth selling; once it does, the same pattern applies
 *     in reverse, with rallies into each level triggering a partial sell.
 *
 * This keeps the bot's actions reactive and on-chain native, without
 * depending on a thinly-traded orderbook venue.
 */

const COOLDOWN_MS_PER_WALL = 10 * 60_000; // 10 minutes
const lastFireByOffset = new Map<number, number>();

export async function mmTick(): Promise<void> {
  const cfg = await getBotConfig();
  if (cfg.paused || !cfg.mm_enabled) return;

  const state = await getTokenState();
  if (!state || Number(state.price_usd) <= 0) return;
  const refPrice = Number(state.price_usd);

  const defense = await getVault("DEFENSE");
  if (!defense) return;
  const defenseSol = Number(defense.balance_sol);
  const inventoryPulse = Number(defense.balance_pulse);

  const buyWalls: Wall[] = MM_BUY_OFFSETS_PCT.map((offset, i) => ({
    side: "buy",
    offset_pct: offset,
    price: refPrice * (1 + offset / 100),
    size_sol: defenseSol * walletFraction(i),
  }));
  const sellWalls: Wall[] = MM_SELL_OFFSETS_PCT.map((offset, i) => ({
    side: "sell",
    offset_pct: offset,
    price: refPrice * (1 + offset / 100),
    size_sol: inventoryPulse * walletFraction(i),
  }));

  await pool.query(
    `UPDATE mm_state SET buy_walls = $1::jsonb, sell_walls = $2::jsonb,
                          inventory_pulse = $3, inventory_sol = $4,
                          spread_bps = 150, updated_at = NOW()
       WHERE id = 1`,
    [JSON.stringify(buyWalls), JSON.stringify(sellWalls), inventoryPulse, defenseSol],
  );

  // Reactive buyback: trigger on a recent price sample, not just the live
  // token_state, so we don't double-fire while the same drop persists.
  const recent = await pool.query<{ low: number }>(
    `SELECT MIN(price_usd)::float AS low
       FROM price_history
       WHERE observed_at >= NOW() - INTERVAL '10 minutes'`,
  );
  const recentLow = Number(recent.rows[0]?.low ?? refPrice);

  for (const wall of buyWalls) {
    if (recentLow > wall.price) continue;
    if (wall.size_sol <= 0) continue;
    const last = lastFireByOffset.get(wall.offset_pct) ?? 0;
    if (Date.now() - last < COOLDOWN_MS_PER_WALL) continue;
    try {
      await fireMmBuy(wall);
      lastFireByOffset.set(wall.offset_pct, Date.now());
    } catch (err) {
      logger.warn({ err, wall }, "mm buy wall failed");
    }
  }
}

function walletFraction(idx: number): number {
  // 50% closest wall, 30% middle, 20% farthest.
  return [0.5, 0.3, 0.2][idx] ?? 0;
}

async function fireMmBuy(wall: Wall): Promise<void> {
  // Each wall fires a much smaller buyback than the catastrophic -25%
  // defense trigger — typically ~5-15% of the wall's notional size — so we
  // can absorb multiple smaller dips without exhausting the vault.
  const deploySol = Math.min(wall.size_sol * 0.1, 1.0); // cap each tick at 1 SOL
  if (deploySol <= 0.01) return;
  if (!env.PULSE_MINT_ADDRESS) return;

  const reserved = await tryReserveDailyBudget(deploySol);
  if (!reserved) {
    logger.warn({ wall }, "mm buy skipped — daily cap");
    return;
  }

  let txSig: string | null = null;
  let pulseReceived = 0;
  try {
    const kp = loadKeypair("DEFENSE");
    const lamports = BigInt(Math.floor(deploySol * LAMPORTS_PER_SOL));
    const quote = await getQuote({
      inputMint: WSOL_MINT,
      outputMint: env.PULSE_MINT_ADDRESS,
      amountAtomic: lamports,
    });
    const decimals = Number(env.PULSE_DECIMALS ?? 6);
    pulseReceived = Number(quote.outAmount) / 10 ** decimals;
    const { tx } = await buildSwapTx({ quote, userPublicKey: kp.publicKey.toBase58() });
    txSig = await sendBundledSwap({ payer: kp, tx, solValue: deploySol });
  } catch (err) {
    if (env.DRY_RUN) {
      logger.info({ err, wall, deploySol }, "[DRY-RUN] mm buy simulation only");
    } else {
      throw err;
    }
  }

  const summary = `📐 MM buy at ${wall.offset_pct}% — deployed ${formatSol(deploySol)} from Defense Vault.`;
  await logActivity(
    "MM_UPDATE",
    summary,
    { wall, deploySol, pulseReceived },
    txSig,
  );
  await postTelegram(summary);
}
