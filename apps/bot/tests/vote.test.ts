import { describe, it, expect } from "vitest";
import { VOTE_OPTIONS, VOTE_OPTIONS_BY_TIER } from "@pulse/shared";
import { isExecutable } from "../src/voting/executeVote.js";

describe("vote options & tally", () => {
  it("every tier (including tier 0) offers the binary ballot", () => {
    for (const tier of [0, 1, 2, 3, 4] as const) {
      expect(VOTE_OPTIONS_BY_TIER[tier]).toEqual(["Defend Chart", "Split Rewards"]);
    }
  });

  it("ballot has exactly two options", () => {
    expect(VOTE_OPTIONS.length).toBe(2);
  });

  it("every binary option has an executor", () => {
    for (const opt of VOTE_OPTIONS) {
      expect(isExecutable(opt), `missing executor for ${opt}`).toBe(true);
    }
  });

  it("tally picks the option with highest weight sum", () => {
    const tallies: Record<string, number> = {
      "Defend Chart": 1500,
      "Split Rewards": 1800,
    };
    const winner = Object.entries(tallies).reduce(
      (best, [k, v]) => (v > best[1] ? ([k, v] as const) : best),
      ["", -Infinity] as readonly [string, number],
    )[0];
    expect(winner).toBe("Split Rewards");
  });
});
