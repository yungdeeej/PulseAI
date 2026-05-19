import { useEffect, useState } from "react";
import { useVoting } from "../lib/useVoting";
import { blobLive } from "../lib/blobLive";

const OPTION_LABELS: Record<string, string> = {
  "Buy + Burn":         "BUY + BURN",
  "Hold & Compound":    "HOLD & COMPOUND",
  "Reinforce MM":       "REINFORCE MM",
  "Hold":               "HOLD",
  "Holder Airdrop":     "HOLDER AIRDROP",
  "Treasury Trade":     "TREASURY TRADE",
  "Pulse Wars":         "PULSE WARS",
  "Permanent Strategy": "PERMANENT STRATEGY",
};

const OPTION_DESC: Record<string, string> = {
  "Buy + Burn":         "Swap decision SOL for $PULSE via Jupiter and burn",
  "Hold & Compound":    "Retain treasury; compound toward next tier",
  "Reinforce MM":       "Move SOL from Decision → Defense vault",
  "Hold":               "Hold current position, await conditions",
  "Holder Airdrop":     "Distribute SOL proportionally to holders",
  "Treasury Trade":     "Swap SOL for admin-configured target mint",
  "Pulse Wars":         "Buy a rival token and burn it",
  "Permanent Strategy": "Lock in an enduring protocol strategy",
};

function formatCountdown(closesAt: string): string {
  const ms = new Date(closesAt).getTime() - Date.now();
  if (ms <= 0) return "CLOSING";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function TallyBar({
  option, weight, totalWeight, count, selected, myVote, accent,
}: {
  option: string; weight: number; totalWeight: number; count: number;
  selected: boolean; myVote: string | null; accent: string;
}) {
  const pct = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0;
  const isMyVote = myVote === option;
  const barColor = isMyVote ? "#7aff9f" : selected ? accent : "rgba(120,200,255,0.35)";

  return (
    <div style={{
      padding: "8px 12px", borderRadius: 8,
      background: selected
        ? `rgba(${isMyVote ? "120,255,160" : "80,200,255"},0.06)`
        : "rgba(20,30,50,0.4)",
      border: `1px solid ${selected
        ? (isMyVote ? "rgba(120,255,160,0.35)" : `${accent}55`)
        : "rgba(120,200,255,0.10)"}`,
      transition: "all 0.3s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5,
          letterSpacing: "0.18em",
          color: selected ? (isMyVote ? "#7aff9f" : accent) : "rgba(150,200,240,0.7)",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          {isMyVote && <span style={{ color: "#7aff9f" }}>◆</span>}
          {OPTION_LABELS[option] ?? option}
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
          color: "rgba(140,190,230,0.5)", display: "flex", gap: 8,
        }}>
          <span style={{ color: barColor }}>{pct}%</span>
          <span>{count} vote{count !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: "rgba(60,120,180,0.14)", overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 2,
          background: `linear-gradient(90deg, transparent, ${barColor})`,
          boxShadow: `0 0 8px ${barColor}`,
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

const infoRowStyle: React.CSSProperties = {
  width: "100%", padding: "10px 16px", textAlign: "center",
  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em",
  color: "rgba(140,190,230,0.5)",
  border: "1px solid rgba(120,200,255,0.10)", borderRadius: 8,
  background: "rgba(20,30,50,0.3)",
};

function ActionBtn({
  label, onClick, disabled = false, accent,
}: { label: string; onClick?: () => void; disabled?: boolean; accent: string }) {
  const rgb = accent.replace("rgb(", "").replace(")", "");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", padding: "10px 16px",
        background: disabled
          ? "rgba(20,30,50,0.4)"
          : `linear-gradient(180deg, rgba(${rgb},.14), rgba(${rgb},.06))`,
        border: `1px solid ${disabled ? "rgba(120,200,255,0.10)" : `${accent}55`}`,
        borderRadius: 8,
        color: disabled ? "rgba(140,190,230,0.3)" : accent,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.18em",
        textTransform: "uppercase", cursor: disabled ? "default" : "pointer",
        transition: "all 0.2s",
      }}
    >
      {label}
    </button>
  );
}

export default function VotingPanel({ mobile = false }: { mobile?: boolean }) {
  const {
    vote, tally, loading,
    walletState, walletAddress, conviction,
    myVote, submitState, submitError,
    connectWallet, disconnectWallet, castVote,
  } = useVoting();

  const [selected, setSelected] = useState<string | null>(null);
  const [countdown, setCountdown] = useState("–");

  useEffect(() => {
    if (!vote) return;
    setCountdown(formatCountdown(vote.closes_at));
    const t = setInterval(() => setCountdown(formatCountdown(vote.closes_at)), 1000);
    return () => clearInterval(t);
  }, [vote]);

  const accent = `rgb(${blobLive.bodyR | 0},${blobLive.bodyG | 0},${blobLive.bodyB | 0})`;

  const panelStyle: React.CSSProperties = mobile
    ? { width: "100%", animation: "panelIn 0.6s ease-out" }
    : {
        position: "fixed",
        bottom: 60, left: "50%", transform: "translateX(-50%)",
        width: 400, zIndex: 5,
        animation: "panelIn 0.5s ease-out",
      };

  const cardStyle: React.CSSProperties = {
    position: "relative",
    background: "linear-gradient(180deg, rgba(20,28,44,0.72), rgba(8,12,22,0.80))",
    border: "1px solid rgba(120,200,255,0.16)",
    borderRadius: 12,
    backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 0 0 1px rgba(80,180,255,0.04) inset, 0 24px 60px -20px rgba(0,120,255,0.18)",
    overflow: "hidden", padding: "16px 18px",
    pointerEvents: "auto",
    fontFamily: "'Inter', sans-serif", color: "#cfe6ff",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 9.5, letterSpacing: "0.22em", color: "rgba(150,200,240,0.55)",
    textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace",
  };

  // ── No active vote ──────────────────────────────────────────────────────────
  if (!loading && !vote) {
    return (
      <div style={panelStyle}>
        <div style={{ ...cardStyle, padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={labelStyle}>Decision Protocol</div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              letterSpacing: "0.16em", color: "rgba(140,190,230,0.35)",
              border: "1px solid rgba(120,200,255,0.12)", borderRadius: 4, padding: "2px 8px",
            }}>STANDBY</div>
          </div>
          <div style={{
            marginTop: 10, fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10.5, color: "rgba(140,190,230,0.38)", letterSpacing: "0.12em",
          }}>
            AWAITING DECISION THRESHOLD // TIER 1 REQUIRED
          </div>
        </div>
      </div>
    );
  }

  if (loading || !vote) return null;

  const totalWeight = Object.values(tally).reduce((s, t) => s + Number(t.total_weight ?? 0), 0);
  const totalVotes  = Object.values(tally).reduce((s, t) => s + Number(t.count ?? 0), 0);

  const canVote    = walletState === "connected" && !myVote && conviction !== null && conviction > 0;
  const alreadyVoted = !!myVote;
  const submitting   = submitState === "signing" || submitState === "submitting";
  const optionToShow = selected ?? myVote ?? null;

  return (
    <div style={panelStyle}>
      <div style={cardStyle}>
        {/* Corner accents */}
        <div style={{ position: "absolute", top: 0, left: 0, width: 20, height: 20,
          borderTop: `1px solid ${accent}99`, borderLeft: `1px solid ${accent}99`, borderTopLeftRadius: 12 }} />
        <div style={{ position: "absolute", bottom: 0, right: 0, width: 20, height: 20,
          borderBottom: `1px solid ${accent}99`, borderRight: `1px solid ${accent}99`, borderBottomRightRadius: 12 }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={labelStyle}>Decision Protocol · Active</div>
            <div style={{ marginTop: 5, fontSize: 13, fontWeight: 600,
              fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.02em" }}>
              TREASURY DIRECTIVE
              <span style={{ color: accent, marginLeft: 8, fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, fontWeight: 400 }}>
                {Number(vote.decision_pool_sol).toFixed(3)} SOL
              </span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              color: accent, letterSpacing: "0.12em" }}>{countdown}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5,
              color: "rgba(140,190,230,0.4)", marginTop: 2, letterSpacing: "0.1em" }}>
              {totalVotes} VOTE{totalVotes !== 1 ? "S" : ""}
            </div>
          </div>
        </div>

        {/* Options / tally bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {vote.options.map((opt) => {
            const row = tally[opt] ?? { total_weight: 0, count: 0 };
            return (
              <div
                key={opt}
                onClick={() => canVote && setSelected(opt)}
                style={{ cursor: canVote ? "pointer" : "default" }}
                title={OPTION_DESC[opt]}
              >
                <TallyBar
                  option={opt}
                  weight={Number(row.total_weight ?? 0)}
                  totalWeight={totalWeight}
                  count={Number(row.count ?? 0)}
                  selected={optionToShow === opt}
                  myVote={myVote}
                  accent={accent}
                />
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid rgba(120,200,255,0.08)", paddingTop: 12 }}>

          {walletState === "none" && (
            <ActionBtn
              label="INSTALL PHANTOM TO VOTE"
              onClick={() => window.open("https://phantom.app/", "_blank")}
              accent={accent}
            />
          )}

          {walletState === "disconnected" && (
            <ActionBtn label="CONNECT WALLET" onClick={connectWallet} accent={accent} />
          )}

          {walletState === "connecting" && (
            <div style={infoRowStyle}>AWAITING WALLET APPROVAL...</div>
          )}

          {walletState === "connected" && (
            <div>
              {/* Wallet info row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    color: "rgba(140,190,230,0.5)", letterSpacing: "0.12em" }}>
                    {walletAddress!.slice(0, 6)}…{walletAddress!.slice(-4)}
                  </div>
                  <button
                    type="button"
                    onClick={disconnectWallet}
                    style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                      letterSpacing: "0.14em", color: "rgba(140,190,230,0.35)",
                      background: "none", border: "1px solid rgba(120,200,255,0.12)",
                      borderRadius: 3, padding: "1px 6px", cursor: "pointer",
                      textTransform: "uppercase", transition: "color 0.2s, border-color 0.2s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#ff7a8a"; e.currentTarget.style.borderColor = "rgba(255,120,140,0.35)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "rgba(140,190,230,0.35)"; e.currentTarget.style.borderColor = "rgba(120,200,255,0.12)"; }}
                  >
                    DISCONNECT
                  </button>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                  color: accent, letterSpacing: "0.12em" }}>
                  {conviction !== null ? `CONVICTION ${conviction.toFixed(2)}` : "LOADING…"}
                </div>
              </div>

              {conviction === 0 && !alreadyVoted && (
                <div style={{ ...infoRowStyle, color: "rgba(140,190,230,0.45)" }}>
                  NO $PULSE BALANCE DETECTED — ACQUIRE TO VOTE
                </div>
              )}

              {alreadyVoted && (
                <div style={{ ...infoRowStyle, color: "#7aff9f",
                  borderColor: "rgba(120,255,160,0.25)", background: "rgba(120,255,160,0.06)" }}>
                  ◆ VOTE CAST · {OPTION_LABELS[myVote!] ?? myVote}
                </div>
              )}

              {canVote && !submitting && (
                <ActionBtn
                  label={selected ? `CAST VOTE · ${OPTION_LABELS[selected] ?? selected}` : "SELECT AN OPTION ABOVE"}
                  onClick={() => { if (selected) castVote(selected); }}
                  disabled={!selected}
                  accent={accent}
                />
              )}

              {submitting && (
                <div style={infoRowStyle}>
                  {submitState === "signing" ? "SIGN IN WALLET..." : "SUBMITTING VOTE..."}
                </div>
              )}

              {submitState === "error" && (
                <div style={{ ...infoRowStyle, color: "#ff7a8a",
                  borderColor: "rgba(255,120,140,0.25)", background: "rgba(255,80,100,0.06)" }}>
                  {submitError ?? "VOTE FAILED — TRY AGAIN"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
