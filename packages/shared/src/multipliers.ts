import type { StatusFlag } from "./tiers.js";

export const STATUS_MULTIPLIERS: Readonly<Record<StatusFlag, number>> = {
  PIONEER: 0.5,
  BELIEVER: 0.25,
  CONVICTION: 0.25,
  ASCENDANT: 0.5,
} as const;

export interface HoldTimeTier {
  minDays: number;
  maxDays: number;
  multiplier: number;
}

export const HOLD_TIME_TIERS: readonly HoldTimeTier[] = [
  { minDays: 0, maxDays: 7, multiplier: 1.0 },
  { minDays: 7, maxDays: 14, multiplier: 1.5 },
  { minDays: 14, maxDays: 30, multiplier: 2.0 },
  { minDays: 30, maxDays: Number.POSITIVE_INFINITY, multiplier: 3.0 },
] as const;

export function holdTimeMultiplier(days: number): number {
  for (const tier of HOLD_TIME_TIERS) {
    if (days >= tier.minDays && days < tier.maxDays) return tier.multiplier;
  }
  return 1.0;
}

export const REINFORCEMENT_BONUS_STEP = 0.1;
export const REINFORCEMENT_BONUS_CAP = 0.5;

export function reinforcementBonus(count: number): number {
  return Math.min(REINFORCEMENT_BONUS_CAP, count * REINFORCEMENT_BONUS_STEP);
}

export const TWEET_BONUS = 0.25;
export const TWEET_BONUS_DURATION_DAYS = 7;
export const TWEET_LIKES_THRESHOLD = 100;
