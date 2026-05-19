import { VersionedTransaction } from "@solana/web3.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { SLIPPAGE_BPS } from "../config/constants.js";
import { retry } from "../utils/retry.js";

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

export interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  routePlan: unknown[];
}

export async function getQuote(args: {
  inputMint: string;
  outputMint: string;
  amountAtomic: bigint | string;
  slippageBps?: number;
}): Promise<QuoteResponse> {
  const url = new URL(`${env.JUPITER_API_URL}/quote`);
  url.searchParams.set("inputMint", args.inputMint);
  url.searchParams.set("outputMint", args.outputMint);
  url.searchParams.set("amount", String(args.amountAtomic));
  url.searchParams.set("slippageBps", String(args.slippageBps ?? SLIPPAGE_BPS));
  return retry(
    async () => {
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Jupiter quote ${res.status}: ${await res.text()}`);
      return (await res.json()) as QuoteResponse;
    },
    { label: "jupiter:quote" },
  );
}

export interface SwapTxResponse {
  swapTransaction: string; // base64 versioned tx
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

export async function buildSwapTx(args: {
  quote: QuoteResponse;
  userPublicKey: string;
  prioritizationFeeLamports?: number;
  wrapUnwrapSol?: boolean;
}): Promise<{ tx: VersionedTransaction; lastValidBlockHeight: number }> {
  const body = {
    quoteResponse: args.quote,
    userPublicKey: args.userPublicKey,
    wrapAndUnwrapSol: args.wrapUnwrapSol ?? true,
    prioritizationFeeLamports: args.prioritizationFeeLamports,
    asLegacyTransaction: false,
    dynamicComputeUnitLimit: true,
  };
  const data = await retry(
    async () => {
      const res = await fetch(`${env.JUPITER_API_URL}/swap`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Jupiter swap ${res.status}: ${await res.text()}`);
      return (await res.json()) as SwapTxResponse;
    },
    { label: "jupiter:swap" },
  );
  const raw = Buffer.from(data.swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(raw);
  logger.debug({ slot: data.lastValidBlockHeight }, "built swap tx");
  return { tx, lastValidBlockHeight: data.lastValidBlockHeight };
}
