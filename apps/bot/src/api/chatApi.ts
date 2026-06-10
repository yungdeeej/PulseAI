import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { logger } from "../utils/logger.js";
import {
  anonymousIdentity,
  createChatSession,
  quotaFor,
  streamChatReply,
  walletForSession,
  MAX_MESSAGE_CHARS,
} from "../features/pulseChat.js";
import { anthropicConfigured } from "../integrations/anthropic.js";

export function mountChatApi(app: Express): void {
  // A burst-limiter on top of the daily quota: even a WHALE-tier session
  // can't hammer the LLM faster than 6 messages/minute per IP.
  const chatLimiter = rateLimit({
    windowMs: 60_000,
    limit: 6,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "slow down — I can only think so fast" },
  });

  // Sign once → 24h bearer token at the wallet's holder tier.
  app.post("/api/chat/session", async (req: Request, res: Response) => {
    try {
      const { wallet, ts, signature } = req.body ?? {};
      if (typeof wallet !== "string" || typeof ts !== "string" || typeof signature !== "string") {
        return res.status(400).json({ error: "missing fields" });
      }
      const result = await createChatSession({ wallet, ts, signatureBase58: signature });
      if (!result.ok) return res.status(401).json(result);
      res.json(result);
    } catch (err) {
      logger.warn({ err }, "chat session creation failed");
      res.status(500).json({ error: "internal error" });
    }
  });

  app.get("/api/chat/quota", async (req: Request, res: Response) => {
    try {
      const token = String(req.query["token"] ?? "");
      const wallet = token ? await walletForSession(token) : null;
      const identity = wallet ?? anonymousIdentity(req.ip ?? "0.0.0.0");
      const quota = await quotaFor(identity, wallet);
      res.json({ quota, configured: anthropicConfigured(), signed_in: !!wallet });
    } catch (err) {
      logger.warn({ err }, "chat quota check failed");
      res.status(500).json({ error: "internal error" });
    }
  });

  // The conversation itself. Response is an SSE stream:
  //   event: delta  → {"text": "..."} chunks
  //   event: done   → {"quota": {...}}
  //   event: error  → {"error": "..."}
  app.post("/api/chat", chatLimiter, async (req: Request, res: Response) => {
    try {
      const { message, token } = req.body ?? {};
      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "message required" });
      }
      if (message.length > MAX_MESSAGE_CHARS * 2) {
        return res.status(400).json({ error: "message too long" });
      }

      const wallet = typeof token === "string" && token ? await walletForSession(token) : null;
      const identity = wallet ?? anonymousIdentity(req.ip ?? "0.0.0.0");

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const result = await streamChatReply({
        identity,
        wallet,
        message,
        onDelta: (text) => {
          res.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`);
        },
      });

      if (!result.ok) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: result.error, quota: result.quota ?? null })}\n\n`);
      } else {
        res.write(`event: done\ndata: ${JSON.stringify({ quota: result.quota })}\n\n`);
      }
      res.end();
    } catch (err) {
      logger.warn({ err }, "chat request failed");
      if (!res.headersSent) {
        res.status(500).json({ error: "internal error" });
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "internal error" })}\n\n`);
        res.end();
      }
    }
  });
}
