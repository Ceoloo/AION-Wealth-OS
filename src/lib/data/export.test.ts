import { describe, it, expect } from "vitest";
import { buildExport } from "./export";
import { emptyBundle, type UserDataBundle } from "./bundle";
import type { FinancialSnapshot } from "../domain/types";

const NOW = "2026-09-12T12:00:00.000Z";

function bundleWith(snapshot: FinancialSnapshot): UserDataBundle {
  const b = emptyBundle("user-a");
  b.snapshots = [snapshot];
  return b;
}

const snapshot: FinancialSnapshot = {
  id: "s1",
  ownerId: "user-a",
  asOf: "2026-09-12",
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
};

describe("export", () => {
  it("produces markdown and valid JSON", () => {
    const { markdown, json } = buildExport(bundleWith(snapshot), "2026-09-12", NOW);
    expect(markdown).toMatch(/# AION Wealth OS/);
    expect(markdown).toMatch(/Monthly surplus/);
    expect(markdown).toMatch(/Open questions for a professional/);
    const parsed = JSON.parse(json);
    expect(parsed.ownerId).toBe("user-a");
    expect(parsed.exportVersion).toBe(2);
    expect(parsed.computed.summary.surplus.value).toBe(110000);
  });

  it("includes assumptions/sources and never fabricates a score", () => {
    const { markdown } = buildExport(bundleWith(snapshot), "2026-09-12", NOW);
    expect(markdown.toLowerCase()).not.toMatch(/your credit score is|guaranteed/);
    expect(markdown).toMatch(/not.*professional approval/i);
  });

  it("handles an empty bundle without crashing", () => {
    const { markdown, json } = buildExport(emptyBundle("user-a"), "2026-09-12", NOW);
    expect(markdown).toMatch(/No financial snapshot on file yet/);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("covers connected data: institutions, provenance, and never a token", () => {
    const b = bundleWith({
      ...snapshot,
      fieldSources: { availableCashCents: "derived", hasPastDueAccounts: "connected_account" },
    });
    b.connections = [
      {
        id: "c1",
        institutionId: "ins_109508",
        institutionName: "First Platypus Bank",
        status: "active",
        errorCode: null,
        lastSyncedAt: "2026-09-12T10:00:00.000Z",
        createdAt: NOW,
      },
    ];
    b.accounts = [
      {
        id: "a1",
        ownerId: "user-a",
        nickname: "Plaid Checking ••0000",
        classification: "personal",
        kind: "bank",
        balanceCents: 800000,
        aprBps: null,
        minPaymentCents: null,
        pastDueCents: null,
        dueDate: null,
        creditLimitCents: null,
        isRevolving: false,
        includeInSnapshot: false,
        createdAt: NOW,
        updatedAt: NOW,
        source: "connected_account",
        fieldSources: { balanceCents: "connected_account" },
        plaidItemId: "c1",
        syncedAt: NOW,
      },
    ];
    const { markdown, json } = buildExport(b, "2026-09-12", NOW);
    expect(markdown).toMatch(/## Connected institutions/);
    expect(markdown).toMatch(/First Platypus Bank/);
    expect(markdown).toMatch(/availableCashCents: Calculated/);
    const parsed = JSON.parse(json);
    expect(parsed.connections).toHaveLength(1);
    expect(parsed.accounts[0].fieldSources.balanceCents).toBe("connected_account");
    expect(parsed.snapshots[0].fieldSources.availableCashCents).toBe("derived");
    expect(json).not.toMatch(/access[_-]?token|ciphertext|access-(sandbox|production)/i);
  });
});
