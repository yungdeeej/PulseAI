import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { env } from "../config/env.js";
import { getVault, getVote, logActivity, archiveVote, closeVote, tallyVoteRecords } from "../db/queries.js";
import { buildSwapTx, getQuote, WSOL_MINT } from "../integrations/jupiter.js";
import { loadKeypair, sendBundledSwap } from "../integrations/wallets.js";
import { primaryConnection } from "../integrations/helius.js";
import { burnTokens } from "../utils/spl.js";
import { logger } from "../utils/logger.js";
import { formatSol } from "../utils/format.js";
import { postTelegram } from "../integrations/telegram.js";
import type { VoteOption } from "@pulse/shared";

interface VoteForExec {
  id: string;
  decision_pool_sol: number | string;
  target_mint?: string | null;
}
type Handler = (vote: VoteForExec) => Promise<{ txSig: string | null; summary: string }>;

const HANDLERS: Record<string, Handler> = {
  "Buy + Burn": handleBuyBurn,
  "Holder Airdrop": handleHolderAirdrop,
  "Reinforce MM": handleReinforceMM,
  "Treasury Trade": handleTreasuryTrade,
  "Pulse Wars": handlePulseWars,
  "Hold": handleHold,
  "Hold & Compound": handleHold,
  "Permanent Strategy": handlePermanentStrategy,
};

export async function executeVote(voteId: string, winningOption: string): Promise<void> {
  const vote = await getVote(voteId);
  if (!vote) throw new Error(`vote ${voteId} missing`);
  const handler = HANDLERS[winningOption];
  if (!handler) throw new Error(`no executor for option "${winningOption}"`);

  logger.info({ voteId, winningOption }, "executing vote");
  const { txSig, summary } = await handler(vote);
  await closeVote(voteId, winningOption, "executed");
  const tallies = await tallyVoteRecords(voteId);
  await archiveVote(voteId, tallies, txSig);
  await logActivity("VOTE_EXECUTED", summary, { voteId, winningOption, txSig }, txSig);
  await postTelegram(summary);
}

// ----------------------------------------------------------------
async function handleBuyBurn(vote: { decision_pool_sol: number | string }) {
  const sol = Number(vote.decision_pool_sol);
  if (sol <= 0 || !env.PULSE_MINT_ADDRESS) {
    return { txSig: null, summary: `Buy + Burn skipped: no funds or mint.` };
  }
  if (env.DRY_RUN) {
    return { txSig: null, summary: `🔥 [DRY-RUN] Buy + Burn ${formatSol(sol)} → incinerator` };
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

  // SPL burn: actual on-chain reduction of $PULSE supply held by the bot wallet.
  const burnAmountAtomic = BigInt(quote.outAmount);
  const burnSig = await burnTokens({
    payer,
    mint: new PublicKey(env.PULSE_MINT_ADDRESS),
    amountAtomic: burnAmountAtomic,
  });

  const decimals = Number(env.PULSE_DECIMALS ?? 6);
  const burnedTokens = Number(burnAmountAtomic) / 10 ** decimals;
  return {
    txSig: swapSig ?? burnSig,
    summary: `🔥 Buy + Burn executed — ${formatSol(sol)} bought, ${Math.round(burnedTokens).toLocaleString("en-US")} $PULSE burned.`,
  };
}

async function handleHolderAirdrop(vote: VoteForExec) {
  const { airdropFromDecisionVault } = await import("../actions/rewards.js");
  const sol = Number(vote.decision_pool_sol);
  if (env.DRY_RUN) {
    return { txSig: null, summary: `🪂 [DRY-RUN] Holder Airdrop ${formatSol(sol)} from Decision Vault` };
  }
  const result = await airdropFromDecisionVault(sol);
  return {
    txSig: result.signatures.find((s): s is string => !!s) ?? null,
    summary: `🪂 Holder Airdrop: ${formatSol(result.total_sol)} → ${result.recipients} holders.`,
  };
}

async function handleReinforceMM(vote: { decision_pool_sol: number | string }) {
  const sol = Number(vote.decision_pool_sol);
  if (env.DRY_RUN) return { txSig: null, summary: `🛡️ [DRY-RUN] Reinforce MM ${formatSol(sol)}` };
  const payer = loadKeypair("BOT");
  const defense = await getVault("DEFENSE");
  if (!defense?.address) throw new Error("DEFENSE vault address not set");
  const conn = primaryConnection();
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const ix = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: new PublicKey(defense.address),
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
  return { txSig: sig, summary: `🛡️ Reinforce MM — ${formatSol(sol)} deposited into Defense Vault` };
}

async function handleTreasuryTrade(vote: VoteForExec) {
  const target = vote.target_mint;
  if (!target) {
    return {
      txSig: null,
      summary: `🎯 Treasury Trade reserved — POST /admin/votes/${vote.id}/target to set the mint.`,
    };
  }
  if (env.DRY_RUN) {
    return {
      txSig: null,
      summary: `🎯 [DRY-RUN] Treasury Trade of ${formatSol(Number(vote.decision_pool_sol))} → ${target}`,
    };
  }
  const payer = loadKeypair("BOT");
  const lamports = BigInt(Math.floor(Number(vote.decision_pool_sol) * LAMPORTS_PER_SOL));
  const quote = await getQuote({ inputMint: WSOL_MINT, outputMint: target, amountAtomic: lamports });
  const { tx } = await buildSwapTx({ quote, userPublicKey: payer.publicKey.toBase58() });
  const sig = await sendBundledSwap({ payer, tx, solValue: Number(vote.decision_pool_sol) });
  return { txSig: sig, summary: `🎯 Treasury Trade executed — ${formatSol(Number(vote.decision_pool_sol))} into ${target.slice(0, 6)}…` };
}

async function handlePulseWars(vote: VoteForExec) {
  // Pulse Wars: buy supply of a target competitor memecoin and burn it.
  const target = vote.target_mint;
  if (!target) {
    return {
      txSig: null,
      summary: `⚔️ Pulse Wars reserved — POST /admin/votes/${vote.id}/target to set the mint.`,
    };
  }
  const sol = Number(vote.decision_pool_sol);
  if (env.DRY_RUN) {
    return { txSig: null, summary: `⚔️ [DRY-RUN] Pulse Wars: would buy + burn ${formatSol(sol)} of ${target}` };
  }
  const payer = loadKeypair("BOT");
  const lamports = BigInt(Math.floor(sol * LAMPORTS_PER_SOL));
  const quote = await getQuote({ inputMint: WSOL_MINT, outputMint: target, amountAtomic: lamports });
  const { tx } = await buildSwapTx({ quote, userPublicKey: payer.publicKey.toBase58() });
  const swapSig = await sendBundledSwap({ payer, tx, solValue: sol });
  const burnSig = await burnTokens({
    payer,
    mint: new PublicKey(target),
    amountAtomic: BigInt(quote.outAmount),
  });
  return {
    txSig: swapSig ?? burnSig,
    summary: `⚔️ Pulse Wars executed — ${formatSol(sol)} of ${target.slice(0, 6)}… bought and burned.`,
  };
}

async function handleHold(_: unknown) {
  return { txSig: null, summary: "💎 Treasury holds — funds compound into the next tier pool." };
}

async function handlePermanentStrategy(_: unknown) {
  return {
    txSig: null,
    summary: "♾️ Permanent strategy elected — config flag set; manual review required.",
  };
}

export function isExecutable(opt: VoteOption | string): boolean {
  return opt in HANDLERS;
}
