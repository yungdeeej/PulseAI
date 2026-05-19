# Pulse — Frontend Handoff

## Overview

Pulse is a living entity dashboard. A physics-driven, emotion-reactive blob character occupies the center of the screen; surrounding panels display the entity's market data, vital signs, tier/ascension status, treasury, and a live activity feed. All data is currently mocked — this document describes every integration point.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite 7 |
| Styling | TailwindCSS v4 (inline styles for all custom UI) |
| Fonts | Inter, Space Grotesk, JetBrains Mono (Google Fonts) |
| State | Plain mutable singleton (`blobLive`) + React `useState` polled via `setInterval` |
| Package manager | pnpm workspaces |

**Dev command:**
```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/blob-character run dev
```

**Build:**
```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/blob-character run build
# Output → artifacts/blob-character/dist/public/
```

---

## Integration Points (all marked `TODO:BACKEND` in source)

### 1. Contract Address
**File:** `src/components/StatPanels.tsx:248`
```ts
const CONTRACT_ADDRESS = "0xPULSE0001a7b3d4e5f6890123456789abcdef0001";
```
Replace with the real deployed EVM contract address. Used in the "Copy CA" button.

---

### 2. X / Twitter URL
**File:** `src/components/StatPanels.tsx:249`
```ts
const X_URL = "https://x.com";
```
Replace with the real X/Twitter profile URL (e.g. `https://x.com/pulse_entity`).

---

### 3. Market Cap + Price Delta
**File:** `src/components/StatPanels.tsx:113–114`
```ts
const [cap, setCap] = useState(42_700_000);   // market cap in USD
const [delta, setDelta] = useState(2.4);       // 24h % change
```
**Currently:** Random drift simulation runs every 1500 ms.

**Expected integration:**
- Poll a price API (DexScreener, CoinGecko, or custom backend endpoint) on mount and then periodically.
- `cap` is displayed as `$XX.XXM`; `delta` drives the `▲ / ▼` indicator.
- `hist` (array of 32 floats) powers the sparkline — feed in OHLCV close prices normalized to a `40–50` range, or replace the sparkline with raw price values and adjust the Sparkline component's scale.

**Suggested endpoint shape:**
```json
GET /api/token/price
{
  "marketCapUsd": 42700000,
  "delta24h": 2.4,
  "history": [40.1, 41.3, ...] // 32 data points
}
```

---

### 4. Entity Tier + Ascension Progress
**File:** `src/components/StatPanels.tsx:202–219`

Currently hardcoded:
- Tier label: `"Tier · Sovereign"`
- Ascension: `"ASCENSION 04 / 07"`
- Progress: `57.3%`

**Expected integration:**
```json
GET /api/entity/tier
{
  "tier": "Sovereign",
  "ascensionLevel": 4,
  "ascensionMax": 7,
  "progressPct": 57.3
}
```
Wire into `LeftPanels` state and pass down to the `Card` component.

---

### 5. Treasury
**File:** `src/components/StatPanels.tsx:222–240`

Currently hardcoded: `"VAULT SECURED"`, `"7 multisig · 3-of-5 quorum"`.

**Expected integration:**
```json
GET /api/treasury
{
  "status": "VAULT SECURED",
  "multisigTotal": 7,
  "quorumRequired": 3
}
```

---

### 6. System Status Panel
**File:** `src/components/ActivityFeed.tsx:137–146`

Currently hardcoded static values: `UPLINK ACTIVE`, `SENSORS ONLINE`, `COOLING 22.4°C`, `LATENCY 3ms`.

**Expected integration:**
```json
GET /api/entity/status
{
  "uplink": { "value": "ACTIVE", "ok": true },
  "sensors": { "value": "ONLINE", "ok": true },
  "cooling": { "value": "22.4°C", "ok": true },
  "latency": { "value": "3ms", "ok": true }
}
```
When `ok` is `false`, the color should change from `#7aff9f` (green) to `#ff7a8a` (red).

---

### 7. Live Activity Feed
**File:** `src/components/ActivityFeed.tsx:47–62`

Currently: synthetic system messages pushed every 5500 ms via `setInterval`.

**Expected integration:** Replace the interval with either:

**Option A — WebSocket (preferred for real-time feel):**
```ts
const ws = new WebSocket(WS_URL);
ws.onmessage = (e) => {
  const ev = JSON.parse(e.data); // { kind, msg, color? }
  pushEvent(ev.kind, ev.msg, ev.color);
};
```

**Option B — Polling:**
```ts
GET /api/events?since=<timestamp>
// Returns array of { kind, msg, color?, ts } newest-first
```

Feed events into `pushEvent(kind, msg, color?)` from `src/lib/blobLive.ts`. Emotion changes are automatically pushed by the blob render loop — no backend action needed for those.

---

## Blob Live State (read-only from UI perspective)

**File:** `src/lib/blobLive.ts`

`blobLive` is a plain mutable singleton written every animation frame by the blob canvas loop. UI components poll it via `setInterval`. **Do not use React state or context for this** — polling is intentional to avoid per-frame re-renders.

```ts
interface BlobLive {
  emotion: string;        // current emotion name
  glowMult: number;       // glow intensity 0.28–1.55
  bodyR/G/B: number;      // lerped RGB color of the blob
  breathPhase: number;    // raw radian phase
  breathPulse: number;    // 0..1 — sin(phase)*0.5+0.5
  entryPulse: number;     // 0..1 — decays after emotion change
  wobbleAmp: number;      // wobble intensity
  blobX/Y/R: number;      // blob position and radius in canvas px
  cursorX/Y: number;      // last cursor position
  cursorVel: number;      // cursor speed px/s
}
```

**To push an event into the activity feed** (from any module):
```ts
import { pushEvent } from "../lib/blobLive";
pushEvent("system", "Treasury :: sync confirmed", "#7aff9f");
pushEvent("interaction", "Wallet connected :: 0xABCD");
```

---

## Blob API (DEV only)

In development mode, `window.__blobAPI` exposes:
```ts
{
  setEmotion(e: Emotion): void;     // force an emotion (10s then auto-brain resumes)
  triggerBlink(): void;
  triggerDoubleBlink(): void;
  toggleCursorFollow(): void;
  toggleAutoBrain(): void;
  wakeUp(): void;                   // wake from sleep
}
```

The **Debug Panel** (▸ in top-right corner) is also only rendered in `import.meta.env.DEV` — it will not appear in production builds.

---

## Emotions Reference

The blob reacts autonomously to cursor behavior. Emotions can also be triggered externally via `__blobAPI.setEmotion()` in response to on-chain events (e.g. large buy → `"excited"`, liquidation → `"nervous"`).

| Emotion | Trigger (auto) | Color |
|---|---|---|
| `idle` | default / timer decay | cyan |
| `curious` | cursor nearby + moving | blue-violet |
| `happy` | pull-release interaction | gold |
| `excited` | fast cursor shake | pink/magenta |
| `nervous` | heavy jitter / high velocity | pale green |
| `focused` | cursor still near blob | deep blue |
| `sleepy` | inactive ~30s | purple |
| `sleeping` | inactive ~45s | blue-grey |
| `shocked` | sudden click / wake | red-orange |
| `suspicious` | slow cursor approach | amber |

---

## File Map

```
src/
├── App.tsx                  — blob canvas render loop + emotion/physics engine
├── main.tsx                 — entry: renders Dashboard
├── index.css                — global styles + Tailwind v4 theme tokens
├── lib/
│   ├── blobLive.ts          — shared live state singleton + activity feed
│   └── useIsMobile.ts       — responsive helpers
└── components/
    ├── Dashboard.tsx        — top-level layout shell
    ├── BackgroundCanvas.tsx — particle field + reactor rings (emotion-reactive)
    ├── StatPanels.tsx       — left panels: market cap, heart rate, tier, treasury, CA/X
    ├── ActivityFeed.tsx     — right panels: emotional state, live feed, system status
    └── CursorOverlay.tsx    — custom cursor (top-most canvas, desktop only)
```

---

## Notes for Production

- The **Debug Panel** is gated behind `import.meta.env.DEV` — safe to deploy as-is.
- `window.__blobAPI` is also DEV-only.
- The mock price drift loop in `StatPanels.tsx` should be replaced but causes no harm in production until replaced (it just drifts randomly).
- There are no external API calls in the current build — all data is generated client-side.
- `src/components/ui/` contains the full shadcn/ui component library (unused by current UI). Available if new UI screens are added.
