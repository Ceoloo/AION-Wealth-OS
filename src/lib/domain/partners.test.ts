import { describe, it, expect } from "vitest";
import { partnerVisibility, isFoundationStable, referralFunnel, PARTNERS, AFFILIATE_DISCLOSURE, type ReferralEvent } from "./partners";
import { summarize } from "./finance";
import type { Account, FinancialSnapshot } from "./types";

function snap(o: Partial<FinancialSnapshot>): FinancialSnapshot {
  return {
    id: "s1", ownerId: "u1", asOf: "2026-09-12",
    takeHomeIncomeCents: 500000, essentialSpendingCents: 200000, otherSpendingCents: 50000,
    requiredDebtPaymentsCents: 50000, availableCashCents: 900000, otherAssetsCents: 0,
    liabilitiesCents: 0, hasPastDueAccounts: false, selfReportedScore: null,
    createdAt: "2026-09-12T00:00:00.000Z", ...o,
  };
}

describe("partner foundations gate", () => {
  it("locks speculative apps when surplus is negative", () => {
    const summary = summarize(snap({ takeHomeIncomeCents: 100000, essentialSpendingCents: 300000 }), []);
    const v = partnerVisibility(summary);
    const lockedIds = v.locked.map((p) => p.id);
    expect(lockedIds).toContain("coinbase");
    expect(lockedIds).toContain("kalshi");
    // credit/banking always available
    expect(v.available.map((p) => p.id)).toEqual(expect.arrayContaining(["kikoff", "self", "chime", "cashapp"]));
    expect(v.lockReason).toBeTruthy();
  });

  it("locks speculative apps when there are past-due accounts", () => {
    const acct: Account = {
      id: "a", ownerId: "u1", nickname: "x", classification: "personal", kind: "credit_card",
      balanceCents: 1000, aprBps: null, minPaymentCents: 0, pastDueCents: 5000, dueDate: null,
      creditLimitCents: 100000, isRevolving: true, includeInSnapshot: true,
      createdAt: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z",
    };
    const v = partnerVisibility(summarize(snap({}), [acct]));
    expect(v.locked.map((p) => p.id)).toContain("coinbase");
  });

  it("locks speculative apps when cash coverage is under 3 months", () => {
    // 200k cash / (200k essentials + 50k debt) = 0.8 months
    const summary = summarize(snap({ availableCashCents: 200000 }), []);
    expect(isFoundationStable(summary)).toBe(false);
    expect(partnerVisibility(summary).locked.length).toBe(2);
  });

  it("unlocks speculative apps only when stable (positive surplus, no past due, 3+ months cash)", () => {
    const summary = summarize(snap({}), []); // surplus +200k, coverage 3.6 months, no past due
    expect(isFoundationStable(summary)).toBe(true);
    expect(partnerVisibility(summary).locked.length).toBe(0);
  });

  it("treats unknown/no data as NOT stable (never assumes stable)", () => {
    expect(isFoundationStable(null)).toBe(false);
    const v = partnerVisibility(null);
    expect(v.locked.map((p) => p.id)).toEqual(expect.arrayContaining(["coinbase", "kalshi"]));
  });

  it("every speculative partner carries a risk note and no AION-authored offer", () => {
    for (const p of PARTNERS.filter((x) => x.category === "investing_speculative")) {
      expect(p.riskNote).toBeTruthy();
      expect(p.partnerOffer).toBeNull();
    }
  });

  it("affiliate disclosure names the referral relationship and disclaims advice", () => {
    expect(AFFILIATE_DISCLOSURE.toLowerCase()).toMatch(/referral/);
    expect(AFFILIATE_DISCLOSURE.toLowerCase()).toMatch(/earn a reward|may earn/);
    expect(AFFILIATE_DISCLOSURE.toLowerCase()).toMatch(/not.*advice/);
  });
});

describe("referralFunnel", () => {
  const ev = (partnerId: string, type: "click" | "signup_reported", at: string): ReferralEvent => ({
    id: `${partnerId}-${at}`, ownerId: "u1", partnerId, category: "credit_builder", type, at,
  });

  it("aggregates clicks and reported signups per app with last-click time", () => {
    const events = [
      ev("kikoff", "click", "2026-09-10T00:00:00.000Z"),
      ev("kikoff", "click", "2026-09-12T00:00:00.000Z"),
      ev("kikoff", "signup_reported", "2026-09-12T01:00:00.000Z"),
      ev("self", "click", "2026-09-11T00:00:00.000Z"),
    ];
    const rows = referralFunnel(events);
    const kikoff = rows.find((r) => r.partnerId === "kikoff")!;
    expect(kikoff.clicks).toBe(2);
    expect(kikoff.reportedSignups).toBe(1);
    expect(kikoff.lastClickAt).toBe("2026-09-12T00:00:00.000Z");
    const coinbase = rows.find((r) => r.partnerId === "coinbase")!;
    expect(coinbase.clicks).toBe(0);
    expect(coinbase.lastClickAt).toBeNull();
    // one row per known partner
    expect(rows.length).toBe(PARTNERS.length);
  });

  it("returns zeroed rows for no events", () => {
    const rows = referralFunnel([]);
    expect(rows.every((r) => r.clicks === 0 && r.reportedSignups === 0)).toBe(true);
  });
});
