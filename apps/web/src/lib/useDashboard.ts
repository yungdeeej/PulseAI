import { useEffect, useRef, useState } from "react";
import { fetchDashboard, fetchActivity, type DashboardData, type ActivityEvent, type MarketActivity } from "./api";
import { pushEvent, activityFeed, blobLive } from "./blobLive";

const DASHBOARD_POLL_MS = 15_000;
const ACTIVITY_POLL_MS = 10_000;

const KIND_COLOR: Record<string, string> = {
  DEFENSE: "rgb(255,110,110)",
  MM_UPDATE: "rgb(120,210,255)",
  VOLUME: "rgb(80,200,255)",
  REWARDS: "rgb(120,255,160)",
  VOTE_OPEN: "rgb(255,210,90)",
  VOTE_EXEC: "rgb(255,120,210)",
  AIRDROP: "rgb(120,255,160)",
  BURN: "rgb(255,110,110)",
  TRADE: "rgb(150,200,240)",
  SNAPSHOT: "rgb(160,170,255)",
  TIER_CROSS: "rgb(255,210,90)",
};

export interface DashboardState extends DashboardData {
  loading: boolean;
  error: string | null;
}

const DEFAULT: DashboardState = {
  tokenState: null,
  vaults: [],
  priceHistory: [],
  change24h: 0,
  creator_wallet_sol: null,
  market_activity: null,
  loading: true,
  error: null,
};

// ── Emotion engine ────────────────────────────────────────────────────────────
// Maps live 5m buy/sell ratio + price change → blob emotion.
// Written directly to blobLive so the canvas + ActivityFeed both react instantly.
function computeEmotion(ma: MarketActivity): string {
  const total5m = ma.buys_5m + ma.sells_5m;
  if (total5m < 2) return "sleepy";
  const buyRatio = ma.buys_5m / total5m;
  const pc = ma.price_change_5m;
  if (buyRatio > 0.70 && pc > 3)    return "excited";
  if (buyRatio > 0.70 && pc > 0)    return "happy";
  if (buyRatio > 0.58)              return "curious";
  if (buyRatio < 0.30 && pc < -3)   return "shocked";
  if (buyRatio < 0.42)              return "nervous";
  if (total5m > 20)                 return "focused";
  return "idle";
}

// Narrative events pushed into the activity feed when significant trades happen
function narrativeEvent(ma: MarketActivity): string | null {
  const total5m = ma.buys_5m + ma.sells_5m;
  if (total5m < 2) return null;
  const pc = ma.price_change_5m;
  const sign = pc >= 0 ? "+" : "";

  if (ma.buys_5m > ma.sells_5m * 2.5)
    return `BUY SURGE // ${ma.buys_5m}B · ${ma.sells_5m}S · ${sign}${pc.toFixed(1)}% // entity energized`;
  if (ma.sells_5m > ma.buys_5m * 2.5)
    return `SELL WAVE // ${ma.sells_5m}S · ${ma.buys_5m}B · ${sign}${pc.toFixed(1)}% // entity alarmed`;
  if (Math.abs(pc) > 4)
    return `VOLATILE // ${sign}${pc.toFixed(1)}% swing · ${total5m} txns // entity watching`;
  if (total5m > 30)
    return `HIGH ACTIVITY // ${total5m} txns in 5m · ratio ${ma.buys_5m}:${ma.sells_5m}`;
  return null;
}

const EMOTION_EVENT_COLOR: Record<string, string> = {
  excited:  "rgb(255,120,210)",
  happy:    "rgb(255,210,90)",
  shocked:  "rgb(255,110,110)",
  nervous:  "rgb(140,240,180)",
  curious:  "rgb(160,170,255)",
  focused:  "rgb(80,140,255)",
  sleepy:   "rgb(170,130,210)",
  idle:     "rgb(80,200,255)",
};

function fmtMcap(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function useDashboard(): DashboardState {
  const [state, setState] = useState<DashboardState>(DEFAULT);
  const seenIds = useRef(new Set<number>());
  const lastNarrativeRef = useRef<string | null>(null);
  const athRef = useRef<number>(
    typeof window !== "undefined"
      ? parseFloat(localStorage.getItem("pulse_ath") ?? "0") || 0
      : 0,
  );

  useEffect(() => {
    let destroyed = false;

    const loadDashboard = async () => {
      try {
        const data = await fetchDashboard();
        if (destroyed) return;

        // ── Apply emotion from live market activity ───────────────────────────
        if (data.market_activity) {
          const newEmotion = computeEmotion(data.market_activity);
          blobLive.emotion = newEmotion;

          // Push a trade narrative event when something interesting happens
          // (only if the narrative text has changed to avoid repetitive spam)
          const narrative = narrativeEvent(data.market_activity);
          if (narrative && narrative !== lastNarrativeRef.current) {
            lastNarrativeRef.current = narrative;
            pushEvent("system", narrative, EMOTION_EVENT_COLOR[newEmotion]);
          }
        }

        // ── ATH detection ─────────────────────────────────────────────────────
        const currentMcap = data.tokenState?.market_cap_usd ?? 0;
        if (currentMcap > 0 && currentMcap > athRef.current) {
          const prevAth = athRef.current;
          athRef.current = currentMcap;
          try { localStorage.setItem("pulse_ath", String(currentMcap)); } catch {}
          if (prevAth > 0) {
            pushEvent("system", `NEW ATH // ${fmtMcap(currentMcap)} // entity transcending`, "rgb(255,210,90)");
            blobLive.emotion = "excited";
          }
        }

        setState((s) => ({ ...s, ...data, loading: false, error: null }));
      } catch (err) {
        if (!destroyed) setState((s) => ({ ...s, loading: false, error: String(err) }));
      }
    };

    const loadActivity = async () => {
      try {
        const events = await fetchActivity(30);
        if (destroyed) return;
        const newEvents = events
          .filter((e) => !seenIds.current.has(e.id))
          .sort((a, b) => a.id - b.id);
        for (const ev of newEvents) {
          seenIds.current.add(ev.id);
          const color = KIND_COLOR[ev.kind] ?? "rgba(150,200,240,0.6)";
          pushEvent("system", ev.summary, color);
        }
      } catch {
      }
    };

    loadDashboard();
    loadActivity();

    const dashboardTimer = setInterval(loadDashboard, DASHBOARD_POLL_MS);
    const activityTimer = setInterval(loadActivity, ACTIVITY_POLL_MS);

    return () => {
      destroyed = true;
      clearInterval(dashboardTimer);
      clearInterval(activityTimer);
    };
  }, []);

  return state;
}
