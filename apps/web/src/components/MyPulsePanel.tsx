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
import { color, radius, space, type as typeT, liveAccent } from "../lib/design";
import SidePanel from "./ui/SidePanel";
import { Button, EmptyState, Pill, SectionLabel, Stat, shortAddr } from "./ui/Primitives";

const WALLET_KEY = "pulse-my-wallet";

interface PhantomProvider {
  publicKey: { toBase58(): string } | null;
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
}
function getSolana(): PhantomProvider | null {
  const w = window as unknown as { solana?: PhantomProvider };
  return w.solana ?? null;
}

type Tab = "me" | "bond" | "board";

export default function MyPulsePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [wallet, setWallet] = useState<string>(() => localStorage.getItem(WALLET_KEY) ?? "");
  const [input, setInput] = useState("");
  const [profile, setProfile] = useState<ConvictionProfile | null>(null);
  const [share, setShare] = useState<ProjectedShare | null>(null);
  const [bond, setBond] = useState<WalletBond | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [streaks, setStreaks] = useState<{ wallet: string; current_days: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("me");

  const load = useCallback(async (addr: string) => {
    setLoading(true);
    try {
      const [data, bondData] = await Promise.all([fetchProfile(addr), fetchBond(addr)]);
      if (data) { setProfile(data.profile); setShare(data.projected_split_rewards); }
      setBond(bondData);
    } finally { setLoading(false); }
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

  const tabs: { key: Tab; label: string }[] = [
    { key: "me", label: "MY STAKE" },
    { key: "bond", label: "BOND" },
    { key: "board", label: "LEADERBOARD" },
  ];

  return (
    <SidePanel open={open} onClose={onClose} title="◇  MY PULSE" width={460}>
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
              }}
            >{t.label}</button>
          );
        })}
      </div>

      <div style={{ paddingTop: space[4] }}>
        {tab === "me" ? (
          !wallet ? (
            <WalletConnect input={input} setInput={setInput} onConnect={connect} onUseTyped={useTyped} />
          ) : loading || !profile ? (
            <EmptyState>reading your pulse…</EmptyState>
          ) : (
            <MyStake wallet={wallet} profile={profile} share={share} onChange={() => { setWallet(""); setProfile(null); localStorage.removeItem(WALLET_KEY); }} />
          )
        ) : tab === "bond" ? (
          !wallet ? (
            <EmptyState>
              Connect or paste a wallet to see what PULSE remembers about you.
            </EmptyState>
          ) : (
            <BondView bond={bond} />
          )
        ) : (
          <Leaderboard board={board} streaks={streaks} />
        )}
      </div>
    </SidePanel>
  );
}

function WalletConnect({
  input, setInput, onConnect, onUseTyped,
}: { input: string; setInput: (s: string) => void; onConnect: () => void; onUseTyped: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[3] }}>
      <div style={{
        fontFamily: typeT.display, fontSize: typeT.size.body,
        color: color.textDim, lineHeight: 1.6,
      }}>
        See your conviction score, multipliers, streak, and what the next “Split Rewards” payout would send you.
      </div>
      <Button onClick={onConnect}>CONNECT WALLET</Button>
      <div style={{ display: "flex", gap: space[2] }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onUseTyped(); }}
          placeholder="or paste a wallet address…"
          style={{
            flex: 1, padding: `${space[2]}px ${space[3]}px`,
            background: color.surface2,
            border: `1px solid ${color.border}`,
            borderRadius: radius.sm,
            color: color.text, fontFamily: typeT.mono, fontSize: typeT.size.label,
            outline: "none",
          }}
        />
        <Button tone="ghost" size="sm" onClick={onUseTyped}>VIEW</Button>
      </div>
    </div>
  );
}

function MyStake({
  wallet, profile, share, onChange,
}: { wallet: string; profile: ConvictionProfile; share: ProjectedShare | null; onChange: () => void }) {
  return (
    <div>
      {/* Wallet bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: space[3] }}>
        <span style={{ fontFamily: typeT.mono, fontSize: typeT.size.micro, color: color.textFaint, letterSpacing: typeT.letter.label }}>
          {shortAddr(wallet)}
        </span>
        <button
          onClick={onChange}
          style={{
            background: "none", border: "none", padding: 0,
            fontFamily: typeT.mono, fontSize: typeT.size.micro,
            color: color.textFaint, letterSpacing: typeT.letter.label, cursor: "pointer",
          }}
        >CHANGE</button>
      </div>

      {/* The killer number */}
      {share && share.pool_sol > 0 && profile.weight > 0 && (
        <div style={{
          padding: `${space[4]}px ${space[5]}px`,
          marginBottom: space[4],
          background: "linear-gradient(135deg, rgba(20,60,40,0.45), rgba(10,30,25,0.45))",
          border: `1px solid rgba(120,255,170,0.35)`,
          borderRadius: radius.md,
        }}>
          <SectionLabel>If Split Rewards wins, you receive</SectionLabel>
          <div style={{
            fontFamily: typeT.mono, fontSize: typeT.size.display,
            fontWeight: 700, color: color.positive,
            lineHeight: 1.1, marginTop: space[1],
          }}>≈ {share.projected_sol.toFixed(4)} SOL</div>
          <div style={{
            marginTop: space[1], fontFamily: typeT.mono,
            fontSize: typeT.size.micro, color: "rgba(120,255,170,0.65)",
            letterSpacing: typeT.letter.value,
          }}>{share.share_pct.toFixed(2)}% of the {share.pool_sol.toFixed(2)} SOL treasury pool</div>
        </div>
      )}

      <Stat label="CONVICTION SCORE" value={Math.round(profile.weight).toLocaleString()} accent />
      <Stat label="BALANCE" value={`${Math.round(profile.balance).toLocaleString()} PULSE`} />
      <Stat label="HOLDING FOR" value={`${Math.floor(profile.hold_days)}d`} hint={`${profile.hold_multiplier.toFixed(1)}× multiplier`} />
      <Stat label="STREAK" value={`${profile.streak_days} days`} />
      <Stat label="REINFORCEMENTS" value={`${profile.reinforcement_count}`} hint={`+${(profile.reinforcement_bonus * 100).toFixed(0)}% bonus`} />
      <Stat label="TWEET BONUS" value={profile.tweet_multiplier_active ? "ACTIVE +25%" : "—"} />

      <div style={{ marginTop: space[3], display: "flex", flexWrap: "wrap", gap: space[1] }}>
        {profile.status_flags.length === 0 ? (
          <Pill tone="default">no badges yet</Pill>
        ) : profile.status_flags.map((f) => <Pill key={f} tone="insight">{f}</Pill>)}
      </div>

      {profile.balance <= 0 && (
        <div style={{
          marginTop: space[4],
          padding: `${space[3]}px ${space[4]}px`,
          background: "rgba(255,200,130,0.07)",
          border: `1px solid rgba(255,200,130,0.25)`,
          borderRadius: radius.sm,
          fontFamily: typeT.display, fontSize: typeT.size.body,
          color: color.caution, lineHeight: 1.6,
        }}>
          This wallet holds no $PULSE yet — buy in and your conviction starts compounding from day one.
        </div>
      )}
    </div>
  );
}

function BondView({ bond }: { bond: WalletBond | null }) {
  return (
    <div>
      {/* Affection card */}
      <div style={{
        padding: `${space[4]}px ${space[5]}px`, marginBottom: space[4],
        background: "linear-gradient(135deg, rgba(40,30,60,0.55), rgba(20,15,40,0.55))",
        border: `1px solid rgba(190,160,255,0.30)`,
        borderRadius: radius.md,
      }}>
        <SectionLabel>Affection</SectionLabel>
        <div style={{
          fontFamily: typeT.mono, fontSize: typeT.size.display,
          fontWeight: 700, color: color.insight, lineHeight: 1.1, marginTop: space[1],
        }}>
          {bond?.relationship ? bond.relationship.affection.toFixed(2) : "0.00"}
        </div>
        <div style={{
          marginTop: space[1], fontFamily: typeT.display,
          fontSize: typeT.size.body, color: "rgba(220,200,255,0.6)", lineHeight: 1.55,
        }}>
          How PULSE feels about your wallet. Earned by talking with it, defending it during drops, and showing up over time.
        </div>
      </div>

      {/* Tips */}
      {bond?.tips_received && bond.tips_received.length > 0 && (
        <div style={{ marginBottom: space[4] }}>
          <SectionLabel>Autonomous tips PULSE sent you</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
            {bond.tips_received.map((t, i) => (
              <div key={i} style={{
                padding: `${space[3]}px ${space[4]}px`,
                background: color.surface2,
                border: `1px solid rgba(120,255,170,0.15)`,
                borderRadius: radius.md,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: space[1] }}>
                  <span style={{ fontFamily: typeT.mono, fontSize: typeT.size.value, color: color.positive, fontWeight: 700 }}>
                    +{t.amount_sol.toFixed(4)} SOL
                  </span>
                  <span style={{ fontFamily: typeT.mono, fontSize: typeT.size.micro, color: color.textFaint }}>
                    {new Date(t.decided_at).toLocaleDateString()}
                  </span>
                </div>
                <div style={{
                  fontFamily: typeT.display, fontStyle: "italic",
                  fontSize: typeT.size.body, color: color.textDim, lineHeight: 1.55,
                }}>“{t.reasoning}”</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memories */}
      <SectionLabel>What PULSE remembers about you</SectionLabel>
      {!bond?.memories || bond.memories.length === 0 ? (
        <EmptyState>
          Nothing yet.<br />
          <span style={{ color: color.textFaint }}>Talk to PULSE — it will start to keep notes about you.</span>
        </EmptyState>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
          {bond.memories.map((m, i) => (
            <div key={i} style={{
              padding: `${space[3]}px ${space[4]}px`,
              background: color.surface2,
              border: `1px solid rgba(190,160,255,0.18)`,
              borderRadius: radius.md,
              fontFamily: typeT.display, fontStyle: "italic",
              fontSize: typeT.size.body, color: color.text, lineHeight: 1.6,
            }}>“{m}”</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Leaderboard({
  board, streaks,
}: { board: LeaderboardEntry[]; streaks: { wallet: string; current_days: number }[] }) {
  return (
    <div>
      <SectionLabel>Top conviction</SectionLabel>
      {board.length === 0 ? (
        <EmptyState>no holders ranked yet</EmptyState>
      ) : (
        <div style={{ marginBottom: space[5] }}>
          {board.map((e, i) => (
            <div key={e.wallet} style={{
              display: "flex", alignItems: "center", gap: space[3],
              padding: `${space[2]}px 0`,
              borderBottom: `1px solid ${color.border}`,
            }}>
              <span style={{
                fontFamily: typeT.mono, fontSize: typeT.size.value,
                color: i < 3 ? color.caution : color.textFaint,
                width: 22, fontWeight: i < 3 ? 700 : 500,
              }}>{i + 1}</span>
              <span style={{ fontFamily: typeT.mono, fontSize: typeT.size.label, color: color.text, flex: 1 }}>
                {shortAddr(e.wallet)}
              </span>
              {e.status_flags[0] && <Pill tone="insight">{e.status_flags[0]}</Pill>}
              <span style={{ fontFamily: typeT.mono, fontSize: typeT.size.value, color: color.positive }}>
                {Math.round(e.weight).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <SectionLabel>Longest streaks</SectionLabel>
      {streaks.length === 0 ? (
        <EmptyState>no active streaks yet</EmptyState>
      ) : streaks.map((s, i) => (
        <div key={s.wallet} style={{
          display: "flex", alignItems: "center", gap: space[3],
          padding: `${space[2]}px 0`,
          borderBottom: `1px solid ${color.border}`,
        }}>
          <span style={{
            fontFamily: typeT.mono, fontSize: typeT.size.value,
            color: i < 3 ? color.caution : color.textFaint,
            width: 22, fontWeight: i < 3 ? 700 : 500,
          }}>{i + 1}</span>
          <span style={{ fontFamily: typeT.mono, fontSize: typeT.size.label, color: color.text, flex: 1 }}>
            {shortAddr(s.wallet)}
          </span>
          <span style={{ fontFamily: typeT.mono, fontSize: typeT.size.value, color: color.caution }}>
            {s.current_days}d
          </span>
        </div>
      ))}
    </div>
  );
}
