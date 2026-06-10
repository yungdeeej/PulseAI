import { useEffect, useRef, useState } from "react";

interface MobileCollapseProps {
  title: string;
  subtitle?: string;
  accent?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export default function MobileCollapse({
  title,
  subtitle,
  accent = "rgba(120,210,255,0.55)",
  open,
  onToggle,
  children,
}: MobileCollapseProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState<number>(0);

  useEffect(() => {
    if (!open) {
      setMaxH(0);
      return;
    }
    const el = bodyRef.current;
    if (!el) return;
    const update = () => setMaxH(el.scrollHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  return (
    <div style={{
      position: "relative",
      background: "rgba(14, 20, 36, 0.72)",
      border: `1px solid ${open ? accent : "rgba(120,200,255,0.14)"}`,
      borderRadius: 12,
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      boxShadow: open
        ? `0 0 0 1px rgba(80,180,255,0.06) inset, 0 18px 40px -20px rgba(0,180,255,0.30)`
        : "0 0 0 1px rgba(80,180,255,0.04) inset",
      overflow: "hidden",
      transition: "border-color 0.3s, box-shadow 0.3s",
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "13px 16px",
          background: "transparent",
          border: "none",
          color: "#cfe6ff",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "'JetBrains Mono', monospace",
        }}
        aria-expanded={open}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%",
            background: accent, boxShadow: `0 0 8px ${accent}`, flexShrink: 0,
          }} />
          <span style={{
            fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase",
            color: open ? "#cfe6ff" : "rgba(200,225,245,0.78)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{title}</span>
          {subtitle && (
            <span style={{
              fontSize: 9.5, letterSpacing: "0.18em",
              color: "rgba(140,190,230,0.45)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              · {subtitle}
            </span>
          )}
        </div>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.3s ease",
            flexShrink: 0,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div
        style={{
          maxHeight: maxH,
          overflow: "hidden",
          transition: "max-height 0.35s ease",
        }}
      >
        <div
          ref={bodyRef}
          style={{
            padding: "2px 12px 14px 12px",
            opacity: open ? 1 : 0,
            transition: "opacity 0.25s ease",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
