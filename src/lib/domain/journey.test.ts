import { describe, it, expect } from "vitest";
import { assessJourney, provisionalStageFor, type JourneyInput } from "./journey";
import { summarize } from "./finance";
import type { Account, CreditIssue, FinancialSnapshot } from "./types";

const ASOF = "2026-09-12";
const NOW = `${ASOF}T00:00:00.000Z`;

function snapshot(over: Partial<FinancialSnapshot> = {}): FinancialSnapshot {
  return {
    id: "s1",
    ownerId: "u1",
    asOf: ASOF,
    takeHomeIncomeCents: null,
    essentialSpendingCents: null,
    otherSpendingCents: null,
    requiredDebtPaymentsCents: null,
    availableCashCents: null,
    otherAssetsCents: null,
    liabilitiesCents: null,
    hasPastDueAccounts: null,
    selfReportedScore: null,
    createdAt: NOW,
    ...over,
  };
}

function account(over: Partial<Account> = {}): Account {
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
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function issue(over: Partial<CreditIssue> = {}): CreditIssue {
  return {
    id: "c1",
    ownerId: "u1",
    bureau: "equifax",
    creditorNickname: "Bank",
    category: "wrong_balance",
    explanation: "Balance is wrong",
    relevantDate: null,
    followUpDate: null,
    state: "user_submitted",
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function input(over: Partial<JourneyInput> = {}): JourneyInput {
  const snap = over.snapshot !== undefined ? over.snapshot : snapshot();
  const accounts = over.accounts ?? [];
  return {
    snapshot: snap,
    accounts,
    creditIssues: over.creditIssues ?? [],
    summary: over.summary ?? summarize(snap ?? snapshot(), accounts),
    selfReported: over.selfReported ?? null,
  };
}

function stage(a: ReturnType<typeof assessJourney>, id: string) {
  return a.stages.find((s) => s.stage === id)!;
}

/** Cash-flow positive, nothing past due, 4 months of cover. */
const HEALTHY = snapshot({
  takeHomeIncomeCents: 500_000,
  essentialSpendingCents: 200_000,
  otherSpendingCents: 50_000,
  requiredDebtPaymentsCents: 50_000,
  availableCashCents: 1_000_000,
  hasPastDueAccounts: false,
});

describe("assessJourney — missing facts are never a pass", () => {
  it("reports stabilize as unknown when nothing has been entered", () => {
    const a = assessJourney(input());
    expect(stage(a, "stabilize").status).toBe("unknown");
    expect(a.currentStage).toBeNull();
    expect(a.allAssessedPassed).toBe(false);
  });

  it("does NOT pass stabilize when past-due status was never reported", () => {
    // Surplus is knowable and positive, but the user has told us nothing about
    // past-due accounts. `summary.hasPastDue` is false here purely from absence.
    const snap = snapshot({
      takeHomeIncomeCents: 500_000,
      essentialSpendingCents: 200_000,
      otherSpendingCents: 0,
      requiredDebtPaymentsCents: 50_000,
      hasPastDueAccounts: null, // the only thing missing
    });
    expect(summarize(snap, []).hasPastDue).toBe(false); // false purely from absence
    const a = assessJourney(input({ snapshot: snap }));
    expect(stage(a, "stabilize").status).toBe("unknown");
    expect(a.currentStage).toBeNull();
  });

  it("an account carrying a past-due figure of 0 counts as KNOWN, not missing", () => {
    const snap = snapshot({
      takeHomeIncomeCents: 500_000,
      essentialSpendingCents: 200_000,
      otherSpendingCents: 0,
      requiredDebtPaymentsCents: 50_000,
      availableCashCents: 100_000,
    });
    const a = assessJourney(input({ snapshot: snap, accounts: [account({ pastDueCents: 0 })] }));
    expect(stage(a, "stabilize").status).toBe("passed");
  });

  it("stages after an unknown one are unknown, not upcoming", () => {
    const a = assessJourney(input());
    expect(stage(a, "repair").status).toBe("unknown");
    expect(stage(a, "build").status).toBe("unknown");
  });
});

describe("assessJourney — gates", () => {
  it("negative surplus lands the user in stabilize", () => {
    const snap = snapshot({
      takeHomeIncomeCents: 200_000,
      essentialSpendingCents: 250_000,
      hasPastDueAccounts: false,
    });
    const a = assessJourney(input({ snapshot: snap }));
    expect(a.currentStage).toBe("stabilize");
    expect(stage(a, "stabilize").detail).toContain("exceeds");
  });

  it("a past-due account lands the user in stabilize even with a healthy surplus", () => {
    const a = assessJourney(input({ snapshot: HEALTHY, accounts: [account({ pastDueCents: 12_000 })] }));
    expect(a.currentStage).toBe("stabilize");
    expect(stage(a, "stabilize").detail).toContain("past due");
  });

  it("an open credit issue lands the user in repair once stabilize is met", () => {
    const a = assessJourney(input({ snapshot: HEALTHY, creditIssues: [issue()] }));
    expect(stage(a, "stabilize").status).toBe("passed");
    expect(a.currentStage).toBe("repair");
  });

  it("resolved credit issues do not hold the user in repair", () => {
    const a = assessJourney(
      input({ snapshot: HEALTHY, creditIssues: [issue({ state: "resolved" })] }),
    );
    expect(stage(a, "repair").status).toBe("passed");
  });

  it("no recorded issues passes repair but says so explicitly", () => {
    const a = assessJourney(input({ snapshot: HEALTHY }));
    expect(stage(a, "repair").status).toBe("passed");
    expect(stage(a, "repair").detail).toContain("isn't the same as your report being clean");
  });

  it("thin cash coverage lands the user in build", () => {
    const snap = snapshot({
      takeHomeIncomeCents: 500_000,
      essentialSpendingCents: 200_000,
      otherSpendingCents: 0,
      requiredDebtPaymentsCents: 50_000,
      availableCashCents: 100_000, // well under 3 months of 250_000
      hasPastDueAccounts: false,
    });
    const a = assessJourney(input({ snapshot: snap }));
    expect(a.currentStage).toBe("build");
  });

  it("clearing every assessed gate reports allAssessedPassed with no current stage", () => {
    const a = assessJourney(input({ snapshot: HEALTHY }));
    expect(a.allAssessedPassed).toBe(true);
    expect(a.currentStage).toBeNull();
    expect(stage(a, "build").status).toBe("passed");
  });
});

describe("assessJourney — stages this version cannot judge", () => {
  it("marks leverage, invest and protect not_assessed in every scenario", () => {
    for (const a of [
      assessJourney(input()),
      assessJourney(input({ snapshot: HEALTHY })),
      assessJourney(input({ snapshot: HEALTHY, creditIssues: [issue()] })),
    ]) {
      for (const id of ["leverage", "invest", "protect"]) {
        expect(stage(a, id).status).toBe("not_assessed");
      }
    }
  });

  it("never reports a score or rating in any stage shown to the user", () => {
    // The basis text is exempt: it is the sentence that DISCLAIMS a score.
    for (const snap of [null, HEALTHY]) {
      const a = assessJourney(input({ snapshot: snap, selfReported: "behind_on_bills" }));
      const shown = JSON.stringify(a.stages).toLowerCase();
      expect(shown).not.toContain("score");
      expect(shown).not.toContain("rating");
      expect(shown).not.toMatch(/\b\d{1,3}\s*\/\s*100\b/);
      expect(shown).not.toMatch(/\b\d{1,3}\s*(?:points?|pts)\b/);
    }
    // And the basis says so out loud.
    expect(assessJourney(input()).basis).toContain("not a score");
  });
});

describe("assessJourney — self-report is provisional only", () => {
  it("shows a provisional stage when the numbers cannot place the user", () => {
    const a = assessJourney(input({ selfReported: "behind_on_bills" }));
    expect(a.currentStage).toBeNull();
    expect(a.provisional).toEqual({ stage: "stabilize", situation: "behind_on_bills" });
  });

  it("a computed stage always wins over the self-report", () => {
    // User says they are stable; their numbers say otherwise.
    const snap = snapshot({
      takeHomeIncomeCents: 200_000,
      essentialSpendingCents: 250_000,
      hasPastDueAccounts: false,
    });
    const a = assessJourney(input({ snapshot: snap, selfReported: "stable_building" }));
    expect(a.currentStage).toBe("stabilize");
    expect(a.provisional).toBeNull();
  });

  it("does not show a provisional stage once every gate is met", () => {
    const a = assessJourney(input({ snapshot: HEALTHY, selfReported: "behind_on_bills" }));
    expect(a.provisional).toBeNull();
    expect(a.allAssessedPassed).toBe(true);
  });

  it('"unsure" yields no provisional stage at all', () => {
    const a = assessJourney(input({ selfReported: "unsure" }));
    expect(a.provisional).toBeNull();
    expect(provisionalStageFor("unsure")).toBeNull();
  });

  it("a self-report never marks a gate passed", () => {
    const a = assessJourney(input({ selfReported: "stable_building" }));
    for (const s of a.stages) expect(s.status).not.toBe("passed");
  });
});

describe("assessJourney — regressions from review", () => {
  it("does not pass stabilize on an income-only snapshot (surplus is overstated)", () => {
    // monthlySurplus fills unknown spending with 0 and returns a positive value.
    const snap = snapshot({ takeHomeIncomeCents: 500_000, hasPastDueAccounts: false });
    expect(summarize(snap, []).surplus.value).toBe(500_000); // overstated, not a fact
    const a = assessJourney(input({ snapshot: snap }));
    expect(stage(a, "stabilize").status).toBe("unknown");
  });

  it("still fails stabilize on partial data when the surplus is already negative", () => {
    // Missing components are all subtractions, so the real figure is worse.
    const snap = snapshot({
      takeHomeIncomeCents: 100_000,
      essentialSpendingCents: 250_000,
      hasPastDueAccounts: false,
    });
    const a = assessJourney(input({ snapshot: snap }));
    expect(a.currentStage).toBe("stabilize");
  });

  it("does not let rounding clear the three-month build gate", () => {
    // 2.95 months exactly: cashCoverageMonths rounds this to 3.0.
    const denom = 100_000;
    const snap = snapshot({
      takeHomeIncomeCents: 500_000,
      essentialSpendingCents: denom,
      otherSpendingCents: 0,
      requiredDebtPaymentsCents: 0,
      availableCashCents: 295_000,
      hasPastDueAccounts: false,
    });
    expect(summarize(snap, []).cashCoverage.value).toBe(3); // rounded
    const a = assessJourney(input({ snapshot: snap }));
    expect(a.currentStage).toBe("build");
    expect(a.allAssessedPassed).toBe(false);
  });

  it("passes the build gate at exactly three months", () => {
    const snap = snapshot({
      takeHomeIncomeCents: 500_000,
      essentialSpendingCents: 100_000,
      otherSpendingCents: 0,
      requiredDebtPaymentsCents: 0,
      availableCashCents: 300_000,
      hasPastDueAccounts: false,
    });
    const a = assessJourney(input({ snapshot: snap }));
    expect(stage(a, "build").status).toBe("passed");
  });

  it("does not pass build when required debt payments are unknown", () => {
    const snap = snapshot({
      takeHomeIncomeCents: 500_000,
      essentialSpendingCents: 100_000,
      otherSpendingCents: 0,
      requiredDebtPaymentsCents: null,
      availableCashCents: 900_000,
      hasPastDueAccounts: false,
    });
    const a = assessJourney(input({ snapshot: snap }));
    expect(stage(a, "build").status).toBe("unknown");
    expect(a.allAssessedPassed).toBe(false);
  });

  it("one account with a past-due figure does not make the others known", () => {
    const snap = snapshot({
      takeHomeIncomeCents: 500_000,
      essentialSpendingCents: 100_000,
      otherSpendingCents: 0,
      requiredDebtPaymentsCents: 50_000,
      availableCashCents: 900_000,
    });
    const a = assessJourney(
      input({
        snapshot: snap,
        accounts: [account({ id: "a1", pastDueCents: 0 }), account({ id: "a2", pastDueCents: null })],
      }),
    );
    expect(stage(a, "stabilize").status).toBe("unknown");
  });

  it("states the real denominator — essentials AND required debt payments", () => {
    const snap = snapshot({
      takeHomeIncomeCents: 500_000,
      essentialSpendingCents: 100_000,
      otherSpendingCents: 0,
      requiredDebtPaymentsCents: 200_000,
      availableCashCents: 400_000,
      hasPastDueAccounts: false,
    });
    const a = assessJourney(input({ snapshot: snap }));
    const detail = stage(a, "build").detail;
    // 400_000 / 300_000 = 1.3 months — never "4 months of essential costs".
    expect(detail).toContain("1.3 month(s)");
    expect(detail).toContain("required debt payments");
    expect(stage(a, "build").gate).toContain("required debt payments");
  });

  it("offers no provisional stage once any gate has been decided from figures", () => {
    // Stabilize and repair are computed as passed; only build is unknown.
    const snap = snapshot({
      takeHomeIncomeCents: 500_000,
      essentialSpendingCents: 100_000,
      otherSpendingCents: 0,
      requiredDebtPaymentsCents: 50_000,
      availableCashCents: null,
      hasPastDueAccounts: false,
    });
    const a = assessJourney(input({ snapshot: snap, selfReported: "behind_on_bills" }));
    expect(stage(a, "stabilize").status).toBe("passed");
    expect(stage(a, "build").status).toBe("unknown");
    expect(a.currentStage).toBeNull();
    expect(a.provisional).toBeNull();
  });

  it("explains a zero denominator without claiming the figures are missing", () => {
    const snap = snapshot({
      takeHomeIncomeCents: 500_000,
      essentialSpendingCents: 0,
      otherSpendingCents: 0,
      requiredDebtPaymentsCents: 0,
      availableCashCents: 400_000,
      hasPastDueAccounts: false,
    });
    const detail = stage(assessJourney(input({ snapshot: snap })), "build").detail;
    expect(detail).not.toContain("we don't know");
    expect(detail).toContain("nothing to measure a cushion against");
  });
});

describe("assessJourney — determinism", () => {
  it("returns an identical assessment for identical input", () => {
    const i = input({ snapshot: HEALTHY, creditIssues: [issue()] });
    expect(JSON.stringify(assessJourney(i))).toBe(JSON.stringify(assessJourney(i)));
  });
});
