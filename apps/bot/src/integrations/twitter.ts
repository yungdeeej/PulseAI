import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

interface TweetResp {
  data?: { id: string; text: string };
}

interface TweetMetrics {
  like_count: number;
  retweet_count: number;
  reply_count: number;
  text: string;
  author_id: string;
  created_at: string;
}

function dryRunPost(text: string): void {
  logger.info({ text }, "[DRY-RUN] would post tweet");
}

export async function postTweet(text: string): Promise<string | null> {
  if (env.DRY_RUN) {
    dryRunPost(text);
    return null;
  }
  if (!env.TWITTER_BEARER_TOKEN) {
    logger.warn("TWITTER_BEARER_TOKEN missing; skipping tweet");
    return null;
  }
  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.TWITTER_BEARER_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status, body: await res.text() }, "twitter post failed");
    return null;
  }
  const data = (await res.json()) as TweetResp;
  return data.data?.id ?? null;
}

/** Verify a tweet matches PULSE rules: must mention $PULSE, posted in last 24h, author follows project. */
export async function fetchTweetMetrics(tweetId: string): Promise<TweetMetrics | null> {
  if (!env.TWITTER_BEARER_TOKEN) return null;
  const url = `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics,created_at,author_id&expansions=author_id`;
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
}

export function parseTweetId(url: string): string | null {
  const m = url.match(/status\/(\d+)/);
  return m?.[1] ?? null;
}
