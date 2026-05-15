import {
  VOTE_DURATION_HOURS,
  VOTE_OPTIONS_BY_TIER,
  type Tier,
} from "@pulse/shared";
import {
  getActiveVote,
  getVault,
  logActivity,
  openVoteRow,
} from "../db/queries.js";
import { logger } from "../utils/logger.js";
import { postTelegram } from "../integrations/telegram.js";
import { postTweet } from "../integrations/twitter.js";
import { formatSol } from "../utils/format.js";

export async function openVote(tier: Tier) {
  const existing = await getActiveVote();
  if (existing) {
    logger.info({ existing: existing.id }, "active vote already exists; skipping new open");
    return existing;
  }
  const options = VOTE_OPTIONS_BY_TIER[tier];
  if (!options || options.length === 0) return null;

  const decision = await getVault("DECISION");
  const poolSol = Number(decision?.balance_sol ?? 0);

  const closesAt = new Date(Date.now() + VOTE_DURATION_HOURS * 3600_000);
  const row = await openVoteRow(tier, options, poolSol, closesAt);

  const summary = `🗳 Treasury Decision open: ${options.join(" • ")}. Pool ${formatSol(
    poolSol,
  )}. Closes <t:${Math.floor(closesAt.getTime() / 1000)}:R>.`;
  await logActivity("VOTE_OPENED", summary, { vote_id: row.id, tier, options, poolSol });

  await postTweet(summary);
  await postTelegram(summary);

  return row;
}
