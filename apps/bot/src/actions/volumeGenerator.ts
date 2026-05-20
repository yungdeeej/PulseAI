import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { env } from "../config/env.js";
import {
  VOLUME_BOT_MIN_INTERVAL_MS,
  VOLUME_BOT_MAX_INTERVAL_MS,
  VOLUME_BOT_MIN_SOL,
  VOLUME_BOT_MAX_SOL,
} from "../config/constants.js";
import { getBotConfig, getVault, logActivity, tryReserveDailyBudget } from "../db/queries.js";
import { logger } from "../utils/logger.js";
import { buildSwapTx, getQuote, WSOL_MINT } from "../integrations/jupiter.js";
import { loadKeypair, sendBundledSwap, tryLoadKeypair } from "../integrations/wallets.js";
import { formatSol } from "../utils/format.js";

let timer: NodeJS.Timeout | null = null;

function scheduleNext(): void {
  if (timer) clearTimeout(timer);
  const delay = randBetween(VOLUME_BOT_MIN_INTERVAL_MS, VOLUME_BOT_MAX_INTERVAL_MS);
  timer = setTimeout(() => {
    volumeTick().catch((err) => logger.error({ err }, "volume tick failed"));
    scheduleNext();
  }, delay);
}

export function startVolumeGenerator(): void {
  scheduleNext();
  logger.info("volume generator scheduled");
}

export function stopVolumeGenerator(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

export async function volumeTick(): Promise<void> {
  const cfg = await getBotConfig();
  if (cfg.paused || !cfg.volume_gen_enabled) return;
  if (!env.PULSE_MINT_ADDRESS) return;

  const decision = await getVault("DECISION");
  if (!decision || Number(decision.balance_sol) < VOLUME_BOT_MAX_SOL * 2) {
    logger.debug("decision vault too low for volume trade");
    return;
  }

  const sol = randBetween(VOLUME_BOT_MIN_SOL, VOLUME_BOT_MAX_SOL);
  if (!(await tryReserveDailyBudget(sol))) {
    logger.warn("volume trade skipped — daily budget exhausted");
    return;
  }

  const opsKp = tryLoadKeypair("BOT");
  if (!opsKp) {
    logger.warn("BOT keypair missing; skipping volume trade");
    return;
  }
  const side = Math.random() < 0.55 ? "BUY" : "SELL";

  try {
    const lamports = BigInt(Math.floor(sol * LAMPORTS_PER_SOL));
    const quote = await getQuote({
      inputMint: side === "BUY" ? WSOL_MINT : env.PULSE_MINT_ADDRESS,
      outputMint: side === "BUY" ? env.PULSE_MINT_ADDRESS : WSOL_MINT,
      amountAtomic: lamports,
    });
    const { tx } = await buildSwapTx({ quote, userPublicKey: opsKp.publicKey.toBase58() });
    const txSig = await sendBundledSwap({ payer: opsKp, tx, solValue: sol });
    await logActivity(
      "VOLUME_BOT",
      `Volume bot ${side.toLowerCase()} of ${formatSol(sol)} (bot_initiated)`,
      { side, sol },
      txSig,
    );
  } catch (err) {
    logger.warn({ err }, "volume trade failed");
  }
}

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
