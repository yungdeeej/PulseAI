import { Connection } from "@solana/web3.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";

let primary: Connection | null = null;
let fallback: Connection | null = null;

export function heliusRpcUrl(): string {
  return `https://${env.NETWORK === "devnet" ? "devnet" : "mainnet"}.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
}

export function primaryConnection(): Connection {
  if (!primary) primary = new Connection(heliusRpcUrl(), "confirmed");
  return primary;
}

export function fallbackConnection(): Connection | null {
  if (fallback) return fallback;
  if (!env.QUICKNODE_RPC_URL) return null;
  fallback = new Connection(env.QUICKNODE_RPC_URL, "confirmed");
  return fallback;
}

/** Run a Solana RPC call on Helius, falling back to QuickNode on persistent failure. */
export async function withRpc<T>(fn: (c: Connection) => Promise<T>): Promise<T> {
  try {
    return await retry(() => fn(primaryConnection()), { label: "helius" });
  } catch (err) {
    const f = fallbackConnection();
    if (!f) throw err;
    logger.warn({ err }, "primary RPC exhausted; falling back to QuickNode");
    return retry(() => fn(f), { label: "quicknode" });
  }
}

/** Fetch all SPL token accounts for the $PULSE mint. */
export async function getTokenHolders(): Promise<{ owner: string; amount: number }[]> {
  const mint = env.PULSE_MINT_ADDRESS;
  if (!mint) {
    logger.warn("PULSE_MINT_ADDRESS unset; returning empty holder list");
    return [];
  }
  const url = heliusRpcUrl();
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTokenAccounts",
    params: { mint },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`getTokenAccounts ${res.status}`);
  const data = (await res.json()) as {
    result?: { token_accounts?: { owner: string; amount: string | number }[] };
  };
  const accs = data.result?.token_accounts ?? [];
  const decimals = Number(env.PULSE_DECIMALS ?? 6);
  return accs.map((a) => ({
    owner: a.owner,
    amount: Number(a.amount) / 10 ** decimals,
  }));
}
