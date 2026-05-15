import { env } from "../config/env.js";
import { getBotConfig, logActivity, patchBotConfig } from "../db/queries.js";
import { logger } from "../utils/logger.js";

export async function ensureSafe(): Promise<{ proceed: boolean; reason?: string }> {
  const cfg = await getBotConfig();
  if (cfg.paused) {
    return { proceed: false, reason: "bot paused" };
  }
  return { proceed: true };
}

export async function reportSafetyHalt(reason: string, payload: unknown = {}): Promise<void> {
  logger.warn({ reason, payload }, "safety halt");
  await logActivity("SAFETY_HALT", reason, payload);
}

export async function syncDryRunFlag(): Promise<void> {
  const cfg = await getBotConfig();
  if (cfg.dry_run !== env.DRY_RUN) {
    await patchBotConfig({ dry_run: env.DRY_RUN });
  }
}
