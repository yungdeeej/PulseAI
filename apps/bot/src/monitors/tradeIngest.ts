import {
  activeReinforcementWindow,
  insertTrade,
  logActivity,
  logReinforcement,
  patchTokenState,
  pricesInWindow,
  tradesPerHour,
  upsertHolderTrade,
  volumeUsd24h,
} from "../db/queries.js";
import { evaluateBountyForTrade } from "../actions/bounty.js";
import { isBotWallet } from "../integrations/botWallets.js";
import { evaluateTierTransition } from "../actions/tier.js";
import { updateStreakOnTrade } from "../features/streak.js";
import { logger } from "../utils/logger.js";
import { computeBpm, pctChange } from "../utils/math.js";
import { NOTABLE_BUY_SOL } from "../config/constants.js";
import { postTelegram } from "../integrations/telegram.js";
import { formatSol, formatUsd, shortAddress } from "../utils/format.js";

export interface ParsedTrade {
  signature: string;
  wallet: string;
  side: "BUY" | "SELL";
  solAmount: number;
  pulseAmount: number;
  observedAt: Date;
  botInitiated?: boolean;
}

export async function processTradeEvent(t: ParsedTrade): Promise<void> {
  if (t.pulseAmount <= 0 || t.solAmount <= 0) return;
  const priceUsdEst = await estimatePriceUsd(t);

  const botInitiated = (t.botInitiated ?? false) || isBotWallet(t.wallet);
  const inserted = await insertTrade({
    signature: t.signature,
    wallet: t.wallet,
    side: t.side,
    solAmount: t.solAmount,
    pulseAmount: t.pulseAmount,
    priceUsd: priceUsdEst,
    botInitiated,
    observedAt: t.observedAt,
  });
  if (!inserted) {
    // Duplicate signature — already processed.
    return;
  }

  const delta = t.side === "BUY" ? t.pulseAmount : -t.pulseAmount;
  await upsertHolderTrade(t.wallet, delta, t.observedAt);

  const tph = await tradesPerHour();
  const vol24h = await volumeUsd24h();
  const supply = Number(process.env.PULSE_TOTAL_SUPPLY ?? 1_000_000_000);
  await patchTokenState({
    price_usd: priceUsdEst,
    market_cap_usd: priceUsdEst * supply,
    trades_per_hour: tph,
    bpm: computeBpm(tph),
    volume_24h_usd: vol24h,
  });

  // Reinforcement window: any buy during an active window counts.
  if (t.side === "BUY") {
    const window = await activeReinforcementWindow();
    if (window) {
      await logReinforcement(window.id, t.wallet, t.solAmount);
    }
  }

  await updateStreakOnTrade(t.wallet);
  await evaluateTierTransition(priceUsdEst);
  await evaluateBountyForTrade({ wallet: t.wallet, side: t.side, solAmount: t.solAmount });

  if (t.side === "BUY" && t.solAmount >= NOTABLE_BUY_SOL && !botInitiated) {
    const msg = `🐳 Notable buy: ${shortAddress(t.wallet)} bought ${formatUsd(
      t.solAmount * (await solUsd()),
    )} of $PULSE (${formatSol(t.solAmount)}).`;
    await logActivity("NOTABLE_BUY", msg, { ...t });
    await postTelegram(msg);
  }
}

async function estimatePriceUsd(t: ParsedTrade): Promise<number> {
  const sol = await solUsd();
  if (t.pulseAmount === 0) return 0;
  const pricePerPulseSol = t.solAmount / t.pulseAmount;
  return pricePerPulseSol * sol;
}

let lastSolUsd = 150;
let lastSolUsdAt = 0;
async function solUsd(): Promise<number> {
  if (Date.now() - lastSolUsdAt < 60_000) return lastSolUsd;
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
    );
    if (res.ok) {
      const data = (await res.json()) as { solana?: { usd?: number } };
      if (data.solana?.usd) {
        lastSolUsd = data.solana.usd;
        lastSolUsdAt = Date.now();
      }
    }
  } catch (err) {
    logger.warn({ err }, "solUsd fetch failed; reusing cached value");
  }
  return lastSolUsd;
}

export async function recentDropPercent(minutes: number): Promise<number> {
  const samples = await pricesInWindow(minutes);
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) return 0;
  return pctChange(Number(first.price_usd), Number(last.price_usd));
}
