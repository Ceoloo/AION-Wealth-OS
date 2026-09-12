import { describe, it, expect } from "vitest";
import { emptyBundle } from "../data/bundle";
import {
  acknowledgePartners,
  addSnapshot,
  recordActionEvent,
  recordReferralEvent,
  setPartnerStatus,
  setProfile,
  upsertAccount,
} from "./mutations";
import type { Ctx } from "./mutations";

function ctx(): Ctx {
  let n = 0;
  let t = 0;
  return {
    ownerId: "u1",
    id: () => `id-${++n}`,
    now: () => `2026-09-1${(t += 1)}T00:00:00.000Z`,
  };
}

describe("mutations", () => {
  it("adds dated snapshots without replacing history", () => {
    const c = ctx();
    let b = emptyBundle("u1");
    b = addSnapshot(b, base("2026-09-01"), c);
    b = addSnapshot(b, base("2026-09-08"), c);
    expect(b.snapshots.length).toBe(2);
    expect(b.snapshots.map((s) => s.asOf)).toEqual(["2026-09-01", "2026-09-08"]);
  });

  it("validation rejects non-integer cents", () => {
    const c = ctx();
    const b = emptyBundle("u1");
    expect(() => addSnapshot(b, { ...base("2026-09-01"), takeHomeIncomeCents: 10.5 }, c)).toThrow();
  });

  it("keeps unknown values as null (not zero)", () => {
    const c = ctx();
    let b = emptyBundle("u1");
    b = addSnapshot(b, { ...base("2026-09-01"), essentialSpendingCents: null }, c);
    expect(b.snapshots[0]!.essentialSpendingCents).toBeNull();
  });

  it("requires a reason to skip/defer", () => {
    const c = ctx();
    const b = emptyBundle("u1");
    expect(() =>
      recordActionEvent(b, { actionId: "x", ruleId: "x", type: "skipped" }, c),
    ).toThrow(/reason/i);
    expect(() =>
      recordActionEvent(b, { actionId: "x", ruleId: "x", type: "deferred", reason: "later" }, c),
    ).not.toThrow();
  });

  it("profile keeps createdAt stable across updates", () => {
    const c = ctx();
    let b = emptyBundle("u1");
    b = setProfile(b, profileInput(), c);
    const created = b.profile!.createdAt;
    b = setProfile(b, { ...profileInput(), experience: "some" }, c);
    expect(b.profile!.createdAt).toBe(created);
    expect(b.profile!.experience).toBe("some");
  });

  it("tracks partner status and acknowledgement", () => {
    let b = emptyBundle("u1");
    expect(b.partnersAcknowledged).toBe(false);
    b = setPartnerStatus(b, "kikoff", "signed_up");
    expect(b.partnerStatuses.kikoff).toBe("signed_up");
    b = acknowledgePartners(b);
    expect(b.partnersAcknowledged).toBe(true);
    // other fields preserved
    expect(b.partnerStatuses.kikoff).toBe("signed_up");
  });

  it("appends referral tracking events (append-only)", () => {
    const c = ctx();
    let b = emptyBundle("u1");
    b = recordReferralEvent(b, { partnerId: "kikoff", category: "credit_builder", type: "click" }, c);
    b = recordReferralEvent(b, { partnerId: "kikoff", category: "credit_builder", type: "signup_reported" }, c);
    expect(b.referralEvents.length).toBe(2);
    expect(b.referralEvents[0]!.type).toBe("click");
    expect(b.referralEvents[0]!.ownerId).toBe("u1");
    expect(b.referralEvents[1]!.type).toBe("signup_reported");
  });

  it("upsertAccount updates an existing account by id", () => {
    const c = ctx();
    let b = emptyBundle("u1");
    b = upsertAccount(b, accountInput(), c);
    const id = b.accounts[0]!.id;
    b = upsertAccount(b, { ...accountInput(), nickname: "Renamed" }, c, id);
    expect(b.accounts.length).toBe(1);
    expect(b.accounts[0]!.nickname).toBe("Renamed");
  });
});

function base(asOf: string) {
  return {
    asOf,
    takeHomeIncomeCents: 500000,
    essentialSpendingCents: 250000,
    otherSpendingCents: 80000,
    requiredDebtPaymentsCents: 60000,
    availableCashCents: 800000,
    otherAssetsCents: 0,
    liabilitiesCents: 300000,
    hasPastDueAccounts: false,
  };
}

function profileInput() {
  return {
    residenceState: "NY" as const,
    businessState: null,
    goals: ["form_business"],
    experience: "new" as const,
    weeklyTimeMinutes: 120,
  };
}

function accountInput() {
  return {
    nickname: "Card",
    classification: "personal" as const,
    kind: "credit_card" as const,
    balanceCents: 30000,
    aprBps: 2499,
    minPaymentCents: 3500,
    pastDueCents: 0,
    dueDate: null,
    creditLimitCents: 100000,
    isRevolving: true,
    includeInSnapshot: true,
  };
}
