import { useEffect, useState } from "react";
import { color, glass, motion, radius, space, type as typeT, liveAccent } from "../lib/design";
import { Pill } from "./ui/Primitives";
import { useIsMobile } from "../lib/useIsMobile";
import { useDashboard } from "../lib/useDashboard";
import { blobLive } from "../lib/blobLive";

function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/**
 * Persistent top strip. Brand left, live state center (tier · market cap ·
 * mood pill), docs link right. Replaces the floating top-right DOCS button
 * and the centered PULSE wordmark so there is exactly one top chrome
 * element.
 */
export default function TopBar() {
  const isMobile = useIsMobile();
  const { tokenState } = useDashboard();
  const [mood, setMood] = useState(blobLive.emotion);

  // Light polling of the live blob mood so the pill stays current without
  // forcing a re-render on every animation frame.
  useEffect(() => {
    const t = setInterval(() => setMood(blobLive.emotion), 1500);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, zIndex: 50,
        height: isMobile ? 48 : 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `0 ${isMobile ? space[4] : space[5]}px`,
        background: "linear-gradient(180deg, rgba(4,5,10,0.85), rgba(4,5,10,0.55))",
        borderBottom: `1px solid ${color.border}`,
        ...glass,
        pointerEvents: "auto",
      }}
    >
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: space[3] }}>
        <div
          style={{
            width: 8, height: 8, borderRadius: radius.pill,
            background: liveAccent(1),
            boxShadow: `0 0 12px ${liveAccent(0.8)}`,
            animation: "pulseDot 1.6s ease-in-out infinite",
          }}
        />
        <div style={{
          fontFamily: typeT.mono, fontSize: typeT.size.label,
          letterSpacing: "0.4em", color: color.text, fontWeight: 600,
        }}>PULSE</div>
      </div>

      {/* Live state */}
      {!isMobile && (
        <div style={{ display: "flex", alignItems: "center", gap: space[3] }}>
          <Pill tone="default">{tokenState?.current_tier ?? "DISCOVERY"}</Pill>
          <div style={{
            fontFamily: typeT.mono, fontSize: typeT.size.value,
            color: color.text, letterSpacing: typeT.letter.value,
          }}>{formatUsd(tokenState?.market_cap_usd)}</div>
          <Pill tone="live">◉ {mood}</Pill>
        </div>
      )}

      {/* Right */}
      <a
        href="#/docs"
        style={{
          fontFamily: typeT.mono, fontSize: typeT.size.micro,
          letterSpacing: typeT.letter.label,
          color: color.textDim, textDecoration: "none",
          padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.sm,
          border: `1px solid ${color.border}`,
          transition: `color ${motion.fast}, border-color ${motion.fast}`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = color.text;
          e.currentTarget.style.borderColor = color.borderStrong;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = color.textDim;
          e.currentTarget.style.borderColor = color.border;
        }}
      >DOCS</a>
    </div>
  );
}
