import {
  TIERS,
  type Tier,
  type TierDef,
} from "@pulse/shared";
import { pool } from "../db/pool.js";
import { insertSnapshot, flagWalletStatus, getTokenState } from "../db/queries.js";
import { logger } from "../utils/logger.js";

/**
 * At a tier crossing, capture every wallet whose USD-denominated balance meets
 * the tier's snapshotMinUsdBalance. Returns the count of wallets snapshotted.
 */
export async function captureSnapshot(tier: Tier): Promise<number> {
  const def = TIERS[tier];
  if (!def) return 0;
  if (def.snapshotMinUsdBalance <= 0 || !def.statusFlag) return 0;

  const state = await getTokenState();
  const priceUsd = Number(state?.price_usd ?? 0);
  if (priceUsd <= 0) {
    logger.warn({ tier }, "cannot snapshot without a known price");
    return 0;
  }
  const minTokens = def.snapshotMinUsdBalance / priceUsd;

  const r = await pool.query<{ wallet: string; balance: number }>(
    `SELECT wallet, balance FROM holder_balances WHERE balance >= $1`,
    [minTokens],
  );

  const rows = r.rows.map((h) => ({
    wallet: h.wallet,
    balance: Number(h.balance),
    balance_usd: Number(h.balance) * priceUsd,
  }));

  await insertSnapshot(tier, rows);

  const flag = def.statusFlag.toLowerCase() as
    | "pioneer"
    | "believer"
    | "conviction"
    | "ascendant";
  for (const row of rows) {
    await flagWalletStatus(row.wallet, flag);
  }

  logger.info({ tier: def.name, count: rows.length }, "snapshot captured");
  return rows.length;
}

export function tierMeta(tier: Tier): TierDef | undefined {
  return TIERS[tier];
}
