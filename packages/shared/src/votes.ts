import type { Tier } from "./tiers.js";

export type VoteStatus = "open" | "closed" | "executed" | "failed";

export type VoteOption = "Defend Chart" | "Split Rewards";

export const VOTE_OPTIONS: readonly VoteOption[] = ["Defend Chart", "Split Rewards"] as const;

export const VOTE_OPTIONS_BY_TIER: Readonly<Record<Tier, readonly VoteOption[]>> = {
  0: VOTE_OPTIONS,
  1: VOTE_OPTIONS,
  2: VOTE_OPTIONS,
  3: VOTE_OPTIONS,
  4: VOTE_OPTIONS,
} as const;

export const VOTE_DURATION_HOURS = 72;
