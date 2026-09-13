import type {
  Account,
  ActionEvent,
  CreditIssue,
  FinancialSnapshot,
  Profile,
  SelfReportedScore,
  WeeklyReview,
} from "../domain/types";
import type { ReferralEvent } from "../domain/partners";

/**
 * Pure row <-> domain mappers between snake_case Postgres rows and camelCase
 * domain types. Kept free of I/O so they can be unit-tested without a database.
 * `null` is preserved as "unknown" everywhere — never coerced to 0.
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? "" : String(v));
const nStr = (v: unknown): string | null => (v == null ? null : String(v));
const nNum = (v: unknown): number | null => (v == null ? null : Number(v));
const nBool = (v: unknown): boolean | null => (v == null ? null : Boolean(v));

export function rowToProfile(r: Row): Profile {
  return {
    id: str(r.id),
    ownerId: str(r.owner_id),
    residenceState: nStr(r.residence_state) as Profile["residenceState"],
    businessState: nStr(r.business_state) as Profile["businessState"],
    goals: Array.isArray(r.goals) ? (r.goals as string[]) : [],
    experience: nStr(r.experience) as Profile["experience"],
    weeklyTimeMinutes: nNum(r.weekly_time_minutes),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function rowToSnapshot(r: Row): FinancialSnapshot {
  return {
    id: str(r.id),
    ownerId: str(r.owner_id),
    asOf: str(r.as_of),
    takeHomeIncomeCents: nNum(r.take_home_income_cents),
    essentialSpendingCents: nNum(r.essential_spending_cents),
    otherSpendingCents: nNum(r.other_spending_cents),
    requiredDebtPaymentsCents: nNum(r.required_debt_payments_cents),
    availableCashCents: nNum(r.available_cash_cents),
    otherAssetsCents: nNum(r.other_assets_cents),
    liabilitiesCents: nNum(r.liabilities_cents),
    hasPastDueAccounts: nBool(r.has_past_due_accounts),
    selfReportedScore: (r.self_reported_score as SelfReportedScore | null) ?? null,
    createdAt: str(r.created_at),
  };
}

export function rowToAccount(r: Row): Account {
  return {
    id: str(r.id),
    ownerId: str(r.owner_id),
    nickname: str(r.nickname),
    classification: str(r.classification) as Account["classification"],
    kind: str(r.kind) as Account["kind"],
    balanceCents: nNum(r.balance_cents),
    aprBps: nNum(r.apr_bps),
    minPaymentCents: nNum(r.min_payment_cents),
    pastDueCents: nNum(r.past_due_cents),
    dueDate: nStr(r.due_date),
    creditLimitCents: nNum(r.credit_limit_cents),
    isRevolving: Boolean(r.is_revolving),
    includeInSnapshot: Boolean(r.include_in_snapshot),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function rowToCreditIssue(r: Row): CreditIssue {
  return {
    id: str(r.id),
    ownerId: str(r.owner_id),
    bureau: str(r.bureau) as CreditIssue["bureau"],
    creditorNickname: str(r.creditor_nickname),
    category: str(r.category) as CreditIssue["category"],
    explanation: str(r.explanation),
    relevantDate: nStr(r.relevant_date),
    followUpDate: nStr(r.follow_up_date),
    state: str(r.state) as CreditIssue["state"],
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function rowToActionEvent(r: Row): ActionEvent {
  return {
    id: str(r.id),
    ownerId: str(r.owner_id),
    actionId: str(r.action_id),
    ruleId: str(r.rule_id),
    type: str(r.type) as ActionEvent["type"],
    reason: nStr(r.reason),
    at: str(r.at),
    occurrenceKey: nStr(r.occurrence_key),
  };
}

export function rowToWeeklyReview(r: Row): WeeklyReview {
  return {
    id: str(r.id),
    ownerId: str(r.owner_id),
    weekOf: str(r.week_of),
    updatedBalancesNote: nStr(r.updated_balances_note),
    actionsCompleted: Array.isArray(r.actions_completed) ? (r.actions_completed as string[]) : [],
    obstacles: nStr(r.obstacles),
    timeSpentMinutes: nNum(r.time_spent_minutes),
    nextPriorities: nStr(r.next_priorities),
    createdAt: str(r.created_at),
  };
}

export function rowToReferralEvent(r: Row): ReferralEvent {
  return {
    id: str(r.id),
    ownerId: str(r.owner_id),
    partnerId: str(r.partner_id),
    category: str(r.category) as ReferralEvent["category"],
    type: str(r.type) as ReferralEvent["type"],
    at: str(r.at),
  };
}

// ---- domain -> row (for inserts/updates). owner_id is stamped by the caller. ----

export function snapshotToRow(s: FinancialSnapshot): Row {
  return {
    id: s.id,
    owner_id: s.ownerId,
    as_of: s.asOf,
    take_home_income_cents: s.takeHomeIncomeCents,
    essential_spending_cents: s.essentialSpendingCents,
    other_spending_cents: s.otherSpendingCents,
    required_debt_payments_cents: s.requiredDebtPaymentsCents,
    available_cash_cents: s.availableCashCents,
    other_assets_cents: s.otherAssetsCents,
    liabilities_cents: s.liabilitiesCents,
    has_past_due_accounts: s.hasPastDueAccounts,
    self_reported_score: s.selfReportedScore,
  };
}

export function accountToRow(a: Account): Row {
  return {
    id: a.id,
    owner_id: a.ownerId,
    nickname: a.nickname,
    classification: a.classification,
    kind: a.kind,
    balance_cents: a.balanceCents,
    apr_bps: a.aprBps,
    min_payment_cents: a.minPaymentCents,
    past_due_cents: a.pastDueCents,
    due_date: a.dueDate,
    credit_limit_cents: a.creditLimitCents,
    is_revolving: a.isRevolving,
    include_in_snapshot: a.includeInSnapshot,
    updated_at: a.updatedAt,
  };
}

export function creditIssueToRow(c: CreditIssue): Row {
  return {
    id: c.id,
    owner_id: c.ownerId,
    bureau: c.bureau,
    creditor_nickname: c.creditorNickname,
    category: c.category,
    explanation: c.explanation,
    relevant_date: c.relevantDate,
    follow_up_date: c.followUpDate,
    state: c.state,
    updated_at: c.updatedAt,
  };
}
