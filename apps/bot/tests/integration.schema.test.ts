import { describe, it, expect } from "vitest";
import { newDb } from "pg-mem";

/**
 * pg-mem does not implement every Postgres feature we use in production
 * (DO blocks, plpgsql triggers, pgcrypto extension). To still validate that
 * the schema is shaped sensibly we run a minimal bootstrap that matches the
 * production schema's column names, types, and key constraints, then exercise
 * the queries the bot performs hot-path.
 */
function bootstrap() {
  const db = newDb();
  db.public.none(`
    CREATE TABLE token_state (
      id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      price_usd numeric NOT NULL DEFAULT 0,
      price_sol numeric NOT NULL DEFAULT 0,
      market_cap_usd numeric NOT NULL DEFAULT 0,
      total_supply numeric NOT NULL DEFAULT 1000000000,
      holder_count integer NOT NULL DEFAULT 0,
      volume_24h_usd numeric NOT NULL DEFAULT 0,
      trades_per_hour integer NOT NULL DEFAULT 0,
      current_tier text NOT NULL DEFAULT 'DISCOVERY',
      bpm integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO token_state (id) VALUES (1);

    CREATE TABLE bot_config (
      id smallint PRIMARY KEY DEFAULT 1,
      paused boolean NOT NULL DEFAULT false,
      dry_run boolean NOT NULL DEFAULT true,
      volume_gen_enabled boolean NOT NULL DEFAULT false,
      max_daily_sol_deployed numeric NOT NULL DEFAULT 50,
      daily_sol_deployed numeric NOT NULL DEFAULT 0,
      daily_window_started_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO bot_config (id) VALUES (1);

    CREATE TABLE trade_tape (
      id serial PRIMARY KEY,
      signature text NOT NULL UNIQUE,
      wallet text NOT NULL,
      side text NOT NULL,
      sol_amount numeric NOT NULL,
      pulse_amount numeric NOT NULL,
      price_usd numeric NOT NULL,
      bot_initiated boolean NOT NULL DEFAULT false,
      observed_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE holder_balances (
      wallet text PRIMARY KEY,
      balance numeric NOT NULL DEFAULT 0,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE tier_history (
      id serial PRIMARY KEY,
      from_tier text,
      to_tier text NOT NULL,
      market_cap_usd numeric NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  return db;
}

describe("schema bootstrap (pg-mem)", () => {
  it("singletons exist and enforce id=1", () => {
    const db = bootstrap();
    const r = db.public.many("SELECT id FROM token_state");
    expect(r.length).toBe(1);
    expect(r[0]?.id).toBe(1);
    expect(() => db.public.none("INSERT INTO token_state (id) VALUES (2)")).toThrow();
  });

  it("trade_tape rejects duplicate signatures", () => {
    const db = bootstrap();
    db.public.none(`
      INSERT INTO trade_tape (signature, wallet, side, sol_amount, pulse_amount, price_usd)
      VALUES ('sig-1', 'WalletA', 'BUY', 1, 1000, 0.001)
    `);
    expect(() =>
      db.public.none(`
        INSERT INTO trade_tape (signature, wallet, side, sol_amount, pulse_amount, price_usd)
        VALUES ('sig-1', 'WalletB', 'SELL', 1, 1000, 0.001)
      `),
    ).toThrow();
  });

  it("holder_balances upsert preserves first_seen_at", () => {
    const db = bootstrap();
    db.public.none(
      "INSERT INTO holder_balances (wallet, balance, first_seen_at, updated_at) VALUES ('A', 100, '2026-01-01', '2026-01-01')",
    );
    db.public.none(`
      INSERT INTO holder_balances (wallet, balance, first_seen_at, updated_at)
      VALUES ('A', 200, '2026-02-01', '2026-02-01')
      ON CONFLICT (wallet) DO UPDATE
        SET balance = holder_balances.balance + EXCLUDED.balance,
            updated_at = EXCLUDED.updated_at
    `);
    const r = db.public.one(
      "SELECT balance, first_seen_at FROM holder_balances WHERE wallet = 'A'",
    ) as { balance: number; first_seen_at: Date };
    expect(Number(r.balance)).toBe(300);
    expect(new Date(r.first_seen_at).getUTCFullYear()).toBe(2026);
    expect(new Date(r.first_seen_at).getUTCMonth()).toBe(0); // January preserved
  });

  it("tier_history records every crossing in order", () => {
    const db = bootstrap();
    db.public.none(`
      INSERT INTO tier_history (from_tier, to_tier, market_cap_usd) VALUES
        ('DISCOVERY','IGNITION', 70000),
        ('IGNITION','MOMENTUM', 320000),
        ('MOMENTUM','CONVICTION', 1100000)
    `);
    const r = db.public.many(
      "SELECT to_tier FROM tier_history ORDER BY occurred_at ASC",
    );
    expect(r.map((x) => (x as { to_tier: string }).to_tier)).toEqual([
      "IGNITION",
      "MOMENTUM",
      "CONVICTION",
    ]);
  });
});
