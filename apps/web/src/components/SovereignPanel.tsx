import { useEffect, useState } from "react";
import {
  fetchSovereign,
  type SovereignSnapshot,
  type AutonomousAction,
  type MindThought,
  type ConstitutionClause,
} from "../lib/api";
import { color, motion, radius, space, type as typeT } from "../lib/design";
import SidePanel from "./ui/SidePanel";
import { EmptyState, Pill, SectionLabel, shortAddr, timeAgo } from "./ui/Primitives";

function actionTone(a: AutonomousAction): "positive" | "caution" | "insight" | "default" {
  if (a.status === "failed") return "caution";
  if (a.action_type === "buyback") return "caution";
  if (a.action_type === "tip_holder") return "positive";
  if (a.action_type === "open_bounty") return "insight";
  return "default";
}

function actionTitle(a: AutonomousAction): string {
  if (a.action_type === "buyback") return `Buy + Burn · ${a.amount_sol.toFixed(3)} SOL`;
  if (a.action_type === "tip_holder") return `Tip ${a.amount_sol.toFixed(3)} SOL → ${shortAddr(a.target_wallet)}`;
  if (a.action_type === "open_bounty") return `Opened Bounty · ${a.amount_sol.toFixed(3)} SOL`;
  return "Passed this cycle";
}

function ThoughtsTab({ thoughts }: { thoughts: MindThought[] }) {
  if (thoughts.length === 0) return <EmptyState>thinking…</EmptyState>;
  return (
    <div style={{ paddingTop: space[3], display: "flex", flexDirection: "column", gap: space[3] }}>
      {thoughts.map((t) => (
        <div key={t.id} style={{
          padding: `${space[3]}px ${space[4]}px`,
          background: color.surface2,
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
          animation: `panelIn ${motion.base}`,
        }}>
          <div style={{
            fontFamily: typeT.display, fontStyle: "italic",
            fontSize: typeT.size.body, color: color.text,
            lineHeight: 1.6,
          }}>{t.thought}</div>
          <div style={{
            marginTop: space[2], display: "flex", justifyContent: "space-between",
            fontFamily: typeT.mono, fontSize: typeT.size.micro,
            color: color.textFaint, letterSpacing: typeT.letter.label,
          }}>
            <span>{t.kind.toUpperCase()}</span>
            <span>{timeAgo(t.created_at)} ago</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionsTab({ actions }: { actions: AutonomousAction[] }) {
  if (actions.length === 0) {
    return <EmptyState>
      PULSE hasn't decided to act yet.<br />
      <span style={{ color: color.textFaint }}>Watching, learning.</span>
    </EmptyState>;
  }
  return (
    <div style={{ paddingTop: space[3], display: "flex", flexDirection: "column", gap: space[3] }}>
      {actions.map((a) => (
        <div key={a.id} style={{
          padding: `${space[3]}px ${space[4]}px`,
          background: color.surface2,
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: space[2] }}>
            <Pill tone={actionTone(a)}>{a.action_type === "pass" ? "PASS" : a.action_type.replace("_", " ")}</Pill>
            <span style={{
              fontFamily: typeT.mono, fontSize: typeT.size.micro,
              color: color.textFaint, letterSpacing: typeT.letter.label,
            }}>{timeAgo(a.decided_at)} ago{a.status === "failed" ? " · FAILED" : ""}</span>
          </div>
          <div style={{
            fontFamily: typeT.mono, fontSize: typeT.size.value,
            color: color.text, marginBottom: space[2],
            letterSpacing: typeT.letter.value,
          }}>{actionTitle(a)}</div>
          <div style={{
            fontFamily: typeT.display, fontStyle: "italic",
            fontSize: typeT.size.body, color: color.textDim, lineHeight: 1.6,
          }}>“{a.reasoning}”</div>
          {a.tx_signature && (
            <a
              href={`https://solscan.io/tx/${a.tx_signature}`}
              target="_blank" rel="noopener noreferrer"
              style={{
                display: "inline-block", marginTop: space[2],
                fontFamily: typeT.mono, fontSize: typeT.size.micro,
                color: color.textDim, textDecoration: "none",
                letterSpacing: typeT.letter.label,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = color.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = color.textDim; }}
            >SOLSCAN ↗</a>
          )}
        </div>
      ))}
    </div>
  );
}

function ConstitutionTab({ clauses }: { clauses: ConstitutionClause[] }) {
  return (
    <div style={{ paddingTop: space[3] }}>
      <div style={{
        padding: `${space[3]}px ${space[4]}px`, marginBottom: space[4],
        background: color.surface2, border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        fontFamily: typeT.display, fontSize: typeT.size.body,
        color: color.textDim, lineHeight: 1.6,
      }}>
        These are the rules PULSE must obey when acting on its own treasury. Holders amend them by vote.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
        {clauses.map((c) => (
          <div key={c.clause} style={{
            padding: `${space[3]}px ${space[4]}px`,
            background: color.surface2,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: space[3], marginBottom: space[1] }}>
              <span style={{
                fontFamily: typeT.mono, fontSize: typeT.size.label,
                color: color.text, letterSpacing: typeT.letter.value,
              }}>{c.clause}</span>
              <span style={{
                fontFamily: typeT.mono, fontSize: typeT.size.label,
                color: color.positive, letterSpacing: typeT.letter.value,
              }}>{JSON.stringify(c.value)}</span>
            </div>
            <div style={{
              fontFamily: typeT.display, fontSize: typeT.size.body - 0.5,
              color: color.textDim, lineHeight: 1.55,
            }}>{c.description}</div>
            <div style={{
              marginTop: space[1],
              fontFamily: typeT.mono, fontSize: typeT.size.micro,
              color: color.textFaint, letterSpacing: typeT.letter.label,
            }}>v{c.version}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SovereignPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<SovereignSnapshot | null>(null);
  const [tab, setTab] = useState<"mind" | "actions" | "rules">("mind");

  useEffect(() => {
    if (!open) return;
    let dead = false;
    const load = () => fetchSovereign().then((d) => { if (!dead) setData(d); }).catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    const wake = () => load();
    window.addEventListener("pulse-insight", wake);
    window.addEventListener("pulse-activity", wake);
    return () => { dead = true; clearInterval(t); window.removeEventListener("pulse-insight", wake); window.removeEventListener("pulse-activity", wake); };
  }, [open]);

  const tabs: { key: typeof tab; label: string }[] = [
    { key: "mind", label: "MIND STREAM" },
    { key: "actions", label: "ACTIONS" },
    { key: "rules", label: "CONSTITUTION" },
  ];

  return (
    <SidePanel open={open} onClose={onClose} title="◆  THE SOVEREIGN" width={500}>
      {/* Tabs */}
      <div style={{
        display: "flex", gap: space[1], padding: `${space[3]}px 0`,
        borderBottom: `1px solid ${color.border}`,
      }}>
        {tabs.map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: "none", border: "none",
                padding: `${space[2]}px ${space[3]}px`,
                fontFamily: typeT.mono, fontSize: typeT.size.micro,
                letterSpacing: typeT.letter.label,
                color: isActive ? color.text : color.textFaint,
                cursor: "pointer", borderRadius: radius.sm,
                fontWeight: isActive ? 600 : 400,
                borderBottom: isActive ? `2px solid ${color.text}` : "2px solid transparent",
                transition: `color ${motion.fast}, border-color ${motion.fast}`,
              }}
            >{t.label}</button>
          );
        })}
      </div>

      {!data ? <EmptyState>listening…</EmptyState>
        : tab === "mind"    ? <ThoughtsTab thoughts={data.thoughts} />
        : tab === "actions" ? <ActionsTab  actions={data.actions} />
                            : <ConstitutionTab clauses={data.constitution} />}

      {/* Footer */}
      <div style={{
        marginTop: space[4], paddingTop: space[3],
        borderTop: `1px solid ${color.border}`,
        fontFamily: typeT.mono, fontSize: typeT.size.micro,
        color: color.textFaint, lineHeight: 1.6, letterSpacing: typeT.letter.value,
      }}>
        PULSE acts on its own treasury within these rules. Every action is on-chain. Every reasoning is public. Holders amend the rules by vote.
      </div>
    </SidePanel>
  );
}
