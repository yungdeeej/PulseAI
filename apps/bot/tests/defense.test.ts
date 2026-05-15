import { describe, it, expect } from "vitest";
import {
  DEFENSE_COOLDOWN_MS,
  DEFENSE_DEPLOY_FRACTION,
  DEFENSE_TRIGGER_DROP_PCT,
  REINFORCEMENT_WINDOW_MINUTES,
} from "../src/config/constants.js";
import { pctChange } from "../src/utils/math.js";

describe("defense trigger logic", () => {
  it("fires at exactly -25%", () => {
    const drop = pctChange(100, 75);
    expect(drop).toBeCloseTo(-25);
    expect(drop <= DEFENSE_TRIGGER_DROP_PCT).toBe(true);
  });

  it("does not fire at -24.9%", () => {
    const drop = pctChange(100, 75.1);
    expect(drop).toBeGreaterThan(DEFENSE_TRIGGER_DROP_PCT);
  });

  it("does fire at -25.0001%", () => {
    const drop = pctChange(100, 74.999);
    expect(drop).toBeLessThanOrEqual(DEFENSE_TRIGGER_DROP_PCT);
  });

  it("respects 2h cooldown constant", () => {
    expect(DEFENSE_COOLDOWN_MS).toBe(2 * 60 * 60 * 1000);
  });

  it("opens a 30-minute reinforcement window", () => {
    expect(REINFORCEMENT_WINDOW_MINUTES).toBe(30);
  });

  it("deploys 30% of Defense Vault", () => {
    expect(DEFENSE_DEPLOY_FRACTION).toBeCloseTo(0.3);
  });
});
