import { useEffect, useRef, useState } from "react";
import { blobLive } from "../lib/blobLive";

const TIER_LABEL: Record<string, string> = {
  DISCOVERY: "DISCOVERY",
  IGNITION: "IGNITION",
  MOMENTUM: "MOMENTUM",
  CONVICTION: "CONVICTION",
  ASCENSION: "ASCENSION",
};

const TIER_TAG: Record<string, string> = {
  IGNITION: "TIER 1",
  MOMENTUM: "TIER 2",
  CONVICTION: "TIER 3",
  ASCENSION: "TIER 4",
};

const DURATION_MS = 6500;

interface ActivePromo {
  tier: string;
  startedAt: number;
}

export default function TierPromotionOverlay() {
  const [active, setActive] = useState<ActivePromo | null>(null);
  const lastSeenRef = useRef<number>(blobLive.tierPromotedAt);

  useEffect(() => {
    const id = setInterval(() => {
      const stamp = blobLive.tierPromotedAt;
      if (stamp !== lastSeenRef.current && stamp > 0) {
        lastSeenRef.current = stamp;
        setActive({ tier: blobLive.tier, startedAt: stamp });
        setTimeout(() => {
          setActive((curr) => (curr && curr.startedAt === stamp ? null : curr));
        }, DURATION_MS);
      }
    }, 200);
    return () => clearInterval(id);
  }, []);

  if (!active) return null;

  const label = TIER_LABEL[active.tier] ?? active.tier;
  const tag = TIER_TAG[active.tier] ?? "TIER ASCENSION";

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        pointerEvents: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(circle at 50% 50%, rgba(255,210,90,0.22) 0%, rgba(4,5,10,0.0) 60%)",
        animation: "tierFlash 1.4s ease-out 1 both",
      }} />
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        width: 40, height: 40, marginLeft: -20, marginTop: -20,
        borderRadius: "50%",
        border: "2px solid rgba(255,210,90,0.85)",
        boxShadow: "0 0 40px rgba(255,210,90,0.6)",
        animation: "tierRing 2.2s ease-out 1 both",
      }} />
      <div style={{
        position: "relative",
        padding: "28px 44px",
        textAlign: "center",
        background: "linear-gradient(180deg, rgba(20,28,44,0.85), rgba(8,12,22,0.92))",
        border: "1px solid rgba(255,210,90,0.55)",
        borderRadius: 14,
        boxShadow: "0 0 60px -10px rgba(255,210,90,0.55), inset 0 0 0 1px rgba(255,210,90,0.08)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        animation: "tierBanner 6.5s cubic-bezier(0.2,0.9,0.3,1.2) 1 both",
      }}>
        <span style={{
          position: "absolute", top: 0, left: 0, width: 22, height: 22,
          borderTop: "1px solid rgba(255,210,90,0.9)",
          borderLeft: "1px solid rgba(255,210,90,0.9)",
          borderTopLeftRadius: 10,
        }} />
        <span style={{
          position: "absolute", bottom: 0, right: 0, width: 22, height: 22,
          borderBottom: "1px solid rgba(255,210,90,0.9)",
          borderRight: "1px solid rgba(255,210,90,0.9)",
          borderBottomRightRadius: 10,
        }} />
        <div style={{
          fontSize: 10.5, letterSpacing: "0.4em",
          color: "rgba(255,210,90,0.85)",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {tag} · UNLOCKED
        </div>
        <div style={{
          marginTop: 10,
          fontSize: 38, fontWeight: 700, letterSpacing: "0.16em",
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          color: "#fff5d2",
          textShadow: "0 0 24px rgba(255,210,90,0.7), 0 0 60px rgba(255,170,40,0.4)",
        }}>
          {label}
        </div>
        <div style={{
          marginTop: 10,
          fontSize: 10, letterSpacing: "0.28em",
          color: "rgba(200,225,245,0.6)",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          ENTITY EVOLVING · CONTAINMENT FIELD ADAPTING
        </div>
      </div>
      <style>{`
        @keyframes tierFlash {
          0%   { opacity: 0; }
          12%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes tierRing {
          0%   { width: 40px; height: 40px; margin-left: -20px; margin-top: -20px; opacity: 0.95; border-width: 2px; }
          100% { width: 1400px; height: 1400px; margin-left: -700px; margin-top: -700px; opacity: 0; border-width: 0.5px; }
        }
        @keyframes tierBanner {
          0%   { transform: scale(0.85); opacity: 0; }
          9%   { transform: scale(1);    opacity: 1; }
          85%  { transform: scale(1);    opacity: 1; }
          100% { transform: scale(1);    opacity: 0; }
        }
      `}</style>
    </div>
  );
}
