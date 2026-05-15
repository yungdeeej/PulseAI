export type Tier = 0 | 1 | 2 | 3 | 4;

export type TierName =
  | "DISCOVERY"
  | "IGNITION"
  | "MOMENTUM"
  | "CONVICTION"
  | "ASCENSION";

export interface TierDef {
  id: Tier;
  name: TierName;
  minUsd: number;
  maxUsd: number;
  snapshotMinUsdBalance: number;
  statusFlag: StatusFlag | null;
}

export type StatusFlag = "PIONEER" | "BELIEVER" | "CONVICTION" | "ASCENDANT";

export const TIERS: readonly TierDef[] = [
  {
    id: 0,
    name: "DISCOVERY",
    minUsd: 0,
    maxUsd: 69_000,
    snapshotMinUsdBalance: 0,
    statusFlag: null,
  },
  {
    id: 1,
    name: "IGNITION",
    minUsd: 69_000,
    maxUsd: 300_000,
    snapshotMinUsdBalance: 50_000,
    statusFlag: "PIONEER",
  },
  {
    id: 2,
    name: "MOMENTUM",
    minUsd: 300_000,
    maxUsd: 1_000_000,
    snapshotMinUsdBalance: 100_000,
    statusFlag: "BELIEVER",
  },
  {
    id: 3,
    name: "CONVICTION",
    minUsd: 1_000_000,
    maxUsd: 5_000_000,
    snapshotMinUsdBalance: 500_000,
    statusFlag: "CONVICTION",
  },
  {
    id: 4,
    name: "ASCENSION",
    minUsd: 5_000_000,
    maxUsd: Number.POSITIVE_INFINITY,
    snapshotMinUsdBalance: 1_000_000,
    statusFlag: "ASCENDANT",
  },
] as const;

export function tierForMarketCap(mcapUsd: number): TierDef {
  // Highest tier whose minUsd is ≤ mcap. ASCENSION has no upper bound.
  let current = TIERS[0]!;
  for (const t of TIERS) {
    if (mcapUsd >= t.minUsd) current = t;
  }
  return current;
}
