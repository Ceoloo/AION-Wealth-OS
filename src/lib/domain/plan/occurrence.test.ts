import { describe, it, expect } from "vitest";
import { generatePlan } from "./engine";
import { episodeIndex } from "./rules";
import type { Account, ActionEvent, FinancialSnapshot, Profile } from "../types";

const NOW = "2026-09-12T12:00:00.000Z";
const ASOF = "2026-09-12";

function profile(): Profile {
  return {
    id: "p1", ownerId: "u1", residenceState: "NY", businessState: null, goals: [],
    experience: "new", weeklyTimeMinutes: 120, createdAt: NOW, updatedAt: NOW,
  };
}
function snap(o: Partial<FinancialSnapshot> = {}): FinancialSnapshot {
  return {
    id: "s1", ownerId: "u1", asOf: ASOF,
    takeHomeIncomeCents: 500000, essentialSpendingCents: 250000, otherSpendingCents: 80000,
    requiredDebtPaymentsCents: 60000, availableCashCents: 2000000, otherAssetsCents: 0,
    liabilitiesCents: 300000, hasPastDueAccounts: false, selfReportedScore: null, createdAt: NOW,
    ...o,
  };
}
function pastDueAccount(id: string): Account {
  return {
    id, ownerId: "u1", nickname: id, classification: "personal", kind: "credit_card",
    balanceCents: 20000, aprBps: null, minPaymentCents: 5000, pastDueCents: 6000,
    dueDate: "2026-09-01", creditLimitCents: 100000, isRevolving: true,
    includeInSnapshot: true, createdAt: NOW, updatedAt: NOW,
  };
}
function completion(actionId: string, occurrenceKey: string | null, at = "2026-09-10T00:00:00.000Z"): ActionEvent {
  return {
    id: `e-${actionId}-${occurrenceKey}-${at}`, ownerId: "u1", actionId, ruleId: actionId,
    type: "completed_user_reported", reason: null, at, occurrenceKey,
  };
}
function run(o: {
  snapshot?: FinancialSnapshot | null;
  snapshots?: FinancialSnapshot[];
  accounts?: Account[];
  events?: ActionEvent[];
}) {
  return generatePlan({
    asOf: ASOF, generatedAt: NOW, profile: profile(),
    snapshot: o.snapshot === undefined ? snap() : o.snapshot,
    snapshots: o.snapshots,
    accounts: o.accounts ?? [], creditIssues: [], events: o.events ?? [],
  });
}

describe("action completion is separate from issue resolution", () => {
  it("keeps the action complete while still reporting the past-due issue as ACTIVE", () => {
    const accounts = [pastDueAccount("acct-1")];
    // The user contacted the creditor for exactly this occurrence.
    const plan = run({ accounts, events: [completion("review_past_due", "acct-1")] });
    const action = plan.thirtyDayPlan.find((a) => a.ruleId === "review_past_due")!;

    expect(action.status).toBe("complete"); // what the user DID is preserved
    expect(action.issueState).toBe("active"); // the account is STILL past due
    expect(action.completionKind).toBe("user_reported");
  });

  it("a NEW past-due account reactivates the action instead of hiding behind the old completion", () => {
    const events = [completion("review_past_due", "acct-1")];
    // acct-2 newly falls past due → different occurrence fingerprint.
    const plan = run({ accounts: [pastDueAccount("acct-1"), pastDueAccount("acct-2")], events });
    const action = plan.thirtyDayPlan.find((a) => a.ruleId === "review_past_due")!;

    expect(action.status).toBe("needs_attention");
    expect(action.occurrenceKey).toBe("acct-1|acct-2");
    // The earlier completion is retained as history, not erased.
    expect(action.priorCompletions).toBe(1);
    expect(plan.priorities.some((a) => a.ruleId === "review_past_due")).toBe(true);
  });

  it("the same past-due set does NOT reactivate a completed action", () => {
    const plan = run({
      accounts: [pastDueAccount("acct-1")],
      events: [completion("review_past_due", "acct-1")],
    });
    expect(plan.priorities.some((a) => a.ruleId === "review_past_due")).toBe(false);
  });
});

describe("recurring issues get a new occurrence after a relapse", () => {
  const negative = (id: string, asOf: string) =>
    snap({ id, asOf, takeHomeIncomeCents: 100000, essentialSpendingCents: 300000, createdAt: `${asOf}T00:00:00.000Z` });
  const positive = (id: string, asOf: string) =>
    snap({ id, asOf, createdAt: `${asOf}T00:00:00.000Z` });

  it("counts false->true transitions as episodes", () => {
    const history = [
      negative("a", "2026-06-01"), // episode 1
      negative("b", "2026-07-01"), // same episode
      positive("c", "2026-08-01"), // recovered
      negative("d", "2026-09-01"), // episode 2
    ];
    expect(episodeIndex(history, (s) =>
      (s.takeHomeIncomeCents ?? 0) - (s.essentialSpendingCents ?? 0) -
      (s.otherSpendingCents ?? 0) - (s.requiredDebtPaymentsCents ?? 0) < 0,
    )).toBe(2);
  });

  it("a completion from episode 1 does not suppress episode 2", () => {
    const history = [negative("a", "2026-06-01"), positive("c", "2026-08-01"), negative("d", "2026-09-01")];
    const plan = run({
      snapshot: history.at(-1),
      snapshots: history,
      events: [completion("stabilize_negative_surplus", "episode:1")],
    });
    const action = plan.thirtyDayPlan.find((a) => a.ruleId === "stabilize_negative_surplus")!;
    expect(action.occurrenceKey).toBe("episode:2");
    expect(action.status).toBe("needs_attention"); // the relapse resurfaces
    expect(action.priorCompletions).toBe(1); // history retained
  });

  it("within the same episode the completion still holds", () => {
    const history = [negative("a", "2026-08-01"), negative("d", "2026-09-01")];
    const plan = run({
      snapshot: history.at(-1),
      snapshots: history,
      events: [completion("stabilize_negative_surplus", "episode:1")],
    });
    const action = plan.thirtyDayPlan.find((a) => a.ruleId === "stabilize_negative_surplus")!;
    expect(action.occurrenceKey).toBe("episode:1");
    expect(action.status).toBe("complete");
  });
});

describe("history is retained and the denominator is honest", () => {
  it("retains a completion when the rule stops applying, as a resolved archive entry", () => {
    // Completed while past due; now nothing is past due so the rule no longer applies.
    const plan = run({ accounts: [], events: [completion("review_past_due", "acct-1")] });

    expect(plan.thirtyDayPlan.some((a) => a.ruleId === "review_past_due")).toBe(false);
    const archived = plan.archivedCompletions.find((a) => a.ruleId === "review_past_due");
    expect(archived).toBeDefined();
    expect(archived!.status).toBe("complete");
    expect(archived!.issueState).toBe("resolved");
  });

  it("does not inflate progress by silently shrinking the denominator", () => {
    const withIssue = run({ accounts: [pastDueAccount("acct-1")], events: [completion("review_past_due", "acct-1")] });
    const resolved = run({ accounts: [], events: [completion("review_past_due", "acct-1")] });

    // The completed step stays counted on both sides of the transition.
    expect(withIssue.progress.total).toBe(resolved.progress.total);
    expect(withIssue.progress.completed).toBe(resolved.progress.completed);
    expect(resolved.progress.basis).toMatch(/denominator|no longer apply/i);
  });

  it("progress counts archived completions in both numerator and denominator", () => {
    const plan = run({ accounts: [], events: [completion("review_past_due", "acct-1")] });
    expect(plan.progress.total).toBe(plan.thirtyDayPlan.length + plan.archivedCompletions.length);
    expect(plan.progress.completed).toBeGreaterThanOrEqual(1);
    expect(plan.progress.completed).toBeLessThanOrEqual(plan.progress.total);
  });
});

describe("backwards compatibility with pre-occurrence events", () => {
  it("legacy events (no occurrenceKey) still complete default-occurrence rules", () => {
    const plan = run({ events: [completion("establish_recordkeeping", null)] });
    const action = plan.thirtyDayPlan.find((a) => a.ruleId === "establish_recordkeeping")!;
    expect(action.occurrenceKey).toBe("default");
    expect(action.status).toBe("complete");
  });
});
