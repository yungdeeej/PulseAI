import pg from "pg";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

// pg returns NUMERIC as strings to preserve precision. For the bot we
// almost always want numbers — but the bigger NUMERIC columns (token
// supply, conviction weights) need full precision. Parse as Number for
// the standard NUMERIC OID and leave application code to cast when
// precision matters.
pg.types.setTypeParser(1700 /* NUMERIC */, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20 /* INT8 */, (v) => (v === null ? null : Number(v)));

/**
 * SSL is required by every hosted Postgres provider we'll realistically
 * connect to (Replit Hosted Postgres, Neon, Supabase, Render, RDS, …).
 * Only disable it for plain localhost/127.0.0.1 dev URLs.
 *
 * `rejectUnauthorized: false` mirrors Replit's docs — their Postgres uses
 * a CA chain that's not in Node's default bundle.
 */
const url = env.DATABASE_URL ?? "";
const isLocal = /(@localhost|@127\.0\.0\.1|@\[?::1\]?)/.test(url);
const sslDisabledByQuery = /sslmode=disable/.test(url);
const ssl = isLocal || sslDisabledByQuery ? undefined : { rejectUnauthorized: false };

// Pool sized for ~1000 concurrent dashboard viewers polling every 10-30s.
// At ~100 req/s with ~50ms p99 query time we need ~5 simultaneous queries —
// 50 gives us 10× headroom for spikes. Replit Hosted Postgres allows >100
// connections so this is well within limits.
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl,
  max: 50,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  logger.error({ err }, "postgres pool error");
});

export type QueryParams = ReadonlyArray<unknown>;

// We accept any object shape here; pg's QueryResultRow constraint is too
// restrictive for our domain types.
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: QueryParams,
): Promise<T[]> {
  const res = await pool.query<pg.QueryResultRow>(
    text,
    params as unknown as unknown[],
  );
  return res.rows as unknown as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: QueryParams,
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
