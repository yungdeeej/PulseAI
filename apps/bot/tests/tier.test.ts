import { describe, it, expect } from "vitest";
import { TIERS, tierForMarketCap } from "@pulse/shared";

describe("tier thresholds", () => {
  it("returns DISCOVERY at 0", () => {
    expect(tierForMarketCap(0).name).toBe("DISCOVERY");
  });
  it("returns DISCOVERY just below IGNITION", () => {
    expect(tierForMarketCap(68_999).name).toBe("DISCOVERY");
  });
  it("crosses into IGNITION at exactly $69K", () => {
    expect(tierForMarketCap(69_000).name).toBe("IGNITION");
  });
  it("crosses into MOMENTUM at exactly $300K", () => {
    expect(tierForMarketCap(300_000).name).toBe("MOMENTUM");
  });
  it("crosses into CONVICTION at exactly $1M", () => {
    expect(tierForMarketCap(1_000_000).name).toBe("CONVICTION");
  });
  it("crosses into ASCENSION at exactly $5M", () => {
    expect(tierForMarketCap(5_000_000).name).toBe("ASCENSION");
  });
  it("stays in ASCENSION for arbitrarily large mcap", () => {
    expect(tierForMarketCap(1_000_000_000).name).toBe("ASCENSION");
  });
  it("each tier has a defined statusFlag except DISCOVERY", () => {
    const flagged = TIERS.filter((t) => t.statusFlag !== null);
    expect(flagged.map((t) => t.name)).toEqual([
      "IGNITION",
      "MOMENTUM",
      "CONVICTION",
      "ASCENSION",
    ]);
  });
});
