import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchActiveVote,
  fetchConviction,
  submitVote,
  type ActiveVote,
  type VoteTally,
} from "./api";

const POLL_MS = 30_000;

// ─── Minimal base58 encoder for Solana signatures ────────────────────────────
const B58_ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(bytes: Uint8Array): string {
  let num = 0n;
  for (const b of bytes) { num = num * 256n + BigInt(b); }
  let str = "";
  while (num > 0n) { str = B58_ALPHA[Number(num % 58n)]! + str; num /= 58n; }
  for (const b of bytes) { if (b !== 0) break; str = "1" + str; }
  return str;
}

// ─── Phantom / window.solana types ───────────────────────────────────────────
interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: { toBase58(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
  signMessage(msg: Uint8Array, enc: "utf8"): Promise<{ signature: Uint8Array }>;
}

function getSolana(): PhantomProvider | null {
  const w = window as unknown as { solana?: PhantomProvider };
  return w.solana ?? null;
}

// ─── Hook state ───────────────────────────────────────────────────────────────

export type WalletState =
  | "none"          // no wallet extension
  | "disconnected"  // wallet present but not connected
  | "connecting"    // in-flight connect
  | "connected";    // connected, address available

export type VoteSubmitState =
  | "idle"
  | "signing"
  | "submitting"
  | "success"
  | "error";

export interface VotingState {
  vote: ActiveVote | null;
  tally: VoteTally;
  loading: boolean;
  walletState: WalletState;
  walletAddress: string | null;
  conviction: number | null;
  myVote: string | null;
  submitState: VoteSubmitState;
  submitError: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  castVote: (option: string) => Promise<void>;
}

export function useVoting(): VotingState {
  const [vote, setVote] = useState<ActiveVote | null>(null);
  const [tally, setTally] = useState<VoteTally>({});
  const [loading, setLoading] = useState(true);
  const [walletState, setWalletState] = useState<WalletState>("none");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [conviction, setConviction] = useState<number | null>(null);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<VoteSubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const destroyed = useRef(false);

  // Detect wallet extension presence on mount
  useEffect(() => {
    const check = () => {
      if (getSolana()) setWalletState("disconnected");
    };
    check();
    // Phantom injects asynchronously; re-check after a short delay
    const t = setTimeout(check, 800);
    return () => clearTimeout(t);
  }, []);

  // Poll for active vote
  useEffect(() => {
    destroyed.current = false;
    const load = async () => {
      try {
        const data = await fetchActiveVote();
        if (!destroyed.current) {
          setVote(data.vote);
          setTally(data.tally ?? {});
          setLoading(false);
        }
      } catch {
        if (!destroyed.current) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { destroyed.current = true; clearInterval(timer); };
  }, []);

  // Fetch conviction whenever wallet connects
  useEffect(() => {
    if (!walletAddress) { setConviction(null); return; }
    fetchConviction(walletAddress).then((w) => {
      if (!destroyed.current) setConviction(w);
    }).catch(() => { if (!destroyed.current) setConviction(0); });
  }, [walletAddress]);

  const connectWallet = useCallback(async () => {
    const sol = getSolana();
    if (!sol) { window.open("https://phantom.app/", "_blank"); return; }
    setWalletState("connecting");
    try {
      const { publicKey } = await sol.connect();
      const addr = publicKey.toBase58();
      setWalletAddress(addr);
      setWalletState("connected");
    } catch {
      setWalletState("disconnected");
    }
  }, []);

  const disconnectWallet = useCallback(async () => {
    const sol = getSolana();
    try { await sol?.disconnect(); } catch { /* ignore */ }
    setWalletAddress(null);
    setConviction(null);
    setMyVote(null);
    setSubmitState("idle");
    setSubmitError(null);
    setWalletState("disconnected");
  }, []);

  const castVote = useCallback(async (option: string) => {
    if (!vote || !walletAddress) return;
    const sol = getSolana();
    if (!sol) return;
    setSubmitState("signing");
    setSubmitError(null);
    try {
      const ts = new Date().toISOString();
      const message = `$PULSE vote ${vote.id} option=${option} ts=${ts}`;
      const encoded = new TextEncoder().encode(message);
      const { signature: sigBytes } = await sol.signMessage(encoded, "utf8");
      const signature = encodeBase58(sigBytes);
      setSubmitState("submitting");
      const result = await submitVote({ wallet: walletAddress, voteId: vote.id, option, ts, signature });
      if (result.ok) {
        setMyVote(option);
        setSubmitState("success");
        // Refresh tally after a brief pause
        setTimeout(async () => {
          try {
            const fresh = await fetchActiveVote();
            if (!destroyed.current) { setVote(fresh.vote); setTally(fresh.tally ?? {}); }
          } catch { /* ignore */ }
        }, 1200);
      } else {
        setSubmitState("error");
        setSubmitError(result.error ?? "Vote failed");
      }
    } catch (err: unknown) {
      setSubmitState("error");
      setSubmitError(err instanceof Error ? err.message : "Signing failed");
    }
  }, [vote, walletAddress]);

  return {
    vote, tally, loading,
    walletState, walletAddress, conviction,
    myVote, submitState, submitError,
    connectWallet, disconnectWallet, castVote,
  };
}
