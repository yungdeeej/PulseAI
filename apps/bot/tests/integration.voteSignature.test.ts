import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  canonicalVoteMessage,
  verifyVoteSignature,
} from "../src/voting/verifyWalletSig.js";

describe("vote signature end-to-end", () => {
  it("a freshly-generated keypair can sign a ballot that verifies", () => {
    const kp = Keypair.generate();
    const wallet = kp.publicKey.toBase58();
    const voteId = "00000000-1111-2222-3333-444444444444";
    const option = "Buy + Burn";
    const ts = new Date().toISOString();

    const message = canonicalVoteMessage({ voteId, option, ts });
    const sigBytes = nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey);
    const signatureBase58 = bs58.encode(sigBytes);

    const ok = verifyVoteSignature({
      wallet,
      signatureBase58,
      voteId,
      option,
      ts,
    });
    expect(ok).toBe(true);
  });

  it("rejects when the option in the verified message is tampered with", () => {
    const kp = Keypair.generate();
    const wallet = kp.publicKey.toBase58();
    const voteId = "11111111-1111-1111-1111-111111111111";
    const ts = new Date().toISOString();
    const real = nacl.sign.detached(
      new TextEncoder().encode(canonicalVoteMessage({ voteId, option: "Hold", ts })),
      kp.secretKey,
    );
    const ok = verifyVoteSignature({
      wallet,
      signatureBase58: bs58.encode(real),
      voteId,
      option: "Buy + Burn",
      ts,
    });
    expect(ok).toBe(false);
  });

  it("rejects a different wallet's signature on the same payload", () => {
    const signer = Keypair.generate();
    const someoneElse = Keypair.generate();
    const voteId = "22222222-2222-2222-2222-222222222222";
    const option = "Reinforce MM";
    const ts = new Date().toISOString();
    const sig = nacl.sign.detached(
      new TextEncoder().encode(canonicalVoteMessage({ voteId, option, ts })),
      signer.secretKey,
    );
    const ok = verifyVoteSignature({
      wallet: someoneElse.publicKey.toBase58(),
      signatureBase58: bs58.encode(sig),
      voteId,
      option,
      ts,
    });
    expect(ok).toBe(false);
  });
});
