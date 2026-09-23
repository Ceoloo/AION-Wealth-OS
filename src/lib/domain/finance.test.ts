import { describe, it, expect } from "vitest";
import {
  monthlySurplus,
  netWorth,
  cashCoverageMonths,
  revolvingUtilization,
  debtDoubleCountCheck,
} from "./finance";
import type { Account, FinancialSnapshot } from "./types";

function snap(overrides: Partial<FinancialSnapshot>): FinancialSnapshot {
  return {
    id: "s1",
    ownerId: "u1",
    asOf: "2026-09-12",
    takeHomeIncomeCents: null,
    essentialSpendingCents: null,
    otherSpendingCents: null,
    requiredDebtPaymentsCents: null,
    availableCashCents: null,
    otherAssetsCents: null,
    liabilitiesCents: null,
    hasPastDueAccounts: null,
    selfReportedScore: null,
    createdAt: "2026-09-12T00:00:00.000Z",
    ...overrides,
  };
}

function acct(overrides: Partial<Account>): Account {
  return {
    id: "a1",
    ownerId: "u1",
    nickname: "Card",
    classification: "personal",
    kind: "credit_card",
    balanceCents: null,
    aprBps: null,
    minPaymentCents: null,
    pastDueCents: null,
    dueDate: null,
    creditLimitCents: null,
    isRevolving: true,
    includeInSnapshot: true,
    createdAt: "2026-09-12T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("monthlySurplus", () => {
  it("computes income minus all outflows", () => {
    const r = monthlySurplus(
      snap({
        takeHomeIncomeCents: 500000,
        essentialSpendingCents: 250000,
        otherSpendingCents: 100000,
        requiredDebtPaymentsCents: 80000,
      }),
    );
    expect(r.value).toBe(70000);
    expect(r.completeness).toBe("complete");
  });

  it("returns null when income (the anchor) is unknown", () => {
    const r = monthlySurplus(snap({ essentialSpendingCents: 100000 }));
    expect(r.value).toBeNull();
    expect(r.completeness).toBe("missing");
    expect(r.missingInputs).toContain("takeHomeIncomeCents");
  });

  it("does NOT treat missing expense components as zero silently — flags partial", () => {
    const r = monthlySurplus(
      snap({ takeHomeIncomeCents: 300000, essentialSpendingCents: 200000 }),
    );
    // otherSpending and requiredDebtPayments unknown → excluded but flagged
    expect(r.value).toBe(100000);
    expect(r.completeness).toBe("partial");
    expect(r.missingInputs).toEqual(
      expect.arrayContaining(["otherSpendingCents", "requiredDebtPaymentsCents"]),
    );
    expect(r.assumptions.join(" ")).toMatch(/not assumed to be zero|overstated/i);
  });

  it("surfaces a negative surplus", () => {
    const r = monthlySurplus(
      snap({
        takeHomeIncomeCents: 200000,
        essentialSpendingCents: 180000,
        otherSpendingCents: 50000,
        requiredDebtPaymentsCents: 30000,
      }),
    );
    expect(r.value).toBe(-60000);
  });
});

describe("netWorth", () => {
  it("assets minus liabilities", () => {
    const r = netWorth(
      snap({ availableCashCents: 100000, otherAssetsCents: 500000, liabilitiesCents: 200000 }),
    );
    expect(r.value).toBe(400000);
    expect(r.completeness).toBe("complete");
  });

  it("handles negative balances (underwater)", () => {
    const r = netWorth(
      snap({ availableCashCents: 5000, otherAssetsCents: 0, liabilitiesCents: 900000 }),
    );
    expect(r.value).toBe(-895000);
  });

  it("labels incomplete data and does not zero-fill missing liabilities", () => {
    const r = netWorth(snap({ availableCashCents: 100000 }));
    expect(r.completeness).toBe("partial");
    expect(r.missingInputs).toEqual(
      expect.arrayContaining(["otherAssetsCents", "liabilitiesCents"]),
    );
  });

  it("returns missing when nothing provided", () => {
    const r = netWorth(snap({}));
    expect(r.value).toBeNull();
    expect(r.completeness).toBe("missing");
  });
});

describe("cashCoverageMonths", () => {
  it("cash divided by monthly obligations", () => {
    const r = cashCoverageMonths(
      snap({
        availableCashCents: 600000,
        essentialSpendingCents: 150000,
        requiredDebtPaymentsCents: 50000,
      }),
    );
    expect(r.value).toBe(3); // 600000 / 200000
  });

  it("handles zero denominator without Infinity/NaN", () => {
    const r = cashCoverageMonths(
      snap({
        availableCashCents: 600000,
        essentialSpendingCents: 0,
        requiredDebtPaymentsCents: 0,
      }),
    );
    expect(r.value).toBeNull();
    expect(r.assumptions.join(" ")).toMatch(/no denominator|undefined/i);
  });

  it("returns null when cash unknown", () => {
    const r = cashCoverageMonths(snap({ essentialSpendingCents: 100000 }));
    expect(r.value).toBeNull();
  });

  it("returns null when all obligation components unknown", () => {
    const r = cashCoverageMonths(snap({ availableCashCents: 100000 }));
    expect(r.value).toBeNull();
  });
});

describe("revolvingUtilization", () => {
  it("balances over limits for accounts with known positive limits", () => {
    const r = revolvingUtilization([
      acct({ id: "a1", balanceCents: 30000, creditLimitCents: 100000 }),
      acct({ id: "a2", balanceCents: 20000, creditLimitCents: 100000 }),
    ]);
    expect(r.value).toBe(0.25); // 50000 / 200000
    expect(r.assumptions.join(" ")).toMatch(/not the credit bureau/i);
  });

  it("excludes accounts with unknown limits and reports the count", () => {
    const r = revolvingUtilization([
      acct({ id: "a1", balanceCents: 30000, creditLimitCents: 100000 }),
      acct({ id: "a2", balanceCents: 50000, creditLimitCents: null }),
    ]);
    expect(r.value).toBe(0.3); // 30000 / 100000 only
    expect(r.unknownLimitCount).toBe(1);
  });

  it("excludes an unknown BALANCE from both sides rather than counting it as zero", () => {
    // Regression: the account below used to add its limit to the denominator
    // while contributing 0 to the numerator, understating utilization (0.25).
    const r = revolvingUtilization([
      acct({ id: "a1", balanceCents: 50000, creditLimitCents: 100000 }),
      acct({ id: "a2", balanceCents: null, creditLimitCents: 100000 }),
    ]);
    expect(r.value).toBe(0.5);
    expect(r.unknownBalanceCount).toBe(1);
    expect(r.assumptions.join(" ")).toMatch(/would understate your utilization/i);
    expect(r.missingInputs).toContain("revolving balances");
  });

  it("returns null utilization when no known positive limits (no divide-by-zero)", () => {
    const r = revolvingUtilization([
      acct({ id: "a2", balanceCents: 50000, creditLimitCents: 0 }),
    ]);
    expect(r.value).toBeNull();
    expect(r.unknownLimitCount).toBe(1);
  });

  it("names unknown BALANCES as the reason, not missing limits", () => {
    // Telling the user there are "no known positive limits" when every limit is
    // known sends them to fix the wrong field.
    const r = revolvingUtilization([
      acct({ id: "a1", balanceCents: null, creditLimitCents: 100000 }),
    ]);
    expect(r.assumptions.join(" ")).toContain("No revolving accounts with known balances");
    expect(r.assumptions.join(" ")).not.toContain("known positive limits");
  });

  it("has no utilization at all when the only account's balance is unknown", () => {
    // BEHAVIOUR CHANGE. This previously asserted a ratio of 0 — an unknown
    // balance counted as zero against a known limit. That contradicts the
    // project rule that null means "unknown, never 0", and it erred in the
    // flattering direction: it reported perfect utilization for an account we
    // know nothing about. Unknown is now reported as unknown.
    const r = revolvingUtilization([
      acct({ id: "a1", balanceCents: null, creditLimitCents: 100000 }),
    ]);
    expect(r.value).toBeNull();
    expect(r.unknownBalanceCount).toBe(1);
  });
});

describe("debtDoubleCountCheck", () => {
  it("flags a mismatch between snapshot payments and account minimums", () => {
    const r = debtDoubleCountCheck(
      snap({ requiredDebtPaymentsCents: 100000, liabilitiesCents: 500000 }),
      [
        acct({ id: "a1", kind: "credit_card", minPaymentCents: 20000, balanceCents: 300000 }),
        acct({ id: "a2", kind: "loan", isRevolving: false, minPaymentCents: 30000, balanceCents: 200000 }),
      ],
    );
    // account minimums sum to 50000 but snapshot says 100000 → possible double count
    expect(r.minPaymentSum).toBe(50000);
    expect(r.paymentMismatch).toBe(true);
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it("does not flag when unknown minimums exist (can't conclude)", () => {
    const r = debtDoubleCountCheck(
      snap({ requiredDebtPaymentsCents: 100000 }),
      [acct({ id: "a1", minPaymentCents: null, balanceCents: 300000 })],
    );
    expect(r.paymentMismatch).toBe(false);
    expect(r.minPaymentUnknownCount).toBe(1);
  });

  it("flags when aggregate liabilities are less than summed debt balances", () => {
    const r = debtDoubleCountCheck(
      snap({ liabilitiesCents: 100000 }),
      [
        acct({ id: "a1", kind: "loan", isRevolving: false, balanceCents: 300000, minPaymentCents: 0 }),
      ],
    );
    expect(r.liabilityMismatch).toBe(true);
  });
});
