import { useState } from "react";
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
import ChatPanel from "./ChatPanel";
import MyPulsePanel from "./MyPulsePanel";
import SovereignPanel from "./SovereignPanel";
import TopBar from "./TopBar";
import MindTicker from "./MindTicker";
import Dock, { type DockKey } from "./Dock";
import { useIsMobile } from "../lib/useIsMobile";
import { useDashboard } from "../lib/useDashboard";
import { useLiveStream } from "../lib/useLiveStream";

type MobileSection = "stats" | "consciousness" | "voting" | "activity" | null;

export default function Dashboard() {
  const isMobile = useIsMobile();
  const [openSection, setOpenSection] = useState<MobileSection>("stats");
  const toggle = (s: Exclude<MobileSection, null>) =>
    setOpenSection((curr) => (curr === s ? null : s));

  // Single state for which dock panel is open — at most one at a time
  // so the blob is always visible behind/beside it.
  const [activeDock, setActiveDock] = useState<DockKey | null>(null);
  const onDockSelect = (k: DockKey) => setActiveDock((c) => (c === k ? null : k));
  const close = () => setActiveDock(null);

  const { tokenState } = useDashboard();
  const mintAddress = tokenState?.mint_address ?? null;

  // Real-time SSE heartbeat: trades pulse the blob, narrations hit the feed.
  useLiveStream();

  return (
    <div style={{
      position: "relative", minHeight: "100vh", background: "#04050A",
      color: "#cfe6ff", overflow: isMobile ? "visible" : "hidden",
    }}>
      <BackgroundCanvas />
      <div style={{ position: "fixed", inset: 0, zIndex: 1 }}>
        <App />
      </div>

      {/* New persistent chrome */}
      <TopBar />
      <MindTicker />

      {/* Existing panels — preserved beneath the new chrome */}
      {isMobile ? (
        <div style={{
          position: "relative", zIndex: 5,
          paddingTop: "62vh",
          paddingBottom: 96,
          paddingLeft: 14, paddingRight: 14,
          display: "flex", flexDirection: "column", gap: 10,
          pointerEvents: "auto",
        }}>
          <div style={{
            position: "fixed", left: 0, right: 0, bottom: 0,
            height: "55vh", zIndex: -1, pointerEvents: "none",
            background: "linear-gradient(180deg, rgba(4,5,10,0) 0%, rgba(4,5,10,0.55) 35%, rgba(4,5,10,0.92) 80%)",
          }} />
          <MobileCollapse title="Stats" subtitle="Market · Tier · Treasury" accent="rgba(150,220,255,0.55)" open={openSection === "stats"} onToggle={() => toggle("stats")}>
            <LeftPanels mobile onSwapClick={() => setActiveDock("swap")} />
          </MobileCollapse>
          <MobileCollapse title="Consciousness" subtitle="AI insight stream" accent="rgba(180,160,255,0.55)" open={openSection === "consciousness"} onToggle={() => toggle("consciousness")}>
            <ConsciousnessPanel mobile />
          </MobileCollapse>
          <MobileCollapse title="Voting" subtitle="Community decisions" accent="rgba(120,255,160,0.55)" open={openSection === "voting"} onToggle={() => toggle("voting")}>
            <VotingPanel mobile />
          </MobileCollapse>
          <MobileCollapse title="Live Activity" subtitle="Emotion · Feed · System" accent="rgba(255,180,120,0.55)" open={openSection === "activity"} onToggle={() => toggle("activity")}>
            <RightPanels mobile />
          </MobileCollapse>
        </div>
      ) : (
        <>
          <LeftPanels onSwapClick={() => setActiveDock("swap")} />
          <VotingPanel />
          <RightPanels />
          <ConsciousnessPanel />
        </>
      )}

      {/* The four primary actions all flow through the dock */}
      <Dock active={activeDock} onSelect={onDockSelect} />

      <ChatPanel      open={activeDock === "chat"}      onClose={close} />
      <SovereignPanel open={activeDock === "sovereign"} onClose={close} />
      <MyPulsePanel   open={activeDock === "mypulse"}   onClose={close} />
      <SwapModal      open={activeDock === "swap"}      onClose={close} mintAddress={mintAddress} accent={"rgb(80,200,255)"} />

      <CursorOverlay />
      <TierPromotionOverlay />

      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(0.88); }
        }
        @keyframes feedIn { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes panelIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
