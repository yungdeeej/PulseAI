import { useEffect, useState } from "react";
import { useDashboard } from "../lib/useDashboard";
import { blobLive } from "../lib/blobLive";
import SwapModal from "./SwapModal";

export default function FloatingSwap({ mobile = false }: { mobile?: boolean } = {}) {
  const { tokenState } = useDashboard();
  const mintAddress = tokenState?.mint_address ?? null;
  const [open, setOpen] = useState(false);
  // Live accent — re-read each render via a 1s timer so the button colour
  // tracks the blob's emotion smoothly without subscribing to every frame.
  const [accent, setAccent] = useState(
    () => `rgb(${blobLive.bodyR | 0},${blobLive.bodyG | 0},${blobLive.bodyB | 0})`,
  );
  useEffect(() => {
    const id = setInterval(() => {
      setAccent(`rgb(${blobLive.bodyR | 0},${blobLive.bodyG | 0},${blobLive.bodyB | 0})`);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const disabled = !mintAddress;

  const buttonStyle: React.CSSProperties = mobile
    ? {
        width: "100%",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        padding: "14px 16px",
        borderRadius: 10,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
        letterSpacing: "0.24em", fontWeight: 600, textTransform: "uppercase",
        background: disabled
          ? "linear-gradient(180deg, rgba(20,28,44,0.55), rgba(8,12,22,0.60))"
          : `linear-gradient(180deg, ${accent}30, ${accent}14)`,
        border: `1px solid ${disabled ? "rgba(120,200,255,0.18)" : `${accent}77`}`,
        color: disabled ? "rgba(207,230,255,0.4)" : "#e7f1ff",
        boxShadow: disabled ? "none" : `0 0 0 1px ${accent}22 inset, 0 14px 30px -16px ${accent}aa`,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.2s ease",
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        animation: "panelIn 0.6s ease-out",
      }
    : {
        position: "fixed", right: 24, bottom: 24, zIndex: 6,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        padding: "14px 22px",
        minWidth: 200,
        borderRadius: 12,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
        letterSpacing: "0.26em", fontWeight: 600, textTransform: "uppercase",
        background: disabled
          ? "linear-gradient(180deg, rgba(20,28,44,0.78), rgba(8,12,22,0.82))"
          : `linear-gradient(180deg, ${accent}38, ${accent}18)`,
        border: `1px solid ${disabled ? "rgba(120,200,255,0.18)" : `${accent}88`}`,
        color: disabled ? "rgba(207,230,255,0.4)" : "#e7f1ff",
        boxShadow: disabled
          ? "0 0 0 1px rgba(80,180,255,0.05) inset, 0 14px 30px -20px rgba(0,180,255,0.25)"
          : `0 0 0 1px ${accent}33 inset, 0 0 28px -6px ${accent}66, 0 18px 40px -18px ${accent}aa`,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "transform 0.2s ease, box-shadow 0.25s ease, border-color 0.25s ease",
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        title={disabled ? "Contract pending" : open ? "Close swap" : "Swap SOL → $PULSE"}
        style={buttonStyle}
        onMouseEnter={(e) => { if (!disabled) {
          e.currentTarget.style.transform = mobile ? "" : "translateY(-2px)";
          e.currentTarget.style.borderColor = `${accent}cc`;
          e.currentTarget.style.boxShadow = `0 0 0 1px ${accent}55 inset, 0 0 36px -4px ${accent}88, 0 22px 44px -16px ${accent}cc`;
        } }}
        onMouseLeave={(e) => { if (!disabled) {
          e.currentTarget.style.transform = "";
          e.currentTarget.style.borderColor = `${accent}88`;
          e.currentTarget.style.boxShadow = `0 0 0 1px ${accent}33 inset, 0 0 28px -6px ${accent}66, 0 18px 40px -18px ${accent}aa`;
        } }}
      >
        {!disabled && (
          <span style={{
            display: "inline-block", width: 7, height: 7, borderRadius: "50%",
            background: accent, boxShadow: `0 0 8px ${accent}, 0 0 14px ${accent}`,
            animation: "pulseDot 1.6s ease-in-out infinite", flexShrink: 0,
          }} />
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M7 7h13M7 7l4-4M7 7l4 4M17 17H4M17 17l-4-4M17 17l-4 4" />
        </svg>
        <span>{disabled ? "SWAP // SOON" : "SWAP // BUY $PULSE"}</span>
      </button>
      <SwapModal open={open} onClose={() => setOpen(false)} mintAddress={mintAddress} accent={accent} />
    </>
  );
}
