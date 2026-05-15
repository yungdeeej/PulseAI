export type VaultKind =
  | "DECISION"
  | "DEFENSE"
  | "REWARDS"
  | "LIQUIDITY"
  | "OPERATIONS";

export const VAULT_KINDS: readonly VaultKind[] = [
  "DECISION",
  "DEFENSE",
  "REWARDS",
  "LIQUIDITY",
  "OPERATIONS",
] as const;

export const VAULT_FEE_SHARE: Readonly<Record<VaultKind, number>> = {
  DECISION: 0.35,
  DEFENSE: 0.3,
  REWARDS: 0.25,
  LIQUIDITY: 0.05,
  OPERATIONS: 0.05,
} as const;
