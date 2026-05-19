import {
  TIERS,
  tierForMarketCap,
  type Tier,
} from "@pulse/shared";
import {
  getTokenState,
  insertTierTransition,
  lastTierTransition,
  patchBotConfig,
  patchTokenState,
  logActivity,
} from "../db/queries.js";
import { captureSnapshot } from "../features/snapshot.js";
import { openVote } from "../voting/openVote.js";
import { logger } from "../utils/logger.js";
import { postTelegram } from "../integrations/telegram.js";
import { formatUsd } from "../utils/format.js";

const TIER_NAME = ["DISCOVERY", "IGNITION", "MOMENTUM", "CONVICTION", "ASCENSION"] as const;

function tierIdFromName(name: string): Tier {
  const idx = TIER_NAME.indexOf(name as (typeof TIER_NAME)[number]);
  return (idx >= 0 ? idx : 0) as Tier;
}

let busy = false;

/**
 * Examine the current market cap and act on tier changes. Idempotent: re-runs
 * with the same mcap and same current tier do nothing.
 */
export async function evaluateTierTransition(mcap: number): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const state = await getTokenState();
    const currentName = state?.current_tier ?? "DISCOVERY";
    const currentTier = tierIdFromName(currentName as string);
    const targetTier = tierForMarketCap(mcap).id;
    if (targetTier === currentTier) return;

    // We only move forward — tier history is irreversible.
    if (targetTier < currentTier) {
      logger.info({ currentTier, targetTier }, "skipping downward tier change");
      return;
    }

    const last = await lastTierTransition();
    if (last && tierIdFromName(last.to_tier as unknown as string) >= targetTier) {
      logger.info({ to: last.to_tier }, "tier already recorded; updating state only");
      await patchTokenState({ current_tier: TIER_NAME[targetTier] });
      return;
    }

    await executeTierTransition(currentTier, targetTier, mcap);
  } finally {
    busy = false;
  }
}

export async function executeTierTransition(
  from: Tier,
  to: Tier,
  mcap: number,
): Promise<void> {
  const def = TIERS[to];
  if (!def) return;
  logger.info({ from, to, mcap }, "executing tier transition");

  await insertTierTransition(from, to, mcap);
  await patchTokenState({ current_tier: def.name });

  const snapshotCount = await captureSnapshot(to);

  // Enable features per tier.
  if (to >= 2) await patchBotConfig({ defense_enabled: true, mm_enabled: true });
  if (to >= 3) await patchBotConfig({ rewards_enabled: true });
  if (to >= 0) await patchBotConfig({ volume_gen_enabled: true });

  // Open Treasury Decision vote.
  const vote = await openVote(to).catch((err) => {
    logger.warn({ err }, "openVote failed during tier transition");
    return null;
  });

  const summary = `🚀 Tier unlocked: ${def.name} at ${formatUsd(mcap)}. Snapshot of ${snapshotCount} wallets captured.`;
  await logActivity("TIER_UNLOCK", summary, {
    from,
    to,
    tierName: def.name,
    mcap,
    snapshotCount,
    voteId: vote?.id,
  });

  const post = `🚀 *$PULSE Tier ${to}: ${def.name}* @ ${formatUsd(mcap)}\n${snapshotCount} wallets snapshotted${
    vote ? `\nVote open — closes <t:${Math.floor(new Date(vote.closes_at).getTime() / 1000)}:R>` : ""
  }`;
  await postTelegram(post);
}
