import { useEffect, useState } from "react";
import { color, glass, motion, radius, space, type as typeT, liveAccent } from "../../lib/design";
import { useIsMobile } from "../../lib/useIsMobile";

/**
 * SidePanel — slides in from the right (or bottom on mobile). Unlike a
 * modal it does NOT block the blob — the dashboard stays interactive and
 * the blob remains the center of attention while you read/talk to it.
 *
 * Two key behaviours:
 *   - Desktop: fixed-width sheet pinned to the right edge, no full-screen
 *     backdrop. Click-outside still closes (via overlay click region
 *     covering only the un-paneled area).
 *   - Mobile: bottom drawer with a dark backdrop.
 */
export default function SidePanel({
  open,
  onClose,
  title,
  width = 460,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(open);

  // Keep the DOM mounted briefly while exit-animation runs.
  useEffect(() => {
    if (open) setMounted(true);
    else {
      const t = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted && !open) return null;

  const accent = liveAccent(0.35);

  if (isMobile) {
    return (
      <>
        {/* Mobile backdrop */}
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 59,
            background: open ? "rgba(2,4,10,0.65)" : "rgba(2,4,10,0)",
            transition: `background ${motion.base}`,
            backdropFilter: open ? "blur(6px)" : "blur(0px)",
            WebkitBackdropFilter: open ? "blur(6px)" : "blur(0px)",
            pointerEvents: open ? "auto" : "none",
          }}
        />
        {/* Bottom sheet */}
        <div
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60,
            height: "85vh",
            background: color.surface1,
            ...glass,
            borderTop: `1px solid ${color.borderStrong}`,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            boxShadow: `0 -24px 60px -24px ${accent}`,
            transform: open ? "translateY(0)" : "translateY(100%)",
            transition: `transform ${motion.slow}`,
            display: "flex", flexDirection: "column",
          }}
        >
          <SheetHeader title={title} onClose={onClose} />
          <div style={{ flex: 1, overflowY: "auto", padding: `0 ${space[5]}px ${space[5]}px` }}>{children}</div>
        </div>
      </>
    );
  }

  // Desktop side sheet
  return (
    <>
      {/* Click-catcher over the un-paneled left side. No visible dim. */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0, bottom: 0, left: 0, right: width,
          zIndex: 58,
          pointerEvents: open ? "auto" : "none",
        }}
      />
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 60,
          width,
          background: color.surface1,
          ...glass,
          borderLeft: `1px solid ${color.borderStrong}`,
          boxShadow: `-24px 0 60px -24px ${accent}`,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: `transform ${motion.slow}, box-shadow ${motion.base}`,
          display: "flex", flexDirection: "column",
        }}
      >
        <SheetHeader title={title} onClose={onClose} />
        <div style={{ flex: 1, overflowY: "auto", padding: `0 ${space[5]}px ${space[5]}px` }}>{children}</div>
      </div>
    </>
  );
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: `${space[4]}px ${space[5]}px`,
      borderBottom: `1px solid ${color.border}`,
    }}>
      <div style={{
        fontFamily: typeT.mono, fontSize: typeT.size.label,
        letterSpacing: typeT.letter.label, color: color.text,
      }}>{title}</div>
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          background: "none", border: "none", padding: space[2], margin: -space[2],
          color: color.textDim, fontFamily: typeT.mono, fontSize: 14,
          cursor: "pointer", lineHeight: 1, borderRadius: radius.sm,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = color.text; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = color.textDim; }}
      >✕</button>
    </div>
  );
}
