import type { Cents } from "./money";
import { sumKnown } from "./money";
import type { Account, FinancialSnapshot } from "./types";

/**
 * Deterministic financial calculations. Pure functions only — no AI, no I/O.
 *
 * Rules that hold everywhere:
 *  - Money is integer cents.
 *  - A missing value (null/undefined) is NEVER treated as 0. It is surfaced as
 *    "unknown" so the UI can label incomplete data explicitly.
 *  - Required debt payments are counted exactly once (see surplus + double-count check).
 *  - Zero denominators are handled explicitly and never produce Infinity/NaN.
 */

export type Completeness = "complete" | "partial" | "missing";

export interface Metric<T> {
  value: T | null;
  completeness: Completeness;
  /** Human-readable assumptions/labels attached to this metric. */
  assumptions: string[];
  /** Field names that were unknown and excluded from the computation. */
  missingInputs: string[];
}

function metric<T>(
  value: T | null,
  missingInputs: string[],
  assumptions: string[] = [],
  hadAnyInput = true,
): Metric<T> {
  // No usable value → "missing". A value with some unknown inputs → "partial".
  // A value with every input present → "complete".
  let completeness: Completeness;
  if (value === null || !hadAnyInput) {
    completeness = "missing";
  } else {
    completeness = missingInputs.length === 0 ? "complete" : "partial";
  }
  return { value, completeness, assumptions, missingInputs };
}

/**
 * Monthly surplus = take-home income − essential spending − other spending
 *                   − required debt payments.
 * Returns null if income is unknown (the anchor input). Missing expense
 * components are listed but treated as not-yet-provided, producing a partial
 * result rather than silently assuming zero.
 */
export function monthlySurplus(s: Pick<
  FinancialSnapshot,
  | "takeHomeIncomeCents"
  | "essentialSpendingCents"
  | "otherSpendingCents"
  | "requiredDebtPaymentsCents"
>): Metric<Cents> {
  const missing: string[] = [];
  if (s.takeHomeIncomeCents === null) missing.push("takeHomeIncomeCents");
  if (s.essentialSpendingCents === null) missing.push("essentialSpendingCents");
  if (s.otherSpendingCents === null) missing.push("otherSpendingCents");
  if (s.requiredDebtPaymentsCents === null) missing.push("requiredDebtPaymentsCents");

  // Income is the anchor. Without it, surplus is not meaningful.
  if (s.takeHomeIncomeCents === null) {
    return metric<Cents>(null, missing, ["Take-home income is required to compute surplus."]);
  }

  const income = s.takeHomeIncomeCents;
  const essential = s.essentialSpendingCents ?? 0;
  const other = s.otherSpendingCents ?? 0;
  const debt = s.requiredDebtPaymentsCents ?? 0;
  const value = income - essential - other - debt;

  const assumptions: string[] = [];
  if (missing.length > 0) {
    assumptions.push(
      "Unknown spending/payment components were excluded (not assumed to be zero); surplus may be overstated.",
    );
  }
  return metric<Cents>(value, missing, assumptions);
}

/**
 * Detects potential double-counting of debt: the snapshot's aggregate
 * requiredDebtPayments vs the sum of per-account minimum payments (for accounts
 * flagged to be included in the snapshot). Purely informational — never mutates.
 */
export function debtDoubleCountCheck(
  snapshot: Pick<FinancialSnapshot, "requiredDebtPaymentsCents" | "liabilitiesCents">,
  accounts: Account[],
): {
  minPaymentSum: Cents;
  minPaymentUnknownCount: number;
  liabilityBalanceSum: Cents;
  liabilityUnknownCount: number;
  paymentMismatch: boolean;
  liabilityMismatch: boolean;
  notes: string[];
} {
  const includedDebtAccounts = accounts.filter(
    (a) => a.includeInSnapshot && a.kind !== "bank" && a.classification !== undefined,
  );

  const minPayments = sumKnown(includedDebtAccounts.map((a) => a.minPaymentCents));
  const balances = sumKnown(
    includedDebtAccounts
      .filter((a) => a.kind === "credit_card" || a.kind === "loan" || a.kind === "line_of_credit")
      .map((a) => a.balanceCents),
  );

  const notes: string[] = [];
  let paymentMismatch = false;
  let liabilityMismatch = false;

  if (
    snapshot.requiredDebtPaymentsCents !== null &&
    minPayments.unknownCount === 0 &&
    includedDebtAccounts.length > 0 &&
    snapshot.requiredDebtPaymentsCents !== minPayments.total
  ) {
    paymentMismatch = true;
    notes.push(
      "Snapshot required debt payments differ from the sum of included account minimum payments — check for double counting or omissions.",
    );
  }

  if (
    snapshot.liabilitiesCents !== null &&
    balances.unknownCount === 0 &&
    includedDebtAccounts.length > 0 &&
    snapshot.liabilitiesCents < balances.total
  ) {
    liabilityMismatch = true;
    notes.push(
      "Aggregate liabilities are less than the sum of included debt balances — some debt may be missing from the snapshot total.",
    );
  }

  return {
    minPaymentSum: minPayments.total,
    minPaymentUnknownCount: minPayments.unknownCount,
    liabilityBalanceSum: balances.total,
    liabilityUnknownCount: balances.unknownCount,
    paymentMismatch,
    liabilityMismatch,
    notes,
  };
}

/**
 * Net worth = assets − liabilities.
 * Assets = available cash + other assets.
 * Liabilities come from the snapshot aggregate. Incomplete data is labeled.
 */
export function netWorth(
  s: Pick<FinancialSnapshot, "availableCashCents" | "otherAssetsCents" | "liabilitiesCents">,
): Metric<Cents> {
  const missing: string[] = [];
  if (s.availableCashCents === null) missing.push("availableCashCents");
  if (s.otherAssetsCents === null) missing.push("otherAssetsCents");
  if (s.liabilitiesCents === null) missing.push("liabilitiesCents");

  const hadAnyInput =
    s.availableCashCents !== null || s.otherAssetsCents !== null || s.liabilitiesCents !== null;

  if (!hadAnyInput) {
    return metric<Cents>(null, missing, ["No asset or liability data provided yet."], false);
  }

  const assets = (s.availableCashCents ?? 0) + (s.otherAssetsCents ?? 0);
  const liabilities = s.liabilitiesCents ?? 0;
  const value = assets - liabilities;

  const assumptions: string[] = [];
  if (missing.length > 0) {
    assumptions.push("Net worth is incomplete; unknown components were excluded, not zeroed.");
  }
  return metric<Cents>(value, missing, assumptions);
}

/**
 * Cash coverage (months) = available liquid cash / (essential spending + required debt payments).
 * The denominator is monthly obligations. Zero/unknown denominator handled explicitly.
 * This is a coverage estimate, not a guarantee.
 */
export function cashCoverageMonths(
  s: Pick<
    FinancialSnapshot,
    "availableCashCents" | "essentialSpendingCents" | "requiredDebtPaymentsCents"
  >,
): Metric<number> {
  const missing: string[] = [];
  if (s.availableCashCents === null) missing.push("availableCashCents");
  if (s.essentialSpendingCents === null) missing.push("essentialSpendingCents");
  if (s.requiredDebtPaymentsCents === null) missing.push("requiredDebtPaymentsCents");

  const assumptions = [
    "Coverage = liquid cash ÷ (essential spending + required debt payments), per month.",
  ];

  if (s.availableCashCents === null) {
    return metric<number>(null, missing, [
      ...assumptions,
      "Available cash is required to estimate coverage.",
    ]);
  }
  // Denominator needs at least one obligation component to be meaningful.
  if (s.essentialSpendingCents === null && s.requiredDebtPaymentsCents === null) {
    return metric<number>(null, missing, [
      ...assumptions,
      "Monthly obligations are unknown; coverage cannot be estimated.",
    ]);
  }

  const denom = (s.essentialSpendingCents ?? 0) + (s.requiredDebtPaymentsCents ?? 0);
  if (denom === 0) {
    // No monthly obligations recorded — coverage is effectively unbounded, but
    // we do NOT return Infinity. Label it honestly.
    return metric<number>(null, missing, [
      ...assumptions,
      "No monthly obligations recorded, so months of coverage is undefined (no denominator).",
    ]);
  }

  const months = Math.round((s.availableCashCents / denom) * 10) / 10; // 1 decimal
  if (missing.length > 0) {
    assumptions.push("Some obligation components were unknown and excluded; coverage may be overstated.");
  }
  return metric<number>(months, missing, assumptions);
}

/**
 * Revolving utilization = included revolving balances / included revolving limits.
 * Accounts with unknown limits are surfaced (cannot be included in the ratio).
 * This is NOT the credit bureau's utilization calculation — labeled as such.
 */
export function revolvingUtilization(accounts: Account[]): Metric<number> & {
  includedBalanceCents: Cents;
  includedLimitCents: Cents;
  unknownLimitCount: number;
} {
  const revolving = accounts.filter(
    (a) => a.isRevolving && (a.kind === "credit_card" || a.kind === "line_of_credit"),
  );

  let includedBalance = 0;
  let includedLimit = 0;
  let unknownLimitCount = 0;
  let anyIncluded = false;

  for (const a of revolving) {
    if (a.creditLimitCents === null || a.creditLimitCents <= 0) {
      unknownLimitCount += 1;
      continue; // cannot include without a positive limit
    }
    includedLimit += a.creditLimitCents;
    includedBalance += a.balanceCents ?? 0;
    anyIncluded = true;
  }

  const assumptions = [
    "This is an app-side estimate from limits you entered — not the credit bureau's official utilization.",
  ];
  if (unknownLimitCount > 0) {
    assumptions.push(
      `${unknownLimitCount} revolving account(s) have unknown limits and are excluded from the ratio.`,
    );
  }

  const missing = unknownLimitCount > 0 ? ["revolving credit limits"] : [];

  if (!anyIncluded || includedLimit === 0) {
    return {
      ...metric<number>(null, missing, [
        ...assumptions,
        "No revolving accounts with known positive limits, so utilization is undefined.",
      ], revolving.length > 0),
      includedBalanceCents: includedBalance,
      includedLimitCents: includedLimit,
      unknownLimitCount,
    };
  }

  const ratio = Math.round((includedBalance / includedLimit) * 1000) / 1000; // 3 decimals
  return {
    ...metric<number>(ratio, missing, assumptions),
    includedBalanceCents: includedBalance,
    includedLimitCents: includedLimit,
    unknownLimitCount,
  };
}

/** Convenience bundle used by the plan engine and dashboards. */
export interface FinanceSummary {
  surplus: Metric<Cents>;
  netWorth: Metric<Cents>;
  cashCoverage: Metric<number>;
  utilization: ReturnType<typeof revolvingUtilization>;
  doubleCount: ReturnType<typeof debtDoubleCountCheck>;
  hasPastDue: boolean;
  pastDueCount: number;
}

export function summarize(snapshot: FinancialSnapshot, accounts: Account[]): FinanceSummary {
  const pastDueAccounts = accounts.filter((a) => (a.pastDueCents ?? 0) > 0);
  return {
    surplus: monthlySurplus(snapshot),
    netWorth: netWorth(snapshot),
    cashCoverage: cashCoverageMonths(snapshot),
    utilization: revolvingUtilization(accounts),
    doubleCount: debtDoubleCountCheck(snapshot, accounts),
    hasPastDue: pastDueAccounts.length > 0 || snapshot.hasPastDueAccounts === true,
    pastDueCount: pastDueAccounts.length,
  };
}
