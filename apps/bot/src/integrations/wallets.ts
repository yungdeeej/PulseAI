import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { primaryConnection } from "./helius.js";
import { buildTipTx, submitBundle } from "./jito.js";
import { MAX_TX_SOL } from "../config/constants.js";

export type VaultName =
  | "BOT"
  | "BURN"
  | "DEFENSE"
  | "REWARDS"
  | "LIQUIDITY"
  | "OPERATIONS";

const envKeyMap: Record<VaultName, keyof typeof env> = {
  BOT: "BOT_WALLET_PRIVATE_KEY",
  BURN: "BURN_VAULT_PRIVATE_KEY",
  DEFENSE: "DEFENSE_VAULT_PRIVATE_KEY",
  REWARDS: "REWARDS_VAULT_PRIVATE_KEY",
  LIQUIDITY: "LIQUIDITY_VAULT_PRIVATE_KEY",
  OPERATIONS: "OPERATIONS_VAULT_PRIVATE_KEY",
};

const cache = new Map<VaultName, Keypair>();

export function loadKeypair(vault: VaultName): Keypair {
  const cached = cache.get(vault);
  if (cached) return cached;
  const secret = env[envKeyMap[vault]] as string | undefined;
  if (!secret) throw new Error(`Missing private key for vault ${vault}`);
  const kp = Keypair.fromSecretKey(bs58.decode(secret));
  cache.set(vault, kp);
  return kp;
}

export function tryLoadKeypair(vault: VaultName): Keypair | null {
  try {
    return loadKeypair(vault);
  } catch {
    return null;
  }
}

export async function getSolBalance(pubkey: PublicKey): Promise<number> {
  const lamports = await primaryConnection().getBalance(pubkey, "confirmed");
  return lamports / 1e9;
}

/**
 * Sign a Jupiter-built swap tx with the given wallet and submit it via a
 * Jito bundle (swap + tip). Honors DRY_RUN. Enforces the per-tx hot wallet cap.
 */
export async function sendBundledSwap(args: {
  payer: Keypair;
  tx: VersionedTransaction;
  solValue: number;
  tipLamports?: number;
}): Promise<string | null> {
  if (args.solValue > MAX_TX_SOL) {
    throw new Error(
      `tx of ${args.solValue} SOL exceeds hot-wallet cap of ${MAX_TX_SOL} SOL`,
    );
  }
  args.tx.sign([args.payer]);
  if (env.DRY_RUN) {
    logger.info({ solValue: args.solValue }, "[DRY-RUN] would submit Jito bundle");
    return null;
  }
  const tipTx = await buildTipTx(args.payer, args.tipLamports ?? 100_000);
  const bundleId = await submitBundle([args.tx, tipTx]);
  return bundleId;
}
