import { useCallback, useEffect, useRef, useState } from "react";
import {
  createChatSession,
  fetchChatQuota,
  streamChat,
  type ChatQuota,
} from "../lib/api";
import { blobLive } from "../lib/blobLive";

// ─── Minimal base58 (same as useVoting) ──────────────────────────────────────
const B58_ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(bytes: Uint8Array): string {
  let num = 0n;
  for (const b of bytes) { num = num * 256n + BigInt(b); }
  let str = "";
  while (num > 0n) { str = B58_ALPHA[Number(num % 58n)]! + str; num /= 58n; }
  for (const b of bytes) { if (b !== 0) break; str = "1" + str; }
  return str;
}

interface PhantomProvider {
  publicKey: { toBase58(): string } | null;
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  signMessage(msg: Uint8Array, enc: "utf8"): Promise<{ signature: Uint8Array }>;
}
function getSolana(): PhantomProvider | null {
  const w = window as unknown as { solana?: PhantomProvider };
  return w.solana ?? null;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const TOKEN_KEY = "pulse-chat-token";

const mono = "'JetBrains Mono', monospace";

export default function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState<ChatQuota | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const token = useRef<string | null>(
    typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null,
  );

  const refreshQuota = useCallback(async () => {
    const q = await fetchChatQuota(token.current);
    if (q) {
      setQuota(q.quota);
      setSignedIn(q.signed_in);
      setConfigured(q.configured);
      if (token.current && !q.signed_in) {
        // expired session
        token.current = null;
        localStorage.removeItem(TOKEN_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (open) void refreshQuota();
  }, [open, refreshQuota]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const signIn = useCallback(async () => {
    const sol = getSolana();
    if (!sol) { window.open("https://phantom.app/", "_blank"); return; }
    setError(null);
    try {
      const { publicKey } = await sol.connect();
      const wallet = publicKey.toBase58();
      const ts = new Date().toISOString();
      const message = `$PULSE chat session ts=${ts}`;
      const { signature: sigBytes } = await sol.signMessage(new TextEncoder().encode(message), "utf8");
      const result = await createChatSession({ wallet, ts, signature: encodeBase58(sigBytes) });
      if (result.ok && result.token) {
        token.current = result.token;
        localStorage.setItem(TOKEN_KEY, result.token);
        await refreshQuota();
      } else {
        setError(result.error ?? "sign-in failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "sign-in failed");
    }
  }, [refreshQuota]);

  const send = useCallback(async () => {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setError(null);
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "" }]);
    // The blob "listens" while it thinks
    blobLive.entryPulse = Math.max(blobLive.entryPulse, 0.8);

    const result = await streamChat({
      message,
      token: token.current,
      onDelta: (text) => {
        setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + text };
          }
          return next;
        });
      },
    });

    setBusy(false);
    if (!result.ok) {
      setMessages((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && !last.content) {
          next[next.length - 1] = { ...last, content: result.error ?? "…my thoughts scattered. Try again." };
        }
        return next;
      });
    }
    if (result.quota) setQuota(result.quota);
  }, [input, busy]);

  if (!open) return null;

  const accent = `rgb(${blobLive.bodyR | 0},${blobLive.bodyG | 0},${blobLive.bodyB | 0})`;
  const exhausted = quota !== null && quota.remaining <= 0;

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
          width: "min(560px, 94vw)", height: "min(640px, 86vh)",
          display: "flex", flexDirection: "column",
          background: "linear-gradient(180deg, rgba(14,20,36,0.96), rgba(6,9,18,0.98))",
          border: "1px solid rgba(120,200,255,0.22)", borderRadius: 16,
          boxShadow: `0 0 60px -18px ${accent}`,
          overflow: "hidden", animation: "panelIn 0.25s ease",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: "1px solid rgba(120,200,255,0.12)",
        }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.3em", color: "#cfe6ff" }}>
            ◉ TALK TO PULSE
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {quota && (
              <span style={{ fontFamily: mono, fontSize: 9, color: "rgba(150,200,240,0.65)", letterSpacing: "0.12em" }}>
                {quota.tier} · {quota.remaining}/{quota.limit} LEFT
              </span>
            )}
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", color: "rgba(150,200,240,0.7)",
                fontFamily: mono, fontSize: 14, cursor: "pointer",
              }}
              aria-label="Close chat"
            >✕</button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.length === 0 && (
            <div style={{ fontFamily: mono, fontSize: 11, lineHeight: 1.7, color: "rgba(150,200,240,0.55)", margin: "auto", textAlign: "center", maxWidth: 380 }}>
              {configured
                ? <>You are talking to the consciousness of $PULSE.<br />It knows its market, its memories, and — if you sign in — <em>you</em>.<br /><br />Visitors get 3 messages a day. Holders get more.</>
                : <>The consciousness is still waking up — chat isn't configured yet.</>}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "82%",
              padding: "10px 13px",
              borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
              background: m.role === "user"
                ? "linear-gradient(180deg, rgba(40,70,110,0.55), rgba(25,45,80,0.55))"
                : "linear-gradient(180deg, rgba(30,26,60,0.6), rgba(18,16,40,0.6))",
              border: m.role === "user"
                ? "1px solid rgba(120,200,255,0.2)"
                : `1px solid rgba(190,160,255,0.25)`,
              fontFamily: mono, fontSize: 11.5, lineHeight: 1.65,
              color: m.role === "user" ? "#cfe6ff" : "#e6dcff",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {m.content || (busy && i === messages.length - 1 ? "…" : m.content)}
            </div>
          ))}
        </div>

        {/* Sign-in nudge / error */}
        {(error || (!signedIn && configured)) && (
          <div style={{
            padding: "8px 18px", display: "flex", alignItems: "center", justifyContent: "space-between",
            borderTop: "1px solid rgba(120,200,255,0.08)",
          }}>
            <span style={{ fontFamily: mono, fontSize: 9, color: error ? "rgb(255,150,130)" : "rgba(150,200,240,0.5)", letterSpacing: "0.1em" }}>
              {error ?? "Sign in with your wallet — holders unlock more of the entity"}
            </span>
            {!signedIn && (
              <button
                onClick={signIn}
                style={{
                  fontFamily: mono, fontSize: 9, letterSpacing: "0.18em", cursor: "pointer",
                  padding: "6px 12px", borderRadius: 7, color: "#0a0f1c",
                  background: accent, border: "none", fontWeight: 700,
                }}
              >SIGN IN</button>
            )}
          </div>
        )}

        {/* Input */}
        <div style={{
          display: "flex", gap: 10, padding: "12px 18px 16px",
          borderTop: "1px solid rgba(120,200,255,0.12)",
        }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={exhausted ? "out of messages today…" : "say something to the entity…"}
            disabled={busy || exhausted || !configured}
            maxLength={500}
            style={{
              flex: 1, padding: "11px 14px", borderRadius: 9,
              background: "rgba(10,16,30,0.85)", border: "1px solid rgba(120,200,255,0.18)",
              color: "#cfe6ff", fontFamily: mono, fontSize: 11.5, outline: "none",
            }}
          />
          <button
            onClick={() => void send()}
            disabled={busy || exhausted || !input.trim() || !configured}
            style={{
              fontFamily: mono, fontSize: 10, letterSpacing: "0.2em",
              padding: "0 18px", borderRadius: 9, cursor: busy ? "wait" : "pointer",
              color: "#0a0f1c", background: busy ? "rgba(120,200,255,0.35)" : accent,
              border: "none", fontWeight: 700,
              opacity: exhausted || !input.trim() ? 0.45 : 1,
            }}
          >{busy ? "…" : "SEND"}</button>
        </div>
      </div>
    </div>
  );
}
