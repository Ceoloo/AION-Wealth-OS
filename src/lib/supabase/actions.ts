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
}): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  if ((args.type === "skipped" || args.type === "deferred") && !args.reason) {
    throw new Error("A reason is required to skip or defer an action.");
  }
  const { error } = await supabase.from("action_events").insert({
    owner_id: uid,
    action_id: args.actionId,
    rule_id: args.ruleId,
    type: args.type,
    reason: args.reason ?? null,
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
  // v0.1 maintains only the NY checklist, so state is fixed to 'NY'.
  const { error } = await supabase.from("formation_checklists").upsert(
    { owner_id: uid, state: "NY", item_id: itemId, status, updated_at: new Date().toISOString() },
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
  const { error } = await supabase.from("partner_statuses").upsert(
    { owner_id: uid, partner_id: partnerId, status, updated_at: new Date().toISOString() },
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
  const category: PartnerCategory =
    PARTNERS.find((p) => p.id === partnerId)?.category ?? "banking";
  const { error } = await supabase.from("referral_events").insert({
    owner_id: uid,
    partner_id: partnerId,
    category,
    type,
  });
  if (error) throw new Error(error.message);
  return loadBundle(supabase, uid);
}

/**
 * Authenticated account data deletion. Deleting the profile cascades to every
 * owned row (see 0001 FKs). In production, gate this behind reauthentication
 * before calling; residual backup copies age out per the retention policy.
 */
export async function deleteAllDataAction(): Promise<UserDataBundle> {
  const { supabase, uid } = await requireCtx();
  // Delete children first (defensive) then the profile.
  for (const table of [
    "financial_snapshots",
    "accounts",
    "credit_issues",
    "action_events",
    "weekly_reviews",
    "formation_checklists",
    "partner_statuses",
    "referral_events",
    "ai_usage",
  ]) {
    await supabase.from(table).delete().eq("owner_id", uid);
  }
  await supabase.from("profiles").delete().eq("owner_id", uid);
  return emptyBundle(uid);
}
