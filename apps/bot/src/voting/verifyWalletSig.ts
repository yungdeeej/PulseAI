import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

/**
 * The dashboard prompts the user to sign a canonical message of the form:
 *   $PULSE vote {voteId} option={option} ts={iso8601}
 *
 * The signature is base58 of nacl.sign.detached(messageBytes, secretKey).
 * Verification requires the wallet public key in base58 form.
 */
export function canonicalVoteMessage(args: {
  voteId: string;
  option: string;
  ts: string;
}): string {
  return `$PULSE vote ${args.voteId} option=${args.option} ts=${args.ts}`;
}

export function verifyVoteSignature(args: {
  wallet: string;
  signatureBase58: string;
  voteId: string;
  option: string;
  ts: string;
}): boolean {
  try {
    const pub = new PublicKey(args.wallet).toBytes();
    const sig = bs58.decode(args.signatureBase58);
    const msg = new TextEncoder().encode(canonicalVoteMessage(args));
    return nacl.sign.detached.verify(msg, sig, pub);
  } catch {
    return false;
  }
}
