import { useCallback, useEffect, useRef, useState } from "react";
import {
  createChatSession,
  fetchChatQuota,
  streamChat,
  type ChatQuota,
} from "../lib/api";
import { blobLive } from "../lib/blobLive";
import { color, motion, radius, space, type as typeT, liveAccent } from "../lib/design";
import SidePanel from "./ui/SidePanel";
import { Button, EmptyState, Pill } from "./ui/Primitives";

// ─── Minimal base58 ─────────────────────────────────────────────────────────
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

interface ChatMsg { role: "user" | "assistant"; content: string; }

const TOKEN_KEY = "pulse-chat-token";

export default function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState<ChatQuota | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
        token.current = null;
        localStorage.removeItem(TOKEN_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (open) {
      void refreshQuota();
      // Focus the input shortly after the panel slides in
      setTimeout(() => inputRef.current?.focus(), 350);
    }
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

  const exhausted = quota !== null && quota.remaining <= 0;

  return (
    <SidePanel open={open} onClose={onClose} title="◉  TALK TO PULSE" width={480}>
      {/* Top status row */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: `${space[3]}px 0`, marginBottom: space[3],
        borderBottom: `1px solid ${color.border}`,
      }}>
        <div style={{ display: "flex", gap: space[2], alignItems: "center" }}>
          {quota && <Pill tone={quota.tier === "VISITOR" ? "default" : "live"}>{quota.tier}</Pill>}
          {quota && (
            <span style={{
              fontFamily: typeT.mono, fontSize: typeT.size.micro,
              color: color.textDim, letterSpacing: typeT.letter.value,
            }}>{quota.remaining}/{quota.limit} LEFT</span>
          )}
        </div>
        {!signedIn && configured && (
          <Button size="sm" onClick={signIn}>SIGN IN</Button>
        )}
      </div>

      {/* Conversation */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: "auto", padding: `${space[2]}px 0`,
          display: "flex", flexDirection: "column", gap: space[3],
          minHeight: 360, maxHeight: "calc(100vh - 320px)",
        }}
      >
        {messages.length === 0 ? (
          <EmptyState>
            {configured ? (
              <>You are speaking with the consciousness of $PULSE.<br />
              <span style={{ color: color.textFaint }}>It knows its market, its memories, and — if you sign in — you.</span></>
            ) : (
              <>The consciousness is still waking up — chat isn't configured yet.</>
            )}
          </EmptyState>
        ) : (
          messages.map((m, i) => (
            <Bubble key={i} role={m.role} pending={busy && i === messages.length - 1 && !m.content}>
              {m.content || "…"}
            </Bubble>
          ))
        )}
      </div>

      {/* Error strip */}
      {error && (
        <div style={{
          marginTop: space[2], padding: `${space[2]}px ${space[3]}px`,
          fontFamily: typeT.mono, fontSize: typeT.size.micro,
          color: color.negative, letterSpacing: typeT.letter.value,
          background: "rgba(255,140,130,0.07)",
          border: `1px solid rgba(255,140,130,0.25)`,
          borderRadius: radius.sm,
        }}>{error}</div>
      )}

      {/* Composer */}
      <div style={{
        marginTop: space[3],
        padding: space[3],
        background: color.surface2,
        borderRadius: radius.md,
        border: `1px solid ${color.border}`,
        display: "flex", gap: space[2], alignItems: "flex-end",
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder={exhausted ? "out of messages today…" : "say something to the entity…"}
          disabled={busy || exhausted || !configured}
          maxLength={500}
          rows={1}
          style={{
            flex: 1, resize: "none", padding: `${space[2]}px ${space[2]}px`,
            background: "transparent", border: "none", outline: "none",
            color: color.text, fontFamily: typeT.mono, fontSize: typeT.size.body,
            lineHeight: 1.5, minHeight: 22, maxHeight: 120,
          }}
        />
        <Button onClick={() => void send()} disabled={busy || exhausted || !input.trim() || !configured} size="sm">
          {busy ? "…" : "SEND"}
        </Button>
      </div>
    </SidePanel>
  );
}

function Bubble({ role, children, pending }: { role: "user" | "assistant"; children: React.ReactNode; pending: boolean }) {
  const isUser = role === "user";
  return (
    <div style={{
      alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth: "86%",
      padding: `${space[2]}px ${space[3]}px`,
      borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
      background: isUser ? "rgba(40,70,110,0.55)" : liveAccent(0.10),
      border: `1px solid ${isUser ? color.border : liveAccent(0.25)}`,
      fontFamily: typeT.mono, fontSize: typeT.size.body,
      lineHeight: 1.55, color: color.text,
      whiteSpace: "pre-wrap", wordBreak: "break-word",
      animation: pending ? `pulseDot 1.5s ease-in-out infinite` : undefined,
      transition: `background ${motion.base}`,
    }}>
      {children}
    </div>
  );
}
