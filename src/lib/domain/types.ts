import type { Cents } from "./money";

/**
 * Core domain types. These are framework-agnostic and shared between the
 * deterministic engine, persistence, and UI. Money fields are integer cents.
 * Any field that can be genuinely unknown is `number | null` — never coerced
 * to 0. `null` means "user hasn't told us", 0 means "user said zero".
 */

export type UUID = string;
export type ISODate = string; // e.g. "2026-09-12"
export type ISODateTime = string; // e.g. "2026-09-12T14:00:00.000Z"

export type USState =
  | "AL" | "AK" | "AZ" | "AR" | "CA" | "CO" | "CT" | "DE" | "FL" | "GA"
  | "HI" | "ID" | "IL" | "IN" | "IA" | "KS" | "KY" | "LA" | "ME" | "MD"
  | "MA" | "MI" | "MN" | "MS" | "MO" | "MT" | "NE" | "NV" | "NH" | "NJ"
  | "NM" | "NY" | "NC" | "ND" | "OH" | "OK" | "OR" | "PA" | "RI" | "SC"
  | "SD" | "TN" | "TX" | "UT" | "VT" | "VA" | "WA" | "WV" | "WI" | "WY" | "DC";

export type ExperienceLevel = "new" | "some" | "experienced";

export interface Profile {
  id: UUID;
  ownerId: UUID;
  residenceState: USState | null;
  businessState: USState | null;
  goals: string[]; // fixed goal ids, not free text
  experience: ExperienceLevel | null;
  weeklyTimeMinutes: number | null; // available minutes per week
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type AccountClass = "personal" | "business";
export type AccountKind =
  | "credit_card"
  | "loan"
  | "line_of_credit"
  | "bank"
  | "other";

/**
 * A single account/debt entry. To avoid double-counting, liabilities entered
 * here are the source of truth; the snapshot's aggregate liability fields must
 * reconcile against these (see finance.ts).
 */
export interface Account {
  id: UUID;
  ownerId: UUID;
  nickname: string;
  classification: AccountClass;
  kind: AccountKind;
  balanceCents: Cents | null; // owed (liability) or held (asset) depending on kind
  aprBps: number | null; // annual percentage rate in basis points; null = unknown
  minPaymentCents: Cents | null;
  pastDueCents: Cents | null;
  dueDate: ISODate | null;
  creditLimitCents: Cents | null; // only for revolving (credit_card / line_of_credit)
  isRevolving: boolean;
  /** When true, this account's balance is already reflected in snapshot liabilities. */
  includeInSnapshot: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * A dated point-in-time financial snapshot. Never silently replaced — each
 * change creates a new dated row so history is preserved.
 */
export interface FinancialSnapshot {
  id: UUID;
  ownerId: UUID;
  asOf: ISODate;
  takeHomeIncomeCents: Cents | null;
  essentialSpendingCents: Cents | null;
  otherSpendingCents: Cents | null;
  requiredDebtPaymentsCents: Cents | null;
  availableCashCents: Cents | null;
  otherAssetsCents: Cents | null;
  liabilitiesCents: Cents | null; // aggregate; may differ from account sum (reconciled)
  hasPastDueAccounts: boolean | null;
  /** Optional user-entered credit score — never fabricated. */
  selfReportedScore: SelfReportedScore | null;
  createdAt: ISODateTime;
}

export interface SelfReportedScore {
  score: number;
  date: ISODate;
  source: string | null; // e.g. "annualcreditreport.com", "card issuer app"
  model: string | null; // e.g. "FICO 8", "VantageScore 3.0", unknown allowed
}

export type CreditIssueCategory =
  | "account_not_mine"
  | "wrong_balance"
  | "wrong_status"
  | "duplicate_account"
  | "outdated_info"
  | "incorrect_personal_info"
  | "other";

export type CreditIssueState =
  | "draft"
  | "user_submitted"
  | "awaiting_response"
  | "resolved"
  | "unresolved";

export type CreditBureau = "equifax" | "experian" | "transunion" | "unknown";

export interface CreditIssue {
  id: UUID;
  ownerId: UUID;
  bureau: CreditBureau;
  creditorNickname: string;
  category: CreditIssueCategory;
  explanation: string; // factual description entered by user
  relevantDate: ISODate | null;
  followUpDate: ISODate | null;
  state: CreditIssueState;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ---- Plan engine outputs ----

export type ActionStatus =
  | "needs_attention"
  | "in_progress"
  | "complete"
  | "insufficient_information";

/** How completion is attested — planned vs user-reported vs verified. */
export type CompletionKind = "planned" | "user_reported" | "verified";

export interface PlanAction {
  /** Stable rule identifier — persists across recomputes. */
  ruleId: string;
  /** Stable per-user action identifier derived from ruleId (+ optional discriminator). */
  actionId: string;
  title: string;
  category: PlanCategory;
  priorityRank: number; // 1 = most urgent
  status: ActionStatus;
  why: string; // why this appeared
  supportingInputs: string[]; // which inputs drove it
  prerequisites: string[]; // other actionIds that should come first
  steps: string[];
  effortMinutes: number;
  verifiedCostCents: Cents | null; // only when sourced & verified
  sourceIds: string[]; // content_source ids backing any factual claims
  completionCriteria: string;
  escalation: string; // when to consult a professional
  teachBack: TeachBack;
}

export interface TeachBack {
  whatItMeans: string;
  whyItMatters: string;
  whatToDo: string;
  howToKnowComplete: string;
  comprehensionCheck: ComprehensionCheck;
}

export interface ComprehensionCheck {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export type PlanCategory =
  | "clarify"
  | "stabilize"
  | "past_due"
  | "cash"
  | "credit_report"
  | "recordkeeping"
  | "formation";

export interface GeneratedPlan {
  engineVersion: string;
  generatedAt: ISODateTime;
  snapshotId: UUID | null;
  priorities: PlanAction[]; // at most 3
  thirtyDayPlan: PlanAction[]; // sequenced
  notices: string[]; // e.g. stabilization-before-borrowing guardrail messages
}

/**
 * A recorded event against an action. Preserves status history without copying
 * raw sensitive financial data.
 */
export type ActionEventType =
  | "generated"
  | "started"
  | "completed_user_reported"
  | "completed_verified"
  | "skipped"
  | "deferred"
  | "reopened";

export interface ActionEvent {
  id: UUID;
  ownerId: UUID;
  actionId: string;
  ruleId: string;
  type: ActionEventType;
  reason: string | null; // required for skip/defer
  at: ISODateTime;
}

export interface WeeklyReview {
  id: UUID;
  ownerId: UUID;
  weekOf: ISODate;
  updatedBalancesNote: string | null;
  actionsCompleted: string[]; // actionIds
  obstacles: string | null;
  timeSpentMinutes: number | null;
  nextPriorities: string | null;
  createdAt: ISODateTime;
}
