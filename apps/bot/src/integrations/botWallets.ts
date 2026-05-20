import { Keypair } from "@solana/web3.js";
import { tryLoadKeypair, type VaultName } from "./wallets.js";

const VAULTS: VaultName[] = ["BOT", "BURN"];

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
  // Also include the Decision Vault address env var (which may not have a
  // private key locally — the BOT keypair controls it per spec).
  const decisionAddr = process.env["DECISION_VAULT_ADDRESS"];
  if (decisionAddr) addrs.add(decisionAddr);
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
void Keypair;
