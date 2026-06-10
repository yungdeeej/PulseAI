import type { Express, Request, Response } from "express";
import { logger } from "../utils/logger.js";
import { pool } from "../db/pool.js";
import {
  walletConvictionProfile,
  projectedRewardShare,
  convictionLeaderboard,
} from "../features/conviction.js";

export function mountProfileApi(app: Express): void {
  // "My Pulse" — the holder's personal stake, fully broken down.
  app.get("/api/wallets/:wallet/profile", async (req: Request, res: Response) => {
    try {
      const wallet = req.params.wallet!;
      if (wallet.length < 32 || wallet.length > 44) {
        return res.status(400).json({ error: "bad wallet" });
      }
      const [profile, share] = await Promise.all([
        walletConvictionProfile(wallet),
        projectedRewardShare(wallet),
      ]);
      res.json({ profile, projected_split_rewards: share });
    } catch (err) {
      logger.warn({ err }, "profile api error");
      res.status(500).json({ error: "internal error" });
    }
  });

  // Social proof: top conviction + longest streaks.
  app.get("/api/leaderboard", async (_req: Request, res: Response) => {
    try {
      const [conviction, streaks] = await Promise.all([
        convictionLeaderboard(),
        pool.query<{ wallet: string; current_days: number }>(
          `SELECT wallet, current_days FROM streaks
            WHERE current_days > 0 ORDER BY current_days DESC LIMIT 10`,
        ),
      ]);
      res.json({
        conviction,
        streaks: streaks.rows,
      });
    } catch (err) {
      logger.warn({ err }, "leaderboard api error");
      res.status(500).json({ error: "internal error" });
    }
  });
}
