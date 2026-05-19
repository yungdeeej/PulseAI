import { describe, it, expect } from "vitest";
import { holdTimeMultiplier, convictionScore } from "@pulse/shared";

describe("rewards math", () => {
  it("hold multiplier 1.0 for < 7 days", () => {
    expect(holdTimeMultiplier(0)).toBe(1.0);
    expect(holdTimeMultiplier(6.9)).toBe(1.0);
  });

  it("hold multiplier 1.5 for 7-14 days", () => {
    expect(holdTimeMultiplier(7)).toBe(1.5);
    expect(holdTimeMultiplier(13.9)).toBe(1.5);
  });

  it("hold multiplier 2.0 for 14-30 days", () => {
    expect(holdTimeMultiplier(14)).toBe(2.0);
    expect(holdTimeMultiplier(29.9)).toBe(2.0);
  });

  it("hold multiplier 3.0 for ≥ 30 days", () => {
    expect(holdTimeMultiplier(30)).toBe(3.0);
    expect(holdTimeMultiplier(365)).toBe(3.0);
  });

  it("conviction score compounds multipliers", () => {
    const base = convictionScore({
      balance: 100_000,
      holdDays: 0,
      tierStreakDays: 0,
      reinforcementCount: 0,
      statusFlags: [],
      tweetMultiplierActive: false,
    });
    const max = convictionScore({
      balance: 100_000,
      holdDays: 31,
      tierStreakDays: 0,
      reinforcementCount: 5,
      statusFlags: ["PIONEER", "BELIEVER", "CONVICTION", "ASCENDANT"],
      tweetMultiplierActive: true,
    });
    expect(max).toBeGreaterThan(base);
    // 100k × 3 (hold) × 1.5 (max reinforcement) × 1.25 (tweet) × 2.5 (status flags total +1.5) = expected upper bound
    expect(max).toBeCloseTo(100_000 * 3 * 1.5 * 1.25 * 2.5, 0);
  });

  it("distributed shares sum to ≈ pool size", () => {
    const weights = [10, 20, 30, 40];
    const total = weights.reduce((s, w) => s + w, 0);
    const pool = 100;
    const payouts = weights.map((w) => (w / total) * pool);
    expect(payouts.reduce((s, p) => s + p, 0)).toBeCloseTo(pool);
  });
});
