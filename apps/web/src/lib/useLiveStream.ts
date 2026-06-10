import { useEffect } from "react";
import { blobLive, pushEvent } from "./blobLive";

/**
 * Real-time heartbeat: subscribes to the bot's SSE stream and makes the
 * dashboard feel alive without waiting for the next poll cycle.
 *
 *   trade    → kick the blob (entryPulse) + push a line into the feed
 *   activity → push the summary into the feed
 *   insight  → narration lines from the consciousness
 *
 * Polling stays in place as the fallback; this only adds immediacy.
 */
export function useLiveStream(): void {
  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 2_000;
    let closed = false;

    const connect = () => {
      if (closed) return;
      try {
        es = new EventSource("/api/stream");
      } catch {
        scheduleRetry();
        return;
      }

      es.addEventListener("hello", () => { retryDelay = 2_000; });

      es.addEventListener("trade", (e) => {
        try {
          const d = JSON.parse((e as MessageEvent).data) as {
            side: "BUY" | "SELL"; sol: number; wallet: string; bot: boolean;
          };
          // Heartbeat kick — bigger trades hit harder.
          const kick = Math.min(1, 0.35 + d.sol / 10);
          if (kick > blobLive.entryPulse) blobLive.entryPulse = kick;
          if (!d.bot) {
            pushEvent(
              "interaction",
              `${d.side} ${d.sol} SOL :: ${d.wallet}`,
              d.side === "BUY" ? "rgb(120,255,170)" : "rgb(255,150,130)",
            );
          }
        } catch { /* ignore malformed frame */ }
      });

      es.addEventListener("activity", (e) => {
        try {
          const d = JSON.parse((e as MessageEvent).data) as { kind: string; summary: string };
          pushEvent("system", d.summary.slice(0, 120));
          // Let polled components refresh sooner than their next interval.
          window.dispatchEvent(new CustomEvent("pulse-activity", { detail: d }));
        } catch { /* ignore */ }
      });

      es.addEventListener("insight", (e) => {
        try {
          const d = JSON.parse((e as MessageEvent).data) as { kind: string; line?: string };
          if (d.line) pushEvent("emotion", d.line.slice(0, 140), "rgb(190,160,255)");
          window.dispatchEvent(new CustomEvent("pulse-insight", { detail: d }));
        } catch { /* ignore */ }
      });

      es.onerror = () => {
        es?.close();
        es = null;
        scheduleRetry();
      };
    };

    const scheduleRetry = () => {
      if (closed || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        retryDelay = Math.min(retryDelay * 2, 60_000);
        connect();
      }, retryDelay);
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, []);
}
