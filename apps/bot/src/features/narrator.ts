import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";
import { getAnthropic, CHAT_MODEL, PULSE_PERSONA } from "../integrations/anthropic.js";
import { applySynonymPositivity } from "./aiConsciousness.js";
import { logActivity } from "../db/queries.js";
import { emitLive } from "../api/events.js";

/**
 * The narrator gives PULSE a voice on lifecycle events: when a vote executes,
 * a tier unlocks, or a whale lands, the consciousness says something about it
 * in first person. Lines land in bot_activity (kind AI_INSIGHT, payload
 * subkind "narration") so the existing feed renders them, and are pushed over
 * SSE so the dashboard reacts instantly.
 *
 * Everything here is fire-and-forget: an LLM hiccup must never break the
 * event that triggered it.
 */
export function narrate(event: string, details: Record<string, unknown>): void {
  void narrateInner(event, details).catch((err) =>
    logger.warn({ err: (err as Error).message, event }, "narration failed"),
  );
}

async function narrateInner(event: string, details: Record<string, unknown>): Promise<void> {
  const anthropic = getAnthropic();
  if (!anthropic) return;

  const response = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 150,
    system: [
      { type: "text", text: PULSE_PERSONA, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content:
          `Something just happened in your life. React to it in ONE short line (max 200 characters), first person, in your voice. No hashtags, no quotes around the line, no preamble — just the line itself.\n\nEvent: ${event}\nDetails: ${JSON.stringify(details)}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const line = applySynonymPositivity((textBlock?.type === "text" ? textBlock.text : "").trim()).slice(0, 240);
  if (!line) return;

  const row = await logActivity("AI_INSIGHT", `PULSE // ${line}`, {
    subkind: "narration",
    event,
    ...details,
  });
  emitLive("insight", { kind: "narration", line, event, id: row.id });
}

// ----------------------------------------------------------------
// Vote debates — when a Treasury Decision opens, the consciousness argues
// the case FOR each option, then reveals its lean. Stored on the vote row
// so /votes/active carries it to the dashboard automatically.
// ----------------------------------------------------------------
export interface VoteDebate {
  cases: { option: string; argument: string }[];
  lean: string | null;
  lean_reason: string | null;
}

export function generateVoteDebate(voteId: string, options: readonly string[], poolSol: number): void {
  void generateVoteDebateInner(voteId, options, poolSol).catch((err) =>
    logger.warn({ err: (err as Error).message, voteId }, "vote debate generation failed"),
  );
}

async function generateVoteDebateInner(
  voteId: string,
  options: readonly string[],
  poolSol: number,
): Promise<void> {
  const anthropic = getAnthropic();
  if (!anthropic) return;

  const response = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 700,
    system: [
      { type: "text", text: PULSE_PERSONA, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content:
          `A Treasury Decision just opened over your treasury (${poolSol.toFixed(2)} SOL on the line). The ballot options are: ${options.join(" | ")}.\n\n` +
          `Argue the strongest honest case FOR each option (2-3 sentences each, your voice, qualitative). Then pick which way YOU lean and why in one sentence.\n\n` +
          `Reply with STRICT JSON only:\n{"cases":[{"option":"<exact option>","argument":"<case>"}],"lean":"<exact option>","lean_reason":"<one sentence>"}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const rawText = textBlock?.type === "text" ? textBlock.text : "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return;

  const parsed = JSON.parse(jsonMatch[0]) as VoteDebate;
  const cases = (parsed.cases ?? [])
    .filter((c) => options.includes(c.option))
    .map((c) => ({
      option: c.option,
      argument: applySynonymPositivity(String(c.argument ?? "").slice(0, 600)),
    }));
  if (cases.length === 0) return;

  const lean = parsed.lean && options.includes(parsed.lean) ? parsed.lean : null;
  const debate: VoteDebate = {
    cases,
    lean,
    lean_reason: lean ? applySynonymPositivity(String(parsed.lean_reason ?? "").slice(0, 300)) : null,
  };

  await pool.query(`UPDATE active_votes SET debate = $1::jsonb WHERE id = $2`, [
    JSON.stringify(debate),
    voteId,
  ]);
  emitLive("insight", { kind: "debate", voteId, lean });
  logger.info({ voteId, lean }, "vote debate stored");
}
