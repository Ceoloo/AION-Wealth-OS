"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./server";
import { loadBundle } from "./data";
import { snapshotToRow, accountToRow, creditIssueToRow } from "./mappers";
import type { UserDataBundle } from "../data/bundle";
import { emptyBundle } from "../data/bundle";
import type { ActionEventType, SelfReportedScore } from "../domain/types";
import type { FormationItemStatus } from "../domain/formation";
import type { PartnerStatus, PartnerCategory, ReferralEventType } from "../domain/partners";
import { PARTNERS } from "../domain/partners";
import {
  actionEventArgsSchema,
  formationItemIdSchema,
  partnerIdSchema,
  partnerStatusSchema,
  referralEventTypeSchema,
  selfReportableFormationStatusSchema,
  accountInputSchema,
  creditIssueInputSchema,
  profileInputSchema,
  selfReportedScoreSchema,
  snapshotInputSchema,
  weeklyReviewInputSchema,
  type AccountInput,
  type CreditIssueInput,
  type ProfileInput,
  type SnapshotInput,
  type WeeklyReviewInput,
} from "../validation/schemas";

/**
 * Authenticated server actions for REAL USER MODE. Every action:
 *  1. resolves the current authenticated user (or throws AUTH_REQUIRED),
 *  2. validates input with the shared Zod schemas,
 *  3. writes with owner_id stamped to auth.uid() (RLS is the DB backstop),
 *  4. returns a freshly-loaded bundle so the client stays consistent.
 *
 * The service-role key is never used here — actions act AS the user via their
 * cookie-bound session, so RLS applies to every statement.
 */

class AuthRequiredError extends Error {
  constructor() {
    super("AUTH_REQUIRED");
    this.name = "AuthRequiredError";
  }
}

async function requireCtx(): Promise<{ supabase: SupabaseClient; uid: string }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new AuthRequiredError();
  return { supabase, uid };
}

/**
 * Destructive real-mode operations require a RECENT sign-in, not merely a valid
 * session. Access tokens refresh silently for a long time, so token validity is
 * not evidence the person at the keyboard is the account holder.
 */
const REAUTH_WINDOW_MS = 10 * 60 * 1000;

async function requireRecentAuth(): Promise<{ supabase: SupabaseClient; uid: string }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) throw new AuthRequiredError();
  const lastSignIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : NaN;
  if (!Number.isFinite(lastSignIn) || Date.now() - lastSignIn > REAUTH_WINDOW_MS) {
    throw new Error("REAUTH_REQUIRED");
  }
  return { supabase, uid: user.id };
}

export async function loadBundleAction(): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  return loadBundle(supabase, uid);
}

export async function saveProfileAction(raw: ProfileInput): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  const input = profileInputSchema.parse(raw);
  const { error } = await supabase.from("profiles").upsert(
    {
      owner_id: uid,
      residence_state: input.residenceState,
      business_state: input.businessState,
      goals: input.goals,
      experience: input.experience,
      weekly_time_minutes: input.weeklyTimeMinutes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id" },
  );
  if (error) throw new Error(error.message);
  return loadBundle(supabase, uid);
}

export async function addSnapshotAction(
  raw: SnapshotInput,
  score: SelfReportedScore | null = null,
): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  const input = snapshotInputSchema.parse(raw);
  const parsedScore = score ? selfReportedScoreSchema.parse(score) : null;
  const row = snapshotToRow({
    id: "", // DB generates
    ownerId: uid,
    asOf: input.asOf,
    takeHomeIncomeCents: input.takeHomeIncomeCents,
    essentialSpendingCents: input.essentialSpendingCents,
    otherSpendingCents: input.otherSpendingCents,
    requiredDebtPaymentsCents: input.requiredDebtPaymentsCents,
    availableCashCents: input.availableCashCents,
    otherAssetsCents: input.otherAssetsCents,
    liabilitiesCents: input.liabilitiesCents,
    hasPastDueAccounts: input.hasPastDueAccounts,
    selfReportedScore: parsedScore,
    createdAt: "",
  });
  delete row.id;
  const { error } = await supabase.from("financial_snapshots").insert(row);
  if (error) throw new Error(error.message);
  return loadBundle(supabase, uid);
}

export async function upsertAccountAction(
  raw: AccountInput,
  existingId?: string,
): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  const input = accountInputSchema.parse(raw);
  const row = accountToRow({
    id: existingId ?? "",
    ownerId: uid,
    ...input,
    createdAt: "",
    updatedAt: new Date().toISOString(),
  });
  delete row.id;
  if (existingId) {
    const { error } = await supabase
      .from("accounts")
      .update(row)
      .eq("id", existingId)
      .eq("owner_id", uid);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("accounts").insert({ ...row, owner_id: uid });
    if (error) throw new Error(error.message);
  }
  return loadBundle(supabase, uid);
}

export async function removeAccountAction(id: string): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  const { error } = await supabase.from("accounts").delete().eq("id", id).eq("owner_id", uid);
  if (error) throw new Error(error.message);
  return loadBundle(supabase, uid);
}

export async function addCreditIssueAction(raw: CreditIssueInput): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  const input = creditIssueInputSchema.parse(raw);
  const row = creditIssueToRow({ id: "", ownerId: uid, ...input, createdAt: "", updatedAt: "" });
  delete row.id;
  delete row.updated_at;
  const { error } = await supabase.from("credit_issues").insert(row);
  if (error) throw new Error(error.message);
  return loadBundle(supabase, uid);
}

export async function updateCreditIssueAction(
  id: string,
  raw: CreditIssueInput,
): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  const input = creditIssueInputSchema.parse(raw);
  const row = creditIssueToRow({ id, ownerId: uid, ...input, createdAt: "", updatedAt: new Date().toISOString() });
  delete row.id;
  const { error } = await supabase.from("credit_issues").update(row).eq("id", id).eq("owner_id", uid);
  if (error) throw new Error(error.message);
  return loadBundle(supabase, uid);
}

export async function recordActionEventAction(args: {
  actionId: string;
  ruleId: string;
  type: ActionEventType;
  reason?: string | null;
  occurrenceKey?: string | null;
}): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  // Runtime validation. Rejects `completed_verified` outright: ownership is not
  // independent verification. RLS (migration 0003) blocks it at the DB too.
  const input = actionEventArgsSchema.parse(args);
  const { error } = await supabase.from("action_events").insert({
    owner_id: uid,
    action_id: input.actionId,
    rule_id: input.ruleId,
    type: input.type,
    reason: input.reason ?? null,
    occurrence_key: input.occurrenceKey ?? null,
  });
  if (error) throw new Error(error.message);
  return loadBundle(supabase, uid);
}

export async function addWeeklyReviewAction(raw: WeeklyReviewInput): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  const input = weeklyReviewInputSchema.parse(raw);
  const { error } = await supabase.from("weekly_reviews").insert({
    owner_id: uid,
    week_of: input.weekOf,
    updated_balances_note: input.updatedBalancesNote,
    actions_completed: input.actionsCompleted,
    obstacles: input.obstacles,
    time_spent_minutes: input.timeSpentMinutes,
    next_priorities: input.nextPriorities,
  });
  if (error) throw new Error(error.message);
  return loadBundle(supabase, uid);
}

export async function setFormationStatusAction(
  itemId: string,
  status: FormationItemStatus,
): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  const item = formationItemIdSchema.parse(itemId);
  // `verified` is rejected: a user marking their own filing done is a self-report.
  const checked = selfReportableFormationStatusSchema.parse(status);
  // v0.1 maintains only the NY checklist, so state is fixed to 'NY'.
  const { error } = await supabase.from("formation_checklists").upsert(
    { owner_id: uid, state: "NY", item_id: item, status: checked, updated_at: new Date().toISOString() },
    { onConflict: "owner_id,state,item_id" },
  );
  if (error) throw new Error(error.message);
  return loadBundle(supabase, uid);
}

export async function setPartnerStatusAction(
  partnerId: string,
  status: PartnerStatus,
): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  const pid = partnerIdSchema.parse(partnerId);
  const st = partnerStatusSchema.parse(status);
  const { error } = await supabase.from("partner_statuses").upsert(
    { owner_id: uid, partner_id: pid, status: st, updated_at: new Date().toISOString() },
    { onConflict: "owner_id,partner_id" },
  );
  if (error) throw new Error(error.message);
  return loadBundle(supabase, uid);
}

export async function acknowledgePartnersAction(): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  const { error } = await supabase
    .from("profiles")
    .upsert({ owner_id: uid, partners_acknowledged: true }, { onConflict: "owner_id" });
  if (error) throw new Error(error.message);
  return loadBundle(supabase, uid);
}

export async function recordReferralEventAction(
  partnerId: string,
  type: ReferralEventType,
): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  const pid = partnerIdSchema.parse(partnerId);
  const evType = referralEventTypeSchema.parse(type);
  const known = PARTNERS.find((p) => p.id === pid);
  if (!known) throw new Error("UNKNOWN_PARTNER");
  const category: PartnerCategory = known.category;
  const { error } = await supabase.from("referral_events").insert({
    owner_id: uid,
    partner_id: pid,
    category,
    type: evType,
  });
  if (error) throw new Error(error.message);
  return loadBundle(supabase, uid);
}

/**
 * Deletes all of this user's DATA. It deliberately does not delete the auth
 * identity (that needs service-role administration), so the product copy says
 * "delete my data" and the sign-in is retained — see docs and Settings.
 *
 * Requires a recent sign-in, runs as one transactional database routine, and
 * verifies its own postcondition. Any failure throws, so a partial deletion can
 * never be reported to the user as success.
 */
export async function deleteAllDataAction(): Promise<UserDataBundle> {
  const { supabase, uid } = await requireRecentAuth();

  const { data, error } = await supabase.rpc("delete_my_data");
  if (error) throw new Error(error.message);

  // The routine returns per-table counts plus its own verification. Treat a
  // missing/!=0 verification as a failure rather than assuming success.
  const receipt = (data ?? null) as Record<string, number> | null;
  if (!receipt || receipt.verified_remaining !== 0) {
    throw new Error("DELETION_UNVERIFIED");
  }

  // Independent re-read: the bundle must genuinely come back empty.
  const after = await loadBundle(supabase, uid);
  const leftovers =
    after.snapshots.length +
    after.accounts.length +
    after.creditIssues.length +
    after.actionEvents.length +
    after.weeklyReviews.length +
    after.referralEvents.length +
    Object.keys(after.formationStatuses).length +
    Object.keys(after.partnerStatuses).length +
    (after.profile ? 1 : 0);
  if (leftovers !== 0) throw new Error("DELETION_INCOMPLETE");

  return emptyBundle(uid);
}
