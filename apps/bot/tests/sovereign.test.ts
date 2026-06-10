import { describe, it, expect } from "vitest";
import { renderConstitutionPrompt } from "../src/features/constitution.js";

describe("sovereign AI", () => {
  const C = {
    autonomous_enabled: true,
    max_action_pct_of_treasury: 3,
    max_actions_per_day: 12,
    cooldown_minutes: 45,
    allowed_actions: ["buyback", "tip_holder", "open_bounty", "pass"],
    treasury_floor_sol: 0.5,
    min_holder_balance_for_tip: 10_000,
    max_tip_sol: 0.2,
    publish_reasoning: true,
  };

  it("constitution prompt is byte-stable across re-renders", () => {
    expect(renderConstitutionPrompt(C)).toBe(renderConstitutionPrompt(C));
  });

  it("clauses are alphabetically sorted in the rendered prompt (cache key stability)", () => {
    const out = renderConstitutionPrompt(C);
    const lines = out.split("\n").slice(1).map((l) => l.match(/^- (\w+):/)?.[1] ?? "");
    expect(lines).toEqual([...lines].sort());
  });

  it("changing any clause changes the rendered prompt", () => {
    const a = renderConstitutionPrompt(C);
    const b = renderConstitutionPrompt({ ...C, max_tip_sol: 0.3 });
    expect(a).not.toBe(b);
  });

  it("describes the autonomous gates the bot enforces", () => {
    const out = renderConstitutionPrompt(C);
    for (const k of [
      "autonomous_enabled",
      "max_action_pct_of_treasury",
      "max_actions_per_day",
      "cooldown_minutes",
      "treasury_floor_sol",
      "max_tip_sol",
    ]) {
      expect(out).toContain(k);
    }
  });
});
