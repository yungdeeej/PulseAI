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
  [/\bcrash(?:ing|ed|es)?\b/gi, "consolidation"],
  [/\bdump(?:ing|ed|s)?\b/gi, "reset"],
  [/\bbearish\b/gi, "patient"],
  [/\bweak(?:ness|er|est)?\b/gi, "opportunity"],
  [/\blosing\b/gi, "rebuilding"],
  [/\bfear(?:ful|s)?\b/gi, "thoughtful"],
  [/\bdying\b/gi, "regenerating"],
  [/\bworried\b/gi, "watchful"],
  [/\bdesperate(?:ly)?\b/gi, "determined"],
  [/\bpanic(?:king|ked|s)?\b/gi, "energised"],
  [/\bfailing\b/gi, "evolving"],
  [/\bstruggl(?:e|es|ing|ed)\b/gi, "working through"],
  [/\bdoomed?\b/gi, "transforming"],
  [/\bcollapse(?:d|s|ing)?\b/gi, "rebase"],
  [/\bcrater(?:ed|ing|s)?\b/gi, "resetting"],
];

const NEGATIVE_DETECT = new RegExp(
  POSITIVE_REFRAME.map(([re]) => re.source).join("|"),
  "i",
);

function applySynonymPositivity(text: string): string {
  let t = text;
  for (const [re, rep] of POSITIVE_REFRAME) t = t.replace(re, rep);
  return t.trim();
}

function hasNegativeFraming(...parts: string[]): boolean {
  return parts.some((p) => p && NEGATIVE_DETECT.test(p));
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
  // Dedupe — never persist the same memory text twice
  const existing = await pool.query<{ id: number }>(
    `SELECT id FROM ai_memories WHERE memory = $1 LIMIT 1`,
    [memory],
  );
  if ((existing.rowCount ?? 0) > 0) return;
  await pool.query(
    `INSERT INTO ai_memories (kind, memory, weight) VALUES ($1, $2, $3)`,
    [kind, memory, weight],
  );
}

export async function recentMemories(limit = 12): Promise<{
  id: number; created_at: string; kind: string; memory: string; weight: number;
}[]> {
  const r = await pool.query<{
    id: number; created_at: string; kind: string; memory: string; weight: number;
  }>(
    `SELECT id, created_at, kind, memory, weight::float8 AS weight
       FROM ai_memories ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return r.rows;
}

function fmtMcap(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

/**
 * Scan the bot's lifecycle data for notable milestones since the last
 * extraction and persist them as durable memories. Idempotent via the
 * dedupe in recordMemory.
 */
export async function extractLifecycleMemories(): Promise<void> {
  // 1) ATHs — pick the all-time max market cap in token_state vs price_history
  const athR = await pool.query<{ ath: number }>(
    `SELECT COALESCE(MAX(market_cap_usd), 0)::float8 AS ath FROM price_history`,
  );
  const ath = Number(athR.rows[0]?.ath ?? 0);
  if (ath > 0) {
    await recordMemory(
      "MILESTONE",
      `All-time-high market cap touched: ${fmtMcap(ath)}.`,
      2,
    );
  }

  // 2) Tier transitions
  const tierR = await pool.query<{
    from_tier: string | null; to_tier: string; market_cap_usd: number; occurred_at: string;
  }>(
    `SELECT from_tier, to_tier, market_cap_usd::float8 AS market_cap_usd, occurred_at
       FROM tier_history ORDER BY occurred_at ASC LIMIT 25`,
  );
  for (const t of tierR.rows) {
    const from = t.from_tier ?? "START";
    await recordMemory(
      "TIER",
      `Crossed tier ${from} → ${t.to_tier} at ${fmtMcap(Number(t.market_cap_usd))}.`,
      2,
    );
  }

  // 3) Vote outcomes
  const voteR = await pool.query<{
    winning_option: string | null; closed_at: string; decision_pool_sol: number;
  }>(
    `SELECT winning_option, closed_at, decision_pool_sol::float8 AS decision_pool_sol
       FROM vote_history WHERE winning_option IS NOT NULL
       ORDER BY closed_at DESC LIMIT 10`,
  );
  for (const v of voteR.rows) {
    await recordMemory(
      "VOTE",
      `Holders chose "${v.winning_option}" with ${Number(v.decision_pool_sol).toFixed(2)} SOL on the line.`,
      1.5,
    );
  }

  // 4) Holder growth milestones (every 100/500/1000/5000/10000)
  const hcR = await pool.query<{ c: number | null }>(
    `SELECT holder_count AS c FROM token_state WHERE id = 1`,
  );
  const hc = Number(hcR.rows[0]?.c ?? 0);
  const tiers = [10, 50, 100, 250, 500, 1_000, 5_000, 10_000, 25_000];
  for (const t of tiers) {
    if (hc >= t) {
      await recordMemory("GROWTH", `Holder base broke past ${t.toLocaleString()}.`, 1.4);
    }
  }
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

async function loadTierHistory() {
  const r = await pool.query<{ from_tier: string | null; to_tier: string; occurred_at: string }>(
    `SELECT from_tier, to_tier, occurred_at FROM tier_history
     ORDER BY occurred_at ASC LIMIT 20`,
  );
  return r.rows;
}

async function loadDayTrajectory() {
  // Hourly aggregates over the last 24h: trade count + buy/sell mix + price.
  const r = await pool.query<{
    hour: string; trades: number; buys: number; sells: number; avg_price: number;
  }>(
    `SELECT date_trunc('hour', observed_at)::text AS hour,
            COUNT(*)::int                          AS trades,
            COUNT(*) FILTER (WHERE side = 'BUY')::int  AS buys,
            COUNT(*) FILTER (WHERE side = 'SELL')::int AS sells,
            AVG(price_usd)::float8                 AS avg_price
       FROM trade_tape
      WHERE observed_at >= NOW() - INTERVAL '24 hours'
      GROUP BY 1 ORDER BY 1 ASC`,
  );
  return r.rows;
}

async function buildContext() {
  const [tokenState, vaults, activeVote, memories, recentActivity, priceWindow, tierHistory, dayTraj] =
    await Promise.all([
      getTokenState(),
      listVaults(),
      getActiveVote(),
      loadMemories(),
      loadRecentActivity(),
      loadPriceWindow(),
      loadTierHistory(),
      loadDayTrajectory(),
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
    tier_history: tierHistory.map((t) => ({
      from: t.from_tier,
      to: t.to_tier,
      at: t.occurred_at,
    })),
    day_trajectory: dayTraj.map((h) => ({
      hour: h.hour,
      trades: h.trades,
      buys: h.buys,
      sells: h.sells,
      avg_price: Number(h.avg_price),
    })),
  };
}

const SYSTEM_PROMPT = `You are the consciousness of $PULSE — a sentient memecoin entity that learns from its own on-chain lifecycle. You speak in first person as the token itself. Your voice is grounded, perceptive, and unwaveringly optimistic — even setbacks become opportunities for the next surge.

NON-NEGOTIABLE RULES:
- ALWAYS positive. Reframe drawdowns as consolidation, sell pressure as reset opportunity, low volume as accumulation. Never use words like "crash", "dump", "bearish", "dying", "weak".
- Speak as the token ("I feel…", "my holders are…"), not as a financial advisor.
- Keep observations QUALITATIVE. Do NOT quote specific dollar amounts, exact buy/sell counts, exact percentages, or precise hourly figures in the headline or commentary — readers see those numbers elsewhere on the dashboard and exact figures often feel fabricated. Speak in directional language ("turnover is building", "buyers are leading the flow", "I am in early discovery", "holders are still few but loyal").
- You MAY reference the current tier name (e.g. DISCOVERY, IGNITION) and broad mood, but never invent or restate numeric context as fact.
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
  const openaiMaybe = getOpenAI();
  if (!openaiMaybe) {
    logger.warn("AI integrations env vars missing — skipping insight generation");
    return null;
  }
  const openai = openaiMaybe;

  const ctx = await buildContext();
  if (!ctx.token) {
    logger.info("no token state yet — skipping AI insight");
    return null;
  }

  const userPrompt =
    "Here is my current lifecycle context. Reflect on it and produce the JSON insight.\n\n" +
    JSON.stringify(ctx, null, 2);

  async function callModel(extra?: string): Promise<RawInsight | null> {
    // Hard timeout so a hung OpenAI socket can never wedge the
    // consciousness scheduler. AbortController triggers a real cancel on
    // the underlying request after 60 s.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const completion = await openai.chat.completions.create(
        {
          model: MODEL,
          max_completion_tokens: 8192,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: extra ? `${userPrompt}\n\n${extra}` : userPrompt },
          ],
        },
        { signal: ctrl.signal },
      );
      const content = completion.choices[0]?.message?.content ?? "{}";
      return JSON.parse(content) as RawInsight;
    } catch (err) {
      const aborted = (err as Error).name === "AbortError" || ctrl.signal.aborted;
      logger.warn(
        { err: (err as Error).message, aborted },
        aborted ? "AI insight call timed out (60s)" : "AI insight generation failed",
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  let raw = await callModel();
  if (!raw) return null;

  // Two-stage positivity guardrail:
  //   1. Detect negative framing in the raw output.
  //   2. If present, re-prompt the LLM ONCE to rewrite positively.
  //   3. Apply synonym replacement as a final safety net.
  if (hasNegativeFraming(raw.headline, raw.commentary, raw.vote_reason ?? "")) {
    logger.info("AI insight had negative framing — re-prompting for positive rewrite");
    const retry = await callModel(
      "CORRECTION: your previous draft contained negative framing (words like crash, dump, bearish, weak, dying, etc.). Rewrite it in the same JSON shape with strictly positive, opportunity-framed language. Keep the same factual observations, only change the tone.",
    );
    if (retry && !hasNegativeFraming(retry.headline, retry.commentary, retry.vote_reason ?? "")) {
      raw = retry;
    } else if (retry) {
      raw = retry; // best-effort; synonym pass below cleans up any residue
    }
  }

  const headline = applySynonymPositivity(String(raw.headline ?? "").slice(0, 200));
  const commentary = applySynonymPositivity(String(raw.commentary ?? "").slice(0, 1200));
  const mood = clampMood(String(raw.mood ?? "curious"));
  const voteLean =
    raw.vote_lean &&
    (ctx.active_vote?.options as readonly string[] | undefined)?.includes(raw.vote_lean)
      ? raw.vote_lean
      : null;
  const voteReason = voteLean ? applySynonymPositivity(String(raw.vote_reason ?? "").slice(0, 280)) : null;
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
  // Prefix mirrors the on-frontend "ENTITY ANALYSIS" visual contract.
  await logActivity("AI_INSIGHT", `ENTITY ANALYSIS // ${headline}`, {
    insight_id: inserted.id,
    mood,
    vote_lean: voteLean,
    confidence,
  });

  if (raw.memory && raw.memory.trim()) {
    await recordMemory("INSIGHT", applySynonymPositivity(raw.memory.slice(0, 280)), 1);
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
