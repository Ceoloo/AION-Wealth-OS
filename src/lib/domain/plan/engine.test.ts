import { describe, it, expect } from "vitest";
import { generatePlan } from "./engine";
import type { ActionEvent, Account, CreditIssue, FinancialSnapshot, Profile } from "../types";

const NOW = "2026-09-12T12:00:00.000Z";
const ASOF = "2026-09-12";

function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    ownerId: "u1",
    residenceState: "NY",
    businessState: null,
    goals: [],
    experience: "new",
    weeklyTimeMinutes: 120,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function snap(overrides: Partial<FinancialSnapshot> = {}): FinancialSnapshot {
  return {
    id: "s1",
    ownerId: "u1",
    asOf: ASOF,
    takeHomeIncomeCents: 500000,
    essentialSpendingCents: 250000,
    otherSpendingCents: 80000,
    requiredDebtPaymentsCents: 60000,
    availableCashCents: 800000,
    otherAssetsCents: 0,
    liabilitiesCents: 300000,
    hasPastDueAccounts: false,
    selfReportedScore: null,
    createdAt: NOW,
    ...overrides,
  };
}

function input(overrides: {
  profile?: Profile | null;
  snapshot?: FinancialSnapshot | null;
  accounts?: Account[];
  creditIssues?: CreditIssue[];
  events?: ActionEvent[];
}) {
  return {
    asOf: ASOF,
    generatedAt: NOW,
    profile: overrides.profile === undefined ? baseProfile() : overrides.profile,
    snapshot: overrides.snapshot === undefined ? snap() : overrides.snapshot,
    accounts: overrides.accounts ?? [],
    creditIssues: overrides.creditIssues ?? [],
    events: overrides.events ?? [],
  };
}

describe("generatePlan — core behavior", () => {
  it("produces at most 3 priorities and a sequenced 30-day plan", () => {
    const plan = generatePlan(input({}));
    expect(plan.priorities.length).toBeLessThanOrEqual(3);
    expect(plan.thirtyDayPlan.length).toBeGreaterThanOrEqual(plan.priorities.length);
    // ranks are 1..n contiguous
    plan.thirtyDayPlan.forEach((a, i) => expect(a.priorityRank).toBe(i + 1));
    // every action carries stable ids and full teach-back
    for (const a of plan.thirtyDayPlan) {
      expect(a.ruleId).toBeTruthy();
      expect(a.actionId).toBeTruthy();
      expect(a.teachBack.comprehensionCheck.options.length).toBeGreaterThan(1);
    }
  });

  it("emits no fabricated score, cost, or confirmation", () => {
    const plan = generatePlan(input({}));
    const text = JSON.stringify(plan).toLowerCase();
    expect(text).not.toMatch(/your credit score is|approval probability|guaranteed/);
    // verifiedCostCents is only ever null or an integer, never invented text
    for (const a of plan.thirtyDayPlan) {
      expect(a.verifiedCostCents === null || Number.isInteger(a.verifiedCostCents)).toBe(true);
    }
  });
});

describe("acceptance #3 — negative surplus prioritizes stabilization", () => {
  it("puts stabilization first and defers elective formation", () => {
    const plan = generatePlan(
      input({
        profile: baseProfile({ businessState: "NY", goals: ["form_business"] }),
        snapshot: snap({
          takeHomeIncomeCents: 200000,
          essentialSpendingCents: 180000,
          otherSpendingCents: 40000,
          requiredDebtPaymentsCents: 30000,
        }),
      }),
    );
    expect(plan.priorities[0]?.category).toBe("stabilize");
    expect(plan.notices.join(" ")).toMatch(/stabiliz/i);
    // formation still exists in the plan but is NOT a current priority
    const formationPriority = plan.priorities.find((a) => a.category === "formation");
    expect(formationPriority).toBeUndefined();
    const formationInPlan = plan.thirtyDayPlan.find((a) => a.category === "formation");
    expect(formationInPlan).toBeDefined();
  });
});

describe("acceptance #3 — missing values do not become zeros", () => {
  it("clarify appears and no stabilization is fabricated from unknowns", () => {
    const plan = generatePlan(
      input({
        snapshot: snap({
          takeHomeIncomeCents: null,
          essentialSpendingCents: null,
          requiredDebtPaymentsCents: null,
          availableCashCents: null,
        }),
      }),
    );
    expect(plan.priorities[0]?.category).toBe("clarify");
    expect(plan.priorities[0]?.status).toBe("insufficient_information");
    // surplus unknown → stabilization rule must NOT fire
    expect(plan.thirtyDayPlan.find((a) => a.category === "stabilize")).toBeUndefined();
  });
});

describe("past-due prioritization", () => {
  it("surfaces a past-due action when accounts are overdue", () => {
    const plan = generatePlan(
      input({
        accounts: [
          {
            id: "a1",
            ownerId: "u1",
            nickname: "Utility",
            classification: "personal",
            kind: "other",
            balanceCents: 20000,
            aprBps: null,
            minPaymentCents: 5000,
            pastDueCents: 15000,
            dueDate: "2026-09-01",
            creditLimitCents: null,
            isRevolving: false,
            includeInSnapshot: true,
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      }),
    );
    expect(plan.thirtyDayPlan.find((a) => a.category === "past_due")).toBeDefined();
  });
});

describe("acceptance #2 — recompute preserves completed work and avoids duplicates", () => {
  it("marks completed actions complete and keeps a single stable action", () => {
    const events: ActionEvent[] = [
      { id: "e1", ownerId: "u1", actionId: "establish_recordkeeping", ruleId: "establish_recordkeeping", type: "generated", reason: null, at: "2026-09-10T00:00:00.000Z" },
      { id: "e2", ownerId: "u1", actionId: "establish_recordkeeping", ruleId: "establish_recordkeeping", type: "completed_user_reported", reason: null, at: "2026-09-11T00:00:00.000Z" },
    ];
    const plan1 = generatePlan(input({ events }));
    const rec = plan1.thirtyDayPlan.filter((a) => a.actionId === "establish_recordkeeping");
    expect(rec.length).toBe(1); // no duplicate
    expect(rec[0]?.status).toBe("complete");
    // completed actions are not shown as current priorities
    expect(plan1.priorities.find((a) => a.actionId === "establish_recordkeeping")).toBeUndefined();

    // Changing a financial fact and recomputing keeps completion intact
    const plan2 = generatePlan(
      input({ events, snapshot: snap({ availableCashCents: 50000 }) }),
    );
    const rec2 = plan2.thirtyDayPlan.find((a) => a.actionId === "establish_recordkeeping");
    expect(rec2?.status).toBe("complete");
  });

  it("respects skip/defer by excluding from priorities but keeping in the plan", () => {
    const events: ActionEvent[] = [
      { id: "e1", ownerId: "u1", actionId: "review_credit_report", ruleId: "review_credit_report", type: "deferred", reason: "later", at: "2026-09-11T00:00:00.000Z" },
    ];
    const plan = generatePlan(input({ events }));
    expect(plan.priorities.find((a) => a.actionId === "review_credit_report")).toBeUndefined();
    expect(plan.thirtyDayPlan.find((a) => a.actionId === "review_credit_report")).toBeDefined();
  });

  it("a reopened action returns to in_progress", () => {
    const events: ActionEvent[] = [
      { id: "e1", ownerId: "u1", actionId: "establish_recordkeeping", ruleId: "establish_recordkeeping", type: "completed_user_reported", reason: null, at: "2026-09-11T00:00:00.000Z" },
      { id: "e2", ownerId: "u1", actionId: "establish_recordkeeping", ruleId: "establish_recordkeeping", type: "reopened", reason: null, at: "2026-09-12T00:00:00.000Z" },
    ];
    const plan = generatePlan(input({ events }));
    const rec = plan.thirtyDayPlan.find((a) => a.actionId === "establish_recordkeeping");
    expect(rec?.status).toBe("in_progress");
  });
});

describe("determinism", () => {
  it("same input yields identical output", () => {
    const a = generatePlan(input({}));
    const b = generatePlan(input({}));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.engineVersion).toBe(b.engineVersion);
  });
});
