import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";

interface TweetMetrics {
  like_count: number;
  retweet_count: number;
  reply_count: number;
  text: string;
  author_id: string;
  created_at: string;
}

/**
 * Twitter integration is READ-ONLY by design. Posting via the v2 API requires
 * a paid tier; the free Essential tier only allows reads with a Bearer token.
 * Telegram is the project's broadcast channel — see integrations/telegram.ts.
 *
 * This module exposes only the calls the tweet-multiplier system needs:
 * fetching tweet metrics and parsing tweet IDs out of submission URLs.
 */

/** Verify a tweet matches PULSE rules: must mention $PULSE, posted in last 24h, author follows project. */
export async function fetchTweetMetrics(tweetId: string): Promise<TweetMetrics | null> {
  if (!env.TWITTER_BEARER_TOKEN) return null;
  const url = `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics,created_at,author_id&expansions=author_id`;
  return retry(
    async () => {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${env.TWITTER_BEARER_TOKEN}` },
      });
      if (!res.ok) {
        logger.warn({ status: res.status }, "twitter fetch failed");
        return null;
      }
      const data = (await res.json()) as {
        data?: {
          id: string;
          text: string;
          public_metrics: {
            like_count: number;
            retweet_count: number;
            reply_count: number;
          };
          author_id: string;
          created_at: string;
        };
      };
      if (!data.data) return null;
      return {
        like_count: data.data.public_metrics.like_count,
        retweet_count: data.data.public_metrics.retweet_count,
        reply_count: data.data.public_metrics.reply_count,
        text: data.data.text,
        author_id: data.data.author_id,
        created_at: data.data.created_at,
      };
    },
    { label: "twitter:fetch" },
  );
}

export function parseTweetId(url: string): string | null {
  const m = url.match(/status\/(\d+)/);
  return m?.[1] ?? null;
}
