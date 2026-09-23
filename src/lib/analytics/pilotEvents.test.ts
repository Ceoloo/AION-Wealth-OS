import { describe, it, expect } from "vitest";
import { derivePilotMilestones } from "./pilotEvents";
import { emptyBundle } from "../data/bundle";
import { buildDemoBundle } from "../store/demoData";
import type { UserDataBundle } from "../data/bundle";

function realBundle(): UserDataBundle {
  const b = emptyBundle("user-a");
  b.profile = {
    id: "p", ownerId: "user-a", residenceState: "NY", businessState: null, situation: null, goals: [],
    experience: "new", weeklyTimeMinutes: 60,
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  };
  b.snapshots = [{
    id: "s", ownerId: "user-a", asOf: "2026-09-02",
    takeHomeIncomeCents: 1, essentialSpendingCents: null, otherSpendingCents: null,
    requiredDebtPaymentsCents: null, availableCashCents: null, otherAssetsCents: null,
    liabilitiesCents: null, hasPastDueAccounts: null, selfReportedScore: null,
    createdAt: "2026-09-02T00:00:00.000Z",
  }];
  b.actionEvents = [{
    id: "e", ownerId: "user-a", actionId: "establish_recordkeeping", ruleId: "establish_recordkeeping",
    type: "completed_user_reported", reason: null, at: "2026-09-03T00:00:00.000Z", occurrenceKey: "default",
  }];
  b.weeklyReviews = [{
    id: "w", ownerId: "user-a", weekOf: "2026-09-07", updatedBalancesNote: "private note",
    actionsCompleted: [], obstacles: "private obstacle text", timeSpentMinutes: 30,
    nextPriorities: null, createdAt: "2026-09-08T00:00:00.000Z",
  }];
  return b;
}

describe("pilot milestones", () => {
  it("derives the four milestones in order", () => {
    const m = derivePilotMilestones(realBundle(), { isDemo: false, planViewedAt: "2026-09-02T10:00:00.000Z" });
    expect(m.map((x) => x.name)).toEqual([
      "onboarding_completed",
      "first_plan_viewed",
      "first_action_completed",
      "weekly_review_submitted",
    ]);
  });

  it("excludes synthetic demo activity entirely", () => {
    expect(derivePilotMilestones(buildDemoBundle(), { isDemo: true })).toEqual([]);
  });

  it("carries no financial values, notes, or identifiers", () => {
    const m = derivePilotMilestones(realBundle(), { isDemo: false, planViewedAt: "2026-09-02T10:00:00.000Z" });
    const json = JSON.stringify(m);
    expect(json).not.toMatch(/private note|private obstacle/); // free text excluded
    expect(json).not.toMatch(/user-a/); // no owner identifier
    expect(Object.keys(m[0]!).sort()).toEqual(["at", "name"]); // name + time only
  });

  it("omits milestones that have not happened", () => {
    expect(derivePilotMilestones(emptyBundle("user-a"), { isDemo: false })).toEqual([]);
  });

  it("keeps referral conversion out of financial-progress milestones", () => {
    const b = realBundle();
    b.referralEvents = [{
      id: "r", ownerId: "user-a", partnerId: "kikoff",
      category: "credit_builder", type: "signup_reported", at: "2026-09-04T00:00:00.000Z",
    }];
    const names = derivePilotMilestones(b, { isDemo: false }).map((x) => x.name);
    expect(names).not.toContain("signup_reported");
    expect(JSON.stringify(derivePilotMilestones(b, { isDemo: false }))).not.toMatch(/kikoff/);
  });
});
