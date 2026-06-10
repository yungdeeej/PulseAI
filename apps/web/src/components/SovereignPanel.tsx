import { useEffect, useState } from "react";
import { fetchSovereign, type SovereignSnapshot, type AutonomousAction, type MindThought, type ConstitutionClause } from "../lib/api";
import { blobLive } from "../lib/blobLive";

const mono = "'JetBrains Mono', monospace";

function short(addr: string | null): string {
  if (!addr) return "—";
  return addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function actionLabel(a: AutonomousAction): string {
  if (a.action_type === "buyback") return `BUY+BURN ${a.amount_sol.toFixed(3)} SOL`;
  if (a.action_type === "tip_holder") return `TIP ${a.amount_sol.toFixed(3)} → ${short(a.target_wallet)}`;
  if (a.action_type === "open_bounty") return `OPENED BOUNTY ${a.amount_sol.toFixed(3)} SOL`;
  return "PASSED";
}

function actionColor(a: AutonomousAction): string {
  if (a.status === "failed") return "rgba(255,140,120,0.85)";
  if (a.action_type === "pass") return "rgba(180,180,210,0.55)";
  if (a.action_type === "buyback") return "rgb(255,180,90)";
  if (a.action_type === "tip_holder") return "rgb(120,255,170)";
  return "rgb(190,160,255)";
}

function ConstitutionList({ clauses }: { clauses: ConstitutionClause[] }) {
  return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.22em", color: "rgba(150,200,240,0.5)", marginBottom: 8 }}>
        THE CONSTITUTION
      </div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: "rgba(220,228,250,0.7)", marginBottom: 12, lineHeight: 1.6 }}>
        These are the rules PULSE must obey when acting on its own treasury. Holders amend them by vote.
      </div>
      {clauses.map((c) => (
        <div key={c.clause} style={{ padding: "8px 0", borderBottom: "1px solid rgba(120,200,255,0.07)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
            <span style={{ fontFamily: mono, fontSize: 10, color: "#cfe6ff", letterSpacing: "0.06em" }}>{c.clause}</span>
            <span style={{ fontFamily: mono, fontSize: 9, color: "rgb(120,255,170)" }}>{JSON.stringify(c.value)}</span>
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, color: "rgba(180,200,230,0.55)", lineHeight: 1.5 }}>
            {c.description}
          </div>
          <div style={{ fontFamily: mono, fontSize: 8, color: "rgba(150,200,240,0.35)", marginTop: 2, letterSpacing: "0.15em" }}>
            v{c.version}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionsList({ actions }: { actions: AutonomousAction[] }) {
  if (actions.length === 0) {
    return (
      <div style={{ fontFamily: mono, fontSize: 10, color: "rgba(150,200,240,0.4)", padding: "20px 0", textAlign: "center" }}>
        PULSE hasn't decided to act yet. Watching, learning.
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.22em", color: "rgba(150,200,240,0.5)", marginBottom: 8 }}>
        AUTONOMOUS DECISIONS
      </div>
      {actions.map((a) => (
        <div key={a.id} style={{ padding: "10px 0", borderBottom: "1px solid rgba(120,200,255,0.07)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ fontFamily: mono, fontSize: 10, color: actionColor(a), letterSpacing: "0.1em", fontWeight: 700 }}>
              {actionLabel(a)}
            </span>
            <span style={{ fontFamily: mono, fontSize: 8.5, color: "rgba(150,200,240,0.45)", letterSpacing: "0.12em" }}>
              {timeAgo(a.decided_at)} {a.status === "failed" ? "· FAILED" : ""}
            </span>
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontStyle: "italic", fontSize: 11, color: "rgba(220,228,250,0.78)", lineHeight: 1.55 }}>
            “{a.reasoning}”
          </div>
          {a.tx_signature && (
            <a
              href={`https://solscan.io/tx/${a.tx_signature}`}
              target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: mono, fontSize: 8.5, color: "rgba(120,200,255,0.7)", textDecoration: "none", letterSpacing: "0.12em" }}
            >SOLSCAN ↗</a>
          )}
        </div>
      ))}
    </div>
  );
}

function ThoughtsList({ thoughts }: { thoughts: MindThought[] }) {
  if (thoughts.length === 0) {
    return (
      <div style={{ fontFamily: mono, fontSize: 10, color: "rgba(150,200,240,0.4)", padding: "20px 0", textAlign: "center" }}>
        thinking…
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.22em", color: "rgba(150,200,240,0.5)", marginBottom: 10 }}>
        THE MIND STREAM
      </div>
      {thoughts.map((t) => (
        <div key={t.id} style={{ padding: "8px 0 10px", borderBottom: "1px solid rgba(120,200,255,0.06)" }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontStyle: "italic", fontSize: 11.5, color: "rgba(230,228,250,0.82)", lineHeight: 1.55 }}>
            {t.thought}
          </div>
          <div style={{ fontFamily: mono, fontSize: 8, color: "rgba(150,200,240,0.4)", marginTop: 3, letterSpacing: "0.15em" }}>
            {t.kind.toUpperCase()} · {timeAgo(t.created_at)}
          </div>
        </div>
      ))}
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
    // React to live SSE events without waiting for the poll
    const wake = () => load();
    window.addEventListener("pulse-insight", wake);
    window.addEventListener("pulse-activity", wake);
    return () => { dead = true; clearInterval(t); window.removeEventListener("pulse-insight", wake); window.removeEventListener("pulse-activity", wake); };
  }, [open]);

  if (!open) return null;
  const accent = `rgb(${blobLive.bodyR | 0},${blobLive.bodyG | 0},${blobLive.bodyB | 0})`;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(2,4,10,0.72)", backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)", pointerEvents: "auto",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 94vw)", maxHeight: "88vh",
          display: "flex", flexDirection: "column",
          background: "linear-gradient(180deg, rgba(14,20,36,0.96), rgba(6,9,18,0.98))",
          border: "1px solid rgba(120,200,255,0.22)", borderRadius: 16,
          boxShadow: `0 0 60px -18px ${accent}`,
          padding: "16px 20px 20px", animation: "panelIn 0.25s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.3em", color: "#cfe6ff" }}>◆ THE SOVEREIGN</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(150,200,240,0.7)", fontFamily: mono, fontSize: 14, cursor: "pointer" }} aria-label="Close">✕</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {([
            ["mind", "MIND STREAM"],
            ["actions", "ACTIONS"],
            ["rules", "CONSTITUTION"],
          ] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              fontFamily: mono, fontSize: 9, letterSpacing: "0.18em", cursor: "pointer",
              padding: "7px 14px", borderRadius: 7,
              color: tab === k ? "#0a0f1c" : "rgba(150,200,240,0.7)",
              background: tab === k ? accent : "rgba(20,30,50,0.6)",
              border: tab === k ? "none" : "1px solid rgba(120,200,255,0.15)",
              fontWeight: tab === k ? 700 : 400,
            }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
          {!data ? (
            <div style={{ fontFamily: mono, fontSize: 10, color: "rgba(150,200,240,0.5)", padding: "20px 0", textAlign: "center" }}>
              listening…
            </div>
          ) : tab === "mind" ? (
            <ThoughtsList thoughts={data.thoughts} />
          ) : tab === "actions" ? (
            <ActionsList actions={data.actions} />
          ) : (
            <ConstitutionList clauses={data.constitution} />
          )}
        </div>

        <div style={{
          marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(120,200,255,0.08)",
          fontFamily: mono, fontSize: 8.5, color: "rgba(150,200,240,0.5)", lineHeight: 1.55, letterSpacing: "0.05em",
        }}>
          PULSE acts on its own treasury within these rules. Every action is on-chain. Every reasoning is public. Holders amend the rules by vote.
        </div>
      </div>
    </div>
  );
}
