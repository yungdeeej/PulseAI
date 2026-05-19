import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export interface DexScreenerPrice {
  price_usd: number;
  price_sol: number;
  market_cap_usd: number;
}

export async function fetchDexScreenerPrice(): Promise<DexScreenerPrice | null> {
  const mint = env.PULSE_MINT_ADDRESS;
  if (!mint) return null;
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) {
      logger.warn({ status: res.status }, "dexscreener fetch failed");
      return null;
    }
    const data = (await res.json()) as {
      pairs?: Array<{
        priceUsd?: string;
        priceNative?: string;
        fdv?: number;
        marketCap?: number;
      }>;
    };
    const pair = data.pairs?.[0];
    if (!pair) return null;
    const price_usd = Number(pair.priceUsd ?? 0);
    const price_sol = Number(pair.priceNative ?? 0);
    const market_cap_usd = Number(pair.marketCap ?? pair.fdv ?? 0);
    if (!price_usd || !market_cap_usd) return null;
    return { price_usd, price_sol, market_cap_usd };
  } catch (err) {
    logger.warn({ err }, "dexscreener fetch error");
    return null;
  }
}
