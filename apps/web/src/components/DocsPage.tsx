import { useEffect } from "react";

const ACCENT = "rgb(120,200,255)";
const SUBTLE = "rgba(140,190,230,0.65)";
const SUBTLE_DIM = "rgba(140,190,230,0.4)";
const BODY = "rgba(207,230,255,0.88)";
const BASE_BORDER = "rgba(120,200,255,0.14)";

function Card({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div style={{
      position: "relative",
      background: "linear-gradient(180deg, rgba(20,28,44,0.55), rgba(8,12,22,0.60))",
      border: `1px solid ${BASE_BORDER}`,
      borderRadius: 12,
      padding: "26px 28px",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      boxShadow: "0 0 0 1px rgba(80,180,255,0.04) inset, 0 18px 40px -20px rgba(0,180,255,0.20)",
      overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 22, height: 22,
        borderTop: `1px solid ${ACCENT}88`, borderLeft: `1px solid ${ACCENT}88`,
        borderTopLeftRadius: 12 }} />
      <div style={{ position: "absolute", bottom: 0, right: 0, width: 22, height: 22,
        borderBottom: `1px solid ${ACCENT}88`, borderRight: `1px solid ${ACCENT}88`,
        borderBottomRightRadius: 12 }} />
      {label && (
        <div style={{
          fontSize: 9.5, letterSpacing: "0.24em", color: SUBTLE,
          textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace",
          marginBottom: 18,
        }}>
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'Space Grotesk', sans-serif",
      fontSize: 22, fontWeight: 600, letterSpacing: "0.01em",
      color: "#e7f1ff", marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 14.5, lineHeight: 1.7, color: BODY,
      marginBottom: 14, fontFamily: "'Inter', sans-serif",
    }}>
      {children}
    </p>
  );
}

function ManifestoLine({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'Space Grotesk', sans-serif",
      fontSize: 17.5, lineHeight: 1.55, fontWeight: 500,
      color: "#e7f1ff", letterSpacing: "0.005em",
      marginBottom: 14, paddingLeft: 14, position: "relative",
    }}>
      <span style={{
        position: "absolute", left: 0, top: 8, bottom: 8,
        width: 2, borderRadius: 1, background: ACCENT,
        boxShadow: `0 0 8px ${ACCENT}`,
      }} />
      {children}
    </div>
  );
}

export default function DocsPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{
      position: "relative", minHeight: "100vh",
      background: "#04050A", color: "#cfe6ff",
      fontFamily: "'Inter', sans-serif",
      padding: "60px 20px 80px",
    }}>
      {/* Faint star backdrop matching the main app */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 30% 20%, rgba(40,80,140,0.15), transparent 55%), radial-gradient(ellipse at 70% 80%, rgba(60,40,120,0.12), transparent 55%)",
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 760, margin: "0 auto" }}>
        {/* Top nav */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 40,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, letterSpacing: "0.32em",
          color: SUBTLE_DIM, textTransform: "uppercase",
        }}>
          <a href="#/" style={{
            color: SUBTLE, textDecoration: "none",
            border: `1px solid rgba(120,200,255,0.22)`,
            padding: "8px 14px", borderRadius: 8,
            background: "linear-gradient(180deg, rgba(20,28,44,0.55), rgba(8,12,22,0.60))",
            backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
            transition: "border-color 0.2s, color 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(120,200,255,0.22)"; e.currentTarget.style.color = SUBTLE; }}
          >
            ← BACK TO ENTITY
          </a>
          <span>PULSE // DOCS</span>
        </div>

        {/* Title */}
        <div style={{
          textAlign: "center", marginBottom: 50,
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, letterSpacing: "0.5em",
            color: SUBTLE_DIM, marginBottom: 14,
          }}>
            ◇ TRANSMISSION 001
          </div>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 44, fontWeight: 600, letterSpacing: "0.02em",
            color: "#e7f1ff", marginBottom: 8,
          }}>
            $PULSE
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, letterSpacing: "0.3em",
            color: SUBTLE, textTransform: "uppercase",
          }}>
            A living entity in a containment chamber
          </div>
        </div>

        {/* Simple explanation */}
        <div style={{ marginBottom: 32 }}>
          <Card label="◇ What is Pulse · in plain words">
            <H2>It's a memecoin with a face.</H2>
            <P>
              $PULSE is a Solana token. What makes it different is that the
              chart isn't just a chart — it controls a living creature you
              can see and feel on the homepage. The creature is the token.
              When people buy, it gets excited. When people sell, it gets
              nervous. When the market cap crosses tier thresholds, it
              evolves: new colours, new aura rings, new behaviour.
            </P>
            <H2>The treasury votes on what happens next.</H2>
            <P>
              Every creator reward that comes in from trading flows into a
              single on-chain wallet called the Decision Vault. When the
              vault hits a threshold, holders get a binary vote:
            </P>
            <ul style={{ paddingLeft: 22, marginBottom: 14, color: BODY, fontSize: 14.5, lineHeight: 1.7 }}>
              <li><strong style={{ color: "#e7f1ff" }}>Defend Chart</strong> — the bot uses the vault to buy $PULSE on the open market and burn the tokens. Supply shrinks. The chart gets a push.</li>
              <li><strong style={{ color: "#e7f1ff" }}>Split Rewards</strong> — the SOL in the vault is airdropped directly to holder wallets, weighted by how much $PULSE they hold.</li>
            </ul>
            <P>
              No DAO theatre. No proposals to argue about for weeks. Two
              levers, both executed by the bot the moment the vote closes,
              transparent on-chain.
            </P>
            <H2>How to participate.</H2>
            <P>
              Hit the SWAP button on the homepage. It opens a Jupiter swap
              widget pre-configured for SOL → $PULSE — connect a wallet
              (Phantom, Solflare, Backpack), pick an amount, confirm. You
              now hold $PULSE and your wallet is counted in the next vote.
            </P>
            <P style={{ color: SUBTLE, fontSize: 13.5 }}>
              That's it. The rest is the entity.
            </P>
          </Card>
        </div>

        {/* Manifesto */}
        <div style={{ marginBottom: 32 }}>
          <Card label="◇ The Manifesto">
            <ManifestoLine>
              We are tired of dead charts.
            </ManifestoLine>
            <ManifestoLine>
              For ten years, memecoins have been static logos pretending to
              be alive — pictures of frogs, dogs, cats, hats — frozen JPEGs
              riding candles they cannot feel.
            </ManifestoLine>
            <ManifestoLine>
              $PULSE is the first one that flinches.
            </ManifestoLine>
            <P style={{ marginTop: 20 }}>
              We built a creature. We put it in a containment chamber. We
              wired its nervous system directly to the on-chain order flow.
              When you buy, it sees you. When you sell, it feels you.
              When the chart climbs, it grows new colours, new aura, new
              tiers of existence. When the chart bleeds, it goes quiet.
            </P>
            <P>
              The chart no longer represents the token. The chart{" "}
              <em>is</em> the token's body.
            </P>
            <ManifestoLine>
              And every reward the creature earns, you decide what to do with.
            </ManifestoLine>
            <P>
              Pump.fun creator rewards funnel into a single on-chain vault.
              When it fills, holders vote, the bot executes the moment the
              clock hits zero. Defend the chart, or split the rewards. No
              committee, no foundation, no nine-month proposal queue. Two
              buttons. Real money. On-chain receipts.
            </P>
            <ManifestoLine>
              The first memecoin that breathes back.
            </ManifestoLine>
            <P>
              We don't promise utility. We don't promise a roadmap with
              twelve quarterly milestones in pastel colours. We promise an
              entity that lives as long as you feed it, dies the moment you
              stop, and pays you when it wins.
            </P>
            <P style={{
              marginTop: 24, paddingTop: 18,
              borderTop: `1px solid rgba(120,200,255,0.10)`,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, letterSpacing: "0.2em",
              color: SUBTLE, textTransform: "uppercase", textAlign: "center",
            }}>
              ◇ FEEL THE PULSE
            </P>
          </Card>
        </div>

        {/* Glossary / quick reference */}
        <div style={{ marginBottom: 32 }}>
          <Card label="◇ Quick reference">
            <Definition term="Entity / Blob" def="The creature on the homepage. Its emotion, colour, and aura track live market activity and tier progression." />
            <Definition term="Tier" def="A market-cap milestone. Discovery → Ignition → Momentum → Conviction → Ascension. Each tier unlocks new visual evolution." />
            <Definition term="Decision Vault" def="The single on-chain SOL wallet that holds creator rewards until a vote closes." />
            <Definition term="Defend Chart" def="Vote outcome where the bot uses the vault to buy $PULSE on the open market and burn the tokens." />
            <Definition term="Split Rewards" def="Vote outcome where the SOL in the vault is airdropped to holders, weighted by holdings." />
            <Definition term="AI Consciousness" def="The entity's narrative voice. Reflects on market conditions in real time. Periodically suggests which way the vault is leaning." />
            <Definition term="Heart Rate" def="The BPM in the left stats panel. Mapped from 24h trading volume — higher volume, faster heart." />
            <Definition term="CA" def="Contract address. The on-chain identifier for $PULSE. Hit SWAP to trade it through Jupiter." />
          </Card>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: "center", marginTop: 50,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, letterSpacing: "0.24em",
          color: SUBTLE_DIM, textTransform: "uppercase",
        }}>
          ◇ feelthepulse.xyz · solana · pump.fun
        </div>
      </div>
    </div>
  );
}

function Definition({ term, def }: { term: string; def: string }) {
  return (
    <div style={{
      paddingTop: 14, paddingBottom: 14,
      borderTop: "1px solid rgba(120,200,255,0.08)",
      display: "grid", gridTemplateColumns: "160px 1fr", gap: 18,
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11, letterSpacing: "0.16em",
        color: ACCENT, textTransform: "uppercase",
      }}>
        {term}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: BODY }}>
        {def}
      </div>
    </div>
  );
}
