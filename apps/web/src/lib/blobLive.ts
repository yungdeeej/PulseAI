// Shared live state written by the blob render loop and read by the dashboard
// UI / background. Never use React state for these — keep it a plain mutable
// object so we don't trigger re-renders.

export interface BlobLive {
  emotion: string;
  glowMult: number;
  bodyR: number; bodyG: number; bodyB: number;
  breathPhase: number;     // raw radians
  breathPulse: number;     // 0..1, sin(phase)*0.5+0.5
  entryPulse: number;      // 0..1, decays after emotion change
  wobbleAmp: number;
  blobX: number; blobY: number; blobR: number;
  cursorX: number; cursorY: number;
  cursorVel: number;
  // Tier evolution. tier is the current tier key (DISCOVERY..ASCENSION).
  // tierPromotedAt is a Date.now() timestamp that flips when the tier
  // increases; UI overlays listen for changes to animate a celebration.
  tier: string;
  tierPromotedAt: number;
}

export const blobLive: BlobLive = {
  emotion: "idle",
  glowMult: 1,
  bodyR: 80, bodyG: 200, bodyB: 255,
  breathPhase: 0,
  breathPulse: 0.5,
  entryPulse: 0,
  wobbleAmp: 1,
  blobX: 0, blobY: 0, blobR: 100,
  cursorX: -1, cursorY: -1,
  cursorVel: 0,
  tier: "DISCOVERY",
  tierPromotedAt: 0,
};

export const TIER_INDEX: Record<string, number> = {
  DISCOVERY: 0,
  IGNITION:  1,
  MOMENTUM:  2,
  CONVICTION: 3,
  ASCENSION: 4,
};

export function tierIndex(tier: string): number {
  return TIER_INDEX[tier] ?? 0;
}

export interface ActivityEvent {
  id: number;
  ts: number;
  kind: "emotion" | "system" | "interaction";
  msg: string;
  color?: string;
}

let _id = 0;
const MAX_EVENTS = 60;
export const activityFeed: ActivityEvent[] = [];

export function pushEvent(kind: ActivityEvent["kind"], msg: string, color?: string) {
  activityFeed.unshift({ id: ++_id, ts: Date.now(), kind, msg, color });
  if (activityFeed.length > MAX_EVENTS) activityFeed.length = MAX_EVENTS;
}

// Color helper exposed for UI consistency
export const EMOTION_COLOR: Record<string, string> = {
  idle:       "rgb(80,200,255)",
  curious:    "rgb(160,170,255)",
  happy:      "rgb(255,210,90)",
  excited:    "rgb(255,120,210)",
  nervous:    "rgb(140,240,180)",
  focused:    "rgb(80,140,255)",
  sleepy:     "rgb(170,130,210)",
  sleeping:   "rgb(110,140,180)",
  shocked:    "rgb(255,110,110)",
  suspicious: "rgb(255,180,80)",
};

// Seed a few system events so the feed isn't empty on first render
pushEvent("system", "PULSE ENTITY :: ONLINE");
pushEvent("system", "Containment field nominal");
pushEvent("system", "Telemetry uplink established");
