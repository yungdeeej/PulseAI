import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { processTradeEvent, type ParsedTrade } from "./tradeIngest.js";
import { mountPublicApi } from "../api/publicApi.js";
import { mountAdminApi } from "../api/adminApi.js";
import { mountDashboardApi } from "../api/dashboardApi.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createWebhookApp() {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  // CORS — public read API stays open ("*"), but sensitive write surfaces
  // (/admin/*, POST /votes) only accept requests from our own origins so a
  // hostile site embedded in a victim's browser can't trigger them. Bearer
  // and Ed25519 auth are still the primary defense; this is defense-in-depth.
  const ALLOWED_ORIGINS = new Set<string>([
    "https://feelthepulse.xyz",
    "https://www.feelthepulse.xyz",
    "https://feelthepulse.replit.app",
  ]);
  const isAllowedOrigin = (origin: string | undefined): boolean => {
    if (!origin) return false;
    if (ALLOWED_ORIGINS.has(origin)) return true;
    // Replit dev preview + localhost for local development
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      || /\.replit\.dev(:\d+)?$/.test(origin)
      || /\.repl\.co(:\d+)?$/.test(origin);
  };
  const isSensitivePath = (req: { method: string; path: string }) =>
    req.path.startsWith("/admin")
    || (req.path === "/votes" && req.method === "POST");

  app.use((req, res, next) => {
    const origin = req.header("origin");
    if (isSensitivePath(req)) {
      // Strict allow-list for sensitive surfaces. Missing Origin (same-origin
      // requests from our own SPA) is allowed; mismatched Origin is rejected.
      if (origin && !isAllowedOrigin(origin)) {
        return res.status(403).json({ error: "origin not allowed" });
      }
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
    } else {
      // Public read API — open by design (cache headers + rate limits guard it).
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Short-TTL caching on GET dashboard reads so a thundering herd of
  // pollers (1000 users * 15s polls = ~67 req/s) gets absorbed by
  // Replit's edge cache instead of slamming Postgres every time.
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    const p = req.path;
    if (p === "/api/dashboard" || p === "/api/activity") {
      res.setHeader("Cache-Control", "public, max-age=5, s-maxage=5, stale-while-revalidate=15");
    } else if (p === "/api/consciousness" || p === "/api/votes") {
      res.setHeader("Cache-Control", "public, max-age=10, s-maxage=10, stale-while-revalidate=30");
    }
    next();
  });

  // Rate limits — separate buckets so a flood on one surface can't lock out
  // another. Keys on IP; behind Replit's proxy `app.set("trust proxy", true)`
  // would be needed to use the forwarded IP, but rate-limit's default keyer
  // is good enough as a baseline DoS guard.
  app.set("trust proxy", 1);
  const writeLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10, // 10 vote/tweet submissions per IP per minute
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "rate_limited" },
  });
  const readLimiter = rateLimit({
    windowMs: 60_000,
    limit: 240, // 4 req/s/IP — generous for legit dashboard polling
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "rate_limited" },
  });
  app.use("/votes", (req, res, next) =>
    req.method === "POST" ? writeLimiter(req, res, next) : next(),
  );
  app.use("/api", readLimiter);

  mountDashboardApi(app);
  mountPublicApi(app);
  mountAdminApi(app);

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, dry_run: env.DRY_RUN, network: env.NETWORK });
  });

  app.post("/helius/webhook", async (req: Request, res: Response) => {
    // Webhook is a write surface — fail closed if the secret isn't set.
    // Previous behavior accepted unsigned payloads when env var was missing,
    // which let any caller inject fake trades into the DB. Now: required.
    if (!env.HELIUS_WEBHOOK_SECRET) {
      logger.warn("rejected helius webhook — HELIUS_WEBHOOK_SECRET unset");
      return res.status(503).json({ error: "webhook disabled" });
    }
    const provided = req.header("authorization") ?? req.header("x-helius-signature") ?? "";
    const expected = env.HELIUS_WEBHOOK_SECRET;
    const ok =
      provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!ok) {
      logger.warn("rejected helius webhook with bad secret");
      return res.status(401).json({ error: "unauthorized" });
    }

    const events = Array.isArray(req.body) ? req.body : [req.body];
    const trades: ParsedTrade[] = [];
    for (const event of events) {
      try {
        const parsed = parseHeliusEvent(event);
        if (parsed) trades.push(parsed);
      } catch (err) {
        logger.warn({ err }, "failed to parse helius event");
      }
    }

    res.json({ ok: true, received: trades.length });
    for (const t of trades) {
      processTradeEvent(t).catch((err) =>
        logger.error({ err, signature: t.signature }, "trade ingest failed"),
      );
    }
  });

  // Serve the built React frontend in production so we only need a single
  // public port. The frontend is built into apps/web/dist/public during
  // deployment (see .replit [deployment] build step). In dev the Vite
  // server on port 5000 still handles the frontend separately.
  const webDist = path.resolve(__dirname, "../../../web/dist/public");
  if (fs.existsSync(webDist)) {
    // Hashed Vite assets are immutable — long max-age. index.html stays
    // short-lived so deploys take effect immediately.
    app.use(express.static(webDist, {
      maxAge: "1y",
      immutable: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
        }
      },
    }));
    // SPA fallback — any non-API GET that didn't match above serves index.html.
    app.get("*", (req, res, next) => {
      if (
        req.method !== "GET" ||
        req.path.startsWith("/api") ||
        req.path.startsWith("/healthz") ||
        req.path.startsWith("/helius") ||
        req.path.startsWith("/votes") ||
        req.path.startsWith("/wallets") ||
        req.path.startsWith("/admin")
      ) return next();
      res.sendFile(path.join(webDist, "index.html"));
    });
    logger.info({ webDist }, "serving frontend from built assets");
  } else {
    logger.info("no built frontend found — running API-only (Vite dev server handles UI)");
  }

  return app;
}

function parseHeliusEvent(event: unknown): ParsedTrade | null {
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;
  const signature = (e["signature"] as string | undefined) ?? null;
  if (!signature) return null;

  const mint = env.PULSE_MINT_ADDRESS;
  if (!mint) return null;

  const tokenTransfers = (e["tokenTransfers"] as Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    mint: string;
    tokenAmount: number;
  }>) ?? [];

  const pulseTransfer = tokenTransfers.find((t) => t.mint === mint);
  if (!pulseTransfer) return null;

  const swap = (e["events"] as Record<string, unknown> | undefined)?.["swap"] as
    | {
        nativeInput?: { account: string; amount: string };
        nativeOutput?: { account: string; amount: string };
      }
    | undefined;

  const side: "BUY" | "SELL" = pulseTransfer.toUserAccount && !pulseTransfer.fromUserAccount
    ? "BUY"
    : swap?.nativeInput
      ? "BUY"
      : "SELL";

  const wallet =
    (side === "BUY" ? pulseTransfer.toUserAccount : pulseTransfer.fromUserAccount) ??
    (e["feePayer"] as string | undefined) ??
    "unknown";

  const solLamports = Number(
    side === "BUY" ? swap?.nativeInput?.amount : swap?.nativeOutput?.amount,
  );
  const solAmount = Number.isFinite(solLamports) ? solLamports / 1e9 : 0;
  const pulseAmount = pulseTransfer.tokenAmount;

  const timestamp = (e["timestamp"] as number | undefined) ?? Math.floor(Date.now() / 1000);

  return {
    signature,
    wallet,
    side,
    solAmount,
    pulseAmount,
    observedAt: new Date(timestamp * 1000),
  };
}
