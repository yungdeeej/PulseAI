import { color, glass, motion, radius, space, type as typeT, liveAccent } from "../lib/design";
import { useIsMobile } from "../lib/useIsMobile";

export type DockKey = "chat" | "sovereign" | "mypulse" | "swap";

const ITEMS: { key: DockKey; symbol: string; label: string }[] = [
  { key: "chat",      symbol: "◉", label: "TALK" },
  { key: "sovereign", symbol: "◆", label: "SOVEREIGN" },
  { key: "mypulse",   symbol: "◇", label: "MY PULSE" },
  { key: "swap",      symbol: "⊞", label: "BUY" },
];

/**
 * Persistent bottom dock — single primary action surface. Active button
 * (the panel currently open) gets the accent fill so the user always
 * knows where they are.
 */
export default function Dock({
  active,
  onSelect,
}: {
  active: DockKey | null;
  onSelect: (key: DockKey) => void;
}) {
  const isMobile = useIsMobile();
  return (
    <div
      style={{
        position: "fixed",
        bottom: isMobile ? space[3] : space[5],
        left: "50%", transform: "translateX(-50%)",
        zIndex: 55, pointerEvents: "auto",
        display: "flex", gap: space[1],
        padding: space[1],
        background: color.surface1,
        border: `1px solid ${color.borderStrong}`,
        borderRadius: radius.pill,
        ...glass,
        boxShadow: `0 12px 40px -16px ${liveAccent(0.55)}`,
      }}
    >
      {ITEMS.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            style={{
              display: "flex", alignItems: "center", gap: space[2],
              padding: isMobile ? `${space[2]}px ${space[3]}px` : `${space[3]}px ${space[4]}px`,
              borderRadius: radius.pill, border: "none",
              background: isActive ? liveAccent(1) : "transparent",
              color: isActive ? "#0A0F1C" : color.textDim,
              fontFamily: typeT.mono,
              fontSize: isMobile ? typeT.size.micro : typeT.size.label,
              letterSpacing: typeT.letter.button,
              cursor: "pointer", fontWeight: isActive ? 700 : 500,
              transition: `background ${motion.fast}, color ${motion.fast}`,
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = color.text;
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = color.textDim;
            }}
          >
            <span style={{ fontSize: isMobile ? 11 : 13 }}>{item.symbol}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
