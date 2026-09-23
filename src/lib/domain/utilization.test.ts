import { describe, it, expect } from "vitest";
import { buildUtilizationPlan, paydownScenarios } from "./utilization";
import type { Account } from "./types";

const NOW = "2026-09-12T00:00:00.000Z";

function card(over: Partial<Account> = {}): Account {
  return {
    id: "a1",
    ownerId: "u1",
    nickname: "Card",
    classification: "personal",
    kind: "credit_card",
    balanceCents: 0,
    aprBps: null,
    minPaymentCents: null,
    pastDueCents: null,
    dueDate: null,
    creditLimitCents: 100_000,
    isRevolving: true,
    includeInSnapshot: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe("buildUtilizationPlan", () => {
  it("computes per-account and overall ratios from entered figures", () => {
    const plan = buildUtilizationPlan([
      card({ id: "a", nickname: "A", balanceCents: 50_000, creditLimitCents: 100_000 }),
      card({ id: "b", nickname: "B", balanceCents: 10_000, creditLimitCents: 100_000 }),
    ]);
    expect(plan.accounts.map((a) => a.ratio)).toEqual([0.5, 0.1]);
    expect(plan.overallRatio).toBe(0.3); // 60_000 / 200_000
    expect(plan.includedBalanceCents).toBe(60_000);
    expect(plan.includedLimitCents).toBe(200_000);
  });

  it("excludes an account with no limit and says why", () => {
    const plan = buildUtilizationPlan([
      card({ id: "a", balanceCents: 50_000, creditLimitCents: 100_000 }),
      card({ id: "b", nickname: "No limit", balanceCents: 90_000, creditLimitCents: null }),
    ]);
    expect(plan.accounts).toHaveLength(1);
    expect(plan.excluded).toHaveLength(1);
    expect(plan.excluded[0]!.reason).toBe("unknown_limit");
    expect(plan.excluded[0]!.explanation).toContain("Add its limit");
  });

  it("excludes an unknown balance rather than counting it as zero", () => {
    const plan = buildUtilizationPlan([
      card({ id: "a", balanceCents: 50_000 }),
      card({ id: "b", nickname: "Unknown", balanceCents: null }),
    ]);
    expect(plan.excluded[0]!.reason).toBe("unknown_balance");
    expect(plan.excluded[0]!.explanation).toContain("understate");
    // The unknown balance must not drag the overall ratio down.
    expect(plan.overallRatio).toBe(0.5);
  });

  it("ignores non-revolving accounts entirely", () => {
    const plan = buildUtilizationPlan([
      card({ id: "a", balanceCents: 50_000 }),
      card({ id: "loan", kind: "loan", isRevolving: false, balanceCents: 900_000 }),
    ]);
    expect(plan.accounts).toHaveLength(1);
    expect(plan.excluded).toHaveLength(0);
    expect(plan.overallRatio).toBe(0.5);
  });

  it("reports the paydown needed for each target, and zero when already met", () => {
    const plan = buildUtilizationPlan([
      card({ id: "a", balanceCents: 50_000, creditLimitCents: 100_000 }),
    ]);
    // 30% of 100_000 = 30_000, so 20_000 to get there; 10% leaves 40_000.
    expect(plan.accounts[0]!.paydownToTarget).toEqual([
      { target: 0.3, cents: 20_000 },
      { target: 0.1, cents: 40_000 },
    ]);
    const met = buildUtilizationPlan([card({ balanceCents: 5_000, creditLimitCents: 100_000 })]);
    expect(met.accounts[0]!.paydownToTarget.every((t) => t.cents === 0)).toBe(true);
  });

  it("never rounds a paydown figure DOWN below the target", () => {
    // 30% of 3_333 cents = 999.9 → allowance floors to 999, so paydown is 2_334
    // and the resulting ratio is genuinely under 30%.
    const plan = buildUtilizationPlan([card({ balanceCents: 3_333, creditLimitCents: 3_333 })]);
    const needed = plan.accounts[0]!.paydownToTarget[0]!.cents;
    expect((3_333 - needed) / 3_333).toBeLessThanOrEqual(0.3);
  });

  it("has no ratio at all when nothing can be included", () => {
    const plan = buildUtilizationPlan([card({ creditLimitCents: null, balanceCents: 10_000 })]);
    expect(plan.overallRatio).toBeNull();
    expect(plan.overallPaydownToTarget).toEqual([]);
  });

  it("states that this is an estimate and predicts no score", () => {
    const plan = buildUtilizationPlan([card({ balanceCents: 50_000 })]);
    const notes = plan.notes.join(" ");
    expect(notes).toContain("not the credit bureau's official utilization");
    expect(notes).toContain("Nothing here predicts a score");
  });

  it("flags a past-due account as the plan's first concern, not a utilization one", () => {
    const plan = buildUtilizationPlan([card({ balanceCents: 50_000, pastDueCents: 9_000 })]);
    expect(plan.accounts[0]!.isPastDue).toBe(true);
    expect(plan.notes.join(" ")).toContain("past due");
  });
});

describe("paydownScenarios", () => {
  const plan = buildUtilizationPlan([
    card({ id: "a", nickname: "A", balanceCents: 80_000, creditLimitCents: 100_000 }),
    card({ id: "b", nickname: "B", balanceCents: 10_000, creditLimitCents: 100_000 }),
  ]);

  it("reports the resulting overall ratio for each account", () => {
    const { scenarios } = paydownScenarios(plan, 20_000);
    const a = scenarios.find((s) => s.accountId === "a")!;
    // 90_000 - 20_000 = 70_000 over a 200_000 limit.
    expect(a.appliedCents).toBe(20_000);
    expect(a.resultingOverallRatio).toBe(0.35);
    expect(a.deltaRatio).toBe(-0.1);
  });

  it("cannot apply more than the account's balance, and says what is left over", () => {
    const { scenarios } = paydownScenarios(plan, 50_000);
    const b = scenarios.find((s) => s.accountId === "b")!;
    expect(b.appliedCents).toBe(10_000); // balance is only 10_000
    expect(b.unusedCents).toBe(40_000);
  });

  it("orders by resulting ratio but states that this is one factor only", () => {
    const { scenarios, caveats } = paydownScenarios(plan, 20_000);
    expect(scenarios[0]!.accountId).toBe("a");
    expect(caveats.join(" ")).toContain("not a recommendation");
    expect(caveats.join(" ")).toContain("interest rates");
  });

  it("returns nothing for a non-positive amount", () => {
    expect(paydownScenarios(plan, 0).scenarios).toEqual([]);
    expect(paydownScenarios(plan, -100).scenarios).toEqual([]);
  });

  it("returns nothing when no account can be included", () => {
    const empty = buildUtilizationPlan([card({ creditLimitCents: null })]);
    expect(paydownScenarios(empty, 10_000).scenarios).toEqual([]);
  });

  it("never mentions a score or a point change", () => {
    const { scenarios, caveats } = paydownScenarios(plan, 20_000);
    const text = JSON.stringify({ scenarios, caveats }).toLowerCase();
    expect(text).not.toContain("score");
    expect(text).not.toMatch(/\b\d{1,3}\s*(?:points?|pts)\b/);
  });
});

describe("regressions from review", () => {
  it("distinguishes an explicit zero limit from an absent one", () => {
    const plan = buildUtilizationPlan([
      card({ id: "z", nickname: "Zero", creditLimitCents: 0, balanceCents: 1_000 }),
      card({ id: "n", nickname: "None", creditLimitCents: null, balanceCents: 1_000 }),
    ]);
    const zero = plan.excluded.find((e) => e.accountId === "z")!;
    const none = plan.excluded.find((e) => e.accountId === "n")!;
    expect(zero.reason).toBe("zero_limit");
    expect(zero.explanation).not.toContain("Add its limit");
    expect(none.reason).toBe("unknown_limit");
  });

  it("counts a revolving account toward utilization even when excluded from snapshot totals", () => {
    // includeInSnapshot is a reconciliation flag, not a "count this" flag: the
    // card is on the credit report either way.
    const plan = buildUtilizationPlan([
      card({ id: "a", balanceCents: 50_000, creditLimitCents: 100_000, includeInSnapshot: false }),
    ]);
    expect(plan.accounts).toHaveLength(1);
    expect(plan.overallRatio).toBe(0.5);
  });
});
