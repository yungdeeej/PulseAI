import { describe, it, expect } from "vitest";
import {
  CHAT_TIERS,
  chatTierFor,
  canonicalChatSessionMessage,
  anonymousIdentity,
  MAX_MESSAGE_CHARS,
} from "../src/features/pulseChat.js";

describe("talk-to-PULSE gating", () => {
  it("visitors (no balance) get the smallest daily quota", () => {
    expect(chatTierFor(0).name).toBe("VISITOR");
    expect(chatTierFor(0).messagesPerDay).toBe(3);
  });

  it("any holder beats the visitor tier", () => {
    expect(chatTierFor(1).name).toBe("HOLDER");
    expect(chatTierFor(99_999).name).toBe("HOLDER");
  });

  it("100K PULSE unlocks the inner circle", () => {
    expect(chatTierFor(100_000).name).toBe("INNER_CIRCLE");
    expect(chatTierFor(9_999_999).name).toBe("INNER_CIRCLE");
  });

  it("10M PULSE is whale tier", () => {
    expect(chatTierFor(10_000_000).name).toBe("WHALE");
    expect(chatTierFor(500_000_000).name).toBe("WHALE");
  });

  it("quotas strictly increase with tier", () => {
    const limits = CHAT_TIERS.map((t) => t.messagesPerDay);
    for (let i = 1; i < limits.length; i++) {
      expect(limits[i]!).toBeGreaterThan(limits[i - 1]!);
    }
  });

  it("session message is canonical and ts-bound", () => {
    const ts = "2026-06-10T12:00:00.000Z";
    expect(canonicalChatSessionMessage(ts)).toBe(`$PULSE chat session ts=${ts}`);
  });

  it("anonymous identity never embeds the raw IP", () => {
    const id = anonymousIdentity("203.0.113.7");
    expect(id.startsWith("ip:")).toBe(true);
    expect(id).not.toContain("203.0.113.7");
    // deterministic for quota tracking
    expect(anonymousIdentity("203.0.113.7")).toBe(id);
    expect(anonymousIdentity("203.0.113.8")).not.toBe(id);
  });

  it("message length cap is sane", () => {
    expect(MAX_MESSAGE_CHARS).toBeGreaterThanOrEqual(200);
    expect(MAX_MESSAGE_CHARS).toBeLessThanOrEqual(2_000);
  });
});
