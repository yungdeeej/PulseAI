import { EventEmitter } from "node:events";
import type { Express, Request, Response } from "express";
import { logger } from "../utils/logger.js";

/**
 * In-process live event hub. The bot is a single process on a Reserved VM,
 * so an EventEmitter is all the pub/sub we need — no Redis, no extra infra.
 *
 * Channels:
 *   trade    — every ingested trade (side, sol, wallet short, bot flag)
 *   activity — every bot_activity insert (kind, summary)
 *   insight  — new AI insight / narration lines
 */
export const liveEvents = new EventEmitter();
liveEvents.setMaxListeners(0); // listener count == connected SSE clients

export type LiveChannel = "trade" | "activity" | "insight";

export function emitLive(channel: LiveChannel, payload: unknown): void {
  try {
    liveEvents.emit("live", { channel, payload, at: new Date().toISOString() });
  } catch (err) {
    logger.warn({ err }, "live event emit failed");
  }
}

const MAX_SSE_CLIENTS = 500;
let connectedClients = 0;

export function mountSseApi(app: Express): void {
  app.get("/api/stream", (req: Request, res: Response) => {
    if (connectedClients >= MAX_SSE_CLIENTS) {
      return res.status(503).json({ error: "too many live connections" });
    }
    connectedClients++;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`event: hello\ndata: {"ok":true}\n\n`);

    const onEvent = (e: { channel: LiveChannel; payload: unknown; at: string }) => {
      res.write(`event: ${e.channel}\ndata: ${JSON.stringify({ ...((e.payload as object) ?? {}), at: e.at })}\n\n`);
    };
    liveEvents.on("live", onEvent);

    // Keep proxies from reaping the idle connection.
    const heartbeat = setInterval(() => res.write(`: ping\n\n`), 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      liveEvents.off("live", onEvent);
      connectedClients--;
    });
  });
}
