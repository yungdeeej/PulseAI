import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { env } from "../config/env.js";
import {
  REWARDS_BATCH_SIZE,
  REWARDS_MIN_BALANCE,
  REWARDS_MIN_HOLD_DAYS,
} from "../config/constants.js";
import {
  getTokenState,
  getVault,
  logActivity,
  reinforcementCount,
  getWalletStatus,
  tryReserveDailyBudget,
} from "../db/queries.js";
import { pool } from "../db/pool.js";
import { convictionScore } from "@pulse/shared";
import { daysBetween } from "../utils/timewindow.js";
import { logger } from "../utils/logger.js";
import { primaryConnection } from "../integrations/helius.js";
import { loadKeypair } from "../integrations/wallets.js";
import { formatSol } from "../utils/format.js";
import { postTelegram } from "../integrations/telegram.js";

export interface RewardComputation {
  wallet: string;
  weight: number;
  share: number; // 0..1
  payoutSol: number;
}

/**
 * Split Rewards voting outcome: redistribute the Decision Vault's pool
 * proportionally to qualifying holders, weighted by Conviction Score.
 * Signed by the BOT keypair, which controls the Decision Vault per spec.
 */
export async function airdropFromDecisionVault(poolSol: number): Promise<{
  recipients: number;
  total_sol: number;
  signatures: (string | null)[];
}> {
  const vault = await getVault("DECISION");
  if (!vault) throw new Error("DECISION vault missing");
  const pool_ = poolSol ?? Number(vault.balance_sol);
  if (pool_ <= 0) {
    logger.info("decision vault empty; skipping airdrop");
    return { recipients: 0, total_sol: 0, signatures: [] };
  }

  const allocations = await computeAllocations(pool_);
  if (allocations.length === 0) {
    logger.info("no eligible recipients for split rewards");
    return { recipients: 0, total_sol: 0, signatures: [] };
  }

  const totalDeploy = allocations.reduce((s, a) => s + a.payoutSol, 0);
  if (!(await tryReserveDailyBudget(totalDeploy))) {
    await logActivity(
      "SAFETY_HALT",
      `Split Rewards skipped — daily SOL budget would be exceeded (${formatSol(totalDeploy)}).`,
      { totalDeploy },
    );
    return { recipients: 0, total_sol: 0, signatures: [] };
  }

  const summary = await sendBatched(allocations);
  await logActivity(
    "AIRDROP",
    `🪂 Split Rewards: ${formatSol(totalDeploy)} → ${allocations.length} wallets across ${summary.batches} batches.`,
    {
      total_sol: totalDeploy,
      recipients: allocations.length,
      batches: summary.batches,
      signatures: summary.signatures,
    },
  );

  const post = `🪂 Split Rewards distributed: ${formatSol(totalDeploy)} → ${allocations.length} holders.`;
  await postTelegram(post);
  return { recipients: allocations.length, total_sol: totalDeploy, signatures: summary.signatures };
}

export async function computeAllocations(poolSol: number): Promise<RewardComputation[]> {
  const state = await getTokenState();
  if (!state || Number(state.price_usd) <= 0) return [];

  const r = await pool.query<{ wallet: string; balance: number; first_seen_at: string }>(
    `SELECT wallet, balance, first_seen_at FROM holder_balances WHERE balance >= $1`,
    [REWARDS_MIN_BALANCE],
  );

  const now = new Date();
  const weighted: { wallet: string; weight: number }[] = [];

  for (const h of r.rows) {
    const holdDays = daysBetween(h.first_seen_at, now);
    if (holdDays < REWARDS_MIN_HOLD_DAYS) continue;

    const status = await getWalletStatus(h.wallet);
    const flags = [] as Parameters<typeof convictionScore>[0]["statusFlags"];
    if (status?.pioneer) (flags as string[]).push("PIONEER");
    if (status?.believer) (flags as string[]).push("BELIEVER");
    if (status?.conviction) (flags as string[]).push("CONVICTION");
    if (status?.ascendant) (flags as string[]).push("ASCENDANT");

    const rCount = await reinforcementCount(h.wallet);
    const tweetActive = await walletHasActiveTweetBonus(h.wallet);

    const weight = convictionScore({
      balance: Number(h.balance),
      holdDays,
      tierStreakDays: await walletStreakDays(h.wallet),
      reinforcementCount: rCount,
      statusFlags: flags,
      tweetMultiplierActive: tweetActive,
    });
    if (weight > 0) weighted.push({ wallet: h.wallet, weight });
  }

  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  if (totalWeight === 0) return [];

  return weighted.map((w) => ({
    wallet: w.wallet,
    weight: w.weight,
    share: w.weight / totalWeight,
    payoutSol: (w.weight / totalWeight) * poolSol,
  }));
}

async function walletStreakDays(wallet: string): Promise<number> {
  const r = await pool.query<{ current_days: number }>(
    "SELECT current_days FROM streaks WHERE wallet = $1",
    [wallet],
  );
  return Number(r.rows[0]?.current_days ?? 0);
}

async function walletHasActiveTweetBonus(wallet: string): Promise<boolean> {
  const r = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM tweet_multipliers
       WHERE wallet = $1 AND status = 'active' AND expires_at > NOW()`,
    [wallet],
  );
  return Number(r.rows[0]?.c ?? 0) > 0;
}

interface BatchSummary {
  batches: number;
  signatures: (string | null)[];
}

async function sendBatched(allocations: RewardComputation[]): Promise<BatchSummary> {
  const signatures: (string | null)[] = [];
  if (env.DRY_RUN) {
    logger.info({ recipients: allocations.length }, "[DRY-RUN] skipping airdrop transfer");
    return { batches: Math.ceil(allocations.length / REWARDS_BATCH_SIZE), signatures };
  }

  const payer = loadKeypair("BOT");
  const conn = primaryConnection();

  const batches = chunk(allocations, REWARDS_BATCH_SIZE);
  for (const batch of batches) {
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const instructions = batch.map((a) =>
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: new PublicKey(a.wallet),
        lamports: Math.floor(a.payoutSol * LAMPORTS_PER_SOL),
      }),
    );
    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([payer]);
    try {
      const sig = await conn.sendTransaction(tx, { maxRetries: 3 });
      await conn.confirmTransaction(sig, "confirmed");
      signatures.push(sig);
    } catch (err) {
      logger.error({ err }, "airdrop batch failed");
      signatures.push(null);
    }
  }
  return { batches: batches.length, signatures };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
