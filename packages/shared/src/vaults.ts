export type VaultKind = "DECISION";

export const VAULT_KINDS: readonly VaultKind[] = ["DECISION"] as const;

export const VAULT_FEE_SHARE: Readonly<Record<VaultKind, number>> = {
  DECISION: 1.0,
} as const;
