import type { Express, Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";
import { logActivity, patchBotConfig } from "../db/queries.js";

/**
 * Admin endpoints. Auth: `Authorization: Bearer <ADMIN_SECRET>`. If the env
 * var isn't set the whole router is disabled, so a misconfigured deploy
 * fails closed.
 */
export function mountAdminApi(app: Express): void {
  if (!env.ADMIN_SECRET) {
    logger.warn("ADMIN_SECRET unset — /admin/* routes disabled");
    return;
  }

  app.use("/admin", requireAdmin);

  // Toggle the pause flag.
  // POST /admin/pause  { paused: true | false }
  app.post("/admin/pause", async (req: Request, res: Response) => {
    const { paused } = req.body ?? {};
    if (typeof paused !== "boolean") return res.status(400).json({ error: "paused must be boolean" });
    await patchBotConfig({ paused });
    await logActivity("SAFETY_HALT", paused ? "Bot paused by admin" : "Bot resumed by admin", {
      paused,
    });
    res.json({ ok: true, paused });
  });

  // Inspect the current bot_config snapshot.
  app.get("/admin/config", async (_req: Request, res: Response) => {
    const r = await pool.query("SELECT * FROM bot_config WHERE id = 1");
    res.json({ config: r.rows[0] ?? null });
  });

  // Nuke all derived/historical data and reset the token_state row back to
  // its pre-launch shape. Used when relaunching with a new CA or wiping the
  // test data accumulated before the real launch.
  //
  // POST /admin/wipe  { confirm: "WIPE" }
  //
  // Requires a literal "WIPE" string in the body so a curl typo can't
  // accidentally trash production. Bot must also be paused before calling
  // (returns 409 otherwise) so polling won't immediately re-populate.
  app.post("/admin/wipe", async (req: Request, res: Response) => {
    if (req.body?.confirm !== "WIPE") {
      return res.status(400).json({ error: 'body must include { "confirm": "WIPE" }' });
    }

    const cfg = await pool.query("SELECT paused FROM bot_config WHERE id = 1");
    if (!cfg.rows[0]?.paused) {
      return res.status(409).json({
        error: "bot must be paused before wipe — POST /admin/pause { paused: true } first",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        UPDATE token_state
        SET mint_address    = NULL,
            price_usd       = 0,
            price_sol       = 0,
            market_cap_usd  = 0,
            total_supply    = 0,
            holder_count    = 0,
            volume_24h_usd  = 0,
            trades_per_hour = 0,
            current_tier    = 'DISCOVERY',
            bpm             = 60,
            updated_at      = NOW()
        WHERE id = 1
      `);
      await client.query(`
        UPDATE vaults SET balance_sol = 0, balance_pulse = 0, updated_at = NOW()
      `);
      await client.query(`
        TRUNCATE TABLE
          price_history, trade_tape, holder_balances, holder_snapshots,
          ai_insights, ai_memories, bot_activity,
          active_votes, vote_history, vote_records,
          defense_log, reinforcement_log, tier_history,
          streaks, tweet_multipliers, wallet_status, bounties
        RESTART IDENTITY
      `);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    await logActivity("SAFETY_HALT", "Database wiped by admin", {});
    logger.warn("Admin wiped database");
    res.json({ ok: true });
  });
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const expected = `Bearer ${env.ADMIN_SECRET}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: "unauthorized" });
  next();
}
