import { z } from "zod";

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const numeric = (def?: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return def;
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isNaN(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "expected a number" });
        return z.NEVER;
      }
      return n;
    });

const schema = z.object({
  NETWORK: z.enum(["mainnet-beta", "devnet"]).default("mainnet-beta"),

  HELIUS_API_KEY: z.string().optional(),
  QUICKNODE_RPC_URL: z.string().url().optional(),

  PULSE_MINT_ADDRESS: z.string().optional(),
  CREATOR_WALLET_ADDRESS: z.string().optional(),
  PULSE_TOTAL_SUPPLY: numeric(1_000_000_000),
  PULSE_DECIMALS: numeric(6),

  BOT_WALLET_PRIVATE_KEY: z.string().optional(),
  BURN_VAULT_PRIVATE_KEY: z.string().optional(),

  DECISION_VAULT_ADDRESS: z.string().optional(),

  JUPITER_API_URL: z.string().url().default("https://quote-api.jup.ag/v6"),
  JITO_AUTH_KEYPAIR: z.string().optional(),
  JITO_BLOCK_ENGINE_URL: z.string().url().default("https://mainnet.block-engine.jito.wtf"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL required (Replit Hosted Postgres)"),
  DATABASE_URL_READONLY: z.string().optional(),

  BIRDEYE_API_KEY: z.string().optional(),

  // Twitter is read-only (free Bearer-token tier) — used by the tweet-
  // multiplier system to fetch tweet metrics. We do not post tweets.
  TWITTER_BEARER_TOKEN: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHANNEL_ID: z.string().optional(),

  BETTERSTACK_HEARTBEAT_URL: z.string().url().optional(),

  PORT: numeric(3001),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  DRY_RUN: boolish.default(true),
  DRY_RUN_TIME_SCALE: numeric(1),
  MAX_DAILY_SOL_DEPLOYED: numeric(50),
  BOT_HOT_WALLET_MAX_BALANCE_SOL: numeric(5),
  HELIUS_WEBHOOK_SECRET: z.string().optional(),
  // Required to call any /admin/* endpoint. Generate with `openssl rand -hex 32`.
  ADMIN_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const env = new Proxy({} as Env, {
  get(_t, prop) {
    return loadEnv()[prop as keyof Env];
  },
});
