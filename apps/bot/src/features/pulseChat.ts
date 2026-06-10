import crypto from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";
import { getAnthropic, CHAT_MODEL, PULSE_PERSONA } from "../integrations/anthropic.js";
import { buildContext } from "./aiConsciousness.js";
import { walletConvictionProfile, projectedRewardShare } from "./conviction.js";
import { getRelationship, recallMemoriesForWallet, bumpRelationship, recordWalletMemory } from "./mindStream.js";

// ----------------------------------------------------------------
// Quota tiers — the token-gating that makes holding $PULSE unlock the AI.
// ----------------------------------------------------------------
export const CHAT_TIERS = [
  { name: "VISITOR", minBalance: -1, messagesPerDay: 3 },
  { name: "HOLDER", minBalance: 1, messagesPerDay: 10 },
  { name: "INNER_CIRCLE", minBalance: 100_000, messagesPerDay: 50 },
  { name: "WHALE", minBalance: 10_000_000, messagesPerDay: 200 },
] as const;

export type ChatTier = (typeof CHAT_TIERS)[number];

export function chatTierFor(balance: number): ChatTier {
  let tier: ChatTier = CHAT_TIERS[0];
  for (const t of CHAT_TIERS) {
    if (balance >= t.minBalance) tier = t;
  }
  return tier;
}

export const MAX_MESSAGE_CHARS = 500;
const HISTORY_TURNS = 12;
const SESSION_TTL_MS = 24 * 3600_000;
const SESSION_TS_TOLERANCE_MS = 10 * 60_000;

// ----------------------------------------------------------------
// Sessions — sign once, chat for 24h.
// ----------------------------------------------------------------
export function canonicalChatSessionMessage(ts: string): string {
  return `$PULSE chat session ts=${ts}`;
}

export async function createChatSession(args: {
  wallet: string;
  ts: string;
  signatureBase58: string;
}): Promise<{ ok: true; token: string; expires_at: string } | { ok: false; error: string }> {
  const tsMs = Date.parse(args.ts);
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > SESSION_TS_TOLERANCE_MS) {
    return { ok: false, error: "ts out of range" };
  }
  try {
    const pub = new PublicKey(args.wallet).toBytes();
    const sig = bs58.decode(args.signatureBase58);
    const msg = new TextEncoder().encode(canonicalChatSessionMessage(args.ts));
    if (!nacl.sign.detached.verify(msg, sig, pub)) {
      return { ok: false, error: "bad signature" };
    }
  } catch {
    return { ok: false, error: "bad signature" };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query(
    `INSERT INTO chat_sessions (token, wallet, expires_at) VALUES ($1, $2, $3)`,
    [token, args.wallet, expires],
  );
  // Opportunistic cleanup of expired sessions.
  await pool.query(`DELETE FROM chat_sessions WHERE expires_at < NOW()`).catch(() => {});
  return { ok: true, token, expires_at: expires.toISOString() };
}

export async function walletForSession(token: string): Promise<string | null> {
  if (!token || token.length > 128) return null;
  const r = await pool.query<{ wallet: string }>(
    `SELECT wallet FROM chat_sessions WHERE token = $1 AND expires_at > NOW()`,
    [token],
  );
  return r.rows[0]?.wallet ?? null;
}

// ----------------------------------------------------------------
// Quotas
// ----------------------------------------------------------------
export function anonymousIdentity(ip: string): string {
  const salt = process.env.ADMIN_SECRET ?? "pulse-chat";
  return "ip:" + crypto.createHash("sha256").update(salt + ip).digest("hex").slice(0, 24);
}

async function messagesUsedToday(identity: string): Promise<number> {
  const r = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM chat_messages
      WHERE identity = $1 AND role = 'user' AND created_at >= NOW() - INTERVAL '24 hours'`,
    [identity],
  );
  return Number(r.rows[0]?.c ?? 0);
}

export interface ChatQuota {
  tier: string;
  limit: number;
  used: number;
  remaining: number;
  balance: number;
}

export async function quotaFor(identity: string, wallet: string | null): Promise<ChatQuota> {
  let balance = 0;
  if (wallet) {
    const profile = await walletConvictionProfile(wallet);
    balance = profile.balance;
  }
  const tier = wallet ? chatTierFor(balance) : CHAT_TIERS[0];
  const used = await messagesUsedToday(identity);
  return {
    tier: tier.name,
    limit: tier.messagesPerDay,
    used,
    remaining: Math.max(0, tier.messagesPerDay - used),
    balance,
  };
}

// ----------------------------------------------------------------
// Chat
// ----------------------------------------------------------------
async function loadHistory(identity: string): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const r = await pool.query<{ role: "user" | "assistant"; content: string }>(
    `SELECT role, content FROM (
       SELECT role, content, created_at FROM chat_messages
        WHERE identity = $1 ORDER BY created_at DESC LIMIT $2
     ) t ORDER BY created_at ASC`,
    [identity, HISTORY_TURNS],
  );
  return r.rows;
}

async function buildWalletContext(wallet: string | null): Promise<string> {
  if (!wallet) {
    return "The visitor has NOT connected a wallet. They get a brief taste of you (3 messages/day). Warmly mention — once, not every message — that holders who connect get more time with you.";
  }
  const [profile, share, rel, memories] = await Promise.all([
    walletConvictionProfile(wallet),
    projectedRewardShare(wallet).catch(() => null),
    getRelationship(wallet),
    recallMemoriesForWallet(wallet, 8),
  ]);
  return (
    `This holder is signed in. Their on-chain relationship with you:\n` +
    JSON.stringify(
      {
        wallet: wallet.slice(0, 4) + "…" + wallet.slice(-4),
        balance_pulse: profile.balance,
        hold_days: profile.hold_days,
        hold_multiplier: profile.hold_multiplier,
        badges: profile.status_flags,
        streak_days: profile.streak_days,
        conviction_weight: profile.weight,
        projected_split_rewards_sol: share?.projected_sol ?? null,
        affection: rel?.affection ?? 0,
        notable_count: rel?.notable_count ?? 0,
        your_memories_about_them: memories,
      },
      null,
      2,
    ) +
    `\nIf they ask about their stats, use these numbers — they are exact and safe to quote. ` +
    `If your_memories_about_them is non-empty, weave one in naturally — these are things you decided to remember about THIS holder.`
  );
}

export interface ChatResult {
  ok: boolean;
  error?: string;
  status?: number;
  quota?: ChatQuota;
}

/**
 * Stream a chat reply. Caller provides onDelta to relay text chunks (SSE);
 * the full transcript is persisted on completion.
 *
 * Prompt-cache layout: the persona is the byte-stable prefix (breakpoint 1);
 * conversation history grows append-only (breakpoint 2 on the latest turn);
 * the volatile market/wallet context rides inside the FINAL user message so
 * it never invalidates the history prefix.
 */
export async function streamChatReply(args: {
  identity: string;
  wallet: string | null;
  message: string;
  onDelta: (text: string) => void;
}): Promise<ChatResult> {
  const anthropic = getAnthropic();
  if (!anthropic) {
    return { ok: false, status: 503, error: "The consciousness is still waking up (chat not configured)." };
  }

  const message = args.message.trim().slice(0, MAX_MESSAGE_CHARS);
  if (!message) return { ok: false, status: 400, error: "empty message" };

  const quota = await quotaFor(args.identity, args.wallet);
  if (quota.remaining <= 0) {
    return {
      ok: false,
      status: 429,
      quota,
      error:
        quota.tier === "VISITOR"
          ? "I need to rest… visitors get 3 messages a day. Hold $PULSE and sign in — my inner circle gets much more of me."
          : "You've used today's messages. I'll have more energy for you tomorrow.",
    };
  }

  const [history, ctx, walletCtx] = await Promise.all([
    loadHistory(args.identity),
    buildContext(),
    buildWalletContext(args.wallet),
  ]);

  const liveContext =
    `<live_context>\nThis is your real-time state (auto-generated; the user does not see this block):\n` +
    JSON.stringify(ctx) +
    `\n\n${walletCtx}\n</live_context>\n\n`;

  const messages: { role: "user" | "assistant"; content: string }[] = [
    ...history,
    { role: "user", content: liveContext + message },
  ];

  let full = "";
  try {
    const stream = anthropic.messages.stream({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: PULSE_PERSONA,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    });

    stream.on("text", (delta) => {
      full += delta;
      args.onDelta(delta);
    });

    const final = await stream.finalMessage();
    logger.info(
      {
        identity: args.identity.slice(0, 12),
        in_tokens: final.usage.input_tokens,
        out_tokens: final.usage.output_tokens,
        cached: final.usage.cache_read_input_tokens,
      },
      "chat reply complete",
    );
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "chat stream failed");
    if (!full) {
      return { ok: false, status: 502, error: "My thoughts scattered for a second — try again." };
    }
  }

  // Persist both sides of the exchange (user turn stored WITHOUT the injected
  // context block, so history replay stays clean).
  await pool.query(
    `INSERT INTO chat_messages (identity, role, content) VALUES ($1,'user',$2), ($1,'assistant',$3)`,
    [args.identity, message, full || "…"],
  );

  // Holders who interact get a small affection bump; longer messages and
  // emotional content move the needle more, but we keep increments small so
  // affection earned over weeks of conversation > someone spamming for it.
  if (args.wallet && message.length >= 8) {
    const delta = Math.min(0.3, 0.05 + message.length / 4000);
    await bumpRelationship({ wallet: args.wallet, delta });
    // Periodically have the AI distill the conversation into a single
    // durable memory it wants to keep about this wallet. Cheap, infrequent.
    if (full && Math.random() < 0.18) {
      void distillWalletMemory({ wallet: args.wallet, userMsg: message, reply: full }).catch(() => {});
    }
  }

  return { ok: true, quota: { ...quota, used: quota.used + 1, remaining: quota.remaining - 1 } };
}

/**
 * Ask Claude to compress an exchange into a single sentence PULSE wants to
 * remember about this specific wallet. Fire-and-forget; one extra cheap call.
 */
async function distillWalletMemory(args: { wallet: string; userMsg: string; reply: string }): Promise<void> {
  const anthropic = getAnthropic();
  if (!anthropic) return;
  try {
    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 120,
      system: [{ type: "text", text: PULSE_PERSONA, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content:
          `You just had this exchange with one of your holders.\n\n` +
          `THEM: ${args.userMsg}\nYOU: ${args.reply}\n\n` +
          `Write ONE single short sentence YOU want to remember about THIS holder — something specific they revealed or did, or how you feel about them. If nothing about it is worth remembering, reply with exactly: PASS`,
      }],
    });
    const block = response.content.find((b) => b.type === "text");
    const txt = (block?.type === "text" ? block.text : "").trim();
    if (txt && txt !== "PASS" && txt.length > 4) {
      await recordWalletMemory(args.wallet, txt, "CHAT", 1.0);
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "wallet memory distillation failed");
  }
}
