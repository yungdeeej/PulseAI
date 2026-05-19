import { env } from "../config/env.js";
import { insertPrice, patchTokenState } from "../db/queries.js";
import { evaluateTierTransition } from "../actions/tier.js";
import { processTradeEvent } from "./tradeIngest.js";
import { logger } from "../utils/logger.js";

/**
 * DRY-RUN synthetic price + trade generator. Produces a deterministic-ish walk
 * across the full tier ladder so pre-launch demos can show every transition.
 *
 * Time progresses faster when DRY_RUN_TIME_SCALE > 1: e.g. scale=60 means each
 * real second represents 1 simulated minute.
 */
let timer: NodeJS.Timeout | null = null;
let cursorMcap = 1_000;

export function startDryRunGenerator(): void {
  if (!env.DRY_RUN) return;
  const scale = Number(env.DRY_RUN_TIME_SCALE ?? 1);
  if (scale <= 0) return;
  const baseIntervalMs = Math.max(250, Math.floor(5_000 / scale));
  logger.info({ baseIntervalMs, scale }, "starting dry-run generator");
  timer = setInterval(tick, baseIntervalMs);
}

export function stopDryRunGenerator(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick(): Promise<void> {
  try {
    // Random walk biased upward so we eventually cross every tier.
    const drift = 1 + (Math.random() - 0.4) * 0.05;
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
