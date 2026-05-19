import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";

export interface BirdeyePrice {
  price_usd: number;
  price_sol: number;
  market_cap_usd: number;
}

const BIRDEYE_BASE = "https://public-api.birdeye.so";

export async function fetchBirdeyePrice(): Promise<BirdeyePrice | null> {
  const mint = env.PULSE_MINT_ADDRESS;
  if (!mint) return null;
  if (!env.BIRDEYE_API_KEY) {
    logger.debug("BIRDEYE_API_KEY missing; skipping birdeye lookup");
    return null;
  }
  return retry(
    async () => {
      const res = await fetch(
        `${BIRDEYE_BASE}/defi/price?address=${mint}&include_liquidity=true`,
        {
          headers: {
            "x-chain": "solana",
            "X-API-KEY": env.BIRDEYE_API_KEY!,
            "accept": "application/json",
          },
        },
      );
      if (!res.ok) {
        logger.warn({ status: res.status }, "birdeye price call failed");
        return null;
      }
      const data = (await res.json()) as {
        data?: { value: number; priceInNative?: number; liquidity?: number };
      };
      if (!data.data?.value) return null;
      const supply = Number(env.PULSE_TOTAL_SUPPLY ?? 1_000_000_000);
      return {
        price_usd: data.data.value,
        price_sol: data.data.priceInNative ?? 0,
        market_cap_usd: data.data.value * supply,
      };
    },
    { label: "birdeye" },
  );
}
