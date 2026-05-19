import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export async function postTelegram(text: string): Promise<boolean> {
  if (env.DRY_RUN) {
    logger.info({ text }, "[DRY-RUN] would post telegram");
    return true;
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) {
    logger.warn("telegram not configured; skipping");
    return false;
  }
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHANNEL_ID,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status, body: await res.text() }, "telegram post failed");
    return false;
  }
  return true;
}
