import {
  convictionScore,
  holdTimeMultiplier,
  reinforcementBonus,
  STATUS_MULTIPLIERS,
  type StatusFlag,
} from "@pulse/shared";
import {
  getHolderBalance,
  getWalletStatus,
  getStreak,
  reinforcementCount,
  getVault,
} from "../db/queries.js";
import { pool } from "../db/pool.js";
import { daysBetween } from "../utils/timewindow.js";

export interface ConvictionProfile {
  wallet: string;
  balance: number;
  hold_days: number;
  hold_multiplier: number;
  status_flags: StatusFlag[];
  status_bonus: number;
  streak_days: number;
  reinforcement_count: number;
  reinforcement_bonus: number;
  tweet_multiplier_active: boolean;
  weight: number;
}

/**
 * Full multiplier breakdown for one wallet — the "My Pulse" surface. Returns
 * a zeroed profile (weight 0) for wallets we have never seen hold the token.
 */
export async function walletConvictionProfile(wallet: string): Promise<ConvictionProfile> {
  const balance = await getHolderBalance(wallet);
  const bal = Number(balance?.balance ?? 0);
  const holdDays = balance ? daysBetween(balance.first_seen_at, new Date()) : 0;

  const status = await getWalletStatus(wallet);
  const flags: StatusFlag[] = [];
  if (status?.pioneer) flags.push("PIONEER");
  if (status?.believer) flags.push("BELIEVER");
  if (status?.conviction) flags.push("CONVICTION");
  if (status?.ascendant) flags.push("ASCENDANT");

  const streak = await getStreak(wallet);
  const rCount = await reinforcementCount(wallet);
  const tweetActive = await walletHasActiveTweetBonus(wallet);

  const weight =
    bal > 0
      ? convictionScore({
          balance: bal,
          holdDays,
          tierStreakDays: Number(streak?.current_days ?? 0),
          reinforcementCount: rCount,
          statusFlags: flags,
          tweetMultiplierActive: tweetActive,
        })
      : 0;

  return {
    wallet,
    balance: bal,
    hold_days: +holdDays.toFixed(2),
    hold_multiplier: holdTimeMultiplier(holdDays),
    status_flags: flags,
    status_bonus: flags.reduce((s, f) => s + STATUS_MULTIPLIERS[f], 0),
    streak_days: Number(streak?.current_days ?? 0),
    reinforcement_count: rCount,
    reinforcement_bonus: reinforcementBonus(rCount),
    tweet_multiplier_active: tweetActive,
    weight,
  };
}

export async function walletConvictionWeight(wallet: string): Promise<number> {
  return (await walletConvictionProfile(wallet)).weight;
}

async function walletHasActiveTweetBonus(wallet: string): Promise<boolean> {
  const r = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM tweet_multipliers
       WHERE wallet = $1 AND status = 'active' AND expires_at > NOW()`,
    [wallet],
  );
  return Number(r.rows[0]?.c ?? 0) > 0;
}

// ----------------------------------------------------------------
// Projected "Split Rewards" share + leaderboard. Both fan out over the
// whole holder table, so results are memoised for 60 s.
// ----------------------------------------------------------------

interface ShareCacheEntry {
  at: number;
  totalWeight: number;
  poolSol: number;
  weights: Map<string, number>;
}
let shareCache: ShareCacheEntry | null = null;
const SHARE_CACHE_MS = 60_000;
const TOP_BALANCES_SCANNED = 200;

async function computeShareTable(): Promise<ShareCacheEntry> {
  if (shareCache && Date.now() - shareCache.at < SHARE_CACHE_MS) return shareCache;

  const decision = await getVault("DECISION");
  const poolSol = Number(decision?.balance_sol ?? 0);

  // Conviction is monotonic in balance for a fixed wallet, but multipliers can
  // promote smaller holders past bigger ones — scan a generous top slice by
  // balance and compute exact weights for those.
  const r = await pool.query<{ wallet: string }>(
    `SELECT wallet FROM holder_balances WHERE balance > 0
      ORDER BY balance DESC LIMIT $1`,
    [TOP_BALANCES_SCANNED],
  );

  const weights = new Map<string, number>();
  let totalWeight = 0;
  for (const row of r.rows) {
    const w = await walletConvictionWeight(row.wallet);
    if (w > 0) {
      weights.set(row.wallet, w);
      totalWeight += w;
    }
  }

  shareCache = { at: Date.now(), totalWeight, poolSol, weights };
  return shareCache;
}

export interface ProjectedShare {
  pool_sol: number;
  share_pct: number;
  projected_sol: number;
}

/** What this wallet would receive if "Split Rewards" won right now. */
export async function projectedRewardShare(wallet: string): Promise<ProjectedShare> {
  const table = await computeShareTable();
  let weight = table.weights.get(wallet);
  if (weight === undefined) {
    weight = await walletConvictionWeight(wallet);
  }
  const total = table.totalWeight + (table.weights.has(wallet) ? 0 : weight);
  const share = total > 0 && weight > 0 ? weight / total : 0;
  return {
    pool_sol: table.poolSol,
    share_pct: +(share * 100).toFixed(4),
    projected_sol: +(share * table.poolSol).toFixed(6),
  };
}

export interface LeaderboardEntry {
  wallet: string;
  weight: number;
  streak_days: number;
  hold_days: number;
  status_flags: StatusFlag[];
}

let lbCache: { at: number; rows: LeaderboardEntry[] } | null = null;

/** Top-10 conviction leaderboard (anonymised display handled by the client). */
export async function convictionLeaderboard(): Promise<LeaderboardEntry[]> {
  if (lbCache && Date.now() - lbCache.at < SHARE_CACHE_MS) return lbCache.rows;
  const table = await computeShareTable();
  const top = [...table.weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const rows: LeaderboardEntry[] = [];
  for (const [wallet, weight] of top) {
    const p = await walletConvictionProfile(wallet);
    rows.push({
      wallet,
      weight,
      streak_days: p.streak_days,
      hold_days: p.hold_days,
      status_flags: p.status_flags,
    });
  }
  lbCache = { at: Date.now(), rows };
  return rows;
}
