import {
  STATUS_MULTIPLIERS,
  holdTimeMultiplier,
  reinforcementBonus,
} from "./multipliers.js";
import type { StatusFlag } from "./tiers.js";

export interface ConvictionInputs {
  balance: number; // raw token balance (not USD)
  holdDays: number;
  tierStreakDays: number; // for tier_streak_bonus
  reinforcementCount: number;
  statusFlags: readonly StatusFlag[];
  tweetMultiplierActive: boolean;
}

/**
 * conviction_score = balance × hold_time_multiplier × tier_streak_bonus × reinforcement_bonus
 * Status flags and tweet bonus stack into a combined "reinforcement_bonus" factor as a multiplicative term.
 *
 * Each component is a "1 + bonus" factor so that the absence of bonuses leaves balance untouched.
 */
export function convictionScore(i: ConvictionInputs): number {
  const hold = holdTimeMultiplier(i.holdDays);
  const tierStreak = 1 + Math.min(0.5, i.tierStreakDays * 0.01); // +1% per day, capped at +50%
  let statusBonus = 0;
  for (const flag of i.statusFlags) statusBonus += STATUS_MULTIPLIERS[flag];
  const reinforcement = 1 + reinforcementBonus(i.reinforcementCount);
  const tweet = i.tweetMultiplierActive ? 1.25 : 1.0;
  const status = 1 + statusBonus;
  return i.balance * hold * tierStreak * reinforcement * status * tweet;
}
