import { getTokenHolders } from "../integrations/helius.js";
import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";

/**
 * Sync holder balances from on-chain ground truth. Keeps the existing
 * `first_seen_at` for wallets we've seen before — that timestamp is critical
 * for hold-time multipliers and must never be reset.
 */
export async function syncHolderCount(): Promise<void> {
  const holders = await getTokenHolders();
  if (holders.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Upsert observed balances; preserve first_seen_at via ON CONFLICT.
    const values: unknown[] = [];
    const rowSql: string[] = [];
    holders.forEach((h, i) => {
      const base = i * 2;
      rowSql.push(`($${base + 1}, $${base + 2})`);
      values.push(h.owner, h.amount);
    });
    if (rowSql.length > 0) {
      await client.query(
        `INSERT INTO holder_balances (wallet, balance, first_seen_at, updated_at)
         VALUES ${rowSql
           .map((s) => s.replace(")", ", NOW(), NOW())"))
           .join(", ")}
         ON CONFLICT (wallet) DO UPDATE
           SET balance = EXCLUDED.balance,
               updated_at = NOW()`,
        values,
      );
    }
    // Zero-out wallets no longer present.
    const owners = holders.map((h) => h.owner);
    await client.query(
      `UPDATE holder_balances SET balance = 0, updated_at = NOW()
         WHERE balance > 0 AND wallet != ALL($1::text[])`,
      [owners],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.warn({ err }, "holder sync rolled back");
    throw err;
  } finally {
    client.release();
  }
}
