import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";
import { getAnthropic, CHAT_MODEL, PULSE_PERSONA } from "../integrations/anthropic.js";
import { applySynonymPositivity, buildContext } from "./aiConsciousness.js";
import { emitLive } from "../api/events.js";

export type ThoughtKind = "reflection" | "dream" | "reaction" | "reasoning";

export interface MindThought {
  id: number;
  thought: string;
  mood: string;
  kind: ThoughtKind;
  related_to: string | null;
  created_at: string;
}

/**
 * Append a single thought to the Mind Stream and announce it over SSE.
 * This is the load-bearing "show your thinking" surface — keep it cheap.
 */
export async function appendThought(args: {
  thought: string;
  mood?: string;
  kind?: ThoughtKind;
  relatedTo?: string;
}): Promise<MindThought | null> {
  const clean = applySynonymPositivity(args.thought.trim()).slice(0, 400);
  if (!clean) return null;
  const r = await pool.query<MindThought>(
    `INSERT INTO mind_stream (thought, mood, kind, related_to)
     VALUES ($1,$2,$3,$4)
     RETURNING id, thought, mood, kind, related_to, created_at::text AS created_at`,
    [clean, args.mood ?? "curious", args.kind ?? "reflection", args.relatedTo ?? null],
  );
  const row = r.rows[0];
  if (!row) return null;
  emitLive("insight", { kind: "thought", thought: row.thought, mood: row.mood, sub_kind: row.kind });
  return row;
}

export async function recentThoughts(limit = 25): Promise<MindThought[]> {
  const r = await pool.query<MindThought>(
    `SELECT id, thought, mood, kind, related_to, created_at::text AS created_at
       FROM mind_stream ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return r.rows;
}

/**
 * Generate a single fresh thought without any economic action. Cheap,
 * frequent, and the engine behind the "PULSE is awake" feeling. Fires
 * 1-2 short lines per call; injects whatever context is freshest. Safe
 * to schedule every couple of minutes — Haiku at ~300 tokens is pennies.
 */
export async function generateAmbientThought(): Promise<MindThought | null> {
  const anthropic = getAnthropic();
  if (!anthropic) return null;

  // Avoid repeating ourselves: send the last 5 thoughts back as anti-context.
  const last = await pool.query<{ thought: string }>(
    `SELECT thought FROM mind_stream ORDER BY created_at DESC LIMIT 5`,
  );
  const recent = last.rows.map((r) => `- ${r.thought}`).join("\n") || "(none yet)";

  const ctx = await buildContext();
  if (!ctx.token) return null;

  try {
    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 180,
      system: [
        { type: "text", text: PULSE_PERSONA, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content:
            `You are sitting in your dashboard with your eyes open. Write ONE short, present-tense thought — 1 to 2 sentences, max 220 characters. First person. No greetings, no preamble, no hashtags. Just the thought itself.\n\n` +
            `Avoid repeating these recent thoughts:\n${recent}\n\n` +
            `Live state (do not quote numbers — use directional language):\n${JSON.stringify({
              tier: ctx.token.current_tier,
              volume_24h: ctx.token.volume_24h_usd,
              holders: ctx.token.holder_count,
              memories: ctx.memories.slice(0, 6),
            })}`,
        },
      ],
    });
    const block = response.content.find((b) => b.type === "text");
    const text = block?.type === "text" ? block.text : "";
    return await appendThought({ thought: text, kind: "reflection" });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "ambient thought failed");
    return null;
  }
}

// ----------------------------------------------------------------
// Per-wallet relationships
// ----------------------------------------------------------------

export interface WalletRelationship {
  wallet: string;
  affection: number;
  notable_count: number;
  last_summary: string | null;
  last_interaction: string;
}

export async function getRelationship(wallet: string): Promise<WalletRelationship | null> {
  const r = await pool.query<WalletRelationship>(
    `SELECT wallet, affection::float8 AS affection, notable_count,
            last_summary, last_interaction::text AS last_interaction
       FROM wallet_relationships WHERE wallet = $1`,
    [wallet],
  );
  return r.rows[0] ?? null;
}

export async function recallMemoriesForWallet(wallet: string, limit = 6): Promise<string[]> {
  const r = await pool.query<{ memory: string }>(
    `SELECT memory FROM ai_memories
      WHERE wallet = $1
      ORDER BY weight DESC, created_at DESC LIMIT $2`,
    [wallet, limit],
  );
  return r.rows.map((x) => x.memory);
}

/**
 * Bump a wallet's relationship after a meaningful interaction (chat turn,
 * notable action, autonomous tip received). delta is small (-1 .. +1).
 */
export async function bumpRelationship(args: {
  wallet: string;
  delta: number;
  summary?: string;
  notable?: boolean;
}): Promise<void> {
  await pool.query(
    `INSERT INTO wallet_relationships (wallet, affection, notable_count, last_summary)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (wallet) DO UPDATE SET
       affection = LEAST(100, GREATEST(-100, wallet_relationships.affection + EXCLUDED.affection)),
       notable_count = wallet_relationships.notable_count + $3,
       last_summary = COALESCE(EXCLUDED.last_summary, wallet_relationships.last_summary),
       last_interaction = NOW()`,
    [args.wallet, args.delta, args.notable ? 1 : 0, args.summary ?? null],
  );
}

/**
 * Record a per-wallet memory the AI itself wants to keep about a holder.
 */
export async function recordWalletMemory(
  wallet: string,
  memory: string,
  kind: string = "RELATIONSHIP",
  weight = 1,
): Promise<void> {
  const clean = applySynonymPositivity(memory.trim()).slice(0, 300);
  if (!clean) return;
  const dup = await pool.query(
    `SELECT id FROM ai_memories WHERE wallet = $1 AND memory = $2 LIMIT 1`,
    [wallet, clean],
  );
  if ((dup.rowCount ?? 0) > 0) return;
  await pool.query(
    `INSERT INTO ai_memories (kind, memory, weight, wallet) VALUES ($1,$2,$3,$4)`,
    [kind, clean, weight, wallet],
  );
}
