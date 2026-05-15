You are building the public-facing web application for $PULSE — a Solana 
memecoin launching on pump.fun with reactive treasury mechanics and 
community-driven Treasury Decisions. Your job is the dashboard — the 
single most important part of the product. The dashboard IS the brand.

═══════════════════════════════════════════════════════════════════
PROJECT CONTEXT
═══════════════════════════════════════════════════════════════════

$PULSE is a memecoin where an off-chain bot manages five fee-routing 
wallets (vaults) configured via pump.fun's Creator Fee Sharing system. 
At each market-cap tier crossing, holders vote on what to do with the 
accumulated Decision Vault funds: buy + burn, airdrop, reinforce the 
market maker, hostile attack on a competing memecoin, or hold.

You are NOT building the bot. You are building the dashboard that shows 
everything the bot is doing in real time. The bot writes to a Supabase 
database; you read from it (with Supabase Realtime for live updates).

═══════════════════════════════════════════════════════════════════
LOCKED PROJECT CONFIG
═══════════════════════════════════════════════════════════════════

Token name:         $PULSE
Chain:              Solana
Launchpad:          pump.fun
Domain:             pulsetoken.ai
Total supply:       1,000,000,000

Vault split (informational only):
  Decision Vault:   35%
  Defense Vault:    30%
  Rewards Vault:    25%
  Liquidity Vault:   5%
  Operations Vault:  5%

Tier thresholds (USD market cap):
  Tier 0 DISCOVERY:   $0       - $69K
  Tier 1 IGNITION:    $69K     - $300K   (snapshot ≥50K $PULSE → Pioneer)
  Tier 2 MOMENTUM:    $300K    - $1M     (snapshot ≥100K → Believer)
  Tier 3 CONVICTION:  $1M      - $5M     (snapshot ≥500K → Conviction)
  Tier 4 ASCENSION:   $5M+               (snapshot ≥1M → Ascendant)

Status multipliers (compound):
  Pioneer:    +0.5x permanent
  Believer:   +0.25x permanent
  Conviction: +0.25x permanent
  Ascendant:  +0.5x permanent

Hold-time multipliers:
  <7 days:    1.0x
  7-14 days:  1.5x
  14-30 days: 2.0x
  30+ days:   3.0x

Conviction Score = balance × hold_time × tier_streak × reinforcement_bonus

═══════════════════════════════════════════════════════════════════
BRAND SYSTEM
═══════════════════════════════════════════════════════════════════

Tagline:            "Feel the Pulse."
Voice:              Confident, slightly mysterious, technical but 
                    accessible, meme-aware.

Color palette:
  Background:       #0A0A0F  (dark void)
  Surface:          #15151F  (cards, panels)
  Pulse Cyan:       #00E5FF  (primary, heartbeat, "alive")
  Reactor Magenta:  #FF00AA  (alerts, defense, attention)
  Success Green:    #00FF88  (buys, positive actions)
  Danger Red:       #FF3355  (sell pressure, defense triggered)
  Text primary:     #FFFFFF
  Text secondary:   #8B8B9F

Typography:
  Display/headers:  Space Grotesk (Google Fonts)
  Body:             Inter (Google Fonts)
  Mono/numbers:     JetBrains Mono (Google Fonts)

Aesthetic references:
  - Cyberpunk medical monitor
  - Hyperliquid trading interface
  - Hospital ICU heart-rate displays

═══════════════════════════════════════════════════════════════════
STACK
═══════════════════════════════════════════════════════════════════

  Next.js 14 App Router, TypeScript strict mode
  Tailwind CSS + shadcn/ui
  Framer Motion (animations)
  Recharts (price chart)
  @supabase/supabase-js (data + Realtime)
  SWR (data fetching)
  lucide-react (icons)
  date-fns (relative time)
  howler.js (heartbeat sound)
  html-to-image (shareable wallet cards)
  react-hot-toast (notifications)

DEPLOY: Vercel
DOMAIN: pulsetoken.ai

═══════════════════════════════════════════════════════════════════
PROJECT STRUCTURE
═══════════════════════════════════════════════════════════════════

apps/dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx              (root layout, fonts, providers)
│   │   ├── page.tsx                (landing page)
│   │   ├── dashboard/page.tsx      (the main product)
│   │   ├── wallet/[address]/page.tsx (wallet lookup)
│   │   ├── how-it-works/page.tsx
│   │   ├── tiers/page.tsx
│   │   ├── transparency/page.tsx
│   │   ├── buy/page.tsx
│   │   └── api/og/route.tsx        (OG image generator for wallet cards)
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── HeartbeatHero.tsx
│   │   │   ├── StatCards.tsx
│   │   │   ├── TierProgressBar.tsx
│   │   │   ├── VaultsPanel.tsx
│   │   │   ├── LiveActivityFeed.tsx
│   │   │   ├── LiveTradeTape.tsx
│   │   │   ├── HolderLeaderboard.tsx
│   │   │   ├── TierProgressionLadder.tsx
│   │   │   ├── TimeMachineSlider.tsx
│   │   │   ├── TreasuryDecisionPanel.tsx
│   │   │   └── VoteLiveTracker.tsx
│   │   ├── shared/
│   │   │   ├── HeartbeatLine.tsx   (the iconic SVG animation)
│   │   │   ├── SoundToggle.tsx
│   │   │   ├── AddressDisplay.tsx
│   │   │   ├── TierBadge.tsx
│   │   │   └── NumberOdometer.tsx
│   │   ├── wallet/
│   │   │   ├── WalletProfile.tsx
│   │   │   ├── ShareableCard.tsx
│   │   │   └── ConvictionBreakdown.tsx
│   │   └── ui/                     (shadcn components)
│   ├── hooks/
│   │   ├── useTokenState.ts
│   │   ├── useBotActivity.ts
│   │   ├── useVaults.ts
│   │   ├── useHolderLeaderboard.ts
│   │   ├── useTierHistory.ts
│   │   ├── useActiveVote.ts
│   │   ├── useTradeTape.ts
│   │   ├── useWalletProfile.ts
│   │   ├── useHeartbeatSound.ts
│   │   └── usePulseStreak.ts
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── formatters.ts
│   │   ├── solscan.ts
│   │   ├── mockData.ts             (for pre-launch dev)
│   │   └── shareCard.ts            (generates wallet card images)
│   └── styles/
│       └── globals.css
├── public/
│   ├── sounds/
│   │   ├── heartbeat.mp3
│   │   ├── flatline.mp3
│   │   ├── trade.mp3
│   │   └── tier-up.mp3
│   └── og-image.png
├── package.json
├── tailwind.config.ts
├── next.config.mjs
├── .env.local.example
└── README.md

═══════════════════════════════════════════════════════════════════
PAGES
═══════════════════════════════════════════════════════════════════

/  (LANDING)
   - Full-bleed black hero
   - Animated heartbeat ECG line spanning width
   - "$PULSE" wordmark + tagline "Feel the Pulse."
   - Single CTA → /dashboard
   - Minimal copy, maximum negative space
   - Subtle scroll prompt

/dashboard  (THE PRODUCT)
   Single scrollable page, no tabs. Sections in order:

   SECTION 1 — HERO (above the fold)
     - Top bar: $PULSE wordmark left, 🔴 LIVE indicator right
     - Sound toggle (heartbeat audio on/off)
     - HeartbeatLine component (full-width animated ECG, BPM = trades/hour)
     - Three stat cards: Market Cap (with 24h delta), Current Tier 
       (with colored badge), Heart Rate (BPM display)
     - Tier progress bar (full width, neon gradient) showing "$X to 
       next tier"

   SECTION 2 — VAULTS PANEL
     - 5 vault cards in a grid: Decision, Defense, Rewards, 
       Liquidity, Operations
     - Each: icon, name, live SOL balance, trigger threshold if 
       applicable, last action timestamp, Solscan link
     - Decision Vault highlighted as the headliner (it's the one 
       holders will vote on)

   SECTION 3 — ACTIVE TREASURY DECISION (only when a vote is open)
     - Large, prominent card with the active vote
     - Countdown timer
     - Vote options with live tally bars (animated)
     - Vote weight calculator: enter wallet → shows your weight
     - Recent voters scrolling feed

   SECTION 4 — LIVE TRADE TAPE
     - Bloomberg-style streaming ticker
     - Each row: timestamp, buyer/seller wallet (truncated), 
       SOL amount, $PULSE amount, price
     - Color-coded green (buy) / red (sell)
     - Whale trades (>1 SOL) get larger row + screen flash
     - Auto-scrolls but can be paused on hover
     - Subscribes to Supabase Realtime

   SECTION 5 — LIVE ACTIVITY FEED
     - Last 50 from bot_activity table
     - New items slide in from top with cyan glow flash
     - Icons per action type, relative timestamps, tx hash links
     - Subscribe to Realtime INSERTs

   SECTION 6 — TIME MACHINE
     - Horizontal slider spanning the project's history
     - Drag to any past date → dashboard re-renders with that 
       day's data
     - Shows: mcap, tier, top action of the day, treasury balance
     - "What if you had bought at Tier 0" calculator
     - Snapshot any moment for sharing

   SECTION 7 — HOLDER LEADERBOARD (multi-axis)
     - Tabs: Diamond Hands | Conviction Score | Biggest Buyers 
       This Week | Defense Reinforcements
     - Top 25 with rank, truncated wallet, balance, hold days, 
       multiplier, status badges
     - Each row clickable → /wallet/[address]
     - Gold/silver/bronze styling for top 3

   SECTION 8 — TIER PROGRESSION LADDER
     - Vertical timeline of all 5 tiers
     - Completed ✅, current 🟢 "YOU ARE HERE", locked 🔒
     - Each tier expandable to show what unlocks
     - Estimated time-to-next-tier based on current trajectory

   SECTION 9 — WALLET LOOKUP CTA
     - "Check Your Vitals" input field
     - Enter any wallet address → /wallet/[address]
     - Encourages users to look up themselves and friends

/wallet/[address]  (WALLET PROFILE — VIRAL LOOP CORE)
   The page that drives all your sharing.

   - Wallet address with copy button
   - Avatar: generated from heartbeat pattern of their actual 
     trading history
   - Status badges: Pioneer, Believer, Conviction, Ascendant (any 
     they hold)
   - Big numbers:
     • Current balance
     • Conviction Score
     • Hold time (days)
     • Multiplier breakdown (hold time × status × reinforcement)
     • Rank on each leaderboard
   - "Pulse Streak" counter — consecutive days holding above 
     threshold
   - Recent activity (last 20 trades)
   - Reinforcement count (defense triggers participated in)
   - Vote history (which Treasury Decisions they voted on)

   ⭐ SHAREABLE CARD GENERATOR
   - Big "Share My Vitals" button
   - Generates a 1200x630 PNG via html-to-image:
     • Branded $PULSE design
     • Wallet's heartbeat visual
     • Conviction Score, hold days, status badges
     • Rank position
     • QR code linking back to /wallet/[address]
   - Buttons: Download | Copy Link | Share to Twitter
   - Pre-filled tweet: "My $PULSE vitals 🫀 [conviction score]. 
     Feel yours at pulsetoken.ai"

/how-it-works  (EXPLAINER)
   - Conversational ~400 words
   - 4 illustrated sections: How the bot works, The vault system, 
     Tier crossings, Treasury Decisions
   - No marketing fluff — explain the actual mechanics

/tiers  (TIER LADDER STATIC)
   - One vivid paragraph per tier
   - What unlocks, snapshot threshold, status multiplier
   - Recent crossings if applicable

/transparency  (TRUST CENTER)
   - All 5 vault addresses (linked to Solscan)
   - Token contract address
   - GitHub repo link
   - Bot uptime status (last heartbeat ping)
   - Total Treasury Decisions executed (count + history)
   - Disclosure section

/buy  (CONVERSION)
   - Embedded Jupiter swap widget OR button to pump.fun
   - Current price, mcap, tier
   - "Become a Pioneer" CTA if pre-Tier 1

═══════════════════════════════════════════════════════════════════
TOP 10 SHIPPING FEATURES (must build)
═══════════════════════════════════════════════════════════════════

1. THE HEARTBEAT SOUND
   - Audio toggle in top bar (default: off)
   - When ON: heartbeat.mp3 loops, playback rate = BPM / 60
   - Flatline sound plays when defense triggers
   - Tier-up sound plays on tier crossing
   - Use howler.js for audio, persist preference in React state

2. WALLET LOOKUP WITH SHAREABLE CARDS
   - /wallet/[address] route fully implemented
   - html-to-image library for card generation
   - 1200x630 PNG dimensions for Twitter cards
   - Open Graph meta tags so wallet links preview nicely

3. TIME MACHINE SLIDER
   - Component that queries historical token_state by date
   - Smooth slider with day-resolution
   - Updates relevant dashboard widgets to that point in time
   - "Time travel mode" badge appears when active
   - "Return to live" button to exit

4. LIVE TRADE TAPE
   - Subscribe to Supabase Realtime on price_history or new 
     trades table
   - Smooth scroll animation as new trades arrive
   - Whale trade (>1 SOL) triggers brief full-screen cyan flash
   - Hover to pause, click to highlight a trader

5. PULSE STREAKS DISPLAY
   - Show streak count prominently on /wallet/[address]
   - Top 10 active streaks visible on dashboard leaderboard
   - "Don't break the streak" visual urgency
   - Streak count read from holder_snapshots history

6. DEFENSE REINFORCEMENTS BADGE
   - Wallets that bought during a defense window get a 
     "Reinforcement" count
   - Display badge with count on wallet profile
   - Multiplier breakdown shows the reinforcement bonus 
     contribution

7. VOLUME BOUNTY ALERTS
   - When bot opens a bounty, show prominent banner on dashboard
   - Countdown timer
   - "Race to claim" CTA → /buy
   - Past bounties archived for replay

8. TWEET-TO-MULTIPLIER STATUS
   - On wallet profile, show pending Twitter multiplier bonuses 
     (set by bot)
   - Explainer: "Tweet about $PULSE. If your tweet gets >100 
     likes, you get +0.25x for a week."
   - Link to verification flow (handled by bot, dashboard just 
     displays state)

9. VOTE LIVE TRACKER
   - Active vote panel as described in Section 3
   - Animated bars updating in real-time
   - Recent voters feed (truncated wallet + vote choice + weight)
   - Vote weight calculator widget

10. BOT PERSONALITY DISPLAY
    - Activity feed shows bot's "voice" — each action has a 
      one-liner pulled from the activity's description field
    - Distinct typography for bot messages (mono font, cyan accent)
    - Link from each message to its full Twitter post

═══════════════════════════════════════════════════════════════════
ANIMATION REQUIREMENTS
═══════════════════════════════════════════════════════════════════

HEARTBEAT LINE
   - SVG <path> with animated stroke-dashoffset
   - Animation duration = 60000 / BPM (one cycle per beat)
   - Path shape: classic ECG waveform (P-QRS-T)
   - Cyan stroke with magenta glow filter
   - Re-renders on BPM change with smooth interpolation

ACTIVITY FEED
   - New items: slide-in from y=-20, opacity 0→1, cyan glow 
     fades over 2s
   - Smooth list reorder when new items arrive
   - Stagger animation for initial load

TIER TRANSITIONS
   - When tier_history INSERT detected via Realtime:
     • Full-screen Framer Motion overlay
     • Confetti from confetti library
     • Tier name "MOMENTUM ACHIEVED" or similar
     • Magenta-to-cyan gradient sweep
     • Plays tier-up.mp3 if sound enabled
     • Dismisses after 5 seconds or click

NUMBER ODOMETER
   - Use Framer Motion or react-spring
   - Rolling digit animation on value changes
   - Different durations for different magnitudes

WHALE TRADE FLASH
   - On trades >1 SOL: brief full-screen flash (200ms)
   - Color: cyan for buys, magenta for sells
   - Body element overlay, fade out quickly

VOTE LIVE BARS
   - Bars animate smoothly on every vote update
   - New vote arrival: pulse glow on the relevant bar
   - Winning option subtly highlighted as it leads

═══════════════════════════════════════════════════════════════════
DATA WIRING
═══════════════════════════════════════════════════════════════════

lib/supabase.ts exports anon client. Service role is bot-only.

Tables read by dashboard:
  - token_state (singleton, live updates)
  - vaults (5 rows, live updates)
  - bot_activity (paginated + Realtime INSERT subscription)
  - tier_history (append-only, triggers tier-crossing animation)
  - holder_snapshots (latest snapshot for leaderboard)
  - active_votes (current Treasury Decision)
  - vote_records (vote history)
  - reinforcement_log (defense participation tracking)
  - tweet_multipliers (Twitter bonus state)
  - bounties (active and past)
  - price_history (for time machine + trade tape)

Subscriptions:
  - bot_activity.INSERT → live feed updates
  - token_state.UPDATE → all stat displays
  - vaults.UPDATE → vault panel
  - tier_history.INSERT → tier crossing animation
  - active_votes.UPDATE → vote tracker

═══════════════════════════════════════════════════════════════════
RESPONSIVE BEHAVIOR
═══════════════════════════════════════════════════════════════════

DESKTOP (1440px target)
   - Full multi-column layout
   - Live Trade Tape on right rail
   - Wallet card preview floats

TABLET (768px-1024px)
   - 2-column grids
   - Trade tape collapses to top bar drawer

MOBILE (375px-767px)
   - Single column, vertically stacked
   - Heartbeat line scales proportionally
   - Sound toggle prominent
   - Wallet lookup as primary CTA
   - Sticky bottom nav: Dashboard | Wallet | Buy | Vote

═══════════════════════════════════════════════════════════════════
MOCK DATA FOR PRE-LAUNCH DEV
═══════════════════════════════════════════════════════════════════

Create lib/mockData.ts that returns realistic mock data for every 
hook when NEXT_PUBLIC_USE_MOCK_DATA=true. This lets you develop 
and demo the dashboard before any real data exists.

Mock data should include:
  - Token at Tier 2 with $487K mcap
  - 5 vaults with believable balances
  - 50+ activity entries spanning tiers
  - 25 holder leaderboard entries with varied stats
  - 1 active Treasury Decision vote with live tallies
  - 100+ trade tape entries with varied sizes
  - 3 past tier crossings

═══════════════════════════════════════════════════════════════════
ENV VARIABLES (.env.local.example)
═══════════════════════════════════════════════════════════════════

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_USE_MOCK_DATA=true     # set to false in production
NEXT_PUBLIC_SOLSCAN_BASE=https://solscan.io
NEXT_PUBLIC_PUMP_FUN_URL=          # set post-launch with token URL
NEXT_PUBLIC_JUPITER_API=https://quote-api.jup.ag/v6
NEXT_PUBLIC_TWITTER_HANDLE=@pulse_solana

═══════════════════════════════════════════════════════════════════
DELIVERABLES
═══════════════════════════════════════════════════════════════════

1. Working Next.js app, runnable via `pnpm dev`
2. All pages and components implemented
3. Mock data system fully working (USE_MOCK_DATA=true)
4. Supabase wiring complete (USE_MOCK_DATA=false uses real data)
5. README in apps/dashboard with:
   - Local dev setup
   - How to switch mock ↔ real data
   - Vercel deploy instructions
   - Where to update brand assets
6. Lighthouse score 90+ on /dashboard
7. Responsive across 375px → 1920px

═══════════════════════════════════════════════════════════════════
WHAT NOT TO BUILD
═══════════════════════════════════════════════════════════════════

- Authentication (dashboard is fully public)
- Trade execution (link out to pump.fun or Jupiter)
- Wallet connection (read-only lookups only)
- Bot logic (separate agent)
- Smart contracts
- localStorage / sessionStorage (use React state)
- Anything requiring on-chain signing

═══════════════════════════════════════════════════════════════════
BUILD ORDER
═══════════════════════════════════════════════════════════════════

1. Scaffold Next.js + Tailwind + shadcn
2. Set up brand tokens in tailwind.config
3. Build shared components (HeartbeatLine, TierBadge, etc.)
4. Build mock data system
5. Build landing page (/)
6. Build dashboard page section by section (top to bottom)
7. Build wallet profile page
8. Build secondary pages (how-it-works, tiers, transparency, buy)
9. Wire up Supabase real-time subscriptions
10. Test responsive at all breakpoints
11. Lighthouse optimization
12. README and deployment

Begin with the scaffold and brand system, then build the HeartbeatLine 
component first — that's the iconic visual and everything else 
references its style. Confirm each major milestone before moving on.
