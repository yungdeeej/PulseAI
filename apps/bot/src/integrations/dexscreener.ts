import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export interface DexScreenerPrice {
  price_usd: number;
  price_sol: number;
  market_cap_usd: number;
  volume_24h_usd: number;
  pair_address: string;
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
        pairAddress?: string;
        priceUsd?: string;
        priceNative?: string;
        fdv?: number;
        marketCap?: number;
        volume?: { h24?: number };
      }>;
    };
    const pair = data.pairs?.[0];
    if (!pair) return null;
    const price_usd = Number(pair.priceUsd ?? 0);
    const price_sol = Number(pair.priceNative ?? 0);
    const market_cap_usd = Number(pair.marketCap ?? pair.fdv ?? 0);
    const volume_24h_usd = Number(pair.volume?.h24 ?? 0);
    if (!price_usd || !market_cap_usd) return null;
    return { price_usd, price_sol, market_cap_usd, volume_24h_usd, pair_address: pair.pairAddress ?? "" };
  } catch (err) {
    logger.warn({ err }, "dexscreener fetch error");
    return null;
  }
}

/** Fetch 1-minute OHLCV bars from GeckoTerminal and return closing market-cap values.
 *  Format: [timestamp, open, high, low, close, volume]
 *  Falls back to an empty array if unavailable. */
export async function fetchDexScreenerHistory(
  pairAddress: string,
  supply: number,
  _resolutionMinutes = 1,
  lookbackMinutes = 60,
): Promise<number[]> {
  if (!pairAddress) return [];
  try {
    const limit = Math.min(lookbackMinutes, 1000);
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/minute` +
        `?limit=${limit}&currency=usd`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: { attributes?: { ohlcv_list?: number[][] } };
    };
    const bars = data.data?.attributes?.ohlcv_list;
    if (!bars?.length) return [];
    // bars arrive newest-first; reverse so sparkline goes left→right
    // Each bar: [timestamp, open, high, low, close, volume]
    // Multiply closing price by supply to get market cap
    return [...bars].reverse().map((b) => Number(b[4]) * supply);
  } catch (err) {
    logger.debug({ err }, "gecko history fetch failed");
    return [];
  }
}
