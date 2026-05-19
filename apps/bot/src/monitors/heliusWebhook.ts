import express, { type Request, type Response } from "express";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { processTradeEvent, type ParsedTrade } from "./tradeIngest.js";
import { mountPublicApi } from "../api/publicApi.js";
import { mountAdminApi } from "../api/adminApi.js";

export function createWebhookApp() {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  mountPublicApi(app);
  mountAdminApi(app);

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, dry_run: env.DRY_RUN, network: env.NETWORK });
  });

  app.post("/helius/webhook", async (req: Request, res: Response) => {
    if (env.HELIUS_WEBHOOK_SECRET) {
      const provided = req.header("authorization") ?? req.header("x-helius-signature") ?? "";
      const expected = env.HELIUS_WEBHOOK_SECRET;
      const ok =
        provided.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
      if (!ok) {
        logger.warn("rejected helius webhook with bad secret");
        return res.status(401).json({ error: "unauthorized" });
      }
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

    // Acknowledge fast; process in background.
    res.json({ ok: true, received: trades.length });
    for (const t of trades) {
      processTradeEvent(t).catch((err) =>
        logger.error({ err, signature: t.signature }, "trade ingest failed"),
      );
    }
  });

  return app;
}

/**
 * Helius "enhanced transactions" wrap swap details under tokenTransfers /
 * events.swap. We only care about trades that touch the $PULSE mint.
 */
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
