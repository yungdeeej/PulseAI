import { env } from "../config/env.js";
import { insertPrice, patchTokenState } from "../db/queries.js";
import { evaluateTierTransition } from "../actions/tier.js";
import { processTradeEvent } from "./tradeIngest.js";
import { fetchDexScreenerPrice } from "../integrations/dexscreener.js";
import { logger } from "../utils/logger.js";

/**
 * DRY-RUN synthetic price + trade generator.
 *
 * Seeds the starting market cap from DexScreener (real on-chain data) so the
 * dashboard reflects the actual token price. A real-price refresh runs every
 * 60 seconds; between refreshes the cursor drifts ±5 % so the sparkline moves.
 */
let timer: NodeJS.Timeout | null = null;
let realPriceTimer: NodeJS.Timeout | null = null;
let cursorMcap = 1_000;

export function startDryRunGenerator(): void {
  if (!env.DRY_RUN) return;
  const scale = Number(env.DRY_RUN_TIME_SCALE ?? 1);
  if (scale <= 0) return;
  const baseIntervalMs = Math.max(250, Math.floor(5_000 / scale));
  logger.info({ baseIntervalMs, scale }, "starting dry-run generator");

  // Seed from DexScreener immediately, then refresh every 60 s
  seedFromDexScreener();
  realPriceTimer = setInterval(seedFromDexScreener, 60_000);

  timer = setInterval(tick, baseIntervalMs);
}

export function stopDryRunGenerator(): void {
  if (timer) clearInterval(timer);
  if (realPriceTimer) clearInterval(realPriceTimer);
  timer = null;
  realPriceTimer = null;
}

async function seedFromDexScreener(): Promise<void> {
  try {
    const price = await fetchDexScreenerPrice();
    if (!price || !price.market_cap_usd) return;
    cursorMcap = price.market_cap_usd;
    await insertPrice(price.price_usd, price.price_sol, price.market_cap_usd, "dexscreener");
    await patchTokenState({
      price_usd: price.price_usd,
      price_sol: price.price_sol,
      market_cap_usd: price.market_cap_usd,
      mint_address: env.PULSE_MINT_ADDRESS,
    });
    await evaluateTierTransition(price.market_cap_usd);
    logger.info({ market_cap_usd: price.market_cap_usd }, "seeded price from dexscreener");
  } catch (err) {
    logger.warn({ err }, "dexscreener seed failed");
  }
}

async function tick(): Promise<void> {
  try {
    // Small random walk around the real price so the sparkline animates
    const drift = 1 + (Math.random() - 0.48) * 0.015;
    cursorMcap = Math.max(500, cursorMcap * drift);

    const supply = Number(env.PULSE_TOTAL_SUPPLY ?? 1_000_000_000);
    const priceUsd = cursorMcap / supply;
    const priceSol = priceUsd / 150;

    await insertPrice(priceUsd, priceSol, cursorMcap, "dryrun");
    await patchTokenState({ price_usd: priceUsd, price_sol: priceSol, market_cap_usd: cursorMcap });

    // Occasionally fabricate a trade so the trade tape and holder balances move.
    if (Math.random() < 0.5) {
      const wallet = `DryRun${Math.floor(Math.random() * 1000).toString().padStart(4, "0")}`;
      const sol = 0.05 + Math.random() * 4;
      const pulseAmount = sol / priceSol;
      await processTradeEvent({
        signature: `dry-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
        wallet,
        side: Math.random() < 0.6 ? "BUY" : "SELL",
        solAmount: sol,
        pulseAmount,
        observedAt: new Date(),
        botInitiated: true,
      });
    }

    await evaluateTierTransition(cursorMcap);
  } catch (err) {
    logger.warn({ err }, "dry-run tick failed");
  }
}
