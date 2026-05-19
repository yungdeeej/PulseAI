import { VersionedTransaction, Keypair, SystemProgram, TransactionMessage, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { primaryConnection } from "./helius.js";

// Tip accounts published by Jito; rotate across them per bundle for fairness.
const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pivKeVBBjNs1d6sQUgsj",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

export function randomJitoTipAccount(): PublicKey {
  const acc = JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]!;
  return new PublicKey(acc);
}

export async function buildTipTx(
  payer: Keypair,
  tipLamports: number,
): Promise<VersionedTransaction> {
  const conn = primaryConnection();
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const ix = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: randomJitoTipAccount(),
    lamports: tipLamports,
  });
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([payer]);
  return tx;
}

/**
 * Submit a Jito bundle of base58-encoded versioned transactions.
 * Returns the bundle UUID on success.
 */
export async function submitBundle(
  signedTxs: VersionedTransaction[],
): Promise<string> {
  const encoded = signedTxs.map((t) => bs58.encode(t.serialize()));
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "sendBundle",
    params: [encoded],
  };
  const res = await fetch(`${env.JITO_BLOCK_ENGINE_URL}/api/v1/bundles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jito sendBundle ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { result?: string; error?: { message: string } };
  if (data.error) throw new Error(`Jito error: ${data.error.message}`);
  if (!data.result) throw new Error("Jito returned no bundle id");
  logger.info({ bundleId: data.result }, "jito bundle submitted");
  return data.result;
}
