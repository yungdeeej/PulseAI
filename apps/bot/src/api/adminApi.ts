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
