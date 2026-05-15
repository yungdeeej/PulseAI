import { pool } from "../db/pool.js";
import {
  getTokenState,
  logActivity,
  tryReserveDailyBudget,
} from "../db/queries.js";
import { logger } from "../utils/logger.js";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { primaryConnection } from "../integrations/helius.js";
import { env } from "../config/env.js";
import { loadKeypair } from "../integrations/wallets.js";
import { formatSol } from "../utils/format.js";

export type BountyKind = "NEXT_BIG_BUY" | "FIRST_50K_HOLD" | "FIRST_5_BUYERS";

interface BountyCondition {
  kind: BountyKind;
  min_sol?: number;
  min_balance_usd?: number;
  duration_hours?: number;
  count?: number;
  window_minutes?: number;
}

const RECENT_BOUNTY_WINDOW_MS = 4 * 3600_000;

/**
 * Decide whether to open a new bounty based on current chain state. Heuristics:
 *  - low volume hour after a tier crossing
 *  - just after a defense trigger
 * Capped at one open bounty at a time.
 */
export async function maybeOpenBounty(): Promise<void> {
  const open = await pool.query<{ id: string }>(
    "SELECT id FROM bounties WHERE fulfilled_at IS NULL AND expires_at > NOW() LIMIT 1",
  );
  if (open.rowCount && open.rowCount > 0) return;

  const recent = await pool.query<{ created_at: string }>(
    `SELECT created_at FROM bounties ORDER BY created_at DESC LIMIT 1`,
  );
  const last = recent.rows[0];
  if (last && Date.now() - new Date(last.created_at).getTime() < RECENT_BOUNTY_WINDOW_MS) return;

  const state = await getTokenState();
  if (!state) return;

  // Trigger if TPH < 5 (slow stretch) and there's an active reinforcement window.
  if (Number(state.trades_per_hour) > 5) return;

  await openBounty({
    kind: "NEXT_BIG_BUY",
    rewardSol: 1,
    conditions: { kind: "NEXT_BIG_BUY", min_sol: 5 },
    expiresAt: new Date(Date.now() + 2 * 3600_000),
  });
}

export async function openBounty(args: {
  kind: BountyKind;
  rewardSol: number;
  conditions: BountyCondition;
  expiresAt: Date;
}): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO bounties (kind, conditions, reward_sol, expires_at)
     VALUES ($1, $2::jsonb, $3, $4) RETURNING id`,
    [args.kind, JSON.stringify(args.conditions), args.rewardSol, args.expiresAt],
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error("bounty insert failed");
  await logActivity(
    "BOUNTY_OPENED",
    `🎯 Bounty open: ${args.kind} reward ${formatSol(args.rewardSol)} expires ${args.expiresAt.toISOString()}`,
    { id, ...args },
  );
  return id;
}

/**
 * Called from trade ingest when conditions might match an open bounty.
 */
export async function evaluateBountyForTrade(args: {
  wallet: string;
  side: "BUY" | "SELL";
  solAmount: number;
}): Promise<void> {
  const open = await pool.query<{
    id: string;
    kind: string;
    conditions: BountyCondition;
    reward_sol: number;
  }>(
    "SELECT id, kind, conditions, reward_sol FROM bounties WHERE fulfilled_at IS NULL AND expires_at > NOW()",
  );
  for (const b of open.rows) {
    if (!matchesCondition(b.conditions, args)) continue;
    try {
      await fulfillBounty(b.id, args.wallet, Number(b.reward_sol));
    } catch (err) {
      logger.warn({ err, bounty: b.id }, "bounty fulfillment failed");
    }
  }
}

function matchesCondition(c: BountyCondition, trade: { side: "BUY" | "SELL"; solAmount: number }) {
  if (c.kind === "NEXT_BIG_BUY") {
    return trade.side === "BUY" && trade.solAmount >= (c.min_sol ?? Infinity);
  }
  return false;
}

async function fulfillBounty(bountyId: string, wallet: string, rewardSol: number): Promise<void> {
  if (!(await tryReserveDailyBudget(rewardSol))) {
    logger.warn({ bountyId }, "bounty fulfillment skipped — daily cap");
    return;
  }
  let txSig: string | null = null;
  if (!env.DRY_RUN) {
    const payer = loadKeypair("OPERATIONS");
    const conn = primaryConnection();
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const ix = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: new PublicKey(wallet),
      lamports: Math.floor(rewardSol * LAMPORTS_PER_SOL),
    });
    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([payer]);
    txSig = await conn.sendTransaction(tx, { maxRetries: 3 });
    await conn.confirmTransaction(txSig, "confirmed");
  }
  await pool.query(
    `UPDATE bounties SET fulfilled_at = NOW(), fulfilled_wallet = $1 WHERE id = $2`,
    [wallet, bountyId],
  );
  await logActivity(
    "BOUNTY_FULFILLED",
    `🎉 Bounty fulfilled by ${wallet} — paid ${formatSol(rewardSol)}`,
    { bountyId, wallet, rewardSol },
    txSig,
  );
}
