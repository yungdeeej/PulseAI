// ─── Design tokens ──────────────────────────────────────────────────────────
// One source of truth for type, color, spacing, radius, and elevations across
// the whole dashboard. Mood-reactive accents read the blob's live color so
// every surface tints in sync with PULSE's current emotion.

import { blobLive } from "./blobLive";

// Spacing scale — strict 4px rhythm
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
} as const;

// Type scale — 5 sizes max, label / body / value / display
export const type = {
  mono: "'JetBrains Mono', ui-monospace, monospace",
  display: "'Space Grotesk', system-ui, sans-serif",
  size: {
    micro: 9,    // labels, micro-labels
    label: 10,   // section headers, pills
    body: 11.5,  // body copy
    value: 13,   // values, button text
    metric: 18,  // mid metrics
    display: 28, // headline numbers (My Pulse projected SOL)
  },
  letter: {
    label: "0.22em",
    button: "0.18em",
    value: "0.05em",
  },
} as const;

// Surface palette — three elevation levels on the dark background
export const color = {
  bg: "#04050A",
  surface1: "rgba(14, 20, 36, 0.72)",
  surface2: "rgba(20, 28, 46, 0.82)",
  surface3: "rgba(28, 38, 58, 0.92)",
  text: "#E8EDFA",
  textDim: "rgba(232, 237, 250, 0.62)",
  textFaint: "rgba(232, 237, 250, 0.38)",
  border: "rgba(120, 200, 255, 0.10)",
  borderStrong: "rgba(120, 200, 255, 0.24)",
  borderAccent: "rgba(120, 200, 255, 0.45)",
  // Semantic
  positive: "rgb(120, 255, 170)",
  caution: "rgb(255, 200, 130)",
  negative: "rgb(255, 140, 130)",
  insight: "rgb(220, 180, 255)",
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

// Animation
export const motion = {
  fast: "120ms cubic-bezier(0.2, 0.8, 0.2, 1)",
  base: "200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
  slow: "320ms cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;

// ─── Mood-driven accent ─────────────────────────────────────────────────────
// Reads the live blob color (mutable singleton, no re-render).

export function liveAccent(alpha = 1): string {
  return `rgba(${blobLive.bodyR | 0}, ${blobLive.bodyG | 0}, ${blobLive.bodyB | 0}, ${alpha})`;
}

export function liveAccentHex(): string {
  // For places that need a solid color (not alpha-able rgba).
  const toHex = (n: number) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0");
  return `#${toHex(blobLive.bodyR)}${toHex(blobLive.bodyG)}${toHex(blobLive.bodyB)}`;
}

// Glassy surface CSS — used by Card, SidePanel, TopBar, Dock for consistency.
export const glass = {
  backdropFilter: "blur(16px) saturate(180%)",
  WebkitBackdropFilter: "blur(16px) saturate(180%)",
} as const;
