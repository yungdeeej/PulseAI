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

  // Set the target mint for a Treasury Trade or Pulse Wars vote.
  // POST /admin/votes/:id/target  { target_mint: "<base58>" }
  app.post("/admin/votes/:id/target", async (req: Request, res: Response) => {
    const { target_mint } = req.body ?? {};
    if (typeof target_mint !== "string" || target_mint.length < 32) {
      return res.status(400).json({ error: "target_mint required" });
    }
    const r = await pool.query<{ id: string }>(
      "UPDATE active_votes SET target_mint = $1 WHERE id = $2 AND status = 'open' RETURNING id",
      [target_mint, req.params.id],
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "open vote not found" });
    await logActivity(
      "VOTE_OPENED",
      `Target mint set on vote ${req.params.id}`,
      { voteId: req.params.id, target_mint },
    );
    res.json({ ok: true });
  });

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
