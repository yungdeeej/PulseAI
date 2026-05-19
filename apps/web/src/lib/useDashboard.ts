import { useEffect, useRef, useState } from "react";
import { fetchDashboard, fetchActivity, type DashboardData, type ActivityEvent } from "./api";
import { pushEvent, activityFeed } from "./blobLive";

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
  loading: true,
  error: null,
};

export function useDashboard(): DashboardState {
  const [state, setState] = useState<DashboardState>(DEFAULT);
  const seenIds = useRef(new Set<number>());

  useEffect(() => {
    let destroyed = false;

    const loadDashboard = async () => {
      try {
        const data = await fetchDashboard();
        if (!destroyed) setState((s) => ({ ...s, ...data, loading: false, error: null }));
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
