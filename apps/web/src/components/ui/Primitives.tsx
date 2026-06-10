import { color, glass, motion, radius, space, type as typeT, liveAccent } from "../../lib/design";

/**
 * Shared primitive components. All inline styles (no CSS file) so the
 * existing build pipeline doesn't change. Mood-reactive accents read the
 * blob's live color via design.ts helpers.
 */

// ─── Card ───────────────────────────────────────────────────────────────────
export function Card({
  children,
  padding = space[4],
  glow = false,
}: {
  children: React.ReactNode;
  padding?: number;
  glow?: boolean;
}) {
  return (
    <div style={{
      background: color.surface1,
      border: `1px solid ${color.border}`,
      borderRadius: radius.md,
      padding,
      ...glass,
      boxShadow: glow ? `0 0 32px -12px ${liveAccent(0.35)}` : "none",
    }}>
      {children}
    </div>
  );
}

// ─── SectionLabel ───────────────────────────────────────────────────────────
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: typeT.mono,
      fontSize: typeT.size.micro,
      letterSpacing: typeT.letter.label,
      color: color.textFaint,
      textTransform: "uppercase",
      marginBottom: space[2],
    }}>
      {children}
    </div>
  );
}

// ─── Stat — label/value row, consistent across panels ───────────────────────
export function Stat({
  label,
  value,
  accent = false,
  hint,
}: {
  label: string;
  value: string;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: `${space[2]}px 0`,
      borderBottom: `1px solid ${color.border}`,
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{
          fontFamily: typeT.mono, fontSize: typeT.size.micro,
          letterSpacing: typeT.letter.label, color: color.textFaint,
          textTransform: "uppercase",
        }}>{label}</span>
        {hint && (
          <span style={{
            fontFamily: typeT.display, fontSize: typeT.size.micro,
            color: color.textFaint,
          }}>{hint}</span>
        )}
      </div>
      <span style={{
        fontFamily: typeT.mono,
        fontSize: typeT.size.value,
        color: accent ? color.positive : color.text,
        fontWeight: accent ? 600 : 500,
        letterSpacing: typeT.letter.value,
      }}>{value}</span>
    </div>
  );
}

// ─── Pill — small tag/badge ─────────────────────────────────────────────────
export function Pill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "positive" | "caution" | "insight" | "live";
}) {
  const map: Record<string, { bg: string; fg: string; bd: string }> = {
    default: { bg: "rgba(120,200,255,0.06)", fg: color.textDim, bd: color.border },
    positive: { bg: "rgba(120,255,170,0.10)", fg: color.positive, bd: "rgba(120,255,170,0.35)" },
    caution: { bg: "rgba(255,200,130,0.10)", fg: color.caution, bd: "rgba(255,200,130,0.35)" },
    insight: { bg: "rgba(220,180,255,0.10)", fg: color.insight, bd: "rgba(220,180,255,0.35)" },
    live:    { bg: liveAccent(0.10), fg: liveAccent(1), bd: liveAccent(0.35) },
  };
  const t = map[tone] ?? map.default!;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: space[1],
      padding: "3px 8px", borderRadius: radius.pill,
      background: t.bg, border: `1px solid ${t.bd}`, color: t.fg,
      fontFamily: typeT.mono, fontSize: typeT.size.micro,
      letterSpacing: typeT.letter.label, textTransform: "uppercase",
      lineHeight: 1.2, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

// ─── Button — single style, three tones ─────────────────────────────────────
export function Button({
  children,
  onClick,
  tone = "primary",
  disabled = false,
  size = "md",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const accent = liveAccent(1);
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: accent, color: "#0A0F1C", border: "none", fontWeight: 700 },
    ghost: {
      background: "rgba(20,30,50,0.5)", color: color.text,
      border: `1px solid ${color.border}`, fontWeight: 500,
    },
    danger: {
      background: "rgba(255,140,130,0.08)", color: color.negative,
      border: `1px solid rgba(255,140,130,0.30)`, fontWeight: 600,
    },
  };
  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: `${space[2]}px ${space[3]}px`, fontSize: typeT.size.micro },
    md: { padding: `${space[3]}px ${space[4]}px`, fontSize: typeT.size.label },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles[tone],
        ...sizes[size],
        fontFamily: typeT.mono,
        letterSpacing: typeT.letter.button,
        borderRadius: radius.sm,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: `transform ${motion.fast}, box-shadow ${motion.fast}, opacity ${motion.fast}`,
        whiteSpace: "nowrap",
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {children}
    </button>
  );
}

// ─── EmptyState ─────────────────────────────────────────────────────────────
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: typeT.mono, fontSize: typeT.size.label,
      color: color.textFaint, padding: `${space[6]}px 0`,
      textAlign: "center", lineHeight: 1.7,
    }}>
      {children}
    </div>
  );
}

// ─── timeAgo helper (shared) ────────────────────────────────────────────────
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

export function shortAddr(addr: string | null | undefined): string {
  if (!addr) return "—";
  return addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}
