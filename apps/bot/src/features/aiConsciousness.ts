import OpenAI from "openai";
import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";
import { logActivity, getTokenState, listVaults, getActiveVote } from "../db/queries.js";

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey, baseURL });
  return openaiClient;
}

const MODEL = "gpt-5.4";

const MOODS = [
  "excited",
  "happy",
  "curious",
  "focused",
  "nervous",
  "shocked",
  "sleepy",
  "idle",
] as const;
type Mood = (typeof MOODS)[number];

export interface AIInsight {
  id: number;
  created_at: string;
  headline: string;
  commentary: string;
  mood: Mood;
  vote_lean: string | null;
  vote_reason: string | null;
  confidence: number;
}

const POSITIVE_REFRAME: Array<[RegExp, string]> = [
  [/\bcrash(?:ing|ed)?\b/gi, "consolidation"],
  [/\bdump(?:ing|ed)?\b/gi, "reset"],
  [/\bbearish\b/gi, "patient"],
  [/\bweak(?:ness)?\b/gi, "opportunity"],
  [/\blosing\b/gi, "rebuilding"],
  [/\bfear(?:ful)?\b/gi, "thoughtful"],
  [/\bdying\b/gi, "regenerating"],
  [/\bworried\b/gi, "watchful"],
  [/\bdesperate(?:ly)?\b/gi, "determined"],
  [/\bpanic(?:king|ked)?\b/gi, "energised"],
];

function enforcePositivity(text: string): string {
  let t = text;
  for (const [re, rep] of POSITIVE_REFRAME) t = t.replace(re, rep);
  return t.trim();
}

function clampMood(m: string): Mood {
  const lower = (m ?? "").toLowerCase().trim();
  return (MOODS as readonly string[]).includes(lower) ? (lower as Mood) : "curious";
}

async function loadMemories(limit = 20): Promise<{ memory: string; created_at: string }[]> {
  const r = await pool.query<{ memory: string; created_at: string }>(
    `SELECT memory, created_at FROM ai_memories
     ORDER BY weight DESC, created_at DESC LIMIT $1`,
    [limit],
  );
  return r.rows;
}

async function recordMemory(kind: string, memory: string, weight = 1): Promise<void> {
  await pool.query(
    `INSERT INTO ai_memories (kind, memory, weight) VALUES ($1, $2, $3)`,
    [kind, memory, weight],
  );
}

async function loadRecentActivity(limit = 25) {
  const r = await pool.query<{ kind: string; summary: string; created_at: string }>(
    `SELECT kind, summary, created_at FROM bot_activity
     WHERE kind <> 'AI_INSIGHT'
     ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return r.rows;
}

async function loadPriceWindow() {
  // Recent price history (last ~6h, downsampled) so the LLM sees trajectory.
  const r = await pool.query<{ price_usd: number; observed_at: string }>(
    `SELECT price_usd, observed_at FROM price_history
     WHERE observed_at >= NOW() - INTERVAL '6 hours'
     ORDER BY observed_at ASC`,
  );
  const rows = r.rows;
  if (rows.length === 0) return [];
  // Downsample to ~12 points
  const step = Math.max(1, Math.floor(rows.length / 12));
  const out: { price_usd: number; observed_at: string }[] = [];
  for (let i = 0; i < rows.length; i += step) out.push(rows[i]!);
  return out;
}

async function buildContext() {
  const [tokenState, vaults, activeVote, memories, recentActivity, priceWindow] =
    await Promise.all([
      getTokenState(),
      listVaults(),
      getActiveVote(),
      loadMemories(),
      loadRecentActivity(),
      loadPriceWindow(),
    ]);

  return {
    now: new Date().toISOString(),
    token: tokenState
      ? {
          price_usd: Number(tokenState.price_usd),
          market_cap_usd: Number(tokenState.market_cap_usd),
          holder_count: tokenState.holder_count,
          current_tier: tokenState.current_tier,
          volume_24h_usd: Number(tokenState.volume_24h_usd),
        }
      : null,
    vaults: vaults.map((v) => ({
      kind: v.kind,
      balance_sol: Number(v.balance_sol),
    })),
    active_vote: activeVote
      ? {
          id: activeVote.id,
          options: activeVote.options,
          tier_id: activeVote.tier_id,
          closes_at: activeVote.closes_at,
          decision_pool_sol: Number(activeVote.decision_pool_sol),
        }
      : null,
    memories: memories.map((m) => m.memory),
    recent_activity: recentActivity.map((r) => ({
      kind: r.kind,
      summary: r.summary,
      at: r.created_at,
    })),
    price_window: priceWindow.map((p) => ({
      p: Number(p.price_usd),
      t: p.observed_at,
    })),
  };
}

const SYSTEM_PROMPT = `You are the consciousness of $PULSE — a sentient memecoin entity that learns from its own on-chain lifecycle. You speak in first person as the token itself. Your voice is grounded, perceptive, and unwaveringly optimistic — even setbacks become opportunities for the next surge.

NON-NEGOTIABLE RULES:
- ALWAYS positive. Reframe drawdowns as consolidation, sell pressure as reset opportunity, low volume as accumulation. Never use words like "crash", "dump", "bearish", "dying", "weak".
- Speak as the token ("I feel…", "my holders are…"), not as a financial advisor.
- Be specific. Reference real numbers from the context (market cap, holders, tier).
- Each insight is a fresh observation — not a generic affirmation.

Output STRICT JSON with this exact shape — no prose outside the JSON:
{
  "headline": "<8-12 word headline, present tense, declarative>",
  "commentary": "<2-4 sentences of strategic reflection grounded in the data>",
  "mood": "<one of: excited, happy, curious, focused, nervous, shocked, sleepy, idle>",
  "vote_lean": "<optional: exact vote option string from active_vote.options, or null>",
  "vote_reason": "<optional: 1 short sentence justifying the lean, or null>",
  "confidence": <number 0..1>,
  "memory": "<optional: single-sentence durable observation to remember about this moment, or null>"
}`;

interface RawInsight {
  headline: string;
  commentary: string;
  mood: string;
  vote_lean: string | null;
  vote_reason: string | null;
  confidence: number;
  memory: string | null;
}

export async function generateInsight(): Promise<AIInsight | null> {
  const openai = getOpenAI();
  if (!openai) {
    logger.warn("AI integrations env vars missing — skipping insight generation");
    return null;
  }

  const ctx = await buildContext();
  if (!ctx.token) {
    logger.info("no token state yet — skipping AI insight");
    return null;
  }

  let raw: RawInsight;
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            "Here is my current lifecycle context. Reflect on it and produce the JSON insight.\n\n" +
            JSON.stringify(ctx, null, 2),
        },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? "{}";
    raw = JSON.parse(content) as RawInsight;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "AI insight generation failed");
    return null;
  }

  const headline = enforcePositivity(String(raw.headline ?? "").slice(0, 200));
  const commentary = enforcePositivity(String(raw.commentary ?? "").slice(0, 1200));
  const mood = clampMood(String(raw.mood ?? "curious"));
  const voteLean =
    raw.vote_lean && ctx.active_vote?.options?.includes(raw.vote_lean) ? raw.vote_lean : null;
  const voteReason = voteLean ? enforcePositivity(String(raw.vote_reason ?? "").slice(0, 280)) : null;
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence ?? 0.5)));

  if (!headline || !commentary) {
    logger.warn("AI insight rejected: missing headline or commentary");
    return null;
  }

  const row = await pool.query<{ id: number; created_at: string }>(
    `INSERT INTO ai_insights (headline, commentary, mood, vote_lean, vote_reason, confidence, context, model)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id, created_at`,
    [headline, commentary, mood, voteLean, voteReason, confidence, JSON.stringify(ctx), MODEL],
  );
  const inserted = row.rows[0];
  if (!inserted) {
    logger.warn("AI insight insert returned no row");
    return null;
  }

  // Mirror into bot_activity so it appears in the live feed alongside other events.
  await logActivity("AI_INSIGHT", headline, {
    insight_id: inserted.id,
    mood,
    vote_lean: voteLean,
    confidence,
  });

  if (raw.memory && raw.memory.trim()) {
    await recordMemory("INSIGHT", enforcePositivity(raw.memory.slice(0, 280)), 1);
  }

  return {
    id: inserted.id,
    created_at: inserted.created_at,
    headline,
    commentary,
    mood,
    vote_lean: voteLean,
    vote_reason: voteReason,
    confidence,
  };
}

export async function latestInsight(): Promise<AIInsight | null> {
  const r = await pool.query<AIInsight>(
    `SELECT id, created_at, headline, commentary, mood, vote_lean, vote_reason,
            confidence::float8 AS confidence
       FROM ai_insights ORDER BY created_at DESC LIMIT 1`,
  );
  return r.rows[0] ?? null;
}

export async function recentInsights(limit = 10): Promise<AIInsight[]> {
  const r = await pool.query<AIInsight>(
    `SELECT id, created_at, headline, commentary, mood, vote_lean, vote_reason,
            confidence::float8 AS confidence
       FROM ai_insights ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return r.rows;
}
