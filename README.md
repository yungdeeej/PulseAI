You are building the orchestration bot for $PULSE, a Solana 
memecoin with reactive treasury mechanics.

STACK:
- Node.js 20 + TypeScript
- @solana/web3.js v1 + @solana/spl-token
- Helius SDK for RPC + webhooks
- Jupiter Aggregator API v6 for swaps
- Jito SDK for MEV-protected bundles
- Supabase JS for logging
- Squads V4 SDK for multisig
- Twitter API v2 + Telegram Bot API for notifications
- node-cron for scheduled tasks
- Better Stack heartbeat for uptime monitoring

DEPLOY TARGET: Replit Reserved VM (always-on)

CORE RESPONSIBILITIES:

1. MONITOR
   - Subscribe to Helius webhook for $PULSE token program 
     (mint address loaded from env)
   - On every trade: update `token_state` in Supabase with 
     latest mcap, price, holder count, volume
   - Maintain rolling 1h price window for defense trigger
   - Track trades_per_hour for dashboard heartbeat animation

2. TIER MANAGEMENT
   - Tier 0: $0 - $69K (passive, bonding curve)
   - Tier 1: $69K - $300K (graduation event)
   - Tier 2: $300K - $1M (defense armed)
   - Tier 3: $1M - $5M (mega-burn event)
   - Tier 4: $5M+ (DAO unlock)
   - On crossing: log to `tier_history`, post to Twitter/Telegram, 
     execute tier-specific event (graduation burn, mega burn, etc.)

3. DEFENSE BOT (Tier 2+)
   - Check every 60 seconds: if price dropped ≥25% in last 1h
   - Trigger: use 30% of Defense Vault to market-buy via Jupiter
   - Bundle with Jito to prevent sandwich attacks
   - Cooldown: 2 hours between defense triggers
   - Log to `bot_activity`

4. BURN ENGINE (continuous)
   - Threshold: 20 SOL in Burn Vault triggers burn
   - Action: swap SOL → $PULSE via Jupiter → send to 
     1nc1nerator11111111111111111111111111111111
   - Log tx hash to `bot_activity`
   - Post to Twitter: "🔥 X $PULSE burned. Total burned: Y"

5. REWARDS DISTRIBUTOR (weekly cron, Sundays 00:00 UTC)
   - Snapshot all holders from chain
   - Apply hold-time multiplier: 
     1x (<7 days), 1.5x (7-14 days), 2x (14-30 days), 3x (30+ days)
   - Filter: only wallets holding ≥100K $PULSE qualify
   - Distribute Rewards Vault balance proportionally
   - Batch send via versioned transactions

6. NOTIFICATIONS
   - Twitter posts on: tier transitions, burns >5M tokens, 
     defense triggers, weekly reward distributions
   - Telegram: same events + every burn (more frequent)
   - Dashboard via Supabase Realtime: every action

SECURITY:
- Hot wallet limit: max 5 SOL per single transaction
- Anything larger requires Squads multisig
- All actions logged to immutable Supabase log
- Emergency pause flag in `bot_config` table — bot polls every 
  30 sec and halts if set
- Encrypted env vars: HOT_WALLET_PRIVATE_KEY, HELIUS_API_KEY, 
  JITO_AUTH_KEY, TWITTER_BEARER, TELEGRAM_TOKEN, SUPABASE_SERVICE_KEY

PROJECT STRUCTURE:
/src
  /monitors        - Helius webhook handlers, price tracking
  /actions         - burn.ts, defense.ts, rewards.ts, tier.ts
  /integrations    - jupiter.ts, jito.ts, squads.ts, twitter.ts, telegram.ts
  /db              - Supabase client wrapper
  /utils           - math (BPM, mcap, multipliers), formatters
  /config          - env validation, tier thresholds
  index.ts         - main loop + cron scheduler

DELIVERABLES:
1. Full TypeScript project, runnable via `npm run dev`
2. Devnet config (testing) + mainnet config (production)
3. README with deployment steps for Replit Reserved VM
4. Dry-run mode: logs actions without executing transactions
5. Unit tests for tier logic, multiplier math, defense trigger 
   conditions

DO NOT BUILD:
- Frontend (separate agent)
- The token contract itself (uses pump.fun)
- Authentication system

Start with the monitoring + logging layer (no transactions), 
verify it captures live trade data correctly on devnet, then 
add action execution one function at a time.
