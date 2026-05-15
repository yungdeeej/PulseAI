import {
  HOLD_TIME_TIERS,
  holdTimeMultiplier,
  reinforcementBonus,
  STATUS_MULTIPLIERS,
  convictionScore,
  type ConvictionInputs,
  type StatusFlag,
} from "@pulse/shared";

export {
  holdTimeMultiplier,
  reinforcementBonus,
  STATUS_MULTIPLIERS,
  HOLD_TIME_TIERS,
  convictionScore,
};
export type { ConvictionInputs, StatusFlag };

export function marketCapUsd(priceUsd: number, totalSupply: number): number {
  return priceUsd * totalSupply;
}

export function pctChange(oldVal: number, newVal: number): number {
  if (oldVal === 0) return 0;
  return ((newVal - oldVal) / oldVal) * 100;
}

/** Beats Per Minute — trades per minute, smoothed from trades_per_hour. */
export function computeBpm(tradesPerHour: number): number {
  return Math.round(tradesPerHour / 60);
}

/** Status flag → status multiplier additive sum. */
export function combinedStatusBonus(flags: readonly StatusFlag[]): number {
  let sum = 0;
  for (const f of flags) sum += STATUS_MULTIPLIERS[f];
  return sum;
}
