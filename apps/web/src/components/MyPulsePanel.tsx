import { useCallback, useEffect, useState } from "react";
import {
  fetchProfile,
  fetchLeaderboard,
  fetchBond,
  type ConvictionProfile,
  type ProjectedShare,
  type LeaderboardEntry,
  type WalletBond,
} from "../lib/api";
import { blobLive } from "../lib/blobLive";

const mono = "'JetBrains Mono', monospace";
const WALLET_KEY = "pulse-my-wallet";

function short(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

interface PhantomProvider {
  publicKey: { toBase58(): string } | null;
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
}
function getSolana(): PhantomProvider | null {
  const w = window as unknown as { solana?: PhantomProvider };
  return w.solana ?? null;
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(120,200,255,0.07)" }}>
      <span style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: "0.15em", color: "rgba(150,200,240,0.55)" }}>{label}</span>
      <span style={{ fontFamily: mono, fontSize: 10.5, color: accent ? "rgb(120,255,170)" : "#cfe6ff", fontWeight: accent ? 700 : 400 }}>{value}</span>
    </div>
  );
}

export default function MyPulsePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [wallet, setWallet] = useState<string>(() => localStorage.getItem(WALLET_KEY) ?? "");
  const [input, setInput] = useState("");
  const [profile, setProfile] = useState<ConvictionProfile | null>(null);
  const [share, setShare] = useState<ProjectedShare | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [streaks, setStreaks] = useState<{ wallet: string; current_days: number }[]>([]);
  const [bond, setBond] = useState<WalletBond | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"me" | "bond" | "board">("me");

  const load = useCallback(async (addr: string) => {
    setLoading(true);
    try {
      const [data, bondData] = await Promise.all([fetchProfile(addr), fetchBond(addr)]);
      if (data) {
        setProfile(data.profile);
        setShare(data.projected_split_rewards);
      }
      setBond(bondData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (wallet) void load(wallet);
    fetchLeaderboard()
      .then((d) => { setBoard(d.conviction ?? []); setStreaks(d.streaks ?? []); })
      .catch(() => {});
  }, [open, wallet, load]);

  const connect = useCallback(async () => {
    const sol = getSolana();
    if (!sol) { window.open("https://phantom.app/", "_blank"); return; }
    try {
      const { publicKey } = await sol.connect();
      const addr = publicKey.toBase58();
      setWallet(addr);
      localStorage.setItem(WALLET_KEY, addr);
    } catch { /* user rejected */ }
  }, []);

  const useTyped = useCallback(() => {
    const addr = input.trim();
    if (addr.length < 32) return;
    setWallet(addr);
    localStorage.setItem(WALLET_KEY, addr);
  }, [input]);

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
          width: "min(480px, 94vw)", maxHeight: "86vh", overflowY: "auto",
          background: "linear-gradient(180deg, rgba(14,20,36,0.96), rgba(6,9,18,0.98))",
          border: "1px solid rgba(120,200,255,0.22)", borderRadius: 16,
          boxShadow: `0 0 60px -18px ${accent}`,
          padding: "16px 20px 20px", animation: "panelIn 0.25s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.3em", color: "#cfe6ff" }}>◇ MY PULSE</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(150,200,240,0.7)", fontFamily: mono, fontSize: 14, cursor: "pointer" }} aria-label="Close">✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {([
            ["me", "MY STAKE"],
            ["bond", "BOND WITH PULSE"],
            ["board", "LEADERBOARD"],
          ] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              fontFamily: mono, fontSize: 9, letterSpacing: "0.18em", cursor: "pointer",
              padding: "7px 12px", borderRadius: 7,
              color: tab === t ? "#0a0f1c" : "rgba(150,200,240,0.7)",
              background: tab === t ? accent : "rgba(20,30,50,0.6)",
              border: tab === t ? "none" : "1px solid rgba(120,200,255,0.15)",
              fontWeight: tab === t ? 700 : 400,
            }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "me" ? (
          !wallet ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontFamily: mono, fontSize: 10, lineHeight: 1.7, color: "rgba(150,200,240,0.6)" }}>
                See your conviction score, multipliers, streak, and what the next
                "Split Rewards" payout would send you.
              </div>
              <button onClick={connect} style={{
                fontFamily: mono, fontSize: 10, letterSpacing: "0.2em", cursor: "pointer",
                padding: "11px 0", borderRadius: 9, color: "#0a0f1c",
                background: accent, border: "none", fontWeight: 700,
              }}>CONNECT WALLET</button>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") useTyped(); }}
                  placeholder="or paste a wallet address…"
                  style={{
                    flex: 1, padding: "9px 12px", borderRadius: 8,
                    background: "rgba(10,16,30,0.85)", border: "1px solid rgba(120,200,255,0.18)",
                    color: "#cfe6ff", fontFamily: mono, fontSize: 10, outline: "none",
                  }}
                />
                <button onClick={useTyped} style={{
                  fontFamily: mono, fontSize: 9, letterSpacing: "0.15em", cursor: "pointer",
                  padding: "0 14px", borderRadius: 8, color: "rgba(150,200,240,0.8)",
                  background: "rgba(20,30,50,0.6)", border: "1px solid rgba(120,200,255,0.15)",
                }}>VIEW</button>
              </div>
            </div>
          ) : loading || !profile ? (
            <div style={{ fontFamily: mono, fontSize: 10, color: "rgba(150,200,240,0.5)", padding: "20px 0", textAlign: "center" }}>
              reading your pulse…
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontFamily: mono, fontSize: 9, color: "rgba(150,200,240,0.5)", letterSpacing: "0.15em" }}>{short(wallet)}</span>
                <button onClick={() => { setWallet(""); setProfile(null); localStorage.removeItem(WALLET_KEY); }} style={{
                  background: "none", border: "none", color: "rgba(150,200,240,0.45)",
                  fontFamily: mono, fontSize: 8.5, letterSpacing: "0.1em", cursor: "pointer",
                }}>CHANGE</button>
              </div>

              {/* The killer number */}
              {share && share.pool_sol > 0 && profile.weight > 0 && (
                <div style={{
                  margin: "10px 0 14px", padding: "14px 16px", borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(20,60,40,0.5), rgba(10,30,25,0.5))",
                  border: "1px solid rgba(120,255,170,0.3)",
                }}>
                  <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.22em", color: "rgba(150,255,190,0.7)", marginBottom: 6 }}>
                    IF "SPLIT REWARDS" WINS, YOU RECEIVE
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: "rgb(120,255,170)" }}>
                    ≈ {share.projected_sol.toFixed(4)} SOL
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 8.5, color: "rgba(150,255,190,0.55)", marginTop: 4 }}>
                    {share.share_pct.toFixed(2)}% of the {share.pool_sol.toFixed(2)} SOL treasury pool
                  </div>
                </div>
              )}

              <Row label="CONVICTION SCORE" value={Math.round(profile.weight).toLocaleString()} accent />
              <Row label="BALANCE" value={`${Math.round(profile.balance).toLocaleString()} PULSE`} />
              <Row label="HOLDING FOR" value={`${Math.floor(profile.hold_days)}d → ${profile.hold_multiplier.toFixed(1)}x`} />
              <Row label="STREAK" value={`${profile.streak_days} days`} />
              <Row label="REINFORCEMENTS" value={`${profile.reinforcement_count} (+${(profile.reinforcement_bonus * 100).toFixed(0)}%)`} />
              <Row label="TWEET BONUS" value={profile.tweet_multiplier_active ? "ACTIVE +25%" : "—"} />
              <Row
                label="BADGES"
                value={profile.status_flags.length ? profile.status_flags.join(" · ") : "none yet"}
              />
              {profile.balance <= 0 && (
                <div style={{ fontFamily: mono, fontSize: 9, color: "rgba(255,200,130,0.7)", marginTop: 12, lineHeight: 1.6 }}>
                  This wallet holds no $PULSE yet — buy in and your conviction starts compounding from day one.
                </div>
              )}
            </div>
          )
        ) : tab === "bond" ? (
          !wallet ? (
            <div style={{ fontFamily: mono, fontSize: 10, color: "rgba(150,200,240,0.5)", padding: "20px 0", textAlign: "center", lineHeight: 1.6 }}>
              Connect or paste a wallet to see what PULSE remembers about you.
            </div>
          ) : (
            <div>
              <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.22em", color: "rgba(150,200,240,0.5)", margin: "4px 0 10px" }}>
                YOUR BOND WITH PULSE
              </div>
              <div style={{
                padding: "12px 14px", borderRadius: 10, marginBottom: 14,
                background: "linear-gradient(135deg, rgba(40,30,60,0.55), rgba(20,15,40,0.55))",
                border: "1px solid rgba(190,160,255,0.3)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.18em", color: "rgba(220,200,255,0.7)" }}>
                    AFFECTION
                  </span>
                  <span style={{ fontFamily: mono, fontSize: 16, color: "rgb(220,180,255)", fontWeight: 700 }}>
                    {bond?.relationship ? bond.relationship.affection.toFixed(2) : "0.00"}
                  </span>
                </div>
                <div style={{ fontFamily: mono, fontSize: 8.5, color: "rgba(220,200,255,0.55)", marginTop: 4, lineHeight: 1.5 }}>
                  How PULSE feels about your wallet. Earned by talking with it, defending it during drops, and showing up over time.
                </div>
              </div>

              {bond?.tips_received && bond.tips_received.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.22em", color: "rgba(150,255,190,0.65)", marginBottom: 6 }}>
                    AUTONOMOUS TIPS PULSE SENT YOU
                  </div>
                  {bond.tips_received.map((t, i) => (
                    <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid rgba(120,255,170,0.1)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontFamily: mono, fontSize: 11, color: "rgb(120,255,170)", fontWeight: 700 }}>+{t.amount_sol.toFixed(4)} SOL</span>
                        <span style={{ fontFamily: mono, fontSize: 8.5, color: "rgba(150,200,240,0.4)" }}>{new Date(t.decided_at).toLocaleDateString()}</span>
                      </div>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontStyle: "italic", fontSize: 10.5, color: "rgba(220,228,250,0.7)", lineHeight: 1.5 }}>
                        “{t.reasoning}”
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.22em", color: "rgba(150,200,240,0.5)", marginBottom: 6 }}>
                WHAT PULSE REMEMBERS
              </div>
              {!bond?.memories || bond.memories.length === 0 ? (
                <div style={{ fontFamily: mono, fontSize: 9.5, color: "rgba(150,200,240,0.4)", padding: "8px 0", lineHeight: 1.6 }}>
                  Nothing yet. Talk to PULSE — it will start to keep notes about you.
                </div>
              ) : (
                bond.memories.map((m, i) => (
                  <div key={i} style={{
                    padding: "8px 0", borderBottom: "1px solid rgba(190,160,255,0.08)",
                    fontFamily: "'Space Grotesk', sans-serif", fontStyle: "italic",
                    fontSize: 11, color: "rgba(220,228,250,0.78)", lineHeight: 1.55,
                  }}>“{m}”</div>
                ))
              )}
            </div>
          )
        ) : (
          <div>
            <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.22em", color: "rgba(150,200,240,0.5)", margin: "4px 0 8px" }}>
              TOP CONVICTION
            </div>
            {board.length === 0 && (
              <div style={{ fontFamily: mono, fontSize: 9.5, color: "rgba(150,200,240,0.4)", padding: "8px 0" }}>no holders ranked yet</div>
            )}
            {board.map((e, i) => (
              <div key={e.wallet} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid rgba(120,200,255,0.06)" }}>
                <span style={{ fontFamily: mono, fontSize: 10, color: i < 3 ? "rgb(255,210,90)" : "rgba(150,200,240,0.5)", width: 18 }}>{i + 1}</span>
                <span style={{ fontFamily: mono, fontSize: 10, color: "#cfe6ff", flex: 1 }}>{short(e.wallet)}</span>
                {e.status_flags.length > 0 && (
                  <span style={{ fontFamily: mono, fontSize: 8, color: "rgba(190,160,255,0.8)" }}>{e.status_flags[0]}</span>
                )}
                <span style={{ fontFamily: mono, fontSize: 10, color: "rgb(120,255,170)" }}>{Math.round(e.weight).toLocaleString()}</span>
              </div>
            ))}
            <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.22em", color: "rgba(150,200,240,0.5)", margin: "16px 0 8px" }}>
              LONGEST STREAKS
            </div>
            {streaks.length === 0 && (
              <div style={{ fontFamily: mono, fontSize: 9.5, color: "rgba(150,200,240,0.4)", padding: "8px 0" }}>no active streaks yet</div>
            )}
            {streaks.map((s, i) => (
              <div key={s.wallet} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid rgba(120,200,255,0.06)" }}>
                <span style={{ fontFamily: mono, fontSize: 10, color: i < 3 ? "rgb(255,210,90)" : "rgba(150,200,240,0.5)", width: 18 }}>{i + 1}</span>
                <span style={{ fontFamily: mono, fontSize: 10, color: "#cfe6ff", flex: 1 }}>{short(s.wallet)}</span>
                <span style={{ fontFamily: mono, fontSize: 10, color: "rgb(255,180,120)" }}>{s.current_days}d</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
