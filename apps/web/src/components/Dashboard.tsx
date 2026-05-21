import { useEffect, useState } from "react";
import App from "../App";
import BackgroundCanvas from "./BackgroundCanvas";
import CursorOverlay from "./CursorOverlay";
import { LeftPanels } from "./StatPanels";
import RightPanels from "./ActivityFeed";
import VotingPanel from "./VotingPanel";
import ConsciousnessPanel from "./ConsciousnessPanel";
import SwapModal from "./SwapModal";
import MobileCollapse from "./MobileCollapse";
import TierPromotionOverlay from "./TierPromotionOverlay";
import { useIsMobile } from "../lib/useIsMobile";
import { useDashboard } from "../lib/useDashboard";
import { blobLive } from "../lib/blobLive";

type MobileSection = "stats" | "consciousness" | "voting" | "activity" | null;

export default function Dashboard() {
  const isMobile = useIsMobile();
  const [openSection, setOpenSection] = useState<MobileSection>("stats");
  const toggle = (s: Exclude<MobileSection, null>) =>
    setOpenSection((curr) => (curr === s ? null : s));

  // Swap modal is owned at the dashboard level so the SWAP CTA in the
  // left-column action row and the modal stay in sync, and the modal mounts
  // above all panels and the blob.
  const [swapOpen, setSwapOpen] = useState(false);
  const { tokenState } = useDashboard();
  const mintAddress = tokenState?.mint_address ?? null;
  const [swapAccent, setSwapAccent] = useState(
    () => `rgb(${blobLive.bodyR | 0},${blobLive.bodyG | 0},${blobLive.bodyB | 0})`,
  );
  useEffect(() => {
    const id = setInterval(() => {
      setSwapAccent(`rgb(${blobLive.bodyR | 0},${blobLive.bodyG | 0},${blobLive.bodyB | 0})`);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const openSwap = () => setSwapOpen(true);

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
          gap: 10,
          pointerEvents: "auto",
        }}>
          <div style={{
            position: "fixed", left: 0, right: 0, bottom: 0,
            height: "55vh", zIndex: -1, pointerEvents: "none",
            background: "linear-gradient(180deg, rgba(4,5,10,0) 0%, rgba(4,5,10,0.55) 35%, rgba(4,5,10,0.92) 80%)",
          }} />
          <MobileCollapse
            title="Stats"
            subtitle="Market · Tier · Treasury"
            accent="rgba(150,220,255,0.55)"
            open={openSection === "stats"}
            onToggle={() => toggle("stats")}
          >
            <LeftPanels mobile onSwapClick={openSwap} />
          </MobileCollapse>

          <MobileCollapse
            title="Consciousness"
            subtitle="AI insight stream"
            accent="rgba(180,160,255,0.55)"
            open={openSection === "consciousness"}
            onToggle={() => toggle("consciousness")}
          >
            <ConsciousnessPanel mobile />
          </MobileCollapse>

          <MobileCollapse
            title="Voting"
            subtitle="Community decisions"
            accent="rgba(120,255,160,0.55)"
            open={openSection === "voting"}
            onToggle={() => toggle("voting")}
          >
            <VotingPanel mobile />
          </MobileCollapse>

          <MobileCollapse
            title="Live Activity"
            subtitle="Emotion · Feed · System"
            accent="rgba(255,180,120,0.55)"
            open={openSection === "activity"}
            onToggle={() => toggle("activity")}
          >
            <RightPanels mobile />
          </MobileCollapse>

        </div>
      ) : (
        <>
          <LeftPanels onSwapClick={openSwap} />
          <VotingPanel />
          <RightPanels />
          <ConsciousnessPanel />
        </>
      )}

      <SwapModal
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        mintAddress={mintAddress}
        accent={swapAccent}
      />

      <CursorOverlay />
      <TierPromotionOverlay />

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
