import { describe, it, expect } from "vitest";
import {
  rowToSnapshot,
  rowToAccount,
  rowToProfile,
  snapshotToRow,
  accountToRow,
  rowToReferralEvent,
} from "./mappers";

describe("row -> domain mappers", () => {
  it("preserves null as unknown (never coerces to 0)", () => {
    const s = rowToSnapshot({
      id: "s1",
      owner_id: "u1",
      as_of: "2026-09-12",
      take_home_income_cents: 500000,
      essential_spending_cents: null,
      other_spending_cents: null,
      required_debt_payments_cents: null,
      available_cash_cents: null,
      other_assets_cents: null,
      liabilities_cents: null,
      has_past_due_accounts: null,
      self_reported_score: null,
      created_at: "2026-09-12T00:00:00.000Z",
    });
    expect(s.takeHomeIncomeCents).toBe(500000);
    expect(s.essentialSpendingCents).toBeNull();
    expect(s.hasPastDueAccounts).toBeNull();
    expect(s.ownerId).toBe("u1");
  });

  it("maps account revolving flags and unknown limit", () => {
    const a = rowToAccount({
      id: "a1",
      owner_id: "u1",
      nickname: "Card",
      classification: "personal",
      kind: "credit_card",
      balance_cents: 30000,
      apr_bps: null,
      min_payment_cents: 3500,
      past_due_cents: 0,
      due_date: null,
      credit_limit_cents: null,
      is_revolving: true,
      include_in_snapshot: true,
      created_at: "x",
      updated_at: "y",
    });
    expect(a.isRevolving).toBe(true);
    expect(a.creditLimitCents).toBeNull();
    expect(a.aprBps).toBeNull();
  });

  it("maps profile goals array and nullable state", () => {
    const p = rowToProfile({
      id: "p1", owner_id: "u1", residence_state: "NY", business_state: null,
      goals: ["form_business"], experience: "new", weekly_time_minutes: 120,
      created_at: "x", updated_at: "y",
    });
    expect(p.goals).toEqual(["form_business"]);
    expect(p.businessState).toBeNull();
  });

  it("maps referral event", () => {
    const e = rowToReferralEvent({
      id: "e1", owner_id: "u1", partner_id: "kikoff", category: "credit_builder",
      type: "click", at: "2026-09-12T00:00:00.000Z",
    });
    expect(e.partnerId).toBe("kikoff");
    expect(e.type).toBe("click");
  });
});

describe("domain -> row mappers", () => {
  it("round-trips a snapshot's money fields", () => {
    const row = snapshotToRow({
      id: "s1", ownerId: "u1", asOf: "2026-09-12",
      takeHomeIncomeCents: 500000, essentialSpendingCents: null, otherSpendingCents: 0,
      requiredDebtPaymentsCents: 60000, availableCashCents: 800000, otherAssetsCents: 0,
      liabilitiesCents: 300000, hasPastDueAccounts: false, selfReportedScore: null,
      createdAt: "x",
    });
    expect(row.owner_id).toBe("u1");
    expect(row.take_home_income_cents).toBe(500000);
    expect(row.essential_spending_cents).toBeNull();
    const back = rowToSnapshot(row);
    expect(back.takeHomeIncomeCents).toBe(500000);
    expect(back.essentialSpendingCents).toBeNull();
  });

  it("account row uses snake_case columns", () => {
    const row = accountToRow({
      id: "a1", ownerId: "u1", nickname: "Card", classification: "business", kind: "loan",
      balanceCents: 100000, aprBps: 899, minPaymentCents: 41000, pastDueCents: 0, dueDate: null,
      creditLimitCents: null, isRevolving: false, includeInSnapshot: true, createdAt: "x", updatedAt: "y",
    });
    expect(row.credit_limit_cents).toBeNull();
    expect(row.is_revolving).toBe(false);
    expect(row.classification).toBe("business");
  });
});
