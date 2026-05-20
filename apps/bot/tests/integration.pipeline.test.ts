import { describe, it, expect, beforeEach, vi } from "vitest";

// ----------------------------------------------------------------
// Mock the DB layer so the pipeline can be exercised without Postgres.
// We mount minimal in-memory tables to back the queries the pipeline uses.
// ----------------------------------------------------------------

interface FakeState {
  tokenState: {
    price_usd: number;
    market_cap_usd: number;
    current_tier: string;
    holder_count: number;
    trades_per_hour: number;
    bpm: number;
    volume_24h_usd: number;
  };
  botConfig: { paused: boolean; volume_gen_enabled: boolean };
  vaults: Record<string, { kind: string; address: string; balance_sol: number; balance_pulse: number }>;
  trades: { signature: string; wallet: string; side: string; sol_amount: number; pulse_amount: number; price_usd: number }[];
  holders: Map<string, { wallet: string; balance: number; first_seen_at: Date; updated_at: Date }>;
  tierHistory: { from_tier: number | null; to_tier: number; market_cap_usd: number }[];
  activeVote: { id: string; tier_id: number; options: string[]; decision_pool_sol: number; opens_at: Date; closes_at: Date; status: string } | null;
  snapshots: { tier: number; wallet: string; balance: number; balance_usd: number }[];
  walletStatus: Map<string, Record<string, boolean>>;
  activity: { kind: string; summary: string; payload: unknown }[];
  reinforcementLog: { defense_id: string; wallet: string; sol_spent: number }[];
  streaks: Map<string, { tier_id: number; current_days: number }>;
  defenseRows: { id: string; triggered_at: Date; reinforcement_window_ends_at: Date }[];
}

const state: FakeState = {} as FakeState;

function reset() {
  state.tokenState = {
    price_usd: 0,
    market_cap_usd: 0,
    current_tier: "DISCOVERY",
    holder_count: 0,
    trades_per_hour: 0,
    bpm: 0,
    volume_24h_usd: 0,
  };
  state.botConfig = {
    paused: false,
    volume_gen_enabled: false,
  };
  state.vaults = {
    DECISION: { kind: "DECISION", address: "decision1111", balance_sol: 5, balance_pulse: 0 },
  };
  state.trades = [];
  state.holders = new Map();
  state.tierHistory = [];
  state.activeVote = null;
  state.snapshots = [];
  state.walletStatus = new Map();
  state.activity = [];
  state.reinforcementLog = [];
  state.streaks = new Map();
  state.defenseRows = [];
}

const TIER_ORD = ["DISCOVERY", "IGNITION", "MOMENTUM", "CONVICTION", "ASCENSION"];

vi.mock("../src/db/queries.js", () => ({
  getTokenState: async () => state.tokenState,
  patchTokenState: async (p: Record<string, unknown>) => {
    Object.assign(state.tokenState, p);
  },
  getBotConfig: async () => state.botConfig,
  patchBotConfig: async (p: Record<string, unknown>) => {
    Object.assign(state.botConfig, p);
  },
  getVault: async (kind: string) => state.vaults[kind] ?? null,
  listVaults: async () => Object.values(state.vaults),
  tryReserveDailyBudget: async () => true,
  insertPrice: async () => {},
  pricesInWindow: async () => [],
  insertTrade: async (t: { signature: string; wallet: string; side: string; sol_amount?: number; solAmount?: number; pulse_amount?: number; pulseAmount?: number; price_usd?: number; priceUsd?: number }) => {
    if (state.trades.find((x) => x.signature === t.signature)) return null;
    const row = {
      signature: t.signature,
      wallet: t.wallet,
      side: t.side,
      sol_amount: Number((t as { solAmount?: number }).solAmount ?? t.sol_amount ?? 0),
      pulse_amount: Number((t as { pulseAmount?: number }).pulseAmount ?? t.pulse_amount ?? 0),
      price_usd: Number((t as { priceUsd?: number }).priceUsd ?? t.price_usd ?? 0),
    };
    state.trades.push(row);
    return row;
  },
  tradesPerHour: async () => state.trades.length,
  volumeUsd24h: async () => state.trades.reduce((s, t) => s + t.pulse_amount * t.price_usd, 0),
  upsertHolderTrade: async (wallet: string, delta: number, observedAt: Date) => {
    const existing = state.holders.get(wallet);
    if (existing) {
      existing.balance = Math.max(0, existing.balance + delta);
      existing.updated_at = observedAt;
      return existing;
    }
    const row = { wallet, balance: Math.max(0, delta), first_seen_at: observedAt, updated_at: observedAt };
    state.holders.set(wallet, row);
    return row;
  },
  getHolderBalance: async (w: string) => state.holders.get(w) ?? null,
  countActiveHolders: async () => [...state.holders.values()].filter((h) => h.balance > 0).length,
  insertTierTransition: async (from: number | null, to: number, mcap: number) => {
    const row = { from_tier: from, to_tier: to, market_cap_usd: mcap };
    state.tierHistory.push(row);
    return row;
  },
  lastTierTransition: async () => {
    const last = state.tierHistory[state.tierHistory.length - 1];
    if (!last) return null;
    return { ...last, to_tier: TIER_ORD[last.to_tier] };
  },
  openVoteRow: async (tier: number, options: string[], poolSol: number, closesAt: Date) => {
    state.activeVote = {
      id: "vote-test-1",
      tier_id: tier,
      options,
      decision_pool_sol: poolSol,
      opens_at: new Date(),
      closes_at: closesAt,
      status: "open",
    };
    return state.activeVote;
  },
  getActiveVote: async () => state.activeVote,
  insertSnapshot: async (tier: number, rows: { wallet: string; balance: number; balance_usd: number }[]) => {
    for (const r of rows) state.snapshots.push({ tier, ...r });
    return rows.length;
  },
  flagWalletStatus: async (wallet: string, flag: string) => {
    const s = state.walletStatus.get(wallet) ?? {};
    s[flag] = true;
    state.walletStatus.set(wallet, s);
  },
  getWalletStatus: async (wallet: string) => state.walletStatus.get(wallet) ?? null,
  getStreak: async (wallet: string) => state.streaks.get(wallet) ?? null,
  upsertStreak: async (wallet: string, tier: number, days: number) => {
    state.streaks.set(wallet, { tier_id: tier, current_days: days });
  },
  breakStreak: async (wallet: string) => {
    const s = state.streaks.get(wallet);
    if (s) s.current_days = 0;
  },
  reinforcementCount: async (wallet: string) =>
    state.reinforcementLog.filter((r) => r.wallet === wallet).length,
  logReinforcement: async (defenseId: string, wallet: string, sol: number) => {
    state.reinforcementLog.push({ defense_id: defenseId, wallet, sol_spent: sol });
  },
  activeReinforcementWindow: async () => {
    const d = state.defenseRows.find((d) => d.reinforcement_window_ends_at.getTime() > Date.now());
    return d ?? null;
  },
  logActivity: async (kind: string, summary: string, payload: unknown = {}) => {
    state.activity.push({ kind, summary, payload });
    return { id: "act-" + state.activity.length };
  },
  updateVaultBalances: async () => {},
}));

vi.mock("../src/db/pool.js", () => ({
  pool: {
    query: async (sql: string) => {
      // Only the bounty evaluator hits the pool directly. Return empty for the test.
      if (/FROM bounties/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/FROM holder_balances/i.test(sql)) {
        const rows = [...state.holders.values()].map((h) => ({
          wallet: h.wallet,
          balance: h.balance,
          first_seen_at: h.first_seen_at,
        }));
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
    end: async () => {},
  },
  query: async () => [],
  queryOne: async () => null,
  withTx: async <T>(fn: () => Promise<T>) => fn(),
}));

vi.mock("../src/integrations/telegram.js", () => ({
  postTelegram: async () => true,
}));

beforeEach(() => {
  reset();
  process.env.PULSE_TOTAL_SUPPLY = "1000000000";
});

describe("trade → tier → snapshot → vote pipeline", () => {
  it("crossing IGNITION opens a vote and snapshots eligible wallets", async () => {
    state.tokenState.price_usd = 0.00006; // mcap ~ $60K (still DISCOVERY)
    state.tokenState.market_cap_usd = 60_000;
    state.tokenState.current_tier = "DISCOVERY";

    // Seed a wallet that holds enough to qualify for the Pioneer snapshot
    // (≥ $50K USD at the post-trade price). $50K / 0.00007 ≈ 715M tokens.
    state.holders.set("PioneerWallet", {
      wallet: "PioneerWallet",
      balance: 1_000_000_000,
      first_seen_at: new Date("2026-01-01"),
      updated_at: new Date(),
    });

    const { processTradeEvent } = await import("../src/monitors/tradeIngest.js");

    // A buy that pushes the implied per-token price above $0.00007 (= $70K mcap).
    await processTradeEvent({
      signature: "pipeline-sig-1",
      wallet: "FreshBuyer",
      side: "BUY",
      solAmount: 5,
      pulseAmount: 35_700_000, // implies ~$0.000021 per token from this single trade
      observedAt: new Date(),
    });
    // Now bump cursorMcap by directly setting price_usd ≥ $0.00007 via a second trade.
    state.tokenState.price_usd = 0.0001;
    state.tokenState.market_cap_usd = 100_000;

    // Re-evaluate explicitly to simulate a price-tracker sample at the new mcap.
    const { evaluateTierTransition } = await import("../src/actions/tier.js");
    await evaluateTierTransition(100_000);

    expect(state.tierHistory.length).toBe(1);
    expect(state.tierHistory[0]?.to_tier).toBe(1);

    expect(state.activeVote).not.toBeNull();
    expect(state.activeVote?.status).toBe("open");
    expect(state.activeVote?.tier_id).toBe(1);
    expect(state.activeVote?.options).toEqual(["Defend Chart", "Split Rewards"]);

    // Snapshot captured the qualifying holder.
    expect(state.snapshots.length).toBeGreaterThanOrEqual(1);
    expect(state.snapshots.find((s) => s.wallet === "PioneerWallet")).toBeTruthy();

    // Wallet flagged as Pioneer.
    expect(state.walletStatus.get("PioneerWallet")?.pioneer).toBe(true);

    // Activity log has a TIER_UNLOCK row.
    const tierEvent = state.activity.find((a) => a.kind === "TIER_UNLOCK");
    expect(tierEvent).toBeTruthy();
    expect(tierEvent?.summary).toMatch(/IGNITION/);

    // bot_config flags flipped per tier.
    expect(state.botConfig.volume_gen_enabled).toBe(true);
  });

  it("a trade with a duplicate signature is a no-op", async () => {
    const { processTradeEvent } = await import("../src/monitors/tradeIngest.js");
    const event = {
      signature: "dedup-sig-1",
      wallet: "WalletA",
      side: "BUY" as const,
      solAmount: 1,
      pulseAmount: 100,
      observedAt: new Date(),
    };
    await processTradeEvent(event);
    await processTradeEvent(event);
    expect(state.trades.length).toBe(1);
  });

  it("the pipeline does not record a downward tier change", async () => {
    state.tokenState.current_tier = "MOMENTUM";
    const { evaluateTierTransition } = await import("../src/actions/tier.js");
    await evaluateTierTransition(80_000); // would be IGNITION
    expect(state.tierHistory.length).toBe(0);
    expect(state.tokenState.current_tier).toBe("MOMENTUM");
  });
});
