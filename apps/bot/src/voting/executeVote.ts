import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { env } from "../config/env.js";
import { getVote, logActivity, archiveVote, closeVote, tallyVoteRecords } from "../db/queries.js";
import { buildSwapTx, getQuote, WSOL_MINT } from "../integrations/jupiter.js";
import { loadKeypair, sendBundledSwap } from "../integrations/wallets.js";
import { burnTokens } from "../utils/spl.js";
import { logger } from "../utils/logger.js";
import { formatSol } from "../utils/format.js";
import { postTelegram } from "../integrations/telegram.js";
import { narrate } from "../features/narrator.js";
import { amendClause, type Constitution } from "../features/constitution.js";
import { pool } from "../db/pool.js";
import type { VoteOption } from "@pulse/shared";

interface VoteForExec {
  id: string;
  decision_pool_sol: number | string;
  amendment?: { clause: keyof Constitution; value: unknown; rationale?: string } | null;
}
type Handler = (vote: VoteForExec) => Promise<{ txSig: string | null; summary: string }>;

const HANDLERS: Record<string, Handler> = {
  "Defend Chart": handleDefendChart,
  "Split Rewards": handleSplitRewards,
  "Ratify Amendment": handleRatifyAmendment,
  "Reject Amendment": handleRejectAmendment,
};

export async function executeVote(voteId: string, winningOption: string): Promise<void> {
  const vote = await getVote(voteId);
  if (!vote) throw new Error(`vote ${voteId} missing`);

  // Pull the proposed amendment off the vote row if it's a constitutional one.
  const amendmentRow = await pool.query<{ amendment: VoteForExec["amendment"] }>(
    `SELECT amendment FROM active_votes WHERE id = $1`,
    [voteId],
  );
  const voteForExec: VoteForExec = {
    id: vote.id,
    decision_pool_sol: vote.decision_pool_sol,
    amendment: amendmentRow.rows[0]?.amendment ?? null,
  };

  const handler = HANDLERS[winningOption];
  if (!handler) throw new Error(`no executor for option "${winningOption}"`);

  logger.info({ voteId, winningOption, isAmendment: !!voteForExec.amendment }, "executing vote");
  const { txSig, summary } = await handler(voteForExec);
  await closeVote(voteId, winningOption, "executed");
  const tallies = await tallyVoteRecords(voteId);
  await archiveVote(voteId, tallies, txSig);
  await logActivity("VOTE_EXECUTED", summary, { voteId, winningOption, txSig }, txSig);
  await postTelegram(summary);
  narrate("vote_executed", { winning_option: winningOption, summary });
}

// ----------------------------------------------------------------
// Defend Chart — buy $PULSE with Decision Vault SOL via Jupiter and burn it.
async function handleDefendChart(vote: VoteForExec) {
  const sol = Number(vote.decision_pool_sol);
  if (sol <= 0 || !env.PULSE_MINT_ADDRESS) {
    return { txSig: null, summary: `Defend Chart skipped: no funds or mint.` };
  }
  if (env.DRY_RUN) {
    return { txSig: null, summary: `🛡️ [DRY-RUN] Defend Chart ${formatSol(sol)} → buy + burn` };
  }
  const payer = loadKeypair("BOT");
  const lamports = BigInt(Math.floor(sol * LAMPORTS_PER_SOL));
  const quote = await getQuote({
    inputMint: WSOL_MINT,
    outputMint: env.PULSE_MINT_ADDRESS,
    amountAtomic: lamports,
  });
  const { tx } = await buildSwapTx({
    quote,
    userPublicKey: payer.publicKey.toBase58(),
  });
  const swapSig = await sendBundledSwap({ payer, tx, solValue: sol });

  const burnAmountAtomic = BigInt(quote.outAmount);
  const burnSig = await burnTokens({
    payer,
    mint: new PublicKey(env.PULSE_MINT_ADDRESS),
    amountAtomic: burnAmountAtomic,
  });

  const decimals = Number(env.PULSE_DECIMALS ?? 6);
  const burnedTokens = Number(burnAmountAtomic) / 10 ** decimals;
  await logActivity("BUY_BURN", `Defend Chart: bought + burned ${Math.round(burnedTokens).toLocaleString("en-US")} $PULSE`, {
    sol, burnedTokens,
  }, swapSig ?? burnSig);
  return {
    txSig: swapSig ?? burnSig,
    summary: `🛡️ Defend Chart executed — ${formatSol(sol)} bought, ${Math.round(burnedTokens).toLocaleString("en-US")} $PULSE burned.`,
  };
}

// Split Rewards — distribute Decision Vault SOL proportionally to holders
// weighted by conviction score.
async function handleSplitRewards(vote: VoteForExec) {
  const { airdropFromDecisionVault } = await import("../actions/rewards.js");
  const sol = Number(vote.decision_pool_sol);
  if (env.DRY_RUN) {
    return { txSig: null, summary: `🪂 [DRY-RUN] Split Rewards ${formatSol(sol)} from Decision Vault` };
  }
  const result = await airdropFromDecisionVault(sol);
  return {
    txSig: result.signatures.find((s): s is string => !!s) ?? null,
    summary: `🪂 Split Rewards: ${formatSol(result.total_sol)} → ${result.recipients} holders.`,
  };
}

// ----------------------------------------------------------------
// Constitutional amendments — the meta-vote that governs the
// autonomous AI's own rules. The amendment payload sits on the vote
// row; "Ratify Amendment" applies it, "Reject Amendment" no-ops.
async function handleRatifyAmendment(vote: VoteForExec) {
  if (!vote.amendment) return { txSig: null, summary: "Amendment ratified but payload missing." };
  const result = await amendClause({
    clause: vote.amendment.clause,
    value: vote.amendment.value,
    amendedBy: `vote:${vote.id}`,
  });
  if (!result) {
    return { txSig: null, summary: `📜 Amendment rejected by validator (bad value shape).` };
  }
  await logActivity("CONSTITUTION_AMENDED", `📜 Constitution amended: ${result.clause} → ${JSON.stringify(result.value)}`, {
    clause: result.clause, value: result.value, version: result.version,
  });
  return {
    txSig: null,
    summary: `📜 Constitution amended: ${result.clause} → ${JSON.stringify(result.value)} (v${result.version}).`,
  };
}

async function handleRejectAmendment(_: VoteForExec) {
  return { txSig: null, summary: `📜 Constitution unchanged — amendment rejected.` };
}

export function isExecutable(opt: VoteOption | string): boolean {
  return opt in HANDLERS;
}
