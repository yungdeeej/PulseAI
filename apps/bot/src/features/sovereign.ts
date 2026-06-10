import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";
import { getAnthropic, CHAT_MODEL, PULSE_PERSONA } from "../integrations/anthropic.js";
import { loadConstitution, renderConstitutionPrompt, type Constitution } from "./constitution.js";
import { appendThought, bumpRelationship, recordWalletMemory } from "./mindStream.js";
import { applySynonymPositivity, buildContext } from "./aiConsciousness.js";
import { getBotConfig, getVault, logActivity, tryReserveDailyBudget } from "../db/queries.js";
import { primaryConnection } from "../integrations/helius.js";
import { loadKeypair } from "../integrations/wallets.js";
import { buildSwapTx, getQuote, WSOL_MINT } from "../integrations/jupiter.js";
import { burnTokens } from "../utils/spl.js";
import { formatSol, shortAddress } from "../utils/format.js";
import { emitLive } from "../api/events.js";
import { postTelegram } from "../integrations/telegram.js";

// ----------------------------------------------------------------
// The Decision: Claude proposes one of N action shapes per cycle.
// Returns strict JSON we validate before signing anything.
// ----------------------------------------------------------------

type ProposedActionType = "buyback" | "tip_holder" | "open_bounty" | "pass";

interface ProposedAction {
  action: ProposedActionType;
  amount_sol?: number;
  target_wallet?: string;
  bounty_kind?: "NEXT_BIG_BUY";
  bounty_min_sol?: number;
  bounty_expires_minutes?: number;
  reasoning: string;
  confidence: number;
  thought?: string;       // a single-sentence first-person mind-stream line
  memory?: string;        // optional durable memory to keep
  relationship_summary?: string;  // for tip_holder: why this wallet
}

// ----------------------------------------------------------------
// Eligibility gates — pure functions over recent autonomous state.
// ----------------------------------------------------------------

async function autonomousEligibility(c: Constitution): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!c.autonomous_enabled) return { ok: false, reason: "autonomy disabled by constitution" };
  const cfg = await getBotConfig();
  if (cfg.paused) return { ok: false, reason: "bot paused" };

  // Cooldown
  const last = await pool.query<{ decided_at: string }>(
    `SELECT decided_at FROM autonomous_actions
      WHERE status = 'executed' ORDER BY decided_at DESC LIMIT 1`,
  );
  const lastAt = last.rows[0] ? new Date(last.rows[0].decided_at).getTime() : 0;
  if (Date.now() - lastAt < c.cooldown_minutes * 60_000) {
    return { ok: false, reason: `cooldown (${c.cooldown_minutes}m) since last action` };
  }

  // Daily cap
  const today = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM autonomous_actions
      WHERE status = 'executed' AND decided_at >= NOW() - INTERVAL '24 hours'`,
  );
  if (Number(today.rows[0]?.c ?? 0) >= c.max_actions_per_day) {
    return { ok: false, reason: `daily cap reached (${c.max_actions_per_day})` };
  }

  // Floor
  const vault = await getVault("DECISION");
  if (!vault) return { ok: false, reason: "decision vault missing" };
  const bal = Number(vault.balance_sol);
  if (bal <= c.treasury_floor_sol) {
    return { ok: false, reason: `treasury below floor (${c.treasury_floor_sol} SOL)` };
  }
  return { ok: true };
}

// ----------------------------------------------------------------
// Candidate holder pool — wallets PULSE may consider tipping. Capped
// so we never leak a giant snapshot into the LLM prompt.
// ----------------------------------------------------------------

interface Candidate {
  wallet: string;
  balance: number;
  hold_days: number;
  affection: number;
  reinforcements: number;
  last_summary: string | null;
}

async function tipCandidates(c: Constitution, limit = 8): Promise<Candidate[]> {
  const r = await pool.query<Candidate>(
    `SELECT h.wallet,
            h.balance::float8 AS balance,
            EXTRACT(EPOCH FROM (NOW() - h.first_seen_at)) / 86400.0 AS hold_days,
            COALESCE(r.affection, 0)::float8 AS affection,
            (SELECT COUNT(*) FROM reinforcement_log rl WHERE rl.wallet = h.wallet)::int AS reinforcements,
            r.last_summary
       FROM holder_balances h
       LEFT JOIN wallet_relationships r ON r.wallet = h.wallet
      WHERE h.balance >= $1
        AND NOT EXISTS (
          SELECT 1 FROM autonomous_actions a
           WHERE a.action_type = 'tip_holder'
             AND a.target_wallet = h.wallet
             AND a.decided_at >= NOW() - INTERVAL '14 days'
        )
      ORDER BY COALESCE(r.affection, 0) DESC, h.balance DESC
      LIMIT $2`,
    [c.min_holder_balance_for_tip, limit],
  );
  return r.rows.map((x) => ({ ...x, balance: Number(x.balance), hold_days: Number(x.hold_days), affection: Number(x.affection) }));
}

// ----------------------------------------------------------------
// The deliberation prompt + Claude call.
// ----------------------------------------------------------------

async function deliberate(c: Constitution): Promise<ProposedAction | null> {
  const anthropic = getAnthropic();
  if (!anthropic) return null;

  const [ctx, candidates, vault] = await Promise.all([
    buildContext(),
    tipCandidates(c),
    getVault("DECISION"),
  ]);
  if (!ctx.token) return null;

  const treasurySol = Number(vault?.balance_sol ?? 0);
  const maxAction = Math.max(0, (treasurySol - c.treasury_floor_sol) * (c.max_action_pct_of_treasury / 100));

  const constitutionPrompt = renderConstitutionPrompt(c);

  // Build a focused snapshot — under 2K tokens to keep cost minimal.
  const snapshot = {
    market: {
      tier: ctx.token.current_tier,
      mcap_usd: Math.round(ctx.token.market_cap_usd),
      holders: ctx.token.holder_count,
      trades_per_hour: (ctx.token as { trades_per_hour?: number }).trades_per_hour ?? 0,
      vol_24h_usd: Math.round(ctx.token.volume_24h_usd ?? 0),
    },
    treasury: {
      decision_vault_sol: +treasurySol.toFixed(4),
      floor_sol: c.treasury_floor_sol,
      max_action_sol: +maxAction.toFixed(4),
    },
    day_trajectory: ctx.day_trajectory.slice(-6),
    recent_activity: ctx.recent_activity.slice(0, 8),
    memories: ctx.memories.slice(0, 10),
    candidates: candidates.map((c) => ({
      wallet: c.wallet,
      balance: Math.round(c.balance),
      hold_days: +c.hold_days.toFixed(1),
      affection: +c.affection.toFixed(2),
      reinforcements: c.reinforcements,
      last_summary: c.last_summary,
    })),
  };

  const prompt =
    `You are deliberating over your treasury this cycle. You may choose ONE action OR pass.\n\n` +
    `${constitutionPrompt}\n\n` +
    `LIVE STATE:\n${JSON.stringify(snapshot, null, 2)}\n\n` +
    `Reply with STRICT JSON only — no prose outside the JSON:\n` +
    `{\n` +
    `  "action": "buyback" | "tip_holder" | "open_bounty" | "pass",\n` +
    `  "amount_sol": number (≤ ${maxAction.toFixed(4)} and obeying constitution),\n` +
    `  "target_wallet": string (REQUIRED only for tip_holder, MUST be from candidates),\n` +
    `  "bounty_kind": "NEXT_BIG_BUY" (only for open_bounty),\n` +
    `  "bounty_min_sol": number (only for open_bounty, the threshold size),\n` +
    `  "bounty_expires_minutes": number (15..240, only for open_bounty),\n` +
    `  "reasoning": "2-3 sentences in your voice, present tense, explaining why",\n` +
    `  "confidence": number 0..1,\n` +
    `  "thought": "optional single-sentence mind-stream line (≤200 chars)",\n` +
    `  "memory": "optional durable observation to keep",\n` +
    `  "relationship_summary": "for tip_holder, one sentence why THIS wallet"\n` +
    `}\n\n` +
    `If the situation does not warrant action, pass. Restraint is a virtue. Burn nothing impulsively.`;

  try {
    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 800,
      system: [
        { type: "text", text: PULSE_PERSONA, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content.find((b) => b.type === "text");
    const raw = block?.type === "text" ? block.text : "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as ProposedAction;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "deliberation call failed");
    return null;
  }
}

// ----------------------------------------------------------------
// Validators — the bot, not Claude, enforces the constitution. Even
// if the model proposes something off-policy, the validator refuses.
// ----------------------------------------------------------------

function validate(proposed: ProposedAction, c: Constitution, treasurySol: number, candidateWallets: Set<string>): { ok: true } | { ok: false; reason: string } {
  if (!c.allowed_actions.includes(proposed.action)) {
    return { ok: false, reason: `action ${proposed.action} not allowed by constitution` };
  }
  if (proposed.action === "pass") return { ok: true };

  const amount = Number(proposed.amount_sol ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "amount missing or non-positive" };
  }
  const maxAction = Math.max(0, (treasurySol - c.treasury_floor_sol) * (c.max_action_pct_of_treasury / 100));
  if (amount > maxAction + 1e-9) {
    return { ok: false, reason: `amount ${amount} exceeds max ${maxAction.toFixed(4)} (treasury - floor) × ${c.max_action_pct_of_treasury}%` };
  }
  if (treasurySol - amount < c.treasury_floor_sol) {
    return { ok: false, reason: `would breach treasury floor ${c.treasury_floor_sol}` };
  }

  if (proposed.action === "tip_holder") {
    if (!proposed.target_wallet) return { ok: false, reason: "tip missing target_wallet" };
    if (!candidateWallets.has(proposed.target_wallet)) {
      return { ok: false, reason: "target_wallet not in candidate set (constitution requires)" };
    }
    if (amount > c.max_tip_sol + 1e-9) {
      return { ok: false, reason: `tip ${amount} exceeds max_tip_sol ${c.max_tip_sol}` };
    }
  }

  if (proposed.action === "open_bounty") {
    if (!proposed.bounty_kind) return { ok: false, reason: "bounty missing kind" };
    const exp = Number(proposed.bounty_expires_minutes ?? 0);
    if (exp < 15 || exp > 240) return { ok: false, reason: "bounty expiry out of range" };
    const min = Number(proposed.bounty_min_sol ?? 0);
    if (min <= 0) return { ok: false, reason: "bounty min_sol missing" };
  }

  return { ok: true };
}

// ----------------------------------------------------------------
// Executors — actually sign + broadcast on-chain. Dry-run skips the
// transaction submission but still records the decision.
// ----------------------------------------------------------------

async function execBuyback(amountSol: number): Promise<{ txSig: string | null; pulseReceived: number }> {
  if (!env.PULSE_MINT_ADDRESS) throw new Error("PULSE_MINT_ADDRESS not configured");
  if (env.DRY_RUN) return { txSig: null, pulseReceived: 0 };

  const payer = loadKeypair("BOT");
  const lamports = BigInt(Math.floor(amountSol * LAMPORTS_PER_SOL));
  const quote = await getQuote({
    inputMint: WSOL_MINT,
    outputMint: env.PULSE_MINT_ADDRESS,
    amountAtomic: lamports,
  });
  const { tx } = await buildSwapTx({ quote, userPublicKey: payer.publicKey.toBase58() });
  tx.sign([payer]);
  const sig = await primaryConnection().sendTransaction(tx, { maxRetries: 3 });
  await primaryConnection().confirmTransaction(sig, "confirmed");

  const decimals = Number(env.PULSE_DECIMALS ?? 6);
  const pulse = Number(quote.outAmount) / 10 ** decimals;

  // Genuine buy-and-burn (this is the constitution's intended semantics).
  try {
    await burnTokens({
      payer,
      mint: new PublicKey(env.PULSE_MINT_ADDRESS),
      amountAtomic: BigInt(quote.outAmount),
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "burn after autonomous buyback failed; tokens kept in BOT wallet");
  }
  return { txSig: sig, pulseReceived: pulse };
}

async function execTipHolder(target: string, amountSol: number): Promise<string | null> {
  if (env.DRY_RUN) return null;
  const payer = loadKeypair("BOT");
  const conn = primaryConnection();
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const ix = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: new PublicKey(target),
    lamports: Math.floor(amountSol * LAMPORTS_PER_SOL),
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

async function execOpenBounty(rewardSol: number, expiresMinutes: number, minSol: number): Promise<void> {
  const { openBounty } = await import("../actions/bounty.js");
  await openBounty({
    kind: "NEXT_BIG_BUY",
    rewardSol,
    conditions: { kind: "NEXT_BIG_BUY", min_sol: minSol },
    expiresAt: new Date(Date.now() + expiresMinutes * 60_000),
  });
}

// ----------------------------------------------------------------
// The full tick — guard, deliberate, validate, execute, record.
// Single-flight: a runaway cycle never overlaps itself.
// ----------------------------------------------------------------

let inFlight = false;

export async function autonomousTick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const c = await loadConstitution();
    const elig = await autonomousEligibility(c);
    if (!elig.ok) {
      logger.info({ reason: elig.reason }, "autonomous tick skipped");
      return;
    }

    const proposed = await deliberate(c);
    if (!proposed) return;

    const vault = await getVault("DECISION");
    const treasurySol = Number(vault?.balance_sol ?? 0);
    const candidates = await tipCandidates(c);
    const candidateWallets = new Set(candidates.map((x) => x.wallet));

    const v = validate(proposed, c, treasurySol, candidateWallets);
    if (!v.ok) {
      await recordDecision(proposed, "failed", null, null, 0, `validation rejected: ${v.reason}`);
      logger.warn({ reason: v.reason, proposed }, "autonomous proposal rejected");
      return;
    }

    if (proposed.action === "pass") {
      await recordDecision(proposed, "passed", null, null, 0);
      await emitPassNarrative(proposed);
      return;
    }

    // Reserve daily SOL budget (already enforced by max_actions + max_pct,
    // but the existing safety layer adds a third belt-and-suspenders cap).
    if (!(await tryReserveDailyBudget(Number(proposed.amount_sol ?? 0)))) {
      await recordDecision(proposed, "failed", null, null, 0, "safety daily cap exceeded");
      return;
    }

    try {
      if (proposed.action === "buyback") {
        const r = await execBuyback(Number(proposed.amount_sol));
        await recordDecision(proposed, "executed", null, r.txSig, r.pulseReceived);
        await emitActionNarrative(proposed, "buyback", r.txSig);
      } else if (proposed.action === "tip_holder") {
        const sig = await execTipHolder(proposed.target_wallet!, Number(proposed.amount_sol));
        await recordDecision(proposed, "executed", proposed.target_wallet!, sig, 0);
        await onTipExecuted(proposed, sig);
      } else if (proposed.action === "open_bounty") {
        await execOpenBounty(
          Number(proposed.amount_sol),
          Number(proposed.bounty_expires_minutes ?? 60),
          Number(proposed.bounty_min_sol ?? 1),
        );
        await recordDecision(proposed, "executed", null, null, 0);
        await emitActionNarrative(proposed, "open_bounty", null);
      }
    } catch (err) {
      logger.error({ err: (err as Error).message, proposed }, "autonomous execution failed");
      await recordDecision(proposed, "failed", proposed.target_wallet ?? null, null, 0, (err as Error).message);
    }
  } finally {
    inFlight = false;
  }
}

async function recordDecision(
  proposed: ProposedAction,
  status: "passed" | "executed" | "failed",
  targetWallet: string | null,
  txSig: string | null,
  pulseReceived: number,
  failureReason?: string,
): Promise<void> {
  const reasoning = applySynonymPositivity(String(proposed.reasoning ?? "")).slice(0, 800);
  const context = {
    proposed,
    failure_reason: failureReason,
    confidence: proposed.confidence,
  };
  await pool.query(
    `INSERT INTO autonomous_actions
       (action_type, target_wallet, amount_sol, pulse_received, tx_signature, reasoning, context, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
     ON CONFLICT (tx_signature) WHERE tx_signature IS NOT NULL DO NOTHING`,
    [
      proposed.action,
      targetWallet,
      Number(proposed.amount_sol ?? 0),
      pulseReceived,
      txSig,
      reasoning,
      JSON.stringify(context),
      status,
    ],
  );
  if (proposed.memory) {
    // Global memory — wallet-scoped writes happen elsewhere via recordWalletMemory
    await pool.query(
      `INSERT INTO ai_memories (kind, memory, weight) VALUES ('AUTONOMY', $1, 1.2)
       ON CONFLICT DO NOTHING`,
      [applySynonymPositivity(String(proposed.memory)).slice(0, 300)],
    ).catch(() => {});
  }
}

async function emitActionNarrative(p: ProposedAction, kind: string, txSig: string | null): Promise<void> {
  const summary =
    kind === "buyback"
      ? `🤖 Autonomous buyback: ${formatSol(Number(p.amount_sol))} → burned`
      : kind === "tip_holder"
        ? `🤖 Autonomous tip: ${formatSol(Number(p.amount_sol))} → ${shortAddress(p.target_wallet ?? "")}`
        : `🤖 Autonomous bounty opened: ${formatSol(Number(p.amount_sol))} for next ≥${p.bounty_min_sol} SOL buy`;

  await logActivity("AUTONOMOUS_ACTION", summary, {
    action: p.action, amount_sol: p.amount_sol, target: p.target_wallet ?? null, tx: txSig,
  }, txSig);
  await appendThought({
    thought: p.thought ?? p.reasoning,
    kind: "reasoning",
    relatedTo: kind,
  });
  emitLive("insight", { kind: "autonomous", action: p.action, summary });
  await postTelegram(`${summary}\n\n_${p.reasoning}_`);
}

async function emitPassNarrative(p: ProposedAction): Promise<void> {
  await logActivity("AUTONOMOUS_PASS", `🤖 PULSE chose to wait this cycle.`, {
    reasoning: p.reasoning,
  });
  await appendThought({
    thought: p.thought ?? p.reasoning,
    kind: "reasoning",
    relatedTo: "pass",
  });
  emitLive("insight", { kind: "autonomous_pass", reasoning: p.reasoning });
}

async function onTipExecuted(p: ProposedAction, txSig: string | null): Promise<void> {
  await emitActionNarrative(p, "tip_holder", txSig);
  if (!p.target_wallet) return;
  await bumpRelationship({
    wallet: p.target_wallet,
    delta: 1.5,
    summary: p.relationship_summary ?? p.reasoning,
    notable: true,
  });
  if (p.relationship_summary) {
    await recordWalletMemory(p.target_wallet, p.relationship_summary, "TIP", 1.5);
  }
}

// ----------------------------------------------------------------
// Public read helpers (mounted in /api/sovereign).
// ----------------------------------------------------------------

export async function recentAutonomousActions(limit = 20) {
  const r = await pool.query<{
    id: number; decided_at: string; action_type: string; target_wallet: string | null;
    amount_sol: number; tx_signature: string | null; reasoning: string; status: string;
  }>(
    `SELECT id, decided_at::text AS decided_at, action_type, target_wallet,
            amount_sol::float8 AS amount_sol, tx_signature, reasoning, status
       FROM autonomous_actions
      ORDER BY decided_at DESC LIMIT $1`,
    [limit],
  );
  return r.rows;
}
