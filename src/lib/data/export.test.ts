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
    expect(parsed.exportVersion).toBe(1);
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
});
