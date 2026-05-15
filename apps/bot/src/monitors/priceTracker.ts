import { fetchBirdeyePrice } from "../integrations/birdeye.js";
import { insertPrice, patchTokenState } from "../db/queries.js";
import { logger } from "../utils/logger.js";
import { evaluateTierTransition } from "../actions/tier.js";

/** Pull a price sample from Birdeye and persist it. */
export async function recordPriceSample(): Promise<void> {
  const price = await fetchBirdeyePrice();
  if (!price) {
    logger.debug("no price sample available");
    return;
  }
  await insertPrice(price.price_usd, price.price_sol, price.market_cap_usd, "birdeye");
  await patchTokenState({
    price_usd: price.price_usd,
    price_sol: price.price_sol,
    market_cap_usd: price.market_cap_usd,
  });
  await evaluateTierTransition(price.market_cap_usd);
}
