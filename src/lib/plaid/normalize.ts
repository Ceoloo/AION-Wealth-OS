import type {
  Account,
  AccountFigure,
  AccountKind,
  FieldSource,
  FinancialSnapshot,
  SnapshotFigure,
} from "../domain/types";
import { dollarsToCents } from "../domain/money";
import { accountInputSchema } from "../validation/schemas";

/**
 * The translator: Plaid's account + liability data -> AION's existing Account
 * and FinancialSnapshot shapes, with every figure tagged by where it came from.
 *
 * Pure: no I/O, no SDK import. The input types are the minimal structural
 * subset of Plaid's responses we read, so anything outside them (full account
 * numbers on loans, property addresses, servicer details, transactions) is
 * never touched here and never stored.
 *
 * Rules, in one place:
 *  - Only USD depository, credit and loan accounts are kept. Anything else is
 *    skipped and reported back, never silently dropped.
 *  - A figure the institution reports overwrites the stored one and is tagged
 *    connected_account. A figure it does NOT report leaves what is stored alone
 *    (including a value the user typed in, which stays user_reported).
 *  - Unknown stays unknown: a missing figure is null, never 0.
 */

// ---------------------------------------------------------------------------
// Input: the subset of Plaid's shapes we read.
// ---------------------------------------------------------------------------

export interface PlaidAccountLike {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  holder_category?: string | null;
  balances: {
    available: number | null;
    current: number | null;
    limit: number | null;
    iso_currency_code: string | null;
    unofficial_currency_code?: string | null;
  };
}

interface AprLike {
  apr_percentage: number;
  apr_type: string;
}

export interface PlaidLiabilitiesLike {
  credit?: Array<{
    account_id: string | null;
    aprs: AprLike[];
    is_overdue: boolean | null;
    minimum_payment_amount: number | null;
    next_payment_due_date: string | null;
  }> | null;
  student?: Array<{
    account_id: string | null;
    interest_rate_percentage: number | null;
    is_overdue: boolean | null;
    minimum_payment_amount: number | null;
    next_payment_due_date: string | null;
  }> | null;
  mortgage?: Array<{
    account_id: string;
    interest_rate: { percentage: number | null } | null;
    next_monthly_payment: number | null;
    next_payment_due_date: string | null;
    past_due_amount: number | null;
  }> | null;
}

// ---------------------------------------------------------------------------
// Output.
// ---------------------------------------------------------------------------

/**
 * What the institution said about one figure:
 *  - { set: v }   it reported a value; store it, tag connected_account.
 *  - { clear }    it told us the stored connection-sourced value is no longer
 *                 right but not what is (e.g. "overdue", amount unknown).
 *  - absent       it said nothing; keep whatever is stored.
 */
export type FigureReport<T> = { set: T } | { clear: true };

type FigureValues = {
  balanceCents: number | null;
  aprBps: number | null;
  minPaymentCents: number | null;
  pastDueCents: number | null;
  dueDate: string | null;
  creditLimitCents: number | null;
};

export interface NormalizedAccount {
  plaidAccountId: string;
  nickname: string;
  classification: Account["classification"];
  kind: AccountKind;
  isRevolving: boolean;
  figures: { [K in AccountFigure]?: FigureReport<FigureValues[K]> };
  /** The institution says a payment is overdue on this account. */
  overdue: boolean;
}

export type SkipReason = "unsupported_type" | "not_usd";

export interface SkippedAccount {
  plaidAccountId: string;
  /** Display name with at most the last 4 characters of the number. */
  label: string;
  type: string;
  reason: SkipReason;
}

export interface NormalizedItem {
  accounts: NormalizedAccount[];
  skipped: SkippedAccount[];
}

// ---------------------------------------------------------------------------
// Account translation.
// ---------------------------------------------------------------------------

const NICKNAME_MAX = 60;

function label(a: PlaidAccountLike): string {
  const name = (a.name || a.official_name || "Account").trim();
  // Plaid's mask is already the last 2-4 characters; never show more than 4.
  const mask = a.mask ? a.mask.slice(-4) : null;
  const suffix = mask ? ` ••${mask}` : "";
  return name.slice(0, NICKNAME_MAX - suffix.length) + suffix;
}

function cents(dollars: number | null | undefined): number | null {
  if (dollars === null || dollars === undefined || !Number.isFinite(dollars)) return null;
  return dollarsToCents(dollars);
}

function bps(percent: number | null | undefined): number | null {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return null;
  return Math.round(percent * 100);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function reportIfKnown<T>(v: T | null): FigureReport<T> | undefined {
  return v === null ? undefined : { set: v };
}

function kindOf(a: PlaidAccountLike): { kind: AccountKind; isRevolving: boolean } | null {
  switch (a.type) {
    case "depository":
      return { kind: "bank", isRevolving: false };
    case "credit":
      return { kind: "credit_card", isRevolving: true };
    case "loan":
      return a.subtype === "line of credit"
        ? { kind: "line_of_credit", isRevolving: true }
        : { kind: "loan", isRevolving: false };
    default:
      return null;
  }
}

export function normalizeItem(
  accounts: PlaidAccountLike[],
  liabilities: PlaidLiabilitiesLike | null,
): NormalizedItem {
  const credit = new Map((liabilities?.credit ?? []).filter((l) => l.account_id).map((l) => [l.account_id!, l]));
  const student = new Map((liabilities?.student ?? []).filter((l) => l.account_id).map((l) => [l.account_id!, l]));
  const mortgage = new Map((liabilities?.mortgage ?? []).map((l) => [l.account_id, l]));

  const out: NormalizedItem = { accounts: [], skipped: [] };

  for (const a of accounts) {
    const mapped = kindOf(a);
    if (!mapped) {
      out.skipped.push({ plaidAccountId: a.account_id, label: label(a), type: a.type, reason: "unsupported_type" });
      continue;
    }
    if (a.balances.iso_currency_code !== "USD") {
      out.skipped.push({ plaidAccountId: a.account_id, label: label(a), type: a.type, reason: "not_usd" });
      continue;
    }

    const figures: NormalizedAccount["figures"] = {};
    let overdue = false;

    // Balance. Debts: what is owed. Bank: what can be spent now, falling back
    // to the ledger balance when the institution does not compute "available".
    const balance =
      mapped.kind === "bank"
        ? cents(a.balances.available ?? a.balances.current)
        : cents(a.balances.current);
    figures.balanceCents = reportIfKnown(balance);

    if (mapped.kind !== "bank") {
      figures.creditLimitCents = reportIfKnown(cents(a.balances.limit));
    }

    const cc = credit.get(a.account_id);
    if (cc) {
      const purchase = cc.aprs.find((r) => r.apr_type === "purchase_apr");
      figures.aprBps = reportIfKnown(bps(purchase?.apr_percentage));
      figures.minPaymentCents = reportIfKnown(cents(cc.minimum_payment_amount));
      figures.dueDate = reportIfKnown(cc.next_payment_due_date);
      if (cc.is_overdue === false) figures.pastDueCents = { set: 0 };
      if (cc.is_overdue === true) {
        // Overdue, amount not given: a connection-sourced 0 would now be wrong.
        figures.pastDueCents = { clear: true };
        overdue = true;
      }
    }

    const sl = student.get(a.account_id);
    if (sl) {
      figures.aprBps = reportIfKnown(bps(sl.interest_rate_percentage));
      figures.minPaymentCents = reportIfKnown(cents(sl.minimum_payment_amount));
      figures.dueDate = reportIfKnown(sl.next_payment_due_date);
      if (sl.is_overdue === false) figures.pastDueCents = { set: 0 };
      if (sl.is_overdue === true) {
        figures.pastDueCents = { clear: true };
        overdue = true;
      }
    }

    const mg = mortgage.get(a.account_id);
    if (mg) {
      figures.aprBps = reportIfKnown(bps(mg.interest_rate?.percentage));
      figures.minPaymentCents = reportIfKnown(cents(mg.next_monthly_payment));
      figures.dueDate = reportIfKnown(mg.next_payment_due_date);
      const pastDue = cents(mg.past_due_amount);
      figures.pastDueCents = reportIfKnown(pastDue);
      if (pastDue !== null && pastDue > 0) overdue = true;
    }

    // A malformed date is not reported rather than stored.
    const due = figures.dueDate;
    if (due && "set" in due && (due.set === null || !ISO_DATE.test(due.set))) delete figures.dueDate;

    out.accounts.push({
      plaidAccountId: a.account_id,
      nickname: label(a),
      classification: a.holder_category === "business" ? "business" : "personal",
      kind: mapped.kind,
      isRevolving: mapped.isRevolving,
      figures,
      overdue,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Merge into a stored account.
// ---------------------------------------------------------------------------

const FIGURES: readonly AccountFigure[] = [
  "balanceCents",
  "aprBps",
  "minPaymentCents",
  "pastDueCents",
  "dueDate",
  "creditLimitCents",
];

export class TranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationError";
  }
}

/**
 * Applies one sync to an account. `existing` is the stored row for this
 * plaid_account_id, or null on first sight. Returns the full account to write.
 *
 * Reported figures overwrite and are tagged connected_account. A { clear }
 * resets a figure only when it was connection-sourced; a value the user typed
 * is theirs and stays. Unreported figures are untouched.
 */
export function mergeConnectedAccount(
  existing: Account | null,
  n: NormalizedAccount,
  ctx: { id: string; ownerId: string; plaidItemId: string; now: string },
): Account {
  const values: FigureValues = {
    balanceCents: existing?.balanceCents ?? null,
    aprBps: existing?.aprBps ?? null,
    minPaymentCents: existing?.minPaymentCents ?? null,
    pastDueCents: existing?.pastDueCents ?? null,
    dueDate: existing?.dueDate ?? null,
    creditLimitCents: existing?.creditLimitCents ?? null,
  };
  const sources: Partial<Record<AccountFigure, FieldSource>> = { ...(existing?.fieldSources ?? {}) };

  for (const f of FIGURES) {
    const r = n.figures[f];
    if (!r) continue;
    if ("set" in r) {
      (values as Record<AccountFigure, unknown>)[f] = r.set;
      sources[f] = "connected_account";
    } else if (sources[f] === "connected_account") {
      (values as Record<AccountFigure, unknown>)[f] = null;
      delete sources[f];
    }
  }

  const account: Account = {
    id: existing?.id ?? ctx.id,
    ownerId: ctx.ownerId,
    // The user may rename or reclassify a connected account; keep their choice.
    nickname: existing?.nickname ?? n.nickname,
    classification: existing?.classification ?? n.classification,
    kind: n.kind,
    isRevolving: n.isRevolving,
    ...values,
    includeInSnapshot: existing?.includeInSnapshot ?? n.kind !== "bank",
    createdAt: existing?.createdAt ?? ctx.now,
    updatedAt: ctx.now,
    source: "connected_account",
    fieldSources: sources,
    plaidItemId: ctx.plaidItemId,
    syncedAt: ctx.now,
  };

  // The same gate user input passes. An institution figure outside the app's
  // valid ranges fails loudly here rather than being written.
  const check = accountInputSchema.safeParse(account);
  if (!check.success) {
    throw new TranslationError(
      `Account ${n.plaidAccountId} failed validation: ${check.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  return account;
}

// ---------------------------------------------------------------------------
// Snapshot derivation.
// ---------------------------------------------------------------------------

type SnapshotValues = Pick<FinancialSnapshot, SnapshotFigure>;

function sumAllKnown(values: Array<number | null>): number | null {
  if (values.length === 0 || values.some((v) => v === null)) return null;
  return (values as number[]).reduce((t, v) => t + v, 0);
}

/**
 * Derives the next snapshot after a sync, or returns null when nothing would
 * change (so syncing never piles up identical snapshots).
 *
 *  - availableCash: sum of every bank account, only if all are known and at
 *    least one is connected. Tagged derived.
 *  - liabilities / requiredDebtPayments: sums over the debt accounts included
 *    in the snapshot, under the same all-known rule. Tagged derived. Accounts
 *    are the source of truth for debt (see finance.ts), so a user's own debt
 *    accounts count too.
 *  - hasPastDueAccounts: true (connected_account) if the institution says any
 *    account is overdue. If it previously said so and no longer does, the flag
 *    becomes unknown rather than "no": the connection cannot vouch for debts
 *    it does not see.
 *  - Everything else (income, spending, other assets, the score) is carried
 *    forward unchanged, with its source.
 */
export function deriveSnapshot(
  prev: FinancialSnapshot | null,
  accounts: Account[],
  anyOverdue: boolean,
  ctx: { id: string; ownerId: string; asOf: string; now: string },
): FinancialSnapshot | null {
  const sources: Partial<Record<SnapshotFigure, FieldSource>> = { ...(prev?.fieldSources ?? {}) };
  const next: SnapshotValues = {
    takeHomeIncomeCents: prev?.takeHomeIncomeCents ?? null,
    essentialSpendingCents: prev?.essentialSpendingCents ?? null,
    otherSpendingCents: prev?.otherSpendingCents ?? null,
    requiredDebtPaymentsCents: prev?.requiredDebtPaymentsCents ?? null,
    availableCashCents: prev?.availableCashCents ?? null,
    otherAssetsCents: prev?.otherAssetsCents ?? null,
    liabilitiesCents: prev?.liabilitiesCents ?? null,
    hasPastDueAccounts: prev?.hasPastDueAccounts ?? null,
  };

  const banks = accounts.filter((a) => a.kind === "bank");
  if (banks.some((a) => a.source === "connected_account")) {
    const cash = sumAllKnown(banks.map((a) => a.balanceCents));
    if (cash !== null) {
      next.availableCashCents = cash;
      sources.availableCashCents = "derived";
    }
  }

  const debts = accounts.filter((a) => a.kind !== "bank" && a.includeInSnapshot);
  if (debts.some((a) => a.source === "connected_account")) {
    const owed = sumAllKnown(debts.map((a) => a.balanceCents));
    if (owed !== null) {
      next.liabilitiesCents = owed;
      sources.liabilitiesCents = "derived";
    }
    const payments = sumAllKnown(debts.map((a) => a.minPaymentCents));
    if (payments !== null) {
      next.requiredDebtPaymentsCents = payments;
      sources.requiredDebtPaymentsCents = "derived";
    }
  }

  if (anyOverdue) {
    next.hasPastDueAccounts = true;
    sources.hasPastDueAccounts = "connected_account";
  } else if (sources.hasPastDueAccounts === "connected_account") {
    next.hasPastDueAccounts = null;
    delete sources.hasPastDueAccounts;
  }

  if (prev) {
    const same = (Object.keys(next) as SnapshotFigure[]).every(
      (k) => next[k] === prev[k] && sources[k] === prev.fieldSources?.[k],
    );
    if (same) return null;
  } else if (Object.values(next).every((v) => v === null)) {
    return null;
  }

  return {
    id: ctx.id,
    ownerId: ctx.ownerId,
    asOf: ctx.asOf,
    ...next,
    // A score is something the user entered on a specific day; it is found by
    // mostRecentScore() across all snapshots, so it is not copied forward.
    selfReportedScore: null,
    createdAt: ctx.now,
    fieldSources: sources,
  };
}
