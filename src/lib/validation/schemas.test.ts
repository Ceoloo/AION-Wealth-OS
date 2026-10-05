import { describe, it, expect } from "vitest";
import {
  actionEventArgsSchema,
  selfReportableFormationStatusSchema,
  partnerStatusSchema,
  referralEventTypeSchema,
  engineIdSchema,
  profileInputSchema,
} from "./schemas";

describe("runtime guards reject self-asserted verification", () => {
  it("rejects completed_verified from an ordinary write path", () => {
    const res = actionEventArgsSchema.safeParse({
      actionId: "review_past_due",
      ruleId: "review_past_due",
      type: "completed_verified",
    });
    expect(res.success).toBe(false);
  });

  it("accepts self-reported completion", () => {
    const res = actionEventArgsSchema.safeParse({
      actionId: "review_past_due",
      ruleId: "review_past_due",
      type: "completed_user_reported",
    });
    expect(res.success).toBe(true);
  });

  it("rejects the formation 'verified' status", () => {
    expect(selfReportableFormationStatusSchema.safeParse("verified").success).toBe(false);
    expect(selfReportableFormationStatusSchema.safeParse("user_reported_done").success).toBe(true);
  });
});

describe("runtime guards on shape, not just TypeScript types", () => {
  it("requires a reason to skip or defer", () => {
    const skip = { actionId: "a_b", ruleId: "a_b", type: "skipped" as const };
    expect(actionEventArgsSchema.safeParse(skip).success).toBe(false);
    expect(actionEventArgsSchema.safeParse({ ...skip, reason: "later" }).success).toBe(true);
    expect(actionEventArgsSchema.safeParse({ ...skip, reason: "   " }).success).toBe(false);
  });

  it("rejects unknown event types and malformed ids", () => {
    expect(
      actionEventArgsSchema.safeParse({ actionId: "a", ruleId: "a", type: "nonsense" }).success,
    ).toBe(false);
    expect(engineIdSchema.safeParse("drop table; --").success).toBe(false);
    expect(engineIdSchema.safeParse("").success).toBe(false);
    expect(engineIdSchema.safeParse("review_past_due").success).toBe(true);
  });

  it("bounds reason length", () => {
    const res = actionEventArgsSchema.safeParse({
      actionId: "a_b", ruleId: "a_b", type: "deferred", reason: "x".repeat(501),
    });
    expect(res.success).toBe(false);
  });

  it("constrains partner + referral enums", () => {
    expect(partnerStatusSchema.safeParse("signed_up").success).toBe(true);
    expect(partnerStatusSchema.safeParse("verified").success).toBe(false);
    expect(referralEventTypeSchema.safeParse("click").success).toBe(true);
    expect(referralEventTypeSchema.safeParse("purchase").success).toBe(false);
  });
});

describe("profileInputSchema — the situation field", () => {
  const legacy = {
    residenceState: "NY" as const,
    businessState: null,
    goals: ["form_business"],
    experience: "new" as const,
    weeklyTimeMinutes: 120,
  };

  it("accepts a profile stored before the column existed, as not-answered", () => {
    // Demo bundles and profile rows written before migration 0005 carry no
    // `situation` key at all. An absent answer must not fail the whole save.
    expect(profileInputSchema.parse(legacy).situation).toBeNull();
  });

  it("keeps an explicit null distinct from a real answer", () => {
    expect(profileInputSchema.parse({ ...legacy, situation: null }).situation).toBeNull();
    expect(profileInputSchema.parse({ ...legacy, situation: "behind_on_bills" }).situation).toBe(
      "behind_on_bills",
    );
  });

  it("rejects a situation outside the fixed set", () => {
    expect(profileInputSchema.safeParse({ ...legacy, situation: "doing_great" }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...legacy, situation: "" }).success).toBe(false);
  });
});
