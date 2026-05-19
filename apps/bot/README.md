# $PULSE Bot

Orchestration bot for the $PULSE memecoin: monitors trades, runs the five
treasury vaults, executes community Treasury Decisions, and writes everything
to Postgres for the dashboard to display.

> **Database note:** this build targets **Replit Hosted Postgres**, not
> Supabase. The migration in `packages/db/migrations/001_initial_schema.sql`
> uses vanilla Postgres only (no RLS, no Supabase Realtime). Access control is
> enforced via two DB roles: `pulse_bot` (read/write) and `pulse_reader`
> (SELECT only, used by the dashboard). Change events are broadcast via
> `LISTEN/NOTIFY` on channel names that match the table names.

## Local dev setup

```bash
pnpm install
cp apps/bot/.env.example apps/bot/.env
# fill in DATABASE_URL, HELIUS_API_KEY, and at minimum BOT_WALLET_PRIVATE_KEY
pnpm migrate
pnpm dev
```

## Applying the DB schema

Two options:

1. **CLI:** `pnpm migrate` — runs the migrate script which applies every SQL
   file in `packages/db/migrations/` in lexicographic order.
2. **Auto-migrate on boot:** set `AUTO_MIGRATE=true` and the bot will apply
   migrations before starting its loops.

Either way is idempotent — every `CREATE` uses `IF NOT EXISTS` or is wrapped
in a `DO $$` block that catches `duplicate_object`.

## Replit deployment

### One-time setup

1. **Import the repo into Replit.** The repo-level `.replit` already declares
   `nodejs-20`, the entrypoint (`apps/bot/src/index.ts`), the run command, and
   port forwarding (3001 → 80), so no manual config is needed.
2. **Attach Replit Hosted Postgres.** Tools → Database → "Connect". Replit
   injects `DATABASE_URL` into the Repl's env automatically. The bot's pool
   detects that URL and enables SSL with `rejectUnauthorized: false`, which
   is what Replit's Postgres requires.
3. **Add Secrets** (Tools → Secrets), copying every var from
   `apps/bot/.env.example` *except* `DATABASE_URL` (Replit already set that)
   and `PORT` (the `.replit` file sets it). Required for boot: `HELIUS_API_KEY`.
   Everything else can stay empty during dry-run.
4. **Hit Run.** The IDE script does `pnpm install --prefer-offline` and
   `AUTO_MIGRATE=true pnpm --filter @pulse/bot dev`. The bot:
   - applies migrations (idempotent)
   - waits up to ~30 s for the DB if it isn't ready yet
   - starts the webhook + dashboard API on port 3001
   - boots all monitors / cron jobs / dry-run generator
5. **Test the public URL.** Replit forwards 3001 → 80. Browse to
   `https://<repl>.<owner>.repl.co/healthz` and you should get
   `{"ok":true,"dry_run":true,"network":"mainnet-beta"}`.

### Going to production (Reserved VM)

1. Tools → Deployments → New deployment → **Reserved VM** ($7/mo).
2. Replit picks up the `[deployment]` block in `.replit`:
   - **Build:** `corepack enable && pnpm install --frozen-lockfile`
   - **Run:** `AUTO_MIGRATE=true pnpm --filter @pulse/bot start`
   - `start` uses `tsx` directly (no separate build step). This works around
     the TypeScript workspace path-alias issue cleanly and adds ~30 MB RSS —
     negligible on a Reserved VM.
3. The Reserved VM gets a stable public URL. Plug that URL into:
   - **Helius webhook:** target `https://<deploy-url>/helius/webhook`,
     authorization header set to `HELIUS_WEBHOOK_SECRET`.
   - **Better Stack heartbeat:** copy URL into `BETTERSTACK_HEARTBEAT_URL`.
     The bot pings every 60 s.
4. Flip `DRY_RUN` to `false` in Secrets when the token is live.

### Ports

| Local | External | Purpose |
|-------|----------|---------|
| 3001  | 80       | Webhook ingest + dashboard API |

The Express server binds explicitly to `0.0.0.0` so Replit's forwarder can
reach it. If you change `PORT`, update the `[[ports]]` block in `.replit`
to match.

## Vault wallet generation

```bash
solana-keygen new --no-bip39-passphrase --silent -o defense.json
solana-keygen pubkey defense.json     # → DEFENSE_VAULT_ADDRESS
cat defense.json | jq -r '.' | xxd …  # convert to base58 → *_PRIVATE_KEY
```

Recommended:
```bash
node -e 'const{Keypair}=require("@solana/web3.js");const bs58=require("bs58");const k=Keypair.generate();console.log("pub:",k.publicKey.toBase58());console.log("priv (base58):",bs58.encode(k.secretKey));'
```

Generate one each for: `BOT`, `BURN`, `DEFENSE`, `REWARDS`, `LIQUIDITY`,
`OPERATIONS`. Configure the same five vault addresses on pump.fun's Creator
Fee Sharing screen post-launch with the share percentages locked in
`packages/shared/src/vaults.ts`.

## Helius webhook

1. Sign up at https://helius.dev and create an API key.
2. Create a webhook of type "Enhanced Transactions" filtered by your
   `PULSE_MINT_ADDRESS`.
3. Set the target URL to `https://<your-replit-domain>/helius/webhook`.
4. Put any random string into the bot's `HELIUS_WEBHOOK_SECRET` and copy it
   into the webhook's authorization header — the bot rejects anything else.

## Twitter API app

1. Apply for a Project + App at https://developer.x.com.
2. Generate API key / secret + Access token / secret with read+write scope.
3. Also create a Bearer token (used for tweet lookups).
4. Paste all five into `.env`.

## Telegram bot

1. Chat with `@BotFather`, run `/newbot`, save the token.
2. Add the bot to your channel as admin.
3. Copy the channel id (e.g. `-1001234567890`) into `TELEGRAM_CHANNEL_ID`.

## DRY-RUN mode

`DRY_RUN=true` (default). In dry-run mode:
- Twitter / Telegram posts are logged, not sent.
- Jupiter quotes are still fetched, but tx submission is skipped.
- DB writes still happen, so the dashboard shows simulated activity.
- The `bot_config.dry_run` flag is synced from the env var on boot.
- A synthetic price + trade generator runs in the background, walking the
  market cap upward across every tier so demos can show the full lifecycle.
  Speed it up with `DRY_RUN_TIME_SCALE=60` (1 real second ≈ 1 simulated minute).

Use this for devnet runs and pre-launch demos.

## Public HTTP API

The same Express server that handles the Helius webhook also exposes the
endpoints the dashboard uses. All write endpoints require a wallet signature.

| Method | Path                              | Purpose |
|--------|-----------------------------------|---------|
| GET    | `/healthz`                        | Liveness |
| POST   | `/helius/webhook`                 | Helius enhanced-tx ingest (auth via `HELIUS_WEBHOOK_SECRET`) |
| GET    | `/votes/active`                   | Currently open Treasury Decision + live tally |
| GET    | `/votes/:id`                      | Vote + tally by id (open or closed) |
| POST   | `/votes`                          | Cast a vote (signed by wallet) |
| POST   | `/tweets`                         | Submit a tweet URL for multiplier verification |
| GET    | `/wallets/:wallet/conviction`     | Live preview of a wallet's vote weight |

### Admin endpoints

All admin routes require `Authorization: Bearer $ADMIN_SECRET`. If
`ADMIN_SECRET` is unset, the whole router is disabled (fail-closed).

| Method | Path                              | Purpose |
|--------|-----------------------------------|---------|
| POST   | `/admin/votes/:id/target`         | Set `target_mint` on an open vote (Treasury Trade / Pulse Wars) |
| POST   | `/admin/pause`                    | `{ paused: true \| false }` |
| GET    | `/admin/config`                   | Inspect current `bot_config` |

## Notifications

Telegram is the **sole** broadcast channel. Twitter posting is intentionally
not implemented — the v2 API requires a paid tier ($100+/mo) and the project
doesn't want that recurring cost. The Twitter Bearer token is still used in
read-only mode to verify tweets for the multiplier system.

## Market maker behavior

The MM is implemented as **tiered reactive defense**, not orderbook
seeding. Memecoin liquidity post-pump.fun-graduation lives in a Raydium
AMM pool — there's no order book to seed walls against. So the bot:

  - Publishes the desired wall plan (-2 / -5 / -10 % buy, +3 / +7 / +15 %
    sell) to `mm_state` for dashboard display.
  - When price drops through each buy-wall level, executes a sized buy
    from the Defense Vault with a 10-min per-wall cooldown. Each wall
    deploys at most 10 % of its notional size per tick (≤ 1 SOL cap),
    so a single dump can't drain the vault.
  - Sell walls become active once the bot accrues PULSE inventory from
    earlier defense buybacks — the same pattern fires in reverse.

This is layered above the catastrophic -25 % / 1h defense trigger, which
remains the primary backstop.

`POST /votes` body:
```json
{
  "wallet": "<base58 pubkey>",
  "voteId": "<uuid>",
  "option": "Buy + Burn",
  "ts": "2026-05-15T12:00:00.000Z",
  "signature": "<base58 ed25519 signature>"
}
```
The signed message is the canonical string `$PULSE vote {voteId} option={option} ts={ts}`.
The bot rejects the call if `ts` is more than 10 minutes off, the option is
not on the ballot, the vote is closed, the signature does not verify, or the
wallet has zero conviction weight.

## Bounty kinds

The volume-bounty engine supports three bounty kinds out of the box:

| Kind                | When it fires                                              |
|---------------------|------------------------------------------------------------|
| `NEXT_BIG_BUY`      | The next `BUY` ≥ `min_sol` SOL claims the entire reward   |
| `FIRST_50K_HOLD`    | First wallet that has held ≥ `$min_balance_usd` for `duration_hours` |
| `FIRST_5_BUYERS`    | First N (default 5) buyers each split the reward equally  |

The default heuristic in `maybeOpenBounty()` opens a `NEXT_BIG_BUY` bounty
during slow stretches; the team can also insert custom rows directly into
`bounties`.

## Project layout

```
apps/bot/
  src/
    index.ts            # main loop: HTTP + cron + intervals
    config/             # env + tier + constant tables
    monitors/           # webhook ingest, state sync, holder sync
    actions/            # tier, defense, MM, volume bot, rewards, bounty
    voting/             # open / tally / execute / verify sigs
    features/           # streak, reinforcement, tweet bonus, snapshot
    integrations/       # helius, jupiter, jito, twitter, telegram, birdeye
    db/                 # pg pool, typed queries, migrate runner
    utils/              # logger, retry, safety, format, math
  tests/                # tier / defense / rewards / conviction / vote / snapshot

packages/
  shared/  src/         # tiers, vaults, multipliers, votes (re-exported by bot)
  db/      migrations/  # 001_initial_schema.sql
```

## Tests

```bash
pnpm test
```

## Operating procedures

- **Pause the bot:** `UPDATE bot_config SET paused = TRUE` — all action loops
  halt within 30 s; monitoring keeps running.
- **Force a tier transition (testing):** insert a price sample into
  `price_history` with the target market cap.
- **Daily SOL budget reset:** automatic, sliding 24h window on
  `bot_config.daily_window_started_at`.
- **Hot wallet cap:** every swap is enforced at 5 SOL max per tx. To exceed
  this the daily-budget path requires a config bump first.
