import { TWEET_BONUS_DURATION_DAYS, TWEET_LIKES_THRESHOLD } from "@pulse/shared";
import { pool } from "../db/pool.js";
import { fetchTweetMetrics, parseTweetId } from "../integrations/twitter.js";
import { logger } from "../utils/logger.js";
import { logActivity } from "../db/queries.js";

const PULSE_MENTION_RE = /\$PULSE/i;

/**
 * Public endpoint shim: a wallet submits a tweet URL for verification.
 * Performs structural checks (mentions $PULSE, posted ≤ 24h ago) and inserts a
 * `pending` row. The like-poll cron promotes it to `active` when the threshold
 * is reached.
 */
export async function submitTweet(args: { wallet: string; url: string }): Promise<{
  ok: boolean;
  reason?: string;
  id?: string;
}> {
  const tweetId = parseTweetId(args.url);
  if (!tweetId) return { ok: false, reason: "could not parse tweet id" };

  const dupe = await pool.query("SELECT id FROM tweet_multipliers WHERE tweet_id = $1", [tweetId]);
  if (dupe.rowCount && dupe.rowCount > 0) {
    return { ok: false, reason: "tweet already submitted" };
  }

  const metrics = await fetchTweetMetrics(tweetId);
  if (!metrics) return { ok: false, reason: "could not fetch tweet metrics" };
  if (!PULSE_MENTION_RE.test(metrics.text)) return { ok: false, reason: "tweet must mention $PULSE" };

  const ageMs = Date.now() - new Date(metrics.created_at).getTime();
  if (ageMs > 24 * 3600_000) return { ok: false, reason: "tweet older than 24h" };

  const r = await pool.query<{ id: string }>(
    `INSERT INTO tweet_multipliers (wallet, tweet_url, tweet_id, status, likes)
     VALUES ($1, $2, $3, 'pending', $4) RETURNING id`,
    [args.wallet, args.url, tweetId, metrics.like_count],
  );
  return { ok: true, id: r.rows[0]?.id };
}

export async function pollTweetEngagements(): Promise<void> {
  const r = await pool.query<{ id: string; tweet_id: string; wallet: string }>(
    "SELECT id, tweet_id, wallet FROM tweet_multipliers WHERE status = 'pending'",
  );

  for (const row of r.rows) {
    const metrics = await fetchTweetMetrics(row.tweet_id);
    if (!metrics) continue;
    await pool.query("UPDATE tweet_multipliers SET likes = $1 WHERE id = $2", [
      metrics.like_count,
      row.id,
    ]);
    if (metrics.like_count >= TWEET_LIKES_THRESHOLD) {
      const expires = new Date(Date.now() + TWEET_BONUS_DURATION_DAYS * 86400_000);
      await pool.query(
        `UPDATE tweet_multipliers
         SET status = 'active', awarded_at = NOW(), expires_at = $1
         WHERE id = $2`,
        [expires, row.id],
      );
      await logActivity(
        "TWEET_BONUS_AWARDED",
        `Tweet bonus awarded to ${row.wallet} (+0.25x for 7d)`,
        { wallet: row.wallet, tweetId: row.tweet_id, likes: metrics.like_count },
      );
      logger.info({ wallet: row.wallet, tweetId: row.tweet_id }, "tweet bonus active");
    }
  }

  // Expire bonuses
  await pool.query(
    `UPDATE tweet_multipliers SET status = 'expired'
     WHERE status = 'active' AND expires_at < NOW()`,
  );
}
