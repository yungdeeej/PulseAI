import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

function getRpcUrl(): string {
  if (env.HELIUS_API_KEY) {
    return `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
  }
  if (env.QUICKNODE_RPC_URL) {
    return env.QUICKNODE_RPC_URL;
  }
  return "https://api.mainnet-beta.solana.com";
}

/** Returns the SOL balance of a public key address, or null on failure. */
export async function fetchWalletSolBalance(address: string): Promise<number | null> {
  if (!address) return null;
  try {
    const res = await fetch(getRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [address, { commitment: "confirmed" }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "solana rpc getBalance failed");
      return null;
    }
    const data = (await res.json()) as { result?: { value?: number }; error?: unknown };
    if (data.error) {
      logger.warn({ error: data.error }, "solana rpc error");
      return null;
    }
    const lamports = data.result?.value ?? null;
    if (lamports === null) return null;
    return lamports / 1_000_000_000;
  } catch (err) {
    logger.warn({ err }, "solana rpc fetch error");
    return null;
  }
}
