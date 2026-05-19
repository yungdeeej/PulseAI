import cron from "node-cron";
import { env, loadEnv } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { createWebhookApp } from "./monitors/heliusWebhook.js";
import { syncAll } from "./monitors/stateSync.js";
import { defenseTick } from "./actions/defense.js";
import { mmTick } from "./actions/marketMaker.js";
import { startVolumeGenerator, stopVolumeGenerator } from "./actions/volumeGenerator.js";
import { distributeWeeklyRewards } from "./actions/rewards.js";
import { tickClosingVotes } from "./voting/tallyVote.js";
import { recordPriceSample } from "./monitors/priceTracker.js";
import { startDryRunGenerator, stopDryRunGenerator } from "./monitors/dryRunGenerator.js";
import { recomputeAllStreaks } from "./features/streak.js";
import { pollTweetEngagements } from "./features/tweetMultiplier.js";
import { evaluateHoldBounties, maybeOpenBounty } from "./actions/bounty.js";
import { generateInsight, extractLifecycleMemories } from "./features/aiConsciousness.js";
import {
  BETTERSTACK_PING_MS,
  BOT_CONFIG_POLL_MS,
  DEFENSE_LOOP_INTERVAL_MS,
  MM_STATE_INTERVAL_MS,
  STATE_SYNC_INTERVAL_MS,
} from "./config/constants.js";
import { pingHeartbeat } from "./utils/heartbeat.js";
import { applyMigrations } from "./db/migrations.js";
import { syncDryRunFlag } from "./utils/safety.js";
import { getBotConfig } from "./db/queries.js";
import { pool } from "./db/pool.js";
import { sleep } from "./utils/retry.js";

const timers: NodeJS.Timeout[] = [];
let paused = false;

async function main() {
  loadEnv();
  logger.info(
    {
      network: env.NETWORK,
      dry_run: env.DRY_RUN,
      port: env.PORT,
      mint: env.PULSE_MINT_ADDRESS ?? "(unset)",
    },
    "starting pulse bot",
  );

  if (process.env.AUTO_MIGRATE === "true") {
    await waitForDb();
    await applyMigrations();
  }
  await syncDryRunFlag();

  // 1. HTTP server (Helius webhook + health). Bind 0.0.0.0 so Replit's
  // port forwarder can reach us — localhost-only binds get a blank page.
  const app = createWebhookApp();
  const port = Number(env.PORT ?? 3001);
  app.listen(port, "0.0.0.0", () => logger.info({ port }, "webhook listener ready"));

  // 2. Pause flag poller
  timers.push(
    setInterval(async () => {
      try {
        const cfg = await getBotConfig();
        if (cfg.paused !== paused) {
          paused = cfg.paused;
          logger.info({ paused }, "bot pause flag changed");
        }
      } catch (err) {
        logger.warn({ err }, "config poll failed");
      }
    }, BOT_CONFIG_POLL_MS),
  );

  // 3. State sync (price, holders, vault balances)
  timers.push(
    setInterval(() => {
      syncAll().catch((err) => logger.error({ err }, "state sync failed"));
    }, STATE_SYNC_INTERVAL_MS),
  );

  // 4. Defense loop
  timers.push(
    setInterval(() => {
      defenseTick().catch((err) => logger.error({ err }, "defense tick failed"));
    }, DEFENSE_LOOP_INTERVAL_MS),
  );

  // 5. MM state publisher
  timers.push(
    setInterval(() => {
      mmTick().catch((err) => logger.error({ err }, "mm tick failed"));
    }, MM_STATE_INTERVAL_MS),
  );

  // 6. Volume bot (self-scheduling)
  startVolumeGenerator();

  // 6b. Dry-run synthetic data (no-op when DRY_RUN=false)
  startDryRunGenerator();

  // 7. Heartbeat
  timers.push(
    setInterval(() => {
      pingHeartbeat().catch(() => {});
    }, BETTERSTACK_PING_MS),
  );

  // 8. Cron jobs
  // Vote close watcher — every minute
  cron.schedule("* * * * *", () => {
    tickClosingVotes().catch((err) => logger.error({ err }, "vote close tick failed"));
  });
  // Price sample — every minute (gives the defense bot continuous data even
  // when no trades are landing).
  cron.schedule("* * * * *", () => {
    recordPriceSample().catch((err) => logger.warn({ err }, "price sample failed"));
  });
  // Bounty engine — every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    maybeOpenBounty().catch((err) => logger.warn({ err }, "bounty engine failed"));
    evaluateHoldBounties().catch((err) => logger.warn({ err }, "hold bounty eval failed"));
  });
  // Tweet engagement poll — hourly
  cron.schedule("0 * * * *", () => {
    pollTweetEngagements().catch((err) => logger.warn({ err }, "tweet poll failed"));
  });
  // Daily streak refresh — 00:00 UTC
  cron.schedule("0 0 * * *", () => {
    recomputeAllStreaks().catch((err) => logger.error({ err }, "streak refresh failed"));
  });
  // Weekly rewards — Sunday 00:00 UTC
  cron.schedule("0 0 * * 0", () => {
    distributeWeeklyRewards().catch((err) => logger.error({ err }, "rewards failed"));
  });
  // AI consciousness — extract durable memories first, then reflect.
  // Runs every 15 minutes plus a single warm-up shortly after boot.
  const consciousnessTick = async () => {
    try { await extractLifecycleMemories(); }
    catch (err) { logger.warn({ err }, "ai memory extraction failed"); }
    try { await generateInsight(); }
    catch (err) { logger.warn({ err }, "ai insight failed"); }
  };
  cron.schedule("*/15 * * * *", () => { void consciousnessTick(); });
  setTimeout(() => { void consciousnessTick(); }, 20_000);

  registerShutdown();
  logger.info("pulse bot online");
}

/**
 * On Replit Reserved VMs the Postgres sidecar can take a few seconds to
 * accept connections after the container starts. We give it up to ~30 s
 * before declaring boot a failure.
 */
async function waitForDb(): Promise<void> {
  const delays = [500, 1_000, 2_000, 4_000, 8_000, 16_000];
  for (let i = 0; i <= delays.length; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      const delay = delays[i];
      if (delay === undefined) throw err;
      logger.warn({ err: (err as Error).message, delay }, "db not ready yet — waiting");
      await sleep(delay);
    }
  }
}

function registerShutdown() {
  const close = async () => {
    logger.info("shutting down…");
    for (const t of timers) clearInterval(t);
    stopVolumeGenerator();
    stopDryRunGenerator();
    await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
