import { Keypair } from "@solana/web3.js";
import { tryLoadKeypair, type VaultName } from "./wallets.js";

const VAULTS: VaultName[] = ["BOT", "BURN", "DEFENSE", "REWARDS", "LIQUIDITY", "OPERATIONS"];

let cached: Set<string> | null = null;

/**
 * Set of every wallet address that the bot itself controls. Used to flag
 * incoming trade events as `bot_initiated=true` for transparency.
 */
export function knownBotAddresses(): Set<string> {
  if (cached) return cached;
  const addrs = new Set<string>();
  for (const v of VAULTS) {
    const kp = tryLoadKeypair(v);
    if (kp) addrs.add(kp.publicKey.toBase58());
  }
  // Also include vault address env vars (which may not have a private key).
  for (const k of [
    "DECISION_VAULT_ADDRESS",
    "DEFENSE_VAULT_ADDRESS",
    "REWARDS_VAULT_ADDRESS",
    "LIQUIDITY_VAULT_ADDRESS",
    "OPERATIONS_VAULT_ADDRESS",
  ] as const) {
    const v = process.env[k];
    if (v) addrs.add(v);
  }
  cached = addrs;
  return cached;
}

/** Reset the cache — useful when env values change at runtime (tests). */
export function resetBotAddressCache(): void {
  cached = null;
}

export function isBotWallet(address: string): boolean {
  return knownBotAddresses().has(address);
}

// Side effect: ensure module always imports cleanly even if Keypair lookups throw.
void Keypair; // hold reference to avoid tree-shake