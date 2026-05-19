import App from "../App";
import BackgroundCanvas from "./BackgroundCanvas";
import CursorOverlay from "./CursorOverlay";
import { LeftPanels } from "./StatPanels";
import RightPanels from "./ActivityFeed";
import VotingPanel from "./VotingPanel";
import ConsciousnessPanel from "./ConsciousnessPanel";
import { useIsMobile } from "../lib/useIsMobile";

export default function Dashboard() {
  const isMobile = useIsMobile();

  return (
    <div style={{
      position: "relative", minHeight: "100vh", background: "#04050A",
      color: "#cfe6ff", overflow: isMobile ? "visible" : "hidden",
    }}>
      {/* Fixed cinematic backdrop + blob */}
      <BackgroundCanvas />
      {/* Blob canvas needs pointer events so the user can drag/pull the character.
          Panels above sit at higher z-index and have their own pointerEvents:auto. */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1 }}>
        <App />
      </div>

      {/* Top center title strip */}
      <div style={{
        position: "fixed", top: isMobile ? 12 : 22, left: "50%",
        transform: "translateX(-50%)", zIndex: 5,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: isMobile ? 8.5 : 10,
        letterSpacing: isMobile ? "0.35em" : "0.5em",
        color: "rgba(120,180,230,0.45)",
        pointerEvents: "none", whiteSpace: "nowrap",
      }}>
        PULSE
      </div>

      {/* Panels */}
      {isMobile ? (
        <div style={{
          position: "relative", zIndex: 5,
          paddingTop: "62vh",
          paddingBottom: 32,
          paddingLeft: 14,
          paddingRight: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          pointerEvents: "auto",
        }}>
          <div style={{
            position: "fixed", left: 0, right: 0, bottom: 0,
            height: "55vh", zIndex: -1, pointerEvents: "none",
            background: "linear-gradient(180deg, rgba(4,5,10,0) 0%, rgba(4,5,10,0.55) 35%, rgba(4,5,10,0.92) 80%)",
          }} />
          <LeftPanels mobile />
          <ConsciousnessPanel mobile />
          <VotingPanel mobile />
          <RightPanels mobile />
        </div>
      ) : (
        <>
          <LeftPanels />
          {/* ConsciousnessPanel is rendered inside RightPanels on desktop so the
              blob stays unobstructed. */}
          <VotingPanel />
          <RightPanels />
        </>
      )}

      <CursorOverlay />

      {/* Bottom center diagnostic bar — desktop only (mobile uses normal flow) */}
      {!isMobile && (
        <div style={{
          position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)",
          zIndex: 5, fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, letterSpacing: "0.3em", color: "rgba(120,180,230,0.45)",
          display: "flex", alignItems: "center", gap: 14, pointerEvents: "none",
          whiteSpace: "nowrap",
        }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%",
            background: "#7aff9f", boxShadow: "0 0 8px #7aff9f",
            animation: "pulseDot 1.6s ease-in-out infinite",
          }} />
          <span>CHAMBER A-7 :: BIOSEAL ENGAGED</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>UPLINK 442.71 MHz</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>OBSERVER MODE</span>
        </div>
      )}

      {/* Global keyframes */}
      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes feedIn {
          from { opacity: 0; transform: translateX(8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes panelIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
