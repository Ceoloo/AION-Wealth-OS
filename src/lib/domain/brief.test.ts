import { describe, it, expect } from "vitest";
import { generateWeeklyBrief, shiftDays, type BriefInput } from "./brief";
import type { CreditIssue, FinancialSnapshot, ActionEvent, GeneratedPlan } from "./types";
import type { JourneyAssessment } from "./journey";

const END = "2026-10-04";
const GEN = `${END}T12:00:00.000Z`;

function snap(asOf: string, over: Partial<FinancialSnapshot> = {}): FinancialSnapshot {
  return {
    id: `s-${asOf}`,
    ownerId: "u1",
    asOf,
    takeHomeIncomeCents: 500_000,
    essentialSpendingCents: 200_000,
    otherSpendingCents: 50_000,
    requiredDebtPaymentsCents: 50_000,
    availableCashCents: 100_000,
    otherAssetsCents: null,
    liabilitiesCents: 800_000,
    hasPastDueAccounts: false,
    selfReportedScore: null,
    createdAt: `${asOf}T00:00:00.000Z`,
    ...over,
  };
}

function event(at: string, over: Partial<ActionEvent> = {}): ActionEvent {
  return {
    id: `e-${at}`,
    ownerId: "u1",
    actionId: "build_cash_coverage",
    ruleId: "build_cash_coverage",
    type: "completed_user_reported",
    reason: null,
    at,
    occurrenceKey: "default",
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
    explanation: "x",
    relevantDate: null,
    followUpDate: null,
    state: "user_submitted",
    createdAt: `${END}T00:00:00.000Z`,
    updatedAt: `${END}T00:00:00.000Z`,
    ...over,
  };
}

const PLAN: GeneratedPlan = {
  engineVersion: "test",
  generatedAt: GEN,
  snapshotId: null,
  priorities: [],
  thirtyDayPlan: [],
  archivedCompletions: [],
  progress: { completed: 0, total: 0, basis: "" },
  notices: [],
};

const JOURNEY: JourneyAssessment = {
  version: "test",
  currentStage: "stabilize",
  stages: [],
  basis: "",
  provisional: null,
  allAssessedPassed: false,
};

function input(over: Partial<BriefInput> = {}): BriefInput {
  const base: BriefInput = {
    asOf: END,
    generatedAt: GEN,
    snapshots: [],
    creditIssues: [],
    events: [],
    plan: PLAN,
    journey: JOURNEY,
  };
  return { ...base, ...over };
}

function change(b: ReturnType<typeof generateWeeklyBrief>, key: string) {
  return b.figureChanges.find((c) => c.key === key)!;
}

describe("shiftDays", () => {
  it("shifts in UTC and crosses month boundaries", () => {
    expect(shiftDays("2026-10-04", -7)).toBe("2026-09-27");
    expect(shiftDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("generateWeeklyBrief — period", () => {
  it("covers the seven days ending today by default", () => {
    const b = generateWeeklyBrief(input());
    expect(b.periodStart).toBe("2026-09-27");
    expect(b.periodEnd).toBe(END);
  });

  it("compares the newest entry in the period against the newest one before it", () => {
    // The user recorded once this week; the comparison must reach back.
    const b = generateWeeklyBrief(
      input({
        snapshots: [
          snap("2026-09-01", { availableCashCents: 100_000 }),
          snap("2026-10-02", { availableCashCents: 160_000 }),
        ],
      }),
    );
    expect(b.comparedFrom).toBe("2026-09-01");
    expect(b.comparedTo).toBe("2026-10-02");
    expect(change(b, "availableCash").deltaCents).toBe(60_000);
    expect(change(b, "availableCash").direction).toBe("up");
  });

  it("makes no comparison for a first-ever entry, and says why", () => {
    const b = generateWeeklyBrief(input({ snapshots: [snap("2026-10-02")] }));
    expect(b.comparedFrom).toBeNull();
    expect(b.figureChanges).toEqual([]);
    expect(b.comparisonNote).toContain("first recorded entry");
  });

  it("says nothing moved when no entry was recorded in the period", () => {
    const b = generateWeeklyBrief(input({ snapshots: [snap("2026-08-01")] }));
    expect(b.comparedTo).toBeNull();
    expect(b.comparisonNote).toContain("didn't record new figures");
  });
});

describe("generateWeeklyBrief — unknowns are never treated as zero", () => {
  it("reports no delta when the earlier figure is unknown", () => {
    const b = generateWeeklyBrief(
      input({
        snapshots: [
          snap("2026-09-01", { availableCashCents: null }),
          snap("2026-10-02", { availableCashCents: 160_000 }),
        ],
      }),
    );
    const c = change(b, "availableCash");
    expect(c.deltaCents).toBeNull();
    expect(c.direction).toBe("unknown");
    expect(c.note).toContain("no earlier figure");
  });

  it("reports no delta when the newer figure is unknown", () => {
    const b = generateWeeklyBrief(
      input({
        snapshots: [
          snap("2026-09-01", { liabilitiesCents: 800_000 }),
          snap("2026-10-02", { liabilitiesCents: null }),
        ],
      }),
    );
    const c = change(b, "liabilities");
    expect(c.deltaCents).toBeNull();
    expect(c.note).toContain("newer entry");
  });

  it("an unknown figure never counts as movement", () => {
    const b = generateWeeklyBrief(
      input({
        snapshots: [
          snap("2026-09-01", { availableCashCents: null, liabilitiesCents: null }),
          snap("2026-10-02", { availableCashCents: null, liabilitiesCents: null }),
        ],
      }),
    );
    expect(b.quiet).toBe(true);
  });
});

describe("generateWeeklyBrief — what the user recorded", () => {
  it("lists only events inside the period", () => {
    const b = generateWeeklyBrief(
      input({
        events: [
          event("2026-09-20T10:00:00.000Z"), // before the period
          event("2026-10-01T10:00:00.000Z"),
          event("2026-10-04T10:00:00.000Z"),
        ],
      }),
    );
    expect(b.recorded).toHaveLength(2);
    expect(b.recorded.join(" ")).not.toContain("2026-09-20");
  });

  it("treats the period as exclusive at the start and inclusive at the end", () => {
    const b = generateWeeklyBrief(
      input({
        events: [
          event("2026-09-27T10:00:00.000Z"), // == periodStart, excluded
          event("2026-10-04T23:00:00.000Z"), // == periodEnd, included
        ],
      }),
    );
    expect(b.recorded).toHaveLength(1);
    expect(b.recorded[0]).toContain("2026-10-04");
  });

  it("omits bookkeeping events the user did not perform", () => {
    const b = generateWeeklyBrief(
      input({ events: [event("2026-10-01T10:00:00.000Z", { type: "generated" })] }),
    );
    expect(b.recorded).toEqual([]);
  });

  it("includes the reason the user gave for a skip or defer", () => {
    const b = generateWeeklyBrief(
      input({
        events: [event("2026-10-01T10:00:00.000Z", { type: "deferred", reason: "Doing it next week" })],
      }),
    );
    expect(b.recorded[0]).toContain("deferred");
    expect(b.recorded[0]).toContain("Doing it next week");
  });
});

describe("generateWeeklyBrief — follow-ups", () => {
  it("separates overdue from upcoming follow-ups", () => {
    const b = generateWeeklyBrief(
      input({
        creditIssues: [
          issue({ id: "a", creditorNickname: "Late", followUpDate: "2026-10-01" }),
          issue({ id: "b", creditorNickname: "Soon", followUpDate: "2026-10-07" }),
          issue({ id: "c", creditorNickname: "Far", followUpDate: "2026-12-01" }),
        ],
      }),
    );
    expect(b.overdue.join(" ")).toContain("Late");
    expect(b.dueSoon.join(" ")).toContain("Soon");
    expect(`${b.overdue.join(" ")} ${b.dueSoon.join(" ")}`).not.toContain("Far");
  });

  it("ignores follow-ups on resolved issues", () => {
    const b = generateWeeklyBrief(
      input({ creditIssues: [issue({ followUpDate: "2026-10-01", state: "resolved" })] }),
    );
    expect(b.overdue).toEqual([]);
  });

  it("flags figures that have gone stale", () => {
    const b = generateWeeklyBrief(input({ snapshots: [snap("2026-08-01")] }));
    expect(b.overdue.join(" ")).toContain("days old");
  });

  it("does not flag figures recorded inside the period as stale", () => {
    const b = generateWeeklyBrief(input({ snapshots: [snap("2026-09-01"), snap("2026-10-02")] }));
    expect(b.overdue.join(" ")).not.toContain("days old");
  });
});

describe("generateWeeklyBrief — honesty", () => {
  it("says a quiet week is quiet instead of manufacturing content", () => {
    const b = generateWeeklyBrief(input());
    expect(b.quiet).toBe(true);
    expect(b.headline).toContain("quiet");
    expect(b.recorded).toEqual([]);
  });

  it("never claims the app caused a change", () => {
    const b = generateWeeklyBrief(
      input({
        snapshots: [snap("2026-09-01", { availableCashCents: 100_000 }), snap("2026-10-02", { availableCashCents: 160_000 })],
        events: [event("2026-10-01T10:00:00.000Z")],
      }),
    );
    expect(b.basis).toContain("not evidence that this app caused anything");
    const text = JSON.stringify(b).toLowerCase();
    expect(text).not.toContain("because you");
    expect(text).not.toContain("thanks to");
    expect(text).not.toMatch(/\byour (?:actions?|progress) (?:caused|led to|resulted)/);
  });

  it("predicts nothing and mentions no score", () => {
    const b = generateWeeklyBrief(
      input({ snapshots: [snap("2026-09-01"), snap("2026-10-02", { availableCashCents: 160_000 })] }),
    );
    const text = JSON.stringify(b).toLowerCase();
    expect(text).not.toContain("score");
    expect(text).not.toContain("will reach");
    expect(text).not.toContain("on track to");
    expect(text).not.toContain("projected");
  });

  it("takes what is still unknown from the journey, so the two cannot disagree", () => {
    const b = generateWeeklyBrief(
      input({
        journey: {
          ...JOURNEY,
          stages: [
            { stage: "stabilize", label: "Stabilize", goal: "", gate: "", status: "unknown", detail: "No income recorded." },
            { stage: "build", label: "Build", goal: "", gate: "", status: "passed", detail: "fine" },
          ],
        },
      }),
    );
    expect(b.stillUnknown).toEqual(["Stabilize: No income recorded."]);
  });

  it("compares within the period when there is nothing recorded before it", () => {
    // Regression: someone who starts recording this week used to be told it was
    // a quiet week, with the false note "this is your first recorded entry".
    const b = generateWeeklyBrief(
      input({
        snapshots: [
          snap("2026-09-28", { availableCashCents: 100_000 }),
          snap("2026-10-03", { availableCashCents: 160_000 }),
        ],
      }),
    );
    expect(b.comparedFrom).toBe("2026-09-28");
    expect(b.comparedTo).toBe("2026-10-03");
    expect(change(b, "availableCash").deltaCents).toBe(60_000);
    expect(b.quiet).toBe(false);
    expect(b.comparisonNote).toBeNull();
    expect(b.comparisonBasis).toContain("earliest entry this period");
  });

  it("still reports a genuine first entry as one", () => {
    const b = generateWeeklyBrief(input({ snapshots: [snap("2026-10-03")] }));
    expect(b.comparedFrom).toBeNull();
    expect(b.comparisonNote).toContain("first recorded entry");
  });

  it("says which two entries were compared", () => {
    const b = generateWeeklyBrief(
      input({ snapshots: [snap("2026-09-01"), snap("2026-10-03", { availableCashCents: 1 })] }),
    );
    expect(b.comparisonBasis).toContain("most recent entry before 2026-09-27");
  });

  it("never headlines movement when nothing moved", () => {
    // Only reason this week isn't quiet is an upcoming follow-up.
    const b = generateWeeklyBrief(
      input({ creditIssues: [issue({ followUpDate: "2026-10-07" })] }),
    );
    expect(b.quiet).toBe(false);
    expect(b.figureChanges).toEqual([]);
    expect(b.headline).not.toContain("figures moved");
    expect(b.headline).toContain("follow-up");
  });

  it("is deterministic for identical input", () => {
    const i = input({
      snapshots: [snap("2026-09-01"), snap("2026-10-02", { availableCashCents: 160_000 })],
      events: [event("2026-10-01T10:00:00.000Z")],
    });
    expect(JSON.stringify(generateWeeklyBrief(i))).toBe(JSON.stringify(generateWeeklyBrief(i)));
  });
});
