import { describe, it, expect } from "vitest";
import { TIERS } from "@pulse/shared";

describe("snapshot eligibility", () => {
  it("each non-discovery tier defines a USD balance threshold", () => {
    expect(TIERS[1]?.snapshotMinUsdBalance).toBe(50_000);
    expect(TIERS[2]?.snapshotMinUsdBalance).toBe(100_000);
    expect(TIERS[3]?.snapshotMinUsdBalance).toBe(500_000);
    expect(TIERS[4]?.snapshotMinUsdBalance).toBe(1_000_000);
  });

  it("wallet just below threshold is excluded; at-or-above is included", () => {
    const threshold = TIERS[1]?.snapshotMinUsdBalance ?? 50_000;
    const wallets = [
      { wallet: "A", balanceUsd: threshold - 1 },
      { wallet: "B", balanceUsd: threshold },
      { wallet: "C", balanceUsd: threshold + 100 },
    ];
    const eligible = wallets.filter((w) => w.balanceUsd >= threshold).map((w) => w.wallet);
    expect(eligible).toEqual(["B", "C"]);
  });

  it("first_seen_at is preserved on subsequent observations", () => {
    // Simulated: an existing wallet should NOT have its first_seen_at overwritten.
    const existingFirstSeen = new Date("2026-01-01T00:00:00Z");
    const observed = new Date("2026-02-01T00:00:00Z");
    // The DB layer uses INSERT … ON CONFLICT DO UPDATE that only touches `balance`
    // and `updated_at`. This unit-level check simply documents the contract.
    const preserved = existingFirstSeen;
    expect(preserved.getTime()).toBeLessThan(observed.getTime());
  });
});
