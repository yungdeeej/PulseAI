import { useEffect, useState } from "react";
import { useVoting } from "../lib/useVoting";
import { blobLive } from "../lib/blobLive";
import { submitTweetUrl, fetchConsciousness, type AIInsight } from "../lib/api";

const OPTION_LABELS: Record<string, string> = {
  "Defend Chart":  "DEFEND CHART",
  "Split Rewards": "SPLIT REWARDS",
};

const OPTION_DESC: Record<string, string> = {
  "Defend Chart":  "Spend Decision Vault SOL to buy $PULSE on Jupiter and burn it",
  "Split Rewards": "Airdrop the Decision Vault pool to holders by conviction weight",
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
  const [boostOpen, setBoostOpen] = useState(false);
  const [debateOpen, setDebateOpen] = useState(false);
  const [tweetUrl, setTweetUrl] = useState("");
  const [tweetState, setTweetState] = useState<"idle" | "submitting" | "pending" | "error">("idle");
  const [tweetError, setTweetError] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const data = await fetchConsciousness(1);
        if (!dead) setAiInsight(data.latest);
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { dead = true; clearInterval(id); };
  }, []);

  async function handleTweetSubmit() {
    if (!walletAddress || !tweetUrl.trim()) return;
    setTweetState("submitting");
    setTweetError(null);
    const result = await submitTweetUrl(walletAddress, tweetUrl.trim());
    if (result.ok) {
      setTweetState("pending");
      setTweetUrl("");
    } else {
      setTweetState("error");
      setTweetError(result.reason ?? "submission failed");
    }
  }

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
        bottom: 110, left: "50%", transform: "translateX(-50%)",
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

  // ── No active vote: show compact standby teaser ─────────────────────────────
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
            const aiLeans = aiInsight?.vote_lean === opt;
            return (
              <div
                key={opt}
                onClick={() => canVote && setSelected(opt)}
                style={{ cursor: canVote ? "pointer" : "default", position: "relative" }}
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
                {aiLeans && (
                  <div style={{
                    position: "absolute", top: -2, right: 4,
                    padding: "1px 6px", borderRadius: 3,
                    background: "rgba(220,180,255,0.14)",
                    border: "1px solid rgba(220,180,255,0.45)",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 8, letterSpacing: "0.16em",
                    color: "rgb(220,180,255)",
                    pointerEvents: "none",
                    textShadow: "0 0 6px rgba(220,180,255,0.5)",
                  }} title={aiInsight?.vote_reason ?? "AI consciousness leans here"}>
                    ◆ AI LEAN
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* AI consciousness lean — italicized first-person line */}
        {aiInsight?.vote_lean && (
          <div
            title={aiInsight.vote_reason ?? undefined}
            style={{
              marginBottom: 12, padding: "8px 10px",
              borderLeft: "2px solid rgba(220,180,255,0.55)",
              background: "rgba(220,180,255,0.06)",
              borderRadius: "0 6px 6px 0",
              fontStyle: "italic", fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 11.5, lineHeight: 1.45,
              color: "rgba(230,220,255,0.86)",
              letterSpacing: "0.01em",
            }}
          >
            <span style={{ color: "rgb(220,180,255)" }}>◆</span>{" "}
            I lean toward <em style={{ color: "rgb(220,180,255)", fontStyle: "italic" }}>{OPTION_LABELS[aiInsight.vote_lean] ?? aiInsight.vote_lean}</em>
            {aiInsight.vote_reason ? ` — ${aiInsight.vote_reason}` : "."}
          </div>
        )}

        {/* The entity argues both sides of the ballot (Claude-generated at vote open) */}
        {vote.debate && vote.debate.cases.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={() => setDebateOpen((v) => !v)}
              style={{
                width: "100%", textAlign: "left", cursor: "pointer",
                background: "rgba(220,180,255,0.05)",
                border: "1px solid rgba(220,180,255,0.2)", borderRadius: 6,
                padding: "7px 10px",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                letterSpacing: "0.2em", color: "rgb(220,180,255)",
              }}
            >
              ◆ THE ENTITY ARGUES BOTH SIDES {debateOpen ? "▾" : "▸"}
            </button>
            {debateOpen && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                {vote.debate.cases.map((c) => (
                  <div key={c.option} style={{
                    padding: "8px 10px", borderRadius: 6,
                    background: "rgba(15,20,38,0.6)",
                    border: vote.debate?.lean === c.option
                      ? "1px solid rgba(220,180,255,0.45)"
                      : "1px solid rgba(120,200,255,0.1)",
                  }}>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5,
                      letterSpacing: "0.18em", color: "rgba(180,220,255,0.8)", marginBottom: 4,
                    }}>
                      FOR “{c.option.toUpperCase()}” {vote.debate?.lean === c.option ? " · ITS PICK" : ""}
                    </div>
                    <div style={{
                      fontFamily: "'Space Grotesk', sans-serif", fontStyle: "italic",
                      fontSize: 11, lineHeight: 1.5, color: "rgba(220,228,250,0.85)",
                    }}>
                      {c.argument}
                    </div>
                  </div>
                ))}
                {vote.debate.lean_reason && (
                  <div style={{
                    fontFamily: "'Space Grotesk', sans-serif", fontStyle: "italic",
                    fontSize: 10.5, color: "rgba(220,180,255,0.75)", padding: "0 2px",
                  }}>
                    “{vote.debate.lean_reason}”
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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

              {conviction !== null && conviction > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => { setBoostOpen(b => !b); setTweetState("idle"); setTweetError(null); }}
                    style={{
                      width: "100%", padding: "8px 12px",
                      background: boostOpen ? "rgba(120,200,255,0.06)" : "rgba(20,30,50,0.3)",
                      border: `1px solid ${boostOpen ? "rgba(120,200,255,0.25)" : "rgba(120,200,255,0.10)"}`,
                      borderRadius: 8, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#78c8ff" }}>⚡</span>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5,
                        letterSpacing: "0.18em", color: boostOpen ? "#78c8ff" : "rgba(140,190,230,0.55)",
                        textTransform: "uppercase",
                      }}>
                        BOOST CONVICTION
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                        letterSpacing: "0.12em", color: "rgba(120,200,255,0.45)",
                        border: "1px solid rgba(120,200,255,0.18)", borderRadius: 3, padding: "1px 6px",
                      }}>+0.25×</span>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                        color: "rgba(140,190,230,0.35)", transition: "transform 0.2s",
                        display: "inline-block", transform: boostOpen ? "rotate(180deg)" : "rotate(0deg)",
                      }}>▾</span>
                    </div>
                  </button>

                  {boostOpen && (
                    <div style={{
                      marginTop: 6, padding: "12px", borderRadius: 8,
                      background: "rgba(10,18,34,0.6)",
                      border: "1px solid rgba(120,200,255,0.12)",
                    }}>
                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5,
                        letterSpacing: "0.13em", color: "rgba(140,190,230,0.45)",
                        marginBottom: 10, lineHeight: 1.6,
                      }}>
                        TWEET ABOUT $PULSE → EARN A +0.25× CONVICTION MULTIPLIER FOR 7 DAYS.
                        TWEET MUST MENTION $PULSE AND REACH 100 LIKES TO ACTIVATE.
                      </div>

                      {tweetState === "pending" ? (
                        <div style={{
                          padding: "10px 12px", borderRadius: 8,
                          background: "rgba(120,200,255,0.05)",
                          border: "1px solid rgba(120,200,255,0.22)",
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5,
                          letterSpacing: "0.14em", color: "#78c8ff",
                          textAlign: "center",
                        }}>
                          ◎ TWEET SUBMITTED — PENDING 100 LIKES
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            type="url"
                            placeholder="https://x.com/..."
                            value={tweetUrl}
                            onChange={e => setTweetUrl(e.target.value)}
                            disabled={tweetState === "submitting"}
                            style={{
                              flex: 1, padding: "8px 10px",
                              background: "rgba(10,18,34,0.8)",
                              border: "1px solid rgba(120,200,255,0.18)",
                              borderRadius: 6, outline: "none",
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 9.5, letterSpacing: "0.08em",
                              color: "rgba(200,225,255,0.85)",
                              minWidth: 0,
                            }}
                            onKeyDown={e => { if (e.key === "Enter") handleTweetSubmit(); }}
                          />
                          <button
                            type="button"
                            onClick={handleTweetSubmit}
                            disabled={!tweetUrl.trim() || tweetState === "submitting"}
                            style={{
                              padding: "8px 12px", borderRadius: 6, flexShrink: 0,
                              background: (!tweetUrl.trim() || tweetState === "submitting")
                                ? "rgba(20,30,50,0.5)"
                                : "rgba(120,200,255,0.12)",
                              border: `1px solid ${(!tweetUrl.trim() || tweetState === "submitting")
                                ? "rgba(120,200,255,0.10)"
                                : "rgba(120,200,255,0.35)"}`,
                              color: (!tweetUrl.trim() || tweetState === "submitting")
                                ? "rgba(140,190,230,0.25)"
                                : "#78c8ff",
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase",
                              cursor: (!tweetUrl.trim() || tweetState === "submitting") ? "default" : "pointer",
                              transition: "all 0.2s",
                            }}
                          >
                            {tweetState === "submitting" ? "…" : "SUBMIT"}
                          </button>
                        </div>
                      )}

                      {tweetState === "error" && (
                        <div style={{
                          marginTop: 6, fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 8.5, letterSpacing: "0.12em",
                          color: "#ff7a8a", textTransform: "uppercase",
                        }}>
                          ✕ {tweetError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {conviction === 0 && !alreadyVoted && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 12px",
                  border: "1px solid rgba(120,200,255,0.08)", borderRadius: 8,
                  background: "rgba(20,30,50,0.3)",
                }}>
                  <span style={{ color: "rgba(140,190,230,0.3)", fontSize: 13, lineHeight: 1 }}>◌</span>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                      letterSpacing: "0.13em", color: "rgba(140,190,230,0.5)" }}>
                      NO $PULSE DETECTED
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5,
                      letterSpacing: "0.10em", color: "rgba(140,190,230,0.28)", marginTop: 3 }}>
                      ACQUIRE $PULSE TO EARN VOTING WEIGHT
                    </div>
                  </div>
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
