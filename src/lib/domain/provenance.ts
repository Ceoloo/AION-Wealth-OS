import type {
  Account,
  AccountFigure,
  FieldSource,
  FinancialSnapshot,
  SnapshotFigure,
} from "./types";

/**
 * Provenance helpers. An absent entry means the figure was typed in by the
 * user: user_reported is the default and the weakest claim, so a missing or
 * unreadable tag can only ever understate how a number was obtained.
 */

export function accountFigureSource(a: Account, f: AccountFigure): FieldSource {
  return a.fieldSources?.[f] ?? "user_reported";
}

export function snapshotFigureSource(s: FinancialSnapshot, f: SnapshotFigure): FieldSource {
  return s.fieldSources?.[f] ?? "user_reported";
}

export const SOURCE_LABEL: Record<FieldSource, string> = {
  user_reported: "You entered",
  connected_account: "From your bank",
  derived: "Calculated",
  verified_source: "Verified",
};

/** Longer wording for tooltips and export, so nobody mistakes one for another. */
export const SOURCE_DESCRIPTION: Record<FieldSource, string> = {
  user_reported: "Entered by you. AION has not checked it.",
  connected_account:
    "Reported by your financial institution through your connection, as of the last sync. Not independently verified.",
  derived: "Calculated by AION from other figures. Only as accurate as those figures.",
  verified_source: "Confirmed against an independent source.",
};

const ACCOUNT_FIGURE_KEYS: readonly AccountFigure[] = [
  "balanceCents",
  "aprBps",
  "minPaymentCents",
  "pastDueCents",
  "dueDate",
  "creditLimitCents",
];

/**
 * After a user edits an account, any figure whose value changed is now theirs.
 * Mirrors the database trigger (migration 0006) so demo mode and the server
 * agree; in real mode the trigger is what actually enforces it.
 */
export function stampUserEdits(prev: Account, next: Account): Account {
  const sources = { ...(prev.fieldSources ?? {}) };
  for (const f of ACCOUNT_FIGURE_KEYS) {
    if (prev[f] !== next[f]) sources[f] = "user_reported";
  }
  return { ...next, fieldSources: sources };
}
