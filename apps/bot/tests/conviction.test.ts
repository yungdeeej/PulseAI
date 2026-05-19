import { describe, it, expect } from "vitest";
import {
  convictionScore,
  reinforcementBonus,
  REINFORCEMENT_BONUS_CAP,
} from "@pulse/shared";

describe("conviction score formula", () => {
  it("zero balance → zero score", () => {
    expect(
      convictionScore({
        balance: 0,
        holdDays: 30,
        tierStreakDays: 0,
        reinforcementCount: 0,
        statusFlags: [],
        tweetMultiplierActive: false,
      }),
    ).toBe(0);
  });

  it("reinforcement bonus capped at +0.5x", () => {
    expect(reinforcementBonus(5)).toBe(REINFORCEMENT_BONUS_CAP);
    expect(reinforcementBonus(10)).toBe(REINFORCEMENT_BONUS_CAP);
    expect(reinforcementBonus(2)).toBe(0.2);
  });

  it("tier streak bonus scales with days", () => {
    const noStreak = convictionScore({
      balance: 100,
      holdDays: 0,
      tierStreakDays: 0,
      reinforcementCount: 0,
      statusFlags: [],
      tweetMultiplierActive: false,
    });
    const withStreak = convictionScore({
      balance: 100,
      holdDays: 0,
      tierStreakDays: 30,
      reinforcementCount: 0,
      statusFlags: [],
      tweetMultiplierActive: false,
    });
    expect(withStreak).toBeGreaterThan(noStreak);
  });

  it("status flags compound additively", () => {
    const single = convictionScore({
      balance: 1,
      holdDays: 0,
      tierStreakDays: 0,
      reinforcementCount: 0,
      statusFlags: ["PIONEER"],
      tweetMultiplierActive: false,
    });
    const all = convictionScore({
      balance: 1,
      holdDays: 0,
      tierStreakDays: 0,
      reinforcementCount: 0,
      statusFlags: ["PIONEER", "BELIEVER", "CONVICTION", "ASCENDANT"],
      tweetMultiplierActive: false,
    });
    expect(all).toBeGreaterThan(single);
    expect(single).toBeCloseTo(1.5); // 1 × 1 × 1 × 1 × 1.5 × 1
    expect(all).toBeCloseTo(2.5); // status bonus = 0.5+0.25+0.25+0.5 = 1.5; factor 2.5
  });
});
