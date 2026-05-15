import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { env } from "../config/env.js";
import {
  DEFENSE_COOLDOWN_MS,
  DEFENSE_DEPLOY_FRACTION,
  DEFENSE_TRIGGER_DROP_PCT,
  DEFENSE_WINDOW_MINUTES,
  REINFORCEMENT_WINDOW_MINUTES,
} from "../config/constants.js";
import {
  getBotConfig,
  getVault,
  insertDefense,
  lastDefense,
  logActivity,
  tryReserveDailyBudget,
} from "../db/queries.js";
import { recentDropPercent } from "../monitors/tradeIngest.js";
import { logger } from "../utils/logger.js";
import { buildSwapTx, getQuote, WSOL_MINT } from "../integrations/jupiter.js";
import { loadKeypair, sendBundledSwap } from "../integrations/wallets.js";
import { formatSol, pct } from "../utils/format.js";
import { postTelegram } from "../integrations/telegram.js";
import { postTweet } from "../integrations/twitter.js";

let inFlight = false;

export async function defenseTick(): Promise<void> {
  if (inFlight) return;
  const cfg = await getBotConfig();
  if (cfg.paused) return;
  if (!cfg.defense_enabled) return;

  const dropPct = await recentDropPercent(DEFENSE_WINDOW_MINUTES);
  if (dropPct > DEFENSE_TRIGGER_DROP_PCT) return;

  const last = await lastDefense();
  if (last && Date.now() - new Date(last.triggered_at).getTime() < DEFENSE_COOLDOWN_MS) {
    logger.debug({ last: last.triggered_at }, "defense cooldown active");
    return;
  }

  inFlight = true;
  try {
    await fireDefense(dropPct);
  } catch (err) {
    logger.error({ err }, "defense firing failed");
  } finally {
    inFlight = false;
  }
}

async function fireDefense(dropPct: number): Promise<void> {
  const vault = await getVault("DEFENSE");
  if (!vault || !env.PULSE_MINT_ADDRESS) {
    logger.warn("defense vault or mint not configured");
    return;
  }

  const deploySol = Number(vault.balance_sol) * DEFENSE_DEPLOY_FRACTION;
  if (deploySol <= 0) {
    logger.warn("defense vault empty");
    return;
  }

  const reserved = await tryReserveDailyBudget(deploySol);
  if (!reserved) {
    await logActivity(
      "SAFETY_HALT",
      `Defense skipped — daily SOL budget exceeded (would deploy ${formatSol(deploySol)}).`,
      { dropPct, deploySol },
    );
    return;
  }

  const windowEnds = new Date(Date.now() + REINFORCEMENT_WINDOW_MINUTES * 60_000);

  let txSig: string | null = null;
  let pulseReceived = 0;
  try {
    const defenseKp = loadKeypair("DEFENSE");
    const amountLamports = BigInt(Math.floor(deploySol * LAMPORTS_PER_SOL));
    const quote = await getQuote({
      inputMint: WSOL_MINT,
      outputMint: env.PULSE_MINT_ADDRESS,
      amountAtomic: amountLamports,
    });
    const decimals = Number(env.PULSE_DECIMALS ?? 6);
    pulseReceived = Number(quote.outAmount) / 10 ** decimals;
    const { tx } = await buildSwapTx({
      quote,
      userPublicKey: defenseKp.publicKey.toBase58(),
    });
    txSig = await sendBundledSwap({
      payer: defenseKp,
      tx,
      solValue: deploySol,
    });
  } catch (err) {
    if (env.DRY_RUN) {
      logger.warn({ err }, "[DRY-RUN] defense swap simulation only");
    } else {
      logger.error({ err }, "defense swap failed");
      throw err;
    }
  }

  const row = await insertDefense(dropPct, deploySol, pulseReceived, txSig, windowEnds);
  const summary = `🛡️ Defense triggered. ${pct(dropPct)} drop. Deployed ${formatSol(
    deploySol,
  )} from Defense Vault. Reinforcement window open ${REINFORCEMENT_WINDOW_MINUTES}m.`;
  await logActivity("DEFENSE", summary, {
    defenseId: row.id,
    dropPct,
    deploySol,
    pulseReceived,
    reinforcementWindowEndsAt: windowEnds.toISOString(),
  }, txSig);

  await postTweet(summary);
  await postTelegram(summary);
}
