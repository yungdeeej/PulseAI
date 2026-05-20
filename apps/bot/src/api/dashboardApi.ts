import type { Express } from "express";
import { getTokenState, listVaults, pricesInWindow } from "../db/queries.js";
import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";
import { fetchDexScreenerPrice, fetchDexScreenerHistory } from "../integrations/dexscreener.js";
import { fetchWalletSolBalance } from "../integrations/solanaRpc.js";
import { latestInsight, recentInsights, recentMemories, generateInsight } from "../features/aiConsciousness.js";

export function mountDashboardApi(app: Express): void {
  app.get("/api/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/dashboard", async (_req, res) => {
    try {
      const supply = Number(env.PULSE_TOTAL_SUPPLY ?? 1_000_000_000);

      const creatorWallet = env.CREATOR_WALLET_ADDRESS ?? null;

      const [tokenState, vaults, livePrice, creatorWalletSol, aiInsight] = await Promise.all([
        getTokenState(),
        listVaults(),
        fetchDexScreenerPrice(),
        creatorWallet ? fetchWalletSolBalance(creatorWallet) : Promise.resolve(null),
        latestInsight(),
      ]);

      // Fetch real OHLCV bar history using the pair address from DexScreener
      const mcapHistory = livePrice?.pair_address
        ? await fetchDexScreenerHistory(livePrice.pair_address, supply, 1, 60)
        : [];

      // Build sparkline from real price history — convert per-token price → market cap
      const dbPrices = await pricesInWindow(60);
      const dbMcapHistory = dbPrices.map((p) => p.price_usd * supply);

      const priceHistory = mcapHistory.length >= 2
        ? mcapHistory
        : dbMcapHistory.length >= 2
          ? dbMcapHistory
          : [];

      // Use live DexScreener price — overrides whatever the dry-run random walk wrote to DB
      const effectivePrice = livePrice?.price_usd ?? tokenState?.price_usd ?? null;
      const effectiveMcap  = livePrice?.market_cap_usd ?? tokenState?.market_cap_usd ?? null;

      const first = priceHistory[0] ?? null;
      const last  = priceHistory[priceHistory.length - 1] ?? null;
      const change24h =
        first && last && first > 0 ? ((last - first) / first) * 100 : 0;

      // DB is the single source of truth for the live mint. The env var is
      // a bootstrap hint for the bot's market-data pollers only — it must
      // not leak into the API response, otherwise a stale launch CA would
      // appear in the UI before the new token is live.
      const mintAddress = tokenState?.mint_address ?? null;

      res.json({
        tokenState: {
          ...(tokenState ?? {}),
          mint_address: mintAddress,
          price_usd: effectivePrice,
          market_cap_usd: effectiveMcap,
          holder_count: tokenState?.holder_count ?? null,
          current_tier: tokenState?.current_tier ?? null,
          volume_24h_usd: livePrice?.volume_24h_usd ?? tokenState?.volume_24h_usd ?? null,
        },
        vaults,
        priceHistory,
        change24h: +change24h.toFixed(2),
        creator_wallet_sol: creatorWalletSol,
        market_activity: livePrice ? {
          buys_5m:        livePrice.txns_5m_buys,
          sells_5m:       livePrice.txns_5m_sells,
          buys_1h:        livePrice.txns_1h_buys,
          sells_1h:       livePrice.txns_1h_sells,
          price_change_5m: livePrice.price_change_5m,
          price_change_1h: livePrice.price_change_1h,
        } : null,
        ai_insight: aiInsight,
      });
    } catch (err) {
      logger.warn({ err }, "dashboard api error");
      res.status(500).json({ error: "internal error" });
    }
  });

  app.get("/api/consciousness", async (req, res) => {
    try {
      const rawLimit = Number(req.query["limit"]);
      const limit = Math.min(
        Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 10),
        30,
      );
      const [latest, recent, memories] = await Promise.all([
        latestInsight(),
        recentInsights(limit),
        recentMemories(12),
      ]);
      res.json({ latest, recent, memories });
    } catch (err) {
      logger.warn({ err }, "consciousness api error");
      res.status(500).json({ error: "internal error" });
    }
  });

  app.post("/api/consciousness/refresh", async (req, res) => {
    // Require admin secret to be configured AND match — never expose the
    // endpoint when ADMIN_SECRET is unset.
    if (!env.ADMIN_SECRET || req.header("x-admin-secret") !== env.ADMIN_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
    try {
      const insight = await generateInsight();
      res.json({ insight });
    } catch (err) {
      logger.warn({ err }, "manual insight refresh failed");
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
