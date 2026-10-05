import type { UserDataBundle } from "../data/bundle";
import type {
  Account,
  ActionEvent,
  ActionEventType,
  CreditIssue,
  FinancialSnapshot,
  Profile,
  SelfReportedScore,
  WeeklyReview,
} from "../domain/types";
import {
  accountInputSchema,
  creditIssueInputSchema,
  profileInputSchema,
  snapshotInputSchema,
  weeklyReviewInputSchema,
  selfReportedScoreSchema,
  type AccountInput,
  type CreditIssueInput,
  type ProfileInput,
  type SnapshotInput,
  type WeeklyReviewInput,
} from "../validation/schemas";

/**
 * Pure, validated state transitions over a UserDataBundle. Each returns a NEW
 * bundle (no mutation). `Ctx` supplies id/time/owner so the functions stay
 * deterministic and testable. The same functions back both the demo store and
 * the server-side (Supabase) path.
 */
export interface Ctx {
  ownerId: string;
  id: () => string;
  now: () => string; // ISODateTime
}

function clone(b: UserDataBundle): UserDataBundle {
  return {
    ownerId: b.ownerId,
    profile: b.profile,
    snapshots: [...b.snapshots],
    accounts: [...b.accounts],
    creditIssues: [...b.creditIssues],
    actionEvents: [...b.actionEvents],
    weeklyReviews: [...b.weeklyReviews],
    formationStatuses: { ...b.formationStatuses },
    partnerStatuses: { ...b.partnerStatuses },
    partnersAcknowledged: b.partnersAcknowledged,
    referralEvents: [...b.referralEvents],
  };
}

/**
 * Append a referral tracking event (click or self-reported signup). Append-only:
 * events are never mutated or removed, so the funnel history is preserved.
 */
export function recordReferralEvent(
  bundle: UserDataBundle,
  args: {
    partnerId: string;
    category: import("../domain/partners").PartnerCategory;
    type: import("../domain/partners").ReferralEventType;
  },
  ctx: Ctx,
): UserDataBundle {
  const b = clone(bundle);
  b.referralEvents = [
    ...b.referralEvents,
    {
      id: ctx.id(),
      ownerId: ctx.ownerId,
      partnerId: args.partnerId,
      category: args.category,
      type: args.type,
      at: ctx.now(),
    },
  ];
  return b;
}

export function setPartnerStatus(
  bundle: UserDataBundle,
  partnerId: string,
  status: import("../domain/partners").PartnerStatus,
): UserDataBundle {
  const b = clone(bundle);
  b.partnerStatuses = { ...b.partnerStatuses, [partnerId]: status };
  return b;
}

export function acknowledgePartners(bundle: UserDataBundle): UserDataBundle {
  const b = clone(bundle);
  b.partnersAcknowledged = true;
  return b;
}

export function setFormationStatus(
  bundle: UserDataBundle,
  itemId: string,
  status: import("../domain/formation").FormationItemStatus,
): UserDataBundle {
  const b = clone(bundle);
  b.formationStatuses = { ...b.formationStatuses, [itemId]: status };
  return b;
}

export function setProfile(bundle: UserDataBundle, raw: ProfileInput, ctx: Ctx): UserDataBundle {
  const input = profileInputSchema.parse(raw);
  const now = ctx.now();
  const b = clone(bundle);
  const existing = b.profile;
  const profile: Profile = {
    id: existing?.id ?? ctx.id(),
    ownerId: ctx.ownerId,
    residenceState: input.residenceState,
    businessState: input.businessState,
    situation: input.situation,
    goals: input.goals,
    experience: input.experience,
    weeklyTimeMinutes: input.weeklyTimeMinutes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  b.profile = profile;
  return b;
}

/**
 * Add a NEW dated snapshot. Never silently replaces prior snapshots — history
 * is preserved so weekly reviews can compare baseline vs latest.
 */
export function addSnapshot(
  bundle: UserDataBundle,
  raw: SnapshotInput,
  ctx: Ctx,
  selfReportedScore: SelfReportedScore | null = null,
): UserDataBundle {
  const input = snapshotInputSchema.parse(raw);
  const score = selfReportedScore ? selfReportedScoreSchema.parse(selfReportedScore) : null;
  const b = clone(bundle);
  const snapshot: FinancialSnapshot = {
    id: ctx.id(),
    ownerId: ctx.ownerId,
    asOf: input.asOf,
    takeHomeIncomeCents: input.takeHomeIncomeCents,
    essentialSpendingCents: input.essentialSpendingCents,
    otherSpendingCents: input.otherSpendingCents,
    requiredDebtPaymentsCents: input.requiredDebtPaymentsCents,
    availableCashCents: input.availableCashCents,
    otherAssetsCents: input.otherAssetsCents,
    liabilitiesCents: input.liabilitiesCents,
    hasPastDueAccounts: input.hasPastDueAccounts,
    selfReportedScore: score,
    createdAt: ctx.now(),
  };
  b.snapshots = [...b.snapshots, snapshot];
  return b;
}

export function upsertAccount(
  bundle: UserDataBundle,
  raw: AccountInput,
  ctx: Ctx,
  existingId?: string,
): UserDataBundle {
  const input = accountInputSchema.parse(raw);
  const b = clone(bundle);
  const now = ctx.now();
  if (existingId) {
    b.accounts = b.accounts.map((a) =>
      a.id === existingId && a.ownerId === ctx.ownerId
        ? { ...a, ...input, updatedAt: now }
        : a,
    );
    return b;
  }
  const account: Account = {
    id: ctx.id(),
    ownerId: ctx.ownerId,
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  b.accounts = [...b.accounts, account];
  return b;
}

export function removeAccount(bundle: UserDataBundle, id: string, ctx: Ctx): UserDataBundle {
  const b = clone(bundle);
  b.accounts = b.accounts.filter((a) => !(a.id === id && a.ownerId === ctx.ownerId));
  return b;
}

export function addCreditIssue(
  bundle: UserDataBundle,
  raw: CreditIssueInput,
  ctx: Ctx,
): UserDataBundle {
  const input = creditIssueInputSchema.parse(raw);
  const b = clone(bundle);
  const now = ctx.now();
  const issue: CreditIssue = {
    id: ctx.id(),
    ownerId: ctx.ownerId,
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  b.creditIssues = [...b.creditIssues, issue];
  return b;
}

export function updateCreditIssue(
  bundle: UserDataBundle,
  id: string,
  raw: CreditIssueInput,
  ctx: Ctx,
): UserDataBundle {
  const input = creditIssueInputSchema.parse(raw);
  const b = clone(bundle);
  b.creditIssues = b.creditIssues.map((c) =>
    c.id === id && c.ownerId === ctx.ownerId ? { ...c, ...input, updatedAt: ctx.now() } : c,
  );
  return b;
}

/**
 * Record an action event. Preserves status history without copying raw
 * sensitive financial data. Skip/defer require a reason.
 */
export function recordActionEvent(
  bundle: UserDataBundle,
  args: {
    actionId: string;
    ruleId: string;
    type: ActionEventType;
    reason?: string | null;
    /** Which occurrence of the rule this refers to (see plan engine). */
    occurrenceKey?: string | null;
  },
  ctx: Ctx,
): UserDataBundle {
  if ((args.type === "skipped" || args.type === "deferred") && !args.reason) {
    throw new Error("A reason is required to skip or defer an action.");
  }
  const b = clone(bundle);
  const event: ActionEvent = {
    id: ctx.id(),
    ownerId: ctx.ownerId,
    actionId: args.actionId,
    ruleId: args.ruleId,
    type: args.type,
    reason: args.reason ?? null,
    at: ctx.now(),
    occurrenceKey: args.occurrenceKey ?? null,
  };
  b.actionEvents = [...b.actionEvents, event];
  return b;
}

export function addWeeklyReview(
  bundle: UserDataBundle,
  raw: WeeklyReviewInput,
  ctx: Ctx,
): UserDataBundle {
  const input = weeklyReviewInputSchema.parse(raw);
  const b = clone(bundle);
  const review: WeeklyReview = {
    id: ctx.id(),
    ownerId: ctx.ownerId,
    ...input,
    createdAt: ctx.now(),
  };
  b.weeklyReviews = [...b.weeklyReviews, review];
  return b;
}
