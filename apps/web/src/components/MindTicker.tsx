import { useEffect, useState } from "react";
import { color, glass, motion, radius, space, type as typeT, liveAccent } from "../lib/design";
import { fetchMindStream, type MindThought } from "../lib/api";
import { useIsMobile } from "../lib/useIsMobile";

/**
 * Single-line scrolling thought ticker under the top bar. Reads the latest
 * thought every 30s and listens to live SSE 'pulse-insight' events for
 * instant updates. The line fades / re-enters when the thought changes so
 * the dashboard always looks "alive".
 */
export default function MindTicker() {
  const isMobile = useIsMobile();
  const [latest, setLatest] = useState<MindThought | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const rows = await fetchMindStream(1);
        if (dead) return;
        const next = rows[0] ?? null;
        if (next && next.id !== latest?.id) {
          // Fade out → swap → fade in
          setVisible(false);
          setTimeout(() => { if (!dead) { setLatest(next); setVisible(true); } }, 200);
        } else if (!latest && next) {
          setLatest(next);
        }
      } catch { /* swallow */ }
    };
    load();
    const t = setInterval(load, 30_000);
    const onWake = () => load();
    window.addEventListener("pulse-insight", onWake);
    return () => { dead = true; clearInterval(t); window.removeEventListener("pulse-insight", onWake); };
  }, [latest?.id]);

  if (!latest) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: isMobile ? 48 : 56, left: 0, right: 0, zIndex: 49,
        display: "flex", alignItems: "center", justifyContent: "center",
        height: isMobile ? 34 : 38,
        background: "linear-gradient(180deg, rgba(4,5,10,0.55), rgba(4,5,10,0))",
        ...glass,
        borderBottom: `1px solid ${color.border}`,
        pointerEvents: "none",
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: space[3],
        maxWidth: isMobile ? "92vw" : 720,
        padding: `0 ${space[4]}px`,
      }}>
        <div style={{
          fontFamily: typeT.mono, fontSize: typeT.size.micro,
          letterSpacing: typeT.letter.label, color: liveAccent(0.85),
          padding: "2px 7px", borderRadius: radius.pill,
          border: `1px solid ${liveAccent(0.4)}`,
          whiteSpace: "nowrap",
        }}>MIND</div>
        <div style={{
          fontFamily: typeT.display, fontStyle: "italic",
          fontSize: isMobile ? typeT.size.body - 1 : typeT.size.body,
          color: color.textDim,
          lineHeight: 1.4,
          opacity: visible ? 1 : 0,
          transition: `opacity ${motion.base}`,
          overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          “{latest.thought}”
        </div>
      </div>
    </div>
  );
}
