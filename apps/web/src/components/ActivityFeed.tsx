import { useEffect, useMemo, useState } from "react";
import { activityFeed, blobLive, EMOTION_COLOR, pushEvent } from "../lib/blobLive";
import { useDashboard } from "../lib/useDashboard";

export default function RightPanels({ mobile = false }: { mobile?: boolean } = {}) {
  const [emotion, setEmotion] = useState(blobLive.emotion);
  const [accent, setAccent] = useState("rgb(80,200,255)");
  const [feedLen, setFeedLen] = useState(activityFeed.length);
  const [reactivity, setReactivity] = useState(blobLive.glowMult);

  // Trigger dashboard polling (which also feeds bot_activity into activityFeed)
  useDashboard();

  useEffect(() => {
    let lastEmotion = blobLive.emotion;
    let lastFeedLen = activityFeed.length;
    let lastAccent = "";
    let lastReact = blobLive.glowMult;
    const id = setInterval(() => {
      if (blobLive.emotion !== lastEmotion) {
        const from = lastEmotion; lastEmotion = blobLive.emotion; setEmotion(lastEmotion);
        pushEvent("emotion", `STATE :: ${from.toUpperCase()} → ${lastEmotion.toUpperCase()}`, EMOTION_COLOR[lastEmotion]);
      }
      if (activityFeed.length !== lastFeedLen) { lastFeedLen = activityFeed.length; setFeedLen(lastFeedLen); }
      const r = (blobLive.bodyR / 12) | 0, g = (blobLive.bodyG / 12) | 0, b = (blobLive.bodyB / 12) | 0;
      const accentKey = `${r},${g},${b}`;
      if (accentKey !== lastAccent) { lastAccent = accentKey; setAccent(`rgb(${blobLive.bodyR | 0},${blobLive.bodyG | 0},${blobLive.bodyB | 0})`); }
      const react = Math.round(blobLive.glowMult * 20) / 20;
      if (react !== lastReact) { lastReact = react; setReactivity(react); }
    }, 220);
    return () => clearInterval(id);
  }, []);

  const visibleFeed = useMemo(() => activityFeed.slice(0, 14), [feedLen]);

  useEffect(() => {
    const msgs = [
      "Containment field :: stable",
      "Neural sync :: 99.4%",
      "Monitoring liquidity depth",
      "Scanning order flow",
      "Wallet cluster analysis :: running",
      "Bio-signature :: persistent",
      "Mempool scan :: no anomalies",
      "Holder distribution :: nominal",
      "Smart money tracker :: active",
      "Price oracle :: synced",
      "On-chain sentiment :: processing",
    ];
    const id = setInterval(() => pushEvent("system", msgs[Math.floor(Math.random() * msgs.length)]), 12000);
    return () => clearInterval(id);
  }, []);

  const cardStyle: React.CSSProperties = {
    position: "relative",
    background: "linear-gradient(180deg, rgba(20,28,44,0.55), rgba(8,12,22,0.60))",
    border: "1px solid rgba(120, 200, 255, 0.14)", borderRadius: 10, padding: "14px 16px",
    backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
    boxShadow: "0 0 0 1px rgba(80,180,255,0.04) inset, 0 18px 40px -20px rgba(0,180,255,0.20)",
    overflow: "hidden",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 9.5, letterSpacing: "0.22em", color: "rgba(150,200,240,0.55)",
    textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8,
  };

  return (
    <div style={{
      ...(mobile ? { position: "relative", width: "100%", animation: "panelIn 0.6s ease-out" }
        : { position: "fixed", top: 24, right: 24, width: 280 }),
      zIndex: 5, display: "flex", flexDirection: "column", gap: mobile ? 10 : 14,
      fontFamily: "'Inter', sans-serif", color: "#cfe6ff", pointerEvents: "auto",
    }}>
      <div style={cardStyle}>
        <div style={labelStyle}>Emotional State</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%",
            background: `radial-gradient(circle at 35% 30%, ${accent}, transparent 70%)`,
            border: `1px solid ${accent}`,
            boxShadow: `0 0 18px ${accent}, inset 0 0 12px ${accent}`,
            transition: "box-shadow 0.6s, border-color 0.6s" }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "'Space Grotesk', sans-serif", color: accent, transition: "color 0.6s" }}>
              {emotion}
            </div>
            <div style={{ fontSize: 10, color: "rgba(140,190,230,0.55)", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
              REACTIVITY :: {(reactivity * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: "14px 0 6px 0" }}>
        <div style={{ ...labelStyle, padding: "0 16px" }}>Live Activity</div>
        <div style={{ maxHeight: 360, overflow: "hidden", padding: "0 16px 6px 16px",
          maskImage: "linear-gradient(180deg, black 80%, transparent)",
          WebkitMaskImage: "linear-gradient(180deg, black 80%, transparent)" }}>
          {visibleFeed.map(ev => {
            const c = ev.color ?? (ev.kind === "system" ? "rgba(150,200,240,0.6)" : "#cfe6ff");
            return (
              <div key={ev.id} style={{ display: "flex", gap: 8, alignItems: "baseline",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, lineHeight: 1.55,
                padding: "3px 0", animation: "feedIn 0.45s ease-out" }}>
                <span style={{ color: "rgba(140,190,230,0.35)", flexShrink: 0 }}>{formatTs(ev.ts)}</span>
                <span style={{ color: c, opacity: 0.92 }}>{ev.msg}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={labelStyle}>System Status</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5 }}>
          <Status label="UPLINK" value="ACTIVE" color="#7aff9f" />
          <Status label="BOT" value="ONLINE" color="#7aff9f" />
          <Status label="COOLING" value="22.4°C" color="rgb(120,210,255)" />
          <Status label="LATENCY" value="3ms" color="rgb(120,210,255)" />
        </div>
      </div>
    </div>
  );
}

function Status({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: "6px 8px", borderRadius: 6, background: "rgba(60,120,180,0.06)", border: "1px solid rgba(120,200,255,0.10)" }}>
      <div style={{ color: "rgba(140,190,230,0.5)", fontSize: 9, letterSpacing: "0.18em" }}>{label}</div>
      <div style={{ color, marginTop: 2 }}>
        <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}`, marginRight: 6, verticalAlign: "middle" }} />
        {value}
      </div>
    </div>
  );
}

function formatTs(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
