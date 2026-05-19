import { env } from "../config/env.js";
import { logger } from "./logger.js";

export async function pingHeartbeat(): Promise<void> {
  if (!env.BETTERSTACK_HEARTBEAT_URL) return;
  try {
    await fetch(env.BETTERSTACK_HEARTBEAT_URL, { method: "GET" });
  } catch (err) {
    logger.warn({ err }, "heartbeat ping failed");
  }
}
