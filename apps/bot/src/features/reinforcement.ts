import { pool } from "../db/pool.js";

/** Sum of reinforcement events for a wallet. */
export async function getReinforcementCount(wallet: string): Promise<number> {
  const r = await pool.query<{ c: number }>(
    "SELECT COUNT(*)::int AS c FROM reinforcement_log WHERE wallet = $1",
    [wallet],
  );
  return Number(r.rows[0]?.c ?? 0);
}

/** Top reinforcement participants for leaderboard display. */
export async function topReinforcers(limit = 10) {
  const r = await pool.query<{ wallet: string; events: number; sol_spent: number }>(
    `SELECT wallet, COUNT(*)::int AS events, SUM(sol_spent)::float AS sol_spent
       FROM reinforcement_log
       GROUP BY wallet
       ORDER BY events DESC, sol_spent DESC
       LIMIT $1`,
    [limit],
  );
  return r.rows;
}
