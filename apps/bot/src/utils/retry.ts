import { logger } from "./logger.js";
import { RPC_RETRY_DELAYS_MS } from "../config/constants.js";

export interface RetryOptions {
  delays?: number[];
  onError?: (err: unknown, attempt: number) => void;
  label?: string;
}

export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const delays = opts.delays ?? RPC_RETRY_DELAYS_MS;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      opts.onError?.(err, attempt);
      const delay = delays[attempt];
      if (delay === undefined) break;
      logger.warn(
        { err, attempt: attempt + 1, delay, label: opts.label },
        "retrying after error",
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
