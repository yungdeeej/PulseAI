import { PublicKey } from "@solana/web3.js";
import { env } from "../config/env.js";
import { getSolBalance } from "../integrations/wallets.js";
import { recordPriceSample } from "./priceTracker.js";
import { syncHolderCount } from "./holderTracker.js";
import { countActiveHolders, listVaults, patchTokenState, updateVaultBalances } from "../db/queries.js";
import { logger } from "../utils/logger.js";
import type { VaultKind } from "@pulse/shared";

const vaultEnv: Record<VaultKind, keyof typeof env> = {
  DECISION: "DECISION_VAULT_ADDRESS",
};

export async function syncVaultBalances(): Promise<void> {
  const vaults = await listVaults();
  for (const v of vaults) {
    const addr = (env[vaultEnv[v.kind]] as string | undefined) ?? v.address;
    if (!addr) continue;
    try {
      const sol = await getSolBalance(new PublicKey(addr));
      await updateVaultBalances(v.kind, sol, Number(v.balance_pulse), addr);
    } catch (err) {
      logger.warn({ err, vault: v.kind }, "vault balance sync failed");
    }
  }
}

export async function syncAll(): Promise<void> {
  try {
    await recordPriceSample();
  } catch (err) {
    logger.warn({ err }, "price sync failed");
  }
  try {
    await syncHolderCount();
    const c = await countActiveHolders(0);
    await patchTokenState({ holder_count: c });
  } catch (err) {
    logger.warn({ err }, "holder count sync failed");
  }
  try {
    await syncVaultBalances();
  } catch (err) {
    logger.warn({ err }, "vault sync failed");
  }
}
