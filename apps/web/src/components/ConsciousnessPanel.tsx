import { useEffect, useState } from "react";
import { fetchConsciousness, type AIInsight, type AIMemory } from "../lib/api";
import { EMOTION_COLOR } from "../lib/blobLive";

const POLL_MS = 30_000;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ConsciousnessPanel({ mobile = false }: { mobile?: boolean } = {}) {
  const [latest, setLatest] = useState<AIInsight | null>(null);
  const [recent, setRecent] = useState<AIInsight[]>([]);
  const [memories, setMemories] = useState<AIMemory[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const data = await fetchConsciousness(8);
        if (dead) return;
        setLatest(data.latest);
        setRecent(data.recent ?? []);
        setMemories(data.memories ?? []);
      } catch {
        /* silent — panel just hides when no data */
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { dead = true; clearInterval(id); };
  }, []);

  const accent = latest ? EMOTION_COLOR[latest.mood] ?? "rgb(220,180,255)" : "rgb(220,180,255)";

  const cardStyle: React.CSSProperties = {
    position: "relative",
    background:
      "linear-gradient(180deg, rgba(28,18,44,0.65), rgba(12,10,28,0.62))",
    border: `1px solid ${accent}33`,
    borderRadius: 10,
    padding: "14px 16px",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    boxShadow: `0 0 0 1px ${accent}14 inset, 0 18px 40px -18px ${accent}40`,
    overflow: "hidden",
    fontFamily: "'Inter', sans-serif",
    color: "#e7d9ff",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 9.5,
    letterSpacing: "0.22em",
    color: `${accent}99`,
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };

  const positionStyle: React.CSSProperties = mobile
    ? { position: "relative", width: "100%", animation: "panelIn 0.6s ease-out" }
    : { position: "fixed", top: 24, left: 24, width: 300, zIndex: 5 };

  if (!latest) {
    return (
      <div style={{ ...positionStyle, pointerEvents: "auto" }}>
        <div style={cardStyle}>
          <div style={labelStyle}>
            <span>◆ AI Consciousness</span>
            <span style={{ opacity: 0.6, letterSpacing: "0.15em" }}>BOOTING</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(220,200,255,0.55)", lineHeight: 1.6 }}>
            Neural cortex syncing… first reflection arrives within a few minutes of bot uptime.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...positionStyle, pointerEvents: "auto" }}>
      <div style={cardStyle}>
        <div style={labelStyle}>
          <span>
            <span style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
              background: accent, boxShadow: `0 0 8px ${accent}`,
              marginRight: 8, verticalAlign: "middle",
              animation: "pulseDot 1.6s ease-in-out infinite",
            }} />
            AI Consciousness
          </span>
          <span style={{ opacity: 0.65, letterSpacing: "0.15em" }}>{timeAgo(latest.created_at)}</span>
        </div>

        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 14.5, lineHeight: 1.35, fontWeight: 500,
          color: accent,
          marginBottom: 8,
          letterSpacing: "0.005em",
        }}>
          {latest.headline}
        </div>

        <div style={{
          fontSize: 11.5, lineHeight: 1.55,
          color: "rgba(230,220,255,0.82)",
          marginBottom: 10,
        }}>
          {latest.commentary}
        </div>

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5,
          color: "rgba(220,200,255,0.55)", letterSpacing: "0.15em",
          paddingTop: 8,
          borderTop: `1px solid ${accent}22`,
        }}>
          <span>MOOD :: {latest.mood.toUpperCase()}</span>
          <span>CONF :: {(latest.confidence * 100).toFixed(0)}%</span>
        </div>

        {latest.vote_lean && (
          <div style={{
            marginTop: 10, padding: "8px 10px",
            borderRadius: 6, background: `${accent}10`,
            border: `1px solid ${accent}30`,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: "rgba(230,220,255,0.85)", lineHeight: 1.5,
          }}>
            <div style={{ color: accent, letterSpacing: "0.18em", marginBottom: 3 }}>
              ▸ LEANS :: {latest.vote_lean.toUpperCase()}
            </div>
            {latest.vote_reason && (
              <div style={{ opacity: 0.75 }}>{latest.vote_reason}</div>
            )}
          </div>
        )}

        {recent.length > 1 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            style={{
              marginTop: 10, width: "100%", padding: "6px 0",
              background: "transparent", border: `1px dashed ${accent}33`,
              color: `${accent}aa`, cursor: "pointer", borderRadius: 6,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5,
              letterSpacing: "0.2em",
            }}
          >
            {expanded ? "− HIDE HISTORY" : `+ ${recent.length - 1} PRIOR REFLECTIONS`}
          </button>
        )}

        {expanded && (
          <div style={{ marginTop: 10, maxHeight: 320, overflowY: "auto" }}>
            {recent.slice(1).map((r) => {
              const c = EMOTION_COLOR[r.mood] ?? accent;
              return (
                <div key={r.id} style={{
                  padding: "8px 0", borderTop: `1px solid ${accent}18`,
                  fontSize: 10.5, lineHeight: 1.5,
                }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    letterSpacing: "0.15em", color: `${c}aa`, marginBottom: 3,
                  }}>
                    {timeAgo(r.created_at)} :: {r.mood.toUpperCase()}
                  </div>
                  <div style={{ color: "rgba(230,220,255,0.78)" }}>{r.headline}</div>
                </div>
              );
            })}

            {memories.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${accent}33` }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                  letterSpacing: "0.2em", color: `${accent}aa`, marginBottom: 8,
                }}>
                  ◇ LONG-TERM MEMORY
                </div>
                {memories.map((m) => (
                  <div key={m.id} style={{
                    padding: "6px 0", fontSize: 10.5, lineHeight: 1.5,
                    color: "rgba(230,220,255,0.72)",
                  }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5,
                      letterSpacing: "0.15em", color: `${accent}99`, marginRight: 6,
                    }}>
                      [{m.kind}]
                    </span>
                    {m.memory}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
