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
      if (b.conditions.kind === "FIRST_5_BUYERS") {
        await fulfillFirstNBuyers(b.id, args.wallet, Number(b.reward_sol), b.conditions.count ?? 5);
      } else {
        await fulfillBounty(b.id, args.wallet, Number(b.reward_sol));
      }
    } catch (err) {
      logger.warn({ err, bounty: b.id }, "bounty fulfillment failed");
    }
  }
}

/**
 * Periodic scan: if a wallet has held ≥ $50K for `duration_hours`, fulfill any
 * open FIRST_50K_HOLD bounty.
 */
export async function evaluateHoldBounties(): Promise<void> {
  const open = await pool.query<{
    id: string;
    conditions: BountyCondition;
    reward_sol: number;
  }>(
    `SELECT id, conditions, reward_sol FROM bounties
       WHERE fulfilled_at IS NULL AND expires_at > NOW()
         AND conditions->>'kind' = 'FIRST_50K_HOLD'`,
  );
  if (open.rows.length === 0) return;

  const state = await pool.query<{ price_usd: number }>(
    "SELECT price_usd FROM token_state WHERE id = 1",
  );
  const price = Number(state.rows[0]?.price_usd ?? 0);
  if (price <= 0) return;

  for (const b of open.rows) {
    const minUsd = b.conditions.min_balance_usd ?? 50_000;
    const dur = b.conditions.duration_hours ?? 24;
    const minTokens = minUsd / price;
    const r = await pool.query<{ wallet: string }>(
      `SELECT wallet FROM holder_balances
         WHERE balance >= $1 AND first_seen_at <= NOW() - ($2 || ' hours')::interval
         ORDER BY first_seen_at ASC LIMIT 1`,
      [minTokens, String(dur)],
    );
    const winner = r.rows[0]?.wallet;
    if (winner) await fulfillBounty(b.id, winner, Number(b.reward_sol));
  }
}

async function fulfillFirstNBuyers(
  bountyId: string,
  wallet: string,
  rewardSol: number,
  cap: number,
): Promise<void> {
  // Use a single UPDATE with a JSONB counter to atomically claim a slot.
  const r = await pool.query<{
    id: string;
    progress: { count: number; buyers: string[] };
  }>(
    `UPDATE bounties
       SET conditions = jsonb_set(
         conditions,
         '{progress}',
         COALESCE(conditions->'progress', '{"count":0,"buyers":[]}'::jsonb) ||
           jsonb_build_object(
             'count', COALESCE((conditions->'progress'->>'count')::int, 0) + 1,
             'buyers', COALESCE(conditions->'progress'->'buyers', '[]'::jsonb) || to_jsonb($2::text)
           )
       )
       WHERE id = $1
         AND fulfilled_at IS NULL
         AND COALESCE((conditions->'progress'->>'count')::int, 0) < $3
         AND NOT (COALESCE(conditions->'progress'->'buyers', '[]'::jsonb) @> to_jsonb($2::text))
       RETURNING id, conditions->'progress' AS progress`,
    [bountyId, wallet, cap],
  );
  const row = r.rows[0];
  if (!row) return;
  const count = Number(row.progress?.count ?? 0);
  await payBounty(bountyId, wallet, rewardSol / cap, /* finalize */ count >= cap);
}

function matchesCondition(
  c: BountyCondition,
  trade: { wallet: string; side: "BUY" | "SELL"; solAmount: number },
) {
  if (c.kind === "NEXT_BIG_BUY") {
    return trade.side === "BUY" && trade.solAmount >= (c.min_sol ?? Infinity);
  }
  if (c.kind === "FIRST_5_BUYERS") {
    // Per-bounty buyer counter is tracked in `progress_count` (see fulfillBounty).
    return trade.side === "BUY";
  }
  // FIRST_50K_HOLD is matched out-of-band by a periodic check, not on each trade.
  return false;
}

async function fulfillBounty(bountyId: string, wallet: string, rewardSol: number): Promise<void> {
  await payBounty(bountyId, wallet, rewardSol, /* finalize */ true);
}

async function payBounty(
  bountyId: string,
  wallet: string,
  rewardSol: number,
  finalize: boolean,
): Promise<void> {
  if (!(await tryReserveDailyBudget(rewardSol))) {
    logger.warn({ bountyId }, "bounty payout skipped — daily cap");
    return;
  }
  const txSig = await sendSolTransfer(wallet, rewardSol);
  if (finalize) {
    await pool.query(
      `UPDATE bounties SET fulfilled_at = NOW(), fulfilled_wallet = $1 WHERE id = $2`,
      [wallet, bountyId],
    );
  }
  await logActivity(
    "BOUNTY_FULFILLED",
    `🎉 Bounty fulfilled by ${wallet} — paid ${formatSol(rewardSol)}`,
    { bountyId, wallet, rewardSol, finalize },
    txSig,
  );
}

async function sendSolTransfer(wallet: string, sol: number): Promise<string | null> {
  if (env.DRY_RUN) return null;
  const payer = loadKeypair("OPERATIONS");
  const conn = primaryConnection();
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const ix = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: new PublicKey(wallet),
    lamports: Math.floor(sol * LAMPORTS_PER_SOL),
  });
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([payer]);
  const sig = await conn.sendTransaction(tx, { maxRetries: 3 });
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}
