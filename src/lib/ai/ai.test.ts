import { describe, it, expect } from "vitest";
import { checkGuardrails } from "./guardrails";
import { buildMinimizedSummary } from "./summary";
import { buildDemoBundle } from "../store/demoData";

const NOW = new Date("2026-09-15T12:00:00.000Z");
const limits = { monthlyBudgetCents: 500, rateLimitPerHour: 3 };

describe("AI guardrails", () => {
  it("allows when under limits", () => {
    expect(checkGuardrails([], NOW, limits).allowed).toBe(true);
  });

  it("blocks when hourly rate exceeded", () => {
    const usage = [
      { at: "2026-09-15T11:30:00.000Z", costCents: 1 },
      { at: "2026-09-15T11:40:00.000Z", costCents: 1 },
      { at: "2026-09-15T11:50:00.000Z", costCents: 1 },
    ];
    const d = checkGuardrails(usage, NOW, limits);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/hourly/i);
  });

  it("blocks when monthly budget exceeded", () => {
    const usage = [{ at: "2026-09-02T00:00:00.000Z", costCents: 500 }];
    const d = checkGuardrails(usage, NOW, limits);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/budget/i);
  });

  it("ignores usage outside the current month/hour windows", () => {
    const usage = [{ at: "2026-08-31T23:00:00.000Z", costCents: 500 }];
    expect(checkGuardrails(usage, NOW, limits).allowed).toBe(true);
  });
});

describe("minimized summary", () => {
  it("sends only coarse bands — never identifiers, notes, or exact balances", () => {
    const { categories, payload } = buildMinimizedSummary(buildDemoBundle());
    expect(categories.length).toBeGreaterThan(0);
    const json = JSON.stringify(payload);
    // No account nicknames or credit-issue explanations leak.
    expect(json).not.toMatch(/Everyday card|Store card|Auto loan/);
    expect(json).not.toMatch(/don't recognize|collections account/i);
    // Coarse bands present.
    expect(payload.surplusSign).toBeDefined();
    expect(payload.cashCoverageBand).toBeDefined();
    expect(payload.utilizationBand).toBeDefined();
    // No exact dollar figures.
    expect(json).not.toMatch(/420000|320000/);
  });
});
