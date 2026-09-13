import { z } from "zod";

/**
 * Server-side (and client-side) validation. Money inputs arrive as dollar
 * strings/numbers and are converted to integer cents by the caller; here we
 * validate ranges and shapes. Unknown values are represented as null, never 0.
 */

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
] as const;

export const usStateSchema = z.enum(US_STATES);

/** A money field that may be genuinely unknown. Cents, integer, bounded. */
const centsNullable = z
  .number()
  .int("Must be a whole number of cents")
  .gte(-100_000_000_00, "Out of range")
  .lte(100_000_000_00, "Out of range")
  .nullable();

const centsNonNegNullable = z
  .number()
  .int()
  .gte(0)
  .lte(100_000_000_00)
  .nullable();

export const profileInputSchema = z.object({
  residenceState: usStateSchema.nullable(),
  businessState: usStateSchema.nullable(),
  goals: z.array(z.string().max(64)).max(20),
  experience: z.enum(["new", "some", "experienced"]).nullable(),
  weeklyTimeMinutes: z.number().int().gte(0).lte(10_080).nullable(),
});

export const snapshotInputSchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  takeHomeIncomeCents: centsNonNegNullable,
  essentialSpendingCents: centsNonNegNullable,
  otherSpendingCents: centsNonNegNullable,
  requiredDebtPaymentsCents: centsNonNegNullable,
  availableCashCents: centsNonNegNullable,
  otherAssetsCents: centsNonNegNullable,
  liabilitiesCents: centsNonNegNullable,
  hasPastDueAccounts: z.boolean().nullable(),
});

export const accountInputSchema = z.object({
  nickname: z.string().min(1).max(60),
  classification: z.enum(["personal", "business"]),
  kind: z.enum(["credit_card", "loan", "line_of_credit", "bank", "other"]),
  balanceCents: centsNullable,
  aprBps: z.number().int().gte(0).lte(100_000).nullable(),
  minPaymentCents: centsNonNegNullable,
  pastDueCents: centsNonNegNullable,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  creditLimitCents: centsNonNegNullable,
  isRevolving: z.boolean(),
  includeInSnapshot: z.boolean(),
});

export const creditIssueInputSchema = z.object({
  bureau: z.enum(["equifax", "experian", "transunion", "unknown"]),
  creditorNickname: z.string().min(1).max(60),
  category: z.enum([
    "account_not_mine",
    "wrong_balance",
    "wrong_status",
    "duplicate_account",
    "outdated_info",
    "incorrect_personal_info",
    "other",
  ]),
  explanation: z.string().min(1).max(2000),
  relevantDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  state: z.enum(["draft", "user_submitted", "awaiting_response", "resolved", "unresolved"]),
});

export const weeklyReviewInputSchema = z.object({
  weekOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  updatedBalancesNote: z.string().max(2000).nullable(),
  actionsCompleted: z.array(z.string().max(80)).max(50),
  obstacles: z.string().max(2000).nullable(),
  timeSpentMinutes: z.number().int().gte(0).lte(10_080).nullable(),
  nextPriorities: z.string().max(2000).nullable(),
});

export const selfReportedScoreSchema = z.object({
  score: z.number().int().gte(250).lte(900),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().max(120).nullable(),
  model: z.string().max(60).nullable(),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;
export type SnapshotInput = z.infer<typeof snapshotInputSchema>;
export type AccountInput = z.infer<typeof accountInputSchema>;
export type CreditIssueInput = z.infer<typeof creditIssueInputSchema>;
export type WeeklyReviewInput = z.infer<typeof weeklyReviewInputSchema>;

// ---------------------------------------------------------------------------
// Runtime guards for values that arrive at server actions as plain JSON.
// TypeScript types are erased at runtime; these are the actual gate.
//
// "Independently verified" states are deliberately NOT accepted from ordinary
// user write paths. Until a trusted verification workflow exists the product
// only supports self-reported completion, so `completed_verified` and the
// formation `verified` status are rejected here (and by RLS — see migration
// 0003, which closes the direct database API path too).
// ---------------------------------------------------------------------------

/** Stable engine identifiers: conservative charset, bounded length. */
export const engineIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9_]+$/i, "Unrecognized identifier");

export const selfReportableActionEventTypeSchema = z.enum([
  "generated",
  "started",
  "completed_user_reported",
  "skipped",
  "deferred",
  "reopened",
]);

export const actionEventArgsSchema = z
  .object({
    actionId: engineIdSchema,
    ruleId: engineIdSchema,
    type: selfReportableActionEventTypeSchema,
    reason: z.string().max(500).nullable().optional(),
    /** Which occurrence of the rule this refers to; NULL = legacy/default. */
    occurrenceKey: z.string().max(500).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.type === "skipped" || v.type === "deferred") && !v.reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A reason is required to skip or defer an action.",
        path: ["reason"],
      });
    }
  });

/** Formation statuses a user may self-report. `verified` is excluded. */
export const selfReportableFormationStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "user_reported_done",
]);

export const partnerIdSchema = z.string().min(1).max(64).regex(/^[a-z0-9_]+$/i);

export const partnerStatusSchema = z.enum([
  "not_started",
  "clicked",
  "signed_up",
  "already_use",
  "skipped",
]);

export const referralEventTypeSchema = z.enum(["click", "signup_reported"]);

export const formationItemIdSchema = z.string().min(1).max(120).regex(/^[a-z0-9_]+$/i);

export type ActionEventArgs = z.infer<typeof actionEventArgsSchema>;
