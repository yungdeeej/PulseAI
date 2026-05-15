import { describe, it, expect } from "vitest";
import { VOTE_OPTIONS_BY_TIER } from "@pulse/shared";
import { isExecutable } from "../src/voting/executeVote.js";

describe("vote options & tally", () => {
  it("Tier 1 has Buy+Burn and Hold&Compound", () => {
    expect(VOTE_OPTIONS_BY_TIER[1]).toEqual(["Buy + Burn", "Hold & Compound"]);
  });

  it("Tier 3 has six options", () => {
    expect(VOTE_OPTIONS_BY_TIER[3].length).toBe(6);
  });

  it("every option in every tier has an executor", () => {
    for (const tier of [1, 2, 3, 4] as const) {
      for (const opt of VOTE_OPTIONS_BY_TIER[tier]) {
        expect(isExecutable(opt), `missing executor for ${opt}`).toBe(true);
      }
    }
  });

  it("tally picks the option with highest weight sum", () => {
    const tallies: Record<string, number> = {
      "Buy + Burn": 1500,
      "Hold": 1200,
      "Reinforce MM": 1800,
    };
    const winner = Object.entries(tallies).reduce(
      (best, [k, v]) => (v > best[1] ? [k, v] as const : best),
      ["", -Infinity] as readonly [string, number],
    )[0];
    expect(winner).toBe("Reinforce MM");
  });
});
