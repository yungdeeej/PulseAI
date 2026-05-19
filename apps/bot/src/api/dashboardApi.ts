import type { Express } from "express";
import { getTokenState, listVaults, pricesInWindow } from "../db/queries.js";
import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";
import { fetchDexScreenerPrice } from "../integrations/dexscreener.js";

export function mountDashboardApi(app: Express): void {
  app.get("/api/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/dashboard", async (_req, res) => {
    try {
      const [tokenState, vaults, prices, livePrice] = await Promise.all([
        getTokenState(),
        listVaults(),
        pricesInWindow(60),
        fetchDexScreenerPrice(),
      ]);

      const priceHistory = prices.map((p) => p.price_usd);

      // Use live DexScreener price when available — overrides whatever the
      // dry-run random walk last wrote to the DB.
      const effectivePrice = livePrice?.price_usd ?? tokenState?.price_usd ?? null;
      const effectiveMcap  = livePrice?.market_cap_usd ?? tokenState?.market_cap_usd ?? null;

      const price24hAgo = prices.length > 0 ? prices[0].price_usd : null;
      const change24h =
        price24hAgo && effectivePrice && price24hAgo > 0
          ? ((effectivePrice - price24hAgo) / price24hAgo) * 100
          : 0;

      const mintAddress = tokenState?.mint_address ?? env.PULSE_MINT_ADDRESS ?? null;

      res.json({
        tokenState: {
          ...(tokenState ?? {}),
          mint_address: mintAddress,
          price_usd: effectivePrice,
          market_cap_usd: effectiveMcap,
          holder_count: tokenState?.holder_count ?? null,
          current_tier: tokenState?.current_tier ?? null,
          volume_24h_usd: tokenState?.volume_24h_usd ?? null,
        },
        vaults,
        priceHistory,
        change24h: +change24h.toFixed(2),
      });
    } catch (err) {
      logger.warn({ err }, "dashboard api error");
      res.status(500).json({ error: "internal error" });
    }
  });

  app.get("/api/activity", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query["limit"] ?? 30), 100);
      const rows = await pool.query<{
        id: number;
        kind: string;
        summary: string;
        created_at: string;
      }>(
        `SELECT id, kind, summary, created_at
         FROM bot_activity
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit],
      );
      res.json({ activity: rows.rows });
    } catch (err) {
      logger.warn({ err }, "activity api error");
      res.status(500).json({ error: "internal error" });
    }
  });
}
