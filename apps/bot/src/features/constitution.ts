import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";

/**
 * The Constitution is the living rule-set the autonomous AI must obey.
 * Each clause is one row; amendments produce a new version + a history
 * entry. This module is the only path that mutates them — the AI itself
 * never writes here, only reads. Amendments come from holder votes or
 * (for genesis / emergency) the admin endpoint.
 *
 * The constitution is read on every autonomous tick, so we keep a tiny
 * in-process cache invalidated by the writer.
 */

export interface Constitution {
  autonomous_enabled: boolean;
  max_action_pct_of_treasury: number;
  max_actions_per_day: number;
  cooldown_minutes: number;
  allowed_actions: string[];
  treasury_floor_sol: number;
  min_holder_balance_for_tip: number;
  max_tip_sol: number;
  publish_reasoning: boolean;
}

export interface ConstitutionClause {
  clause: string;
  value: unknown;
  description: string;
  version: number;
  updated_at: string;
}

const DEFAULTS: Constitution = {
  autonomous_enabled: true,
  max_action_pct_of_treasury: 3,
  max_actions_per_day: 12,
  cooldown_minutes: 45,
  allowed_actions: ["buyback", "tip_holder", "open_bounty", "pass"],
  treasury_floor_sol: 0.5,
  min_holder_balance_for_tip: 10_000,
  max_tip_sol: 0.2,
  publish_reasoning: true,
};

let cache: { at: number; value: Constitution } | null = null;
const CACHE_MS = 10_000;

export async function loadConstitution(): Promise<Constitution> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const rows = await pool.query<{ clause: string; value: unknown }>(
    `SELECT clause, value FROM constitution`,
  );
  const merged: Record<string, unknown> = { ...DEFAULTS };
  for (const r of rows.rows) merged[r.clause] = r.value;
  cache = { at: Date.now(), value: merged as unknown as Constitution };
  return cache.value;
}

export function invalidateConstitutionCache(): void {
  cache = null;
}

export async function listConstitution(): Promise<ConstitutionClause[]> {
  const r = await pool.query<ConstitutionClause>(
    `SELECT clause, value, description, version,
            updated_at::text AS updated_at
       FROM constitution ORDER BY clause ASC`,
  );
  return r.rows;
}

/**
 * Amend a single clause. amendedBy is 'admin', 'genesis', or a vote id.
 * Validates value shape against the clause's expected type.
 */
export async function amendClause(args: {
  clause: keyof Constitution;
  value: unknown;
  amendedBy: string;
}): Promise<ConstitutionClause | null> {
  // Type guard against the seeded defaults — bad shape from a buggy vote
  // executor shouldn't silently lobotomize the AI.
  const expected = DEFAULTS[args.clause];
  if (!sameKind(args.value, expected)) {
    logger.warn({ clause: args.clause, value: args.value }, "rejected amendment: bad value shape");
    return null;
  }

  return await runAmendment({ clause: args.clause, value: args.value, amendedBy: args.amendedBy });
}

async function runAmendment(args: {
  clause: string;
  value: unknown;
  amendedBy: string;
}): Promise<ConstitutionClause | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<ConstitutionClause>(
      "SELECT * FROM constitution WHERE clause = $1 FOR UPDATE",
      [args.clause],
    );
    const old = existing.rows[0];
    if (!old) {
      await client.query("ROLLBACK");
      return null;
    }
    const newVersion = old.version + 1;
    await client.query(
      `UPDATE constitution
         SET value = $1::jsonb, version = $2, updated_at = NOW()
       WHERE clause = $3`,
      [JSON.stringify(args.value), newVersion, args.clause],
    );
    await client.query(
      `INSERT INTO constitution_history (clause, old_value, new_value, version, amended_by)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)`,
      [args.clause, JSON.stringify(old.value), JSON.stringify(args.value), newVersion, args.amendedBy],
    );
    await client.query("COMMIT");
    invalidateConstitutionCache();
    return {
      clause: args.clause,
      value: args.value,
      description: old.description,
      version: newVersion,
      updated_at: new Date().toISOString(),
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error({ err, clause: args.clause }, "amendment failed");
    throw err;
  } finally {
    client.release();
  }
}

function sameKind(a: unknown, b: unknown): boolean {
  if (Array.isArray(a)) return Array.isArray(b);
  if (a === null) return b === null;
  return typeof a === typeof b;
}

export interface ConstitutionAmendment {
  clause: keyof Constitution;
  value: unknown;
  rationale: string;
}

/**
 * Render the constitution as a stable, byte-identical string suitable for
 * inclusion as a cached system-prompt block. Sorted by clause name so the
 * cache only invalidates when an actual amendment lands.
 */
export function renderConstitutionPrompt(c: Constitution): string {
  const lines: string[] = ["THE PULSE CONSTITUTION (these are your hard rules — you must obey them):"];
  const keys = Object.keys(c).sort() as (keyof Constitution)[];
  for (const k of keys) {
    lines.push(`- ${k}: ${JSON.stringify(c[k])}`);
  }
  return lines.join("\n");
}
