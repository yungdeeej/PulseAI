import { useEffect, useRef, useState } from "react";
import { blobLive } from "../lib/blobLive";
import { useDashboard } from "../lib/useDashboard";

const TIER_LABELS: Record<string, string> = {
  DISCOVERY: "TIER 0 · DISCOVERY",
  IGNITION: "TIER 1 · IGNITION",
  MOMENTUM: "TIER 2 · MOMENTUM",
  CONVICTION: "TIER 3 · CONVICTION",
  ASCENSION: "TIER 4 · ASCENSION",
};

const TIER_PROGRESS: Record<string, number> = {
  DISCOVERY: 5, IGNITION: 25, MOMENTUM: 50, CONVICTION: 75, ASCENSION: 100,
};

function Card({ label, children, accent }: { label: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      position: "relative",
      background: "linear-gradient(180deg, rgba(20,28,44,0.55), rgba(8,12,22,0.60))",
      border: "1px solid rgba(120, 200, 255, 0.14)", borderRadius: 10, padding: "14px 16px",
      backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      boxShadow: "0 0 0 1px rgba(80,180,255,0.04) inset, 0 18px 40px -20px rgba(0,180,255,0.20)",
      overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 22, height: 22,
        borderTop: `1px solid ${accent ?? "rgba(120,210,255,0.55)"}`,
        borderLeft: `1px solid ${accent ?? "rgba(120,210,255,0.55)"}`, borderTopLeftRadius: 10 }} />
      <div style={{ position: "absolute", bottom: 0, right: 0, width: 22, height: 22,
        borderBottom: `1px solid ${accent ?? "rgba(120,210,255,0.55)"}`,
        borderRight: `1px solid ${accent ?? "rgba(120,210,255,0.55)"}`, borderBottomRightRadius: 10 }} />
      <div style={{ fontSize: 9.5, letterSpacing: "0.22em", color: "rgba(150,200,240,0.55)",
        textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function LiveDot({ color }: { color: string }) {
  return (
    <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%",
      background: color, boxShadow: `0 0 8px ${color}, 0 0 14px ${color}`,
      animation: "pulseDot 1.6s ease-in-out infinite" }} />
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const W = 168, H = 28;
  if (data.length < 2) return <svg width={W} height={H} />;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / span) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={`0,${H} ${pts} ${W},${H}`} fill={color} opacity={0.10} />
    </svg>
  );
}

function Waveform() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    const W = 168, H = 52;
    c.width = W * 2; c.height = H * 2; c.style.width = W + "px"; c.style.height = H + "px";
    ctx.scale(2, 2);
    let raf = 0; const buf: number[] = new Array(W).fill(H / 2);
    let last = performance.now(); const maxAmp = H / 2 - 2;
    const loop = () => {
      const now = performance.now(); last = now;
      const heart = Math.sin(blobLive.breathPhase) * 0.5 + 0.5;
      const spike = Math.exp(-Math.pow((heart - 0.95) * 12, 2)) * 1.2;
      let v = (heart - 0.5) * 12 + spike * 22;
      if (v > maxAmp) v = maxAmp; if (v < -maxAmp) v = -maxAmp;
      buf.push(H / 2 - v); buf.shift();
      ctx.clearRect(0, 0, W, H);
      const col = `rgb(${blobLive.bodyR | 0}, ${blobLive.bodyG | 0}, ${blobLive.bodyB | 0})`;
      ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.shadowColor = col; ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let i = 0; i < buf.length; i++) { if (i === 0) ctx.moveTo(i, buf[i]); else ctx.lineTo(i, buf[i]); }
      ctx.stroke(); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} style={{ display: "block" }} />;
}

export function LeftPanels({ mobile = false }: { mobile?: boolean } = {}) {
  const { tokenState, vaults, priceHistory, change24h } = useDashboard();
  const [bpm, setBpm] = useState(72);

  const cap = Number(tokenState?.market_cap_usd ?? 0);
  const tier = (tokenState?.current_tier ?? "DISCOVERY") as string;
  const tierLabel = TIER_LABELS[tier] ?? tier;
  const tierProgress = TIER_PROGRESS[tier] ?? 5;

  const decisionVault = vaults.find((v) => v.kind === "DECISION");
  const defenseVault = vaults.find((v) => v.kind === "DEFENSE");
  const totalVaultSol = vaults.reduce((sum, v) => sum + Number(v.balance_sol), 0);

  useEffect(() => {
    const id = setInterval(() => {
      const base = 64;
      const variance = (Math.sin(blobLive.breathPhase * 0.5) * 6) + (blobLive.entryPulse * 18);
      const emoBoost = blobLive.emotion === "excited" ? 38 : blobLive.emotion === "nervous" ? 30
        : blobLive.emotion === "shocked" ? 44 : blobLive.emotion === "sleepy" ? -20
        : blobLive.emotion === "sleeping" ? -36 : blobLive.emotion === "focused" ? -8 : 0;
      setBpm(Math.round(base + variance + emoBoost));
    }, 600);
    return () => clearInterval(id);
  }, []);

  const accent = `rgb(${blobLive.bodyR | 0},${blobLive.bodyG | 0},${blobLive.bodyB | 0})`;
  const sparkData = priceHistory.length >= 2
    ? priceHistory
    : Array.from({ length: 32 }, (_, i) => 0.00001 + Math.sin(i * 0.4) * 0.000002);

  const mintAddress = tokenState?.mint_address ?? null;
  const shortMint = mintAddress
    ? `${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`
    : null;

  return (
    <div style={{
      ...(mobile ? { position: "relative", width: "100%", animation: "panelIn 0.6s ease-out" }
        : { position: "fixed", top: 24, left: 24, width: 260 }),
      zIndex: 5, display: "flex", flexDirection: "column", gap: mobile ? 10 : 14,
      fontFamily: "'Inter', sans-serif", color: "#cfe6ff", pointerEvents: "auto",
    }}>
      <div style={{ padding: "0 4px" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.4em", color: "rgba(120,180,230,0.6)", fontFamily: "'JetBrains Mono', monospace" }}>
          PULSE CONTAINMENT
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "0.04em", marginTop: 2, fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
          ENTITY <span style={{ color: accent }}>// 001</span>
        </div>
        <div style={{ fontSize: 10.5, color: "rgba(140,190,230,0.55)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
          <LiveDot color="#7aff9f" /> {tierLabel} · CHAMBER A-7
        </div>
        {shortMint && (
          <div style={{
            marginTop: 6, display: "flex", alignItems: "center", gap: 6,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            letterSpacing: "0.14em", color: "rgba(140,190,230,0.38)",
          }}>
            <span style={{ color: "rgba(120,200,255,0.3)" }}>CA</span>
            <span>{mintAddress}</span>
          </div>
        )}
      </div>

      <Card label="Market Cap" accent="rgba(150,220,255,0.55)">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "0.02em", fontFamily: "'Space Grotesk', sans-serif" }}>
            {cap >= 1_000_000 ? `$${(cap / 1_000_000).toFixed(2)}M`
              : cap >= 1_000 ? `$${(cap / 1_000).toFixed(1)}K`
              : cap > 0 ? `$${cap.toFixed(0)}` : "–"}
          </div>
          <div style={{ fontSize: 11, color: change24h >= 0 ? "#7aff9f" : "#ff7a8a", fontFamily: "'JetBrains Mono', monospace" }}>
            {change24h >= 0 ? "▲" : "▼"} {Math.abs(change24h).toFixed(2)}%
          </div>
        </div>
        <div style={{ marginTop: 8 }}><Sparkline data={sparkData} color={accent} /></div>
      </Card>

      <Card label="Heart Rate">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>
            {bpm} <span style={{ fontSize: 11, color: "rgba(140,190,230,0.55)", fontWeight: 400, marginLeft: 2 }}>BPM</span>
          </div>
          <div style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "rgba(140,190,230,0.55)", fontFamily: "'JetBrains Mono', monospace" }}>SYNC</div>
        </div>
        <div style={{ marginTop: 6 }}><Waveform /></div>
      </Card>

      <Card label={`Tier · ${tier}`}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", fontFamily: "'Space Grotesk', sans-serif", color: "#cfe6ff" }}>
            {tierLabel}
          </div>
          <div style={{ fontSize: 10, color: accent, fontFamily: "'JetBrains Mono', monospace" }}>{tierProgress}%</div>
        </div>
        <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: "rgba(60,120,180,0.16)", overflow: "hidden", position: "relative" }}>
          <div style={{ width: `${tierProgress}%`, height: "100%", background: `linear-gradient(90deg, transparent, ${accent})`, boxShadow: `0 0 10px ${accent}` }} />
        </div>
      </Card>

      <Card label="Treasury">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>
              {totalVaultSol > 0 ? `${totalVaultSol.toFixed(3)} SOL` : "VAULT SECURED"}
            </div>
            <div style={{ fontSize: 10, color: "rgba(140,190,230,0.55)", marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
              {decisionVault
                ? `DEC ${Number(decisionVault.balance_sol).toFixed(3)} · DEF ${Number(defenseVault?.balance_sol ?? 0).toFixed(3)}`
                : "5 vaults · online"}
            </div>
          </div>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(120,255,160,0.10)", border: "1px solid rgba(120,255,160,0.4)", display: "grid", placeItems: "center", color: "#7aff9f", fontFamily: "'JetBrains Mono', monospace", fontSize: 14 }}>◉</div>
        </div>
      </Card>

      <ActionRow accent={accent} mintAddress={tokenState?.mint_address ?? null} />
    </div>
  );
}

const X_URL = "https://x.com/pulsetoken";

function ActionRow({ accent, mintAddress }: { accent: string; mintAddress: string | null }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (!mintAddress) return;
    try { await navigator.clipboard.writeText(mintAddress); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { }
  };
  const btnBase: React.CSSProperties = {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    padding: "10px 12px",
    background: "linear-gradient(180deg, rgba(20,28,44,0.55), rgba(8,12,22,0.60))",
    border: "1px solid rgba(120,200,255,0.18)", borderRadius: 10, color: "#cfe6ff",
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.18em",
    textTransform: "uppercase", cursor: mintAddress ? "pointer" : "default",
    transition: "border-color 0.2s, box-shadow 0.2s", backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)", textDecoration: "none",
  };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" onClick={onCopy} style={{ ...btnBase,
        color: copied ? "#7aff9f" : "#cfe6ff",
        borderColor: copied ? "rgba(120,255,160,0.55)" : "rgba(120,200,255,0.22)",
        boxShadow: copied ? "0 0 18px -6px rgba(120,255,160,0.55)" : "none",
        opacity: mintAddress ? 1 : 0.5 }}
        onMouseEnter={(e) => { if (!copied && mintAddress) { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 18px -6px ${accent}`; } }}
        onMouseLeave={(e) => { if (!copied) { e.currentTarget.style.borderColor = "rgba(120,200,255,0.22)"; e.currentTarget.style.boxShadow = "none"; } }}
        title={mintAddress ?? "Contract address not yet set"}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <span>{copied ? "COPIED" : mintAddress ? "COPY CA" : "CA TBA"}</span>
      </button>
      <a href={X_URL} target="_blank" rel="noopener noreferrer" style={{ ...btnBase, flex: "0 0 56px" }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 18px -6px ${accent}`; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(120,200,255,0.22)"; e.currentTarget.style.boxShadow = "none"; }}
        title="Follow on X" aria-label="Follow on X">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2H21.5l-7.55 8.625L23 22h-6.844l-5.36-6.99L4.7 22H1.44l8.07-9.214L1 2h7.02l4.85 6.394L18.244 2Zm-1.2 18h1.8L7.05 4H5.18l11.864 16Z" />
        </svg>
      </a>
    </div>
  );
}
