import { useEffect, useRef, useState } from "react";

const JUPITER_SCRIPT_SRC = "https://terminal.jup.ag/main-v4.js";
const JUPITER_SCRIPT_ID = "jupiter-terminal-script";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const MOUNT_ID = "pulse-jupiter-mount";

declare global {
  interface Window {
    Jupiter?: {
      init: (cfg: Record<string, unknown>) => void;
      resume?: () => void;
      close?: () => void;
      _instance?: unknown;
    };
  }
}

function loadJupiterScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Jupiter && typeof window.Jupiter.init === "function") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(JUPITER_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      // Script tag exists — it may still be loading, may have loaded successfully,
      // or may have already fired load before window.Jupiter was checked.
      // Poll briefly for window.Jupiter as a safety net so we don't hang on a
      // missed load event.
      let attempts = 0;
      const tick = () => {
        if (window.Jupiter && typeof window.Jupiter.init === "function") { resolve(); return; }
        if (++attempts > 60) { reject(new Error("jupiter terminal not ready")); return; }
        setTimeout(tick, 100);
      };
      existing.addEventListener("load", () => { if (window.Jupiter) resolve(); }, { once: true });
      existing.addEventListener("error", () => reject(new Error("script error")), { once: true });
      tick();
      return;
    }
    const s = document.createElement("script");
    s.id = JUPITER_SCRIPT_ID;
    s.src = JUPITER_SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load jupiter terminal"));
    document.head.appendChild(s);
  });
}

interface SwapModalProps {
  open: boolean;
  onClose: () => void;
  mintAddress: string | null;
  accent: string;
}

export default function SwapModal({ open, onClose, mintAddress, accent }: SwapModalProps) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const initialisedRef = useRef(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Capture trigger element, move focus into the modal, restore on close.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    // Defer to next frame so the close button is mounted.
    const id = requestAnimationFrame(() => { closeBtnRef.current?.focus(); });
    return () => {
      cancelAnimationFrame(id);
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  // Close on Escape + simple focus trap (Tab cycles within the modal).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !cardRef.current) return;
      const focusables = cardRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Load script + init Jupiter when opened
  useEffect(() => {
    if (!open) {
      // Tear down on close so re-open gets a fresh widget tied to the new mount node.
      try { window.Jupiter?.close?.(); } catch { /* noop */ }
      initialisedRef.current = false;
      setPhase("loading");
      return;
    }
    if (!mintAddress) { setPhase("error"); return; }
    let cancelled = false;
    setPhase("loading");

    (async () => {
      try {
        await loadJupiterScript();
        if (cancelled) return;
        // Wait for the mount node to exist (it appears in the next paint after `open`).
        await new Promise<void>(r => requestAnimationFrame(() => r()));
        if (cancelled) return;
        const target = document.getElementById(MOUNT_ID);
        if (!target) throw new Error("mount node missing");
        if (initialisedRef.current) return;
        window.Jupiter!.init({
          displayMode: "integrated",
          integratedTargetId: MOUNT_ID,
          endpoint: "https://api.mainnet-beta.solana.com",
          formProps: {
            initialInputMint: SOL_MINT,
            initialOutputMint: mintAddress,
            fixedOutputMint: true,
          },
          defaultExplorer: "Solscan",
          containerStyles: { width: "100%", maxHeight: "560px" },
        });
        initialisedRef.current = true;
        setPhase("ready");
      } catch (err) {
        if (!cancelled) { console.error("[swap] jupiter init failed:", err); setPhase("error"); }
      }
    })();

    return () => {
      cancelled = true;
      // Tear down on cleanup too — covers unmount-while-open case where the
      // `open=false` branch never runs (route change, layout swap, etc).
      if (initialisedRef.current) {
        try { window.Jupiter?.close?.(); } catch { /* noop */ }
        initialisedRef.current = false;
      }
    };
  }, [open, mintAddress]);

  if (!open) return null;

  const backdropStyle: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 100,
    background: "rgba(2,4,8,0.72)",
    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 20,
    animation: "swapFadeIn 0.18s ease-out",
  };

  const cardStyle: React.CSSProperties = {
    position: "relative",
    width: "100%", maxWidth: 440,
    maxHeight: "calc(100vh - 40px)",
    background: "rgba(14, 20, 36, 0.94)",
    border: `1px solid ${accent}44`,
    borderRadius: 12,
    padding: "18px 18px 14px",
    boxShadow: `0 0 0 1px ${accent}1a inset, 0 24px 60px -20px ${accent}55, 0 8px 28px rgba(0,0,0,0.5)`,
    color: "#cfe6ff",
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    overflow: "hidden",
    display: "flex", flexDirection: "column",
    animation: "swapCardIn 0.26s ease-out",
  };

  const cornerColor = `${accent}cc`;
  const corners = (
    <>
      <div style={{ position: "absolute", top: 0, left: 0, width: 22, height: 22,
        borderTop: `1px solid ${cornerColor}`, borderLeft: `1px solid ${cornerColor}`,
        borderTopLeftRadius: 12 }} />
      <div style={{ position: "absolute", bottom: 0, right: 0, width: 22, height: 22,
        borderBottom: `1px solid ${cornerColor}`, borderRight: `1px solid ${cornerColor}`,
        borderBottomRightRadius: 12 }} />
    </>
  );

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div
        ref={cardRef}
        style={cardStyle}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pulse-swap-title"
      >
        {corners}

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 12,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, letterSpacing: "0.22em", color: "rgba(150,200,240,0.7)",
          textTransform: "uppercase",
        }}>
          <span id="pulse-swap-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-block", width: 7, height: 7, borderRadius: "50%",
              background: accent, boxShadow: `0 0 8px ${accent}, 0 0 14px ${accent}`,
              animation: "pulseDot 1.6s ease-in-out infinite",
            }} />
            SWAP // $PULSE
          </span>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close swap"
            style={{
              background: "transparent", border: "1px solid rgba(120,200,255,0.22)",
              color: "#cfe6ff", borderRadius: 6, width: 28, height: 28,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", padding: 0, transition: "border-color 0.18s, color 0.18s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(120,200,255,0.22)"; e.currentTarget.style.color = "#cfe6ff"; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, minHeight: 420, overflowY: "auto",
          borderRadius: 8, position: "relative",
        }}>
          {phase === "loading" && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 10, color: "rgba(150,200,240,0.65)",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                border: `2px solid ${accent}33`, borderTopColor: accent,
                animation: "swapSpin 0.9s linear infinite",
              }} />
              Loading swap…
            </div>
          )}
          {phase === "error" && (
            <div style={{
              padding: "32px 20px", textAlign: "center",
              color: "rgba(255,180,180,0.85)",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11, lineHeight: 1.6,
              letterSpacing: "0.08em",
            }}>
              {!mintAddress ? "Contract address not yet set." : "Swap widget failed to load. Please refresh and try again."}
            </div>
          )}
          <div id={MOUNT_ID} style={{
            width: "100%", minHeight: 420,
            visibility: phase === "ready" ? "visible" : "hidden",
          }} />
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 12, paddingTop: 10,
          borderTop: "1px solid rgba(120,200,255,0.10)",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
          letterSpacing: "0.18em", color: "rgba(140,190,230,0.55)",
          textTransform: "uppercase", textAlign: "center",
        }}>
          ◇ POWERED BY JUPITER · ROUTED ON-CHAIN
        </div>
      </div>

      <style>{`
        @keyframes swapFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes swapCardIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes swapSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
