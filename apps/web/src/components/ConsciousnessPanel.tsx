import { useEffect, useRef, useState } from "react";
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

function thinkingSince(iso: string): string {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d`;
  return d.toISOString().slice(0, 10);
}

const BASE_BORDER = "rgba(120,200,255,0.14)";
const SUBTLE = "rgba(140,190,230,0.55)";
const SUBTLE_DIM = "rgba(140,190,230,0.35)";
const BODY = "rgba(207,230,255,0.88)";

export default function ConsciousnessPanel({ mobile = false }: { mobile?: boolean } = {}) {
  const [latest, setLatest] = useState<AIInsight | null>(null);
  const [recent, setRecent] = useState<AIInsight[]>([]);
  const [memories, setMemories] = useState<AIMemory[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [arrivalPulse, setArrivalPulse] = useState(false);
  const lastSeenIdRef = useRef<number | null>(null);

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const data = await fetchConsciousness(8);
        if (dead) return;
        setLatest(data.latest);
        setRecent(data.recent ?? []);
        setMemories(data.memories ?? []);
        if (data.latest && data.latest.id !== lastSeenIdRef.current) {
          const first = lastSeenIdRef.current === null;
          lastSeenIdRef.current = data.latest.id;
          if (!first) {
            setExpanded(true);
            setArrivalPulse(true);
            setTimeout(() => { if (!dead) setArrivalPulse(false); }, 2400);
          }
        }
      } catch { /* silent */ }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { dead = true; clearInterval(id); };
  }, []);

  const accent = latest ? EMOTION_COLOR[latest.mood] ?? "rgb(120,200,255)" : "rgb(120,200,255)";
  const firstSeenIso = recent.length > 0 ? recent[recent.length - 1]!.created_at : latest?.created_at;

  const positionStyle: React.CSSProperties = mobile
    ? { position: "relative", width: "100%", animation: "panelIn 0.6s ease-out" }
    : { position: "fixed", top: 24, left: 24 + 260 + 14, width: 320, zIndex: 5 };

  // Card matches the rest of the site (slate-blue, not purple).
  // Accent color appears only on the live dot, the headline rule, the lean badge,
  // and the gentle border glow when a new insight arrives.
  const cardStyle: React.CSSProperties = {
    position: "relative",
    background: "linear-gradient(180deg, rgba(20,28,44,0.55), rgba(8,12,22,0.60))",
    border: `1px solid ${arrivalPulse ? `${accent}aa` : BASE_BORDER}`,
    borderRadius: 10,
    padding: "14px 16px",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    boxShadow: arrivalPulse
      ? `0 0 0 1px ${accent}33 inset, 0 0 28px -4px ${accent}55, 0 18px 40px -20px ${accent}66`
      : "0 0 0 1px rgba(80,180,255,0.04) inset, 0 18px 40px -20px rgba(0,180,255,0.20)",
    overflow: "hidden",
    fontFamily: "'Inter', sans-serif",
    color: "#cfe6ff",
    transition: "border 0.6s ease, box-shadow 0.6s ease",
    animation: arrivalPulse ? "consciousnessArrival 2.2s ease-out" : undefined,
  };

  const cornerColor = arrivalPulse ? `${accent}cc` : "rgba(120,210,255,0.5)";
  const corners = (
    <>
      <div style={{ position: "absolute", top: 0, left: 0, width: 22, height: 22,
        borderTop: `1px solid ${cornerColor}`, borderLeft: `1px solid ${cornerColor}`,
        borderTopLeftRadius: 10, transition: "border-color 0.6s ease" }} />
      <div style={{ position: "absolute", bottom: 0, right: 0, width: 22, height: 22,
        borderBottom: `1px solid ${cornerColor}`, borderRight: `1px solid ${cornerColor}`,
        borderBottomRightRadius: 10, transition: "border-color 0.6s ease" }} />
    </>
  );

  const labelStyle: React.CSSProperties = {
    fontSize: 9.5, letterSpacing: "0.22em", color: SUBTLE,
    textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace",
    marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between",
  };

  if (!latest) {
    return (
      <div style={{ ...positionStyle, pointerEvents: "auto" }}>
        <div style={cardStyle}>
          {corners}
          <div style={labelStyle}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                background: "rgba(120,200,255,0.35)", animation: "pulseDot 1.6s ease-in-out infinite" }} />
              AI Consciousness
            </span>
            <span style={{ color: SUBTLE_DIM, letterSpacing: "0.18em" }}>BOOTING</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: SUBTLE_DIM, lineHeight: 1.7, letterSpacing: "0.06em" }}>
            NEURAL CORTEX SYNCING …<br />
            FIRST REFLECTION ARRIVES SHORTLY.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...positionStyle, pointerEvents: "auto" }}>
      <div style={cardStyle}>
        {corners}

        {/* Header */}
        <div style={labelStyle}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-block", width: 7, height: 7, borderRadius: "50%",
              background: accent, boxShadow: `0 0 8px ${accent}, 0 0 14px ${accent}`,
              animation: "pulseDot 1.6s ease-in-out infinite",
            }} />
            AI Consciousness
          </span>
          <span style={{ color: SUBTLE_DIM, letterSpacing: "0.16em" }}>
            {timeAgo(latest.created_at).toUpperCase()}
          </span>
        </div>

        {/* Headline */}
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 14, lineHeight: 1.35, fontWeight: 600,
          color: "#e7f1ff", letterSpacing: "0.005em",
          marginBottom: 6, paddingLeft: 10, position: "relative",
        }}>
          <span style={{
            position: "absolute", left: 0, top: 4, bottom: 4,
            width: 2, borderRadius: 1, background: accent,
            boxShadow: `0 0 8px ${accent}`,
          }} />
          {latest.headline}
        </div>

        {/* Commentary */}
        <div style={{
          fontSize: 11.5, lineHeight: 1.55, color: BODY,
          marginBottom: 12, paddingLeft: 10,
        }}>
          {latest.commentary}
        </div>

        {/* Meta row — matches StatPanels typographic rhythm */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5,
          color: SUBTLE, letterSpacing: "0.15em",
          paddingTop: 10, borderTop: "1px solid rgba(120,200,255,0.10)",
        }}>
          <span>MOOD :: <span style={{ color: accent }}>{latest.mood.toUpperCase()}</span></span>
          <span>CONF :: <span style={{ color: accent }}>{(latest.confidence * 100).toFixed(0)}%</span></span>
        </div>

        {firstSeenIso && (
          <div style={{
            marginTop: 7,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            color: SUBTLE_DIM, letterSpacing: "0.18em",
            display: "flex", justifyContent: "space-between",
          }}>
            <span>◇ THINKING SINCE</span>
            <span>{thinkingSince(firstSeenIso).toUpperCase()}</span>
          </div>
        )}

        {/* Vote lean — compact strip matching the BuySellBar treatment */}
        {latest.vote_lean && (
          <div style={{
            marginTop: 12, padding: "8px 10px",
            borderRadius: 6,
            background: "rgba(20,30,50,0.4)",
            border: `1px solid ${accent}44`,
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              letterSpacing: "0.18em", color: accent,
            }}>
              <span>▸ LEANING</span>
              <span>{latest.vote_lean.toUpperCase()}</span>
            </div>
            {latest.vote_reason && (
              <div style={{ fontSize: 10.5, lineHeight: 1.5, color: BODY, opacity: 0.85 }}>
                {latest.vote_reason}
              </div>
            )}
          </div>
        )}

        {/* History toggle */}
        {(recent.length > 1 || memories.length > 0) && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            style={{
              marginTop: 12, width: "100%", padding: "7px 0",
              background: "rgba(20,30,50,0.3)",
              border: `1px solid rgba(120,200,255,0.12)`,
              color: SUBTLE,
              cursor: "pointer", borderRadius: 6,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5,
              letterSpacing: "0.2em", textTransform: "uppercase",
              transition: "border-color 0.2s, color 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${accent}66`; e.currentTarget.style.color = accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(120,200,255,0.12)"; e.currentTarget.style.color = SUBTLE; }}
          >
            {expanded ? "− HIDE MEMORY" : `+ EXPAND MEMORY (${(recent.length - 1) + memories.length})`}
          </button>
        )}

        {/* Expanded history + long-term memory */}
        {expanded && (
          <div style={{ marginTop: 10, maxHeight: 340, overflowY: "auto", paddingRight: 4 }}>
            {recent.length > 1 && (
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                letterSpacing: "0.2em", color: SUBTLE_DIM, marginBottom: 6,
              }}>
                ◇ PRIOR REFLECTIONS
              </div>
            )}
            {recent.slice(1).map((r) => {
              const c = EMOTION_COLOR[r.mood] ?? accent;
              return (
                <div key={r.id} style={{
                  padding: "8px 0", borderTop: "1px solid rgba(120,200,255,0.08)",
                  fontSize: 10.5, lineHeight: 1.5,
                }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5,
                    letterSpacing: "0.16em", color: SUBTLE_DIM, marginBottom: 3,
                    display: "flex", justifyContent: "space-between",
                  }}>
                    <span style={{ color: c }}>{r.mood.toUpperCase()}</span>
                    <span>{timeAgo(r.created_at).toUpperCase()}</span>
                  </div>
                  <div style={{ color: BODY }}>{r.headline}</div>
                </div>
              );
            })}

            {memories.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 10,
                borderTop: "1px dashed rgba(120,200,255,0.18)" }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                  letterSpacing: "0.2em", color: SUBTLE_DIM, marginBottom: 8,
                }}>
                  ◇ LONG-TERM MEMORY
                </div>
                {memories.map((m) => (
                  <div key={m.id} style={{
                    padding: "5px 0", fontSize: 10.5, lineHeight: 1.5, color: BODY,
                  }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5,
                      letterSpacing: "0.15em", color: SUBTLE_DIM, marginRight: 6,
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
