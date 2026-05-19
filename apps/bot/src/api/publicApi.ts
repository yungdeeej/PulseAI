import type { Express, Request, Response } from "express";
import { getActiveVote, getVote, insertVoteRecord, getHolderBalance, getWalletStatus, getStreak } from "../db/queries.js";
import { tallyVoteRecords } from "../db/queries.js";
import { verifyVoteSignature } from "../voting/verifyWalletSig.js";
import { submitTweet } from "../features/tweetMultiplier.js";
import { reinforcementCount } from "../db/queries.js";
import { convictionScore, type StatusFlag, type VoteOption } from "@pulse/shared";
import { daysBetween } from "../utils/timewindow.js";
import { logger } from "../utils/logger.js";
import { pool } from "../db/pool.js";

const VOTE_TS_TOLERANCE_MS = 10 * 60_000; // signed message must be ≤10 min old
const PROCESSED_SIGS = new Set<string>();
const PROCESSED_SIG_CAP = 5_000;

function rememberSig(sig: string) {
  PROCESSED_SIGS.add(sig);
  if (PROCESSED_SIGS.size > PROCESSED_SIG_CAP) {
    // Cheap eviction — drop the first entry.
    const first = PROCESSED_SIGS.values().next().value;
    if (first) PROCESSED_SIGS.delete(first);
  }
}

/**
 * Mount the public dashboard endpoints onto the existing webhook Express app.
 * These are the only endpoints exposed to untrusted callers; everything is
 * guarded by wallet-signed messages plus structural validation.
 */
export function mountPublicApi(app: Express): void {
  app.get("/votes/active", async (_req, res) => {
    const vote = await getActiveVote();
    if (!vote) return res.json({ vote: null });
    const tally = await tallyVoteRecords(vote.id);
    res.json({ vote, tally });
  });

  app.get("/votes/:id", async (req, res) => {
    const vote = await getVote(req.params.id!);
    if (!vote) return res.status(404).json({ error: "not found" });
    const tally = await tallyVoteRecords(vote.id);
    res.json({ vote, tally });
  });

  app.post("/votes", async (req: Request, res: Response) => {
    try {
      const { wallet, voteId, option, ts, signature } = req.body ?? {};
      if (typeof wallet !== "string" || typeof voteId !== "string" || typeof option !== "string" || typeof ts !== "string" || typeof signature !== "string") {
        return res.status(400).json({ error: "missing fields" });
      }
      if (PROCESSED_SIGS.has(signature)) {
        return res.status(409).json({ error: "duplicate signature" });
      }

      const tsMs = Date.parse(ts);
      if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > VOTE_TS_TOLERANCE_MS) {
        return res.status(400).json({ error: "ts out of range" });
      }

      const vote = await getVote(voteId);
      if (!vote) return res.status(404).json({ error: "vote not found" });
      if (vote.status !== "open") return res.status(409).json({ error: "vote closed" });
      if (new Date(vote.closes_at).getTime() <= Date.now()) {
        return res.status(409).json({ error: "vote already closed" });
      }
      const options = Array.isArray(vote.options) ? vote.options : [];
      if (!options.includes(option as VoteOption)) {
        return res.status(400).json({ error: "option not on ballot" });
      }

      const ok = verifyVoteSignature({
        wallet,
        signatureBase58: signature,
        voteId,
        option,
        ts,
      });
      if (!ok) return res.status(401).json({ error: "bad signature" });

      const weight = await computeWalletConvictionWeight(wallet);
      if (weight <= 0) return res.status(403).json({ error: "no conviction weight (do you hold $PULSE?)" });

      const record = await insertVoteRecord(voteId, wallet, option as VoteOption, weight, signature);
      rememberSig(signature);
      res.json({ ok: true, weight, record });
    } catch (err) {
      logger.warn({ err }, "vote submission failed");
      res.status(500).json({ error: "internal error" });
    }
  });

  app.post("/tweets", async (req: Request, res: Response) => {
    try {
      const { wallet, url } = req.body ?? {};
      if (typeof wallet !== "string" || typeof url !== "string") {
        return res.status(400).json({ error: "missing fields" });
      }
      const r = await submitTweet({ wallet, url });
      if (!r.ok) return res.status(400).json(r);
      res.json(r);
    } catch (err) {
      logger.warn({ err }, "tweet submission failed");
      res.status(500).json({ error: "internal error" });
    }
  });

  // Read-only helper: dashboard can compute a live preview of a wallet's vote weight.
  app.get("/wallets/:wallet/conviction", async (req, res) => {
    const wallet = req.params.wallet!;
    const weight = await computeWalletConvictionWeight(wallet);
    res.json({ wallet, weight });
  });
}

async function computeWalletConvictionWeight(wallet: string): Promise<number> {
  const balance = await getHolderBalance(wallet);
  if (!balance || Number(balance.balance) <= 0) return 0;
  const status = await getWalletStatus(wallet);
  const flags: StatusFlag[] = [];
  if (status?.pioneer) flags.push("PIONEER");
  if (status?.believer) flags.push("BELIEVER");
  if (status?.conviction) flags.push("CONVICTION");
  if (status?.ascendant) flags.push("ASCENDANT");
  const streak = await getStreak(wallet);
  const rCount = await reinforcementCount(wallet);
  const tweetActive = await walletHasActiveTweetBonus(wallet);
  return convictionScore({
    balance: Number(balance.balance),
    holdDays: daysBetween(balance.first_seen_at, new Date()),
    tierStreakDays: Number(streak?.current_days ?? 0),
    reinforcementCount: rCount,
    statusFlags: flags,
    tweetMultiplierActive: tweetActive,
  });
}

async function walletHasActiveTweetBonus(wallet: string): Promise<boolean> {
  const r = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM tweet_multipliers
       WHERE wallet = $1 AND status = 'active' AND expires_at > NOW()`,
    [wallet],
  );
  return Number(r.rows[0]?.c ?? 0) > 0;
}
