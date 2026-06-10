import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import { logger } from "../utils/logger.js";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import {
  listConstitution,
  loadConstitution,
  type Constitution,
} from "../features/constitution.js";
import { recentAutonomousActions, autonomousTick } from "../features/sovereign.js";
import { recentThoughts, getRelationship, recallMemoriesForWallet } from "../features/mindStream.js";

/**
 * Sovereign-AI surfaces:
 *   GET  /api/sovereign            — constitution + last actions + mind stream
 *   GET  /api/mindstream           — paged thoughts
 *   GET  /api/wallets/:w/bond      — PULSE's relationship with this wallet
 *   POST /api/votes/amendment      — propose a constitution amendment (admin only)
 *   POST /admin/sovereign/tick     — fire an autonomous tick now (admin only)
 */
export function mountSovereignApi(app: Express): void {
  app.get("/api/sovereign", async (_req: Request, res: Response) => {
    try {
      const [clauses, actions, thoughts] = await Promise.all([
        listConstitution(),
        recentAutonomousActions(15),
        recentThoughts(15),
      ]);
      res.json({ constitution: clauses, actions, thoughts });
    } catch (err) {
      logger.warn({ err }, "sovereign api error");
      res.status(500).json({ error: "internal error" });
    }
  });

  app.get("/api/mindstream", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(Math.max(1, Number(req.query["limit"] ?? 30)), 100);
      const rows = await recentThoughts(limit);
      res.json({ thoughts: rows });
    } catch (err) {
      logger.warn({ err }, "mindstream api error");
      res.status(500).json({ error: "internal error" });
    }
  });

  app.get("/api/wallets/:wallet/bond", async (req: Request, res: Response) => {
    try {
      const wallet = req.params.wallet!;
      if (wallet.length < 32 || wallet.length > 44) return res.status(400).json({ error: "bad wallet" });
      const [rel, memories, tips] = await Promise.all([
        getRelationship(wallet),
        recallMemoriesForWallet(wallet, 8),
        pool.query<{ amount_sol: number; decided_at: string; reasoning: string }>(
          `SELECT amount_sol::float8 AS amount_sol, decided_at::text AS decided_at, reasoning
             FROM autonomous_actions
            WHERE action_type = 'tip_holder' AND target_wallet = $1 AND status = 'executed'
            ORDER BY decided_at DESC LIMIT 5`,
          [wallet],
        ),
      ]);
      res.json({
        relationship: rel,
        memories,
        tips_received: tips.rows,
      });
    } catch (err) {
      logger.warn({ err }, "bond api error");
      res.status(500).json({ error: "internal error" });
    }
  });

  // ----- Admin: amendments + manual tick -----
  if (!env.ADMIN_SECRET) return; // /admin gate is already required by adminApi; we add admin-only sovereign routes here too

  const requireAdmin = (req: Request, res: Response, next: () => void) => {
    const header = req.header("authorization") ?? "";
    const expected = `Bearer ${env.ADMIN_SECRET}`;
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) return res.status(401).json({ error: "unauthorized" });
    next();
  };

  app.post("/admin/sovereign/tick", requireAdmin, async (_req: Request, res: Response) => {
    void autonomousTick();
    res.json({ ok: true, queued: true });
  });

  // Propose an amendment as the next vote. The amendment payload is stored
  // on active_votes.amendment; ballot is Ratify / Reject. Pool SOL stays 0
  // because amendments don't move treasury.
  app.post("/admin/sovereign/propose-amendment", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { clause, value, rationale, hours } = req.body ?? {};
      const constitution = await loadConstitution();
      if (typeof clause !== "string" || !(clause in constitution)) {
        return res.status(400).json({ error: "unknown clause" });
      }
      const closesAt = new Date(Date.now() + Math.max(1, Math.min(168, Number(hours ?? 24))) * 3600_000);
      const options = ["Ratify Amendment", "Reject Amendment"];
      const r = await pool.query<{ id: string }>(
        `INSERT INTO active_votes (tier_id, options, decision_pool_sol, closes_at, status, amendment)
         VALUES ((SELECT current_tier FROM token_state WHERE id = 1), $1::jsonb, 0, $2, 'open', $3::jsonb)
         RETURNING id`,
        [JSON.stringify(options), closesAt, JSON.stringify({ clause, value, rationale: String(rationale ?? "") })],
      );
      res.json({ ok: true, vote_id: r.rows[0]?.id });
    } catch (err) {
      logger.warn({ err }, "amendment proposal failed");
      res.status(500).json({ error: "internal error" });
    }
  });
}

export type { Constitution };
