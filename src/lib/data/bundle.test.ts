import { describe, it, expect } from "vitest";
import { mostRecentScore } from "./bundle";
import type { FinancialSnapshot } from "../domain/types";

function snap(asOf: string, score: number | null, createdAt = `${asOf}T00:00:00.000Z`): FinancialSnapshot {
  return {
    id: `s-${asOf}-${score ?? "none"}`,
    ownerId: "u1",
    asOf,
    takeHomeIncomeCents: null,
    essentialSpendingCents: null,
    otherSpendingCents: null,
    requiredDebtPaymentsCents: null,
    availableCashCents: null,
    otherAssetsCents: null,
    liabilitiesCents: null,
    hasPastDueAccounts: null,
    selfReportedScore:
      score === null ? null : { score, date: asOf, source: null, model: null },
    createdAt,
  };
}

describe("mostRecentScore", () => {
  it("returns null when no snapshot carries a score", () => {
    expect(mostRecentScore([])).toBeNull();
    expect(mostRecentScore([snap("2026-09-01", null)])).toBeNull();
  });

  it("keeps a recorded score visible after a later snapshot without one", () => {
    // The regression this exists for: recording a score then updating your
    // figures used to hide the score, because only the latest snapshot was read.
    const snapshots = [snap("2026-09-01", 640), snap("2026-09-10", null)];
    expect(mostRecentScore(snapshots)?.score).toBe(640);
  });

  it("returns the newest score when several were recorded", () => {
    const snapshots = [snap("2026-09-01", 640), snap("2026-09-15", 705), snap("2026-09-20", null)];
    expect(mostRecentScore(snapshots)?.score).toBe(705);
  });

  it("breaks a same-day tie by creation time, not array order", () => {
    const snapshots = [
      snap("2026-09-15", 700, "2026-09-15T10:00:00.000Z"),
      snap("2026-09-15", 660, "2026-09-15T08:00:00.000Z"),
    ];
    expect(mostRecentScore(snapshots)?.score).toBe(700);
  });

  it("does not mutate the array it is given", () => {
    const snapshots = [snap("2026-09-20", 700), snap("2026-09-01", 640)];
    const order = snapshots.map((s) => s.id);
    mostRecentScore(snapshots);
    expect(snapshots.map((s) => s.id)).toEqual(order);
  });
});
