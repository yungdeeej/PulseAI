import {
  TransactionMessage,
  VersionedTransaction,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  createBurnInstruction,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { primaryConnection } from "../integrations/helius.js";
import { logger } from "./logger.js";

/**
 * Burn `amountAtomic` of `mint` held by `payer`. Returns the tx signature.
 * The amount is in raw token units (i.e. UI amount × 10**decimals).
 */
export async function burnTokens(args: {
  payer: Keypair;
  mint: PublicKey;
  amountAtomic: bigint;
}): Promise<string> {
  const conn = primaryConnection();
  const ata = await getAssociatedTokenAddress(args.mint, args.payer.publicKey);
  // Make sure the ATA exists; if it does, this is a no-op.
  await getOrCreateAssociatedTokenAccount(conn, args.payer, args.mint, args.payer.publicKey);

  const burnIx = createBurnInstruction(ata, args.mint, args.payer.publicKey, args.amountAtomic);
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: args.payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [burnIx],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([args.payer]);

  const sig = await conn.sendTransaction(tx, { maxRetries: 3 });
  await conn.confirmTransaction(sig, "confirmed");
  logger.info({ sig, amount: args.amountAtomic.toString() }, "spl burn confirmed");
  return sig;
}
