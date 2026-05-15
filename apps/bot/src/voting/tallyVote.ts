import {
  archiveVote,
  closeVote,
  getActiveVote,
  getVote,
  logActivity,
  tallyVoteRecords,
} from "../db/queries.js";
import { executeVote } from "./executeVote.js";
import { logger } from "../utils/logger.js";

/**
 * Compute the live tally for a vote. Does not mutate state.
 */
export async function liveTally(voteId: string) {
  return tallyVoteRecords(voteId);
}

/**
 * Cron: every minute, check if any open vote has closed. If so, finalize.
 */
export async function tickClosingVotes(): Promise<void> {
  const vote = await getActiveVote();
  if (!vote) return;
  if (new Date(vote.closes_at).getTime() > Date.now()) return;
  await finalizeVote(vote.id);
}

export async function finalizeVote(voteId: string): Promise<void> {
  const vote = await getVote(voteId);
  if (!vote) return;
  if (vote.status !== "open") return;

  const tallies = await tallyVoteRecords(voteId);
  const winning = pickWinningOption(tallies);
  await closeVote(voteId, winning, "closed");
  await archiveVote(voteId, tallies);

  await logActivity("VOTE_CLOSED", `Vote ${voteId} closed; winner=${winning ?? "(none)"}`, {
    voteId,
    tallies,
    winning,
  });

  if (!winning) {
    logger.warn({ voteId }, "vote closed with no winning option");
    return;
  }

  try {
    await executeVote(voteId, winning);
  } catch (err) {
    logger.error({ err, voteId }, "vote execution failed");
    await closeVote(voteId, winning, "failed");
  }
}

function pickWinningOption(tallies: Record<string, number>): string | null {
  let best: string | null = null;
  let bestVal = -Infinity;
  for (const [opt, val] of Object.entries(tallies)) {
    if (val > bestVal) {
      bestVal = val;
      best = opt;
    }
  }
  return bestVal > 0 ? best : null;
}
