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

## Replit Reserved VM deployment

1. Create a Reserved VM ($7/mo). Point it at this repo.
2. Add the Replit Hosted Postgres database to the VM. Replit injects
   `DATABASE_URL` automatically.
3. In Replit Secrets, paste the rest of `.env.example` (Helius key, vault
   private keys, social tokens). All `*_PRIVATE_KEY` env vars stay in Secrets
   only — never in the repo.
4. Set the run command to:
   ```bash
   AUTO_MIGRATE=true pnpm --filter @pulse/bot start
   ```
   (Use `pnpm --filter @pulse/bot dev` for hot reload.)
5. Configure the Helius webhook (next section).
6. Add a Better Stack heartbeat and copy the URL into
   `BETTERSTACK_HEARTBEAT_URL`. The bot pings every 60 s.

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

Use this for devnet runs and pre-launch demos.

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
