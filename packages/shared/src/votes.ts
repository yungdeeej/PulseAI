import type { Tier } from "./tiers.js";

export type VoteStatus = "open" | "closed" | "executed" | "failed";

export type VoteOption =
  | "Buy + Burn"
  | "Hold & Compound"
  | "Reinforce MM"
  | "Hold"
  | "Holder Airdrop"
  | "Treasury Trade"
  | "Pulse Wars"
  | "Permanent Strategy";

export const VOTE_OPTIONS_BY_TIER: Readonly<Record<Tier, readonly VoteOption[]>> = {
  0: ["Hold & Compound"],
  1: ["Buy + Burn", "Hold & Compound"],
  2: ["Buy + Burn", "Reinforce MM", "Hold"],
  3: [
    "Buy + Burn",
    "Holder Airdrop",
    "Reinforce MM",
    "Treasury Trade",
    "Pulse Wars",
    "Hold",
  ],
  4: [
    "Buy + Burn",
    "Holder Airdrop",
    "Reinforce MM",
    "Treasury Trade",
    "Pulse Wars",
    "Permanent Strategy",
  ],
} as const;

export const VOTE_DURATION_HOURS = 72;
