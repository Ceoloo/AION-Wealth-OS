import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserDataBundle } from "../data/bundle";
import { emptyBundle } from "../data/bundle";
import type { FormationItemStatus } from "../domain/formation";
import type { PartnerStatus } from "../domain/partners";
import {
  rowToAccount,
  rowToActionEvent,
  rowToCreditIssue,
  rowToProfile,
  rowToReferralEvent,
  rowToSnapshot,
  rowToWeeklyReview,
} from "./mappers";

/**
 * Server-side read that assembles a full UserDataBundle for one owner. RLS
 * already scopes rows to the caller; we ALSO filter by owner_id explicitly as
 * defense-in-depth (the app-level ownership guarantee), so a misconfigured
 * policy can never leak another user's rows through this path.
 */
export async function loadBundle(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<UserDataBundle> {
  const bundle = emptyBundle(ownerId);

  const [
    profileRes,
    snapshotsRes,
    accountsRes,
    creditRes,
    eventsRes,
    reviewsRes,
    formationRes,
    partnerRes,
    referralRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("owner_id", ownerId).maybeSingle(),
    supabase.from("financial_snapshots").select("*").eq("owner_id", ownerId).order("as_of"),
    supabase.from("accounts").select("*").eq("owner_id", ownerId).order("created_at"),
    supabase.from("credit_issues").select("*").eq("owner_id", ownerId).order("created_at"),
    supabase.from("action_events").select("*").eq("owner_id", ownerId).order("at"),
    supabase.from("weekly_reviews").select("*").eq("owner_id", ownerId).order("week_of"),
    supabase.from("formation_checklists").select("*").eq("owner_id", ownerId),
    supabase.from("partner_statuses").select("*").eq("owner_id", ownerId),
    supabase.from("referral_events").select("*").eq("owner_id", ownerId).order("at"),
  ]);

  if (profileRes.data) {
    bundle.profile = rowToProfile(profileRes.data);
    bundle.partnersAcknowledged = Boolean(profileRes.data.partners_acknowledged);
  }
  bundle.snapshots = (snapshotsRes.data ?? []).map(rowToSnapshot);
  bundle.accounts = (accountsRes.data ?? []).map(rowToAccount);
  bundle.creditIssues = (creditRes.data ?? []).map(rowToCreditIssue);
  bundle.actionEvents = (eventsRes.data ?? []).map(rowToActionEvent);
  bundle.weeklyReviews = (reviewsRes.data ?? []).map(rowToWeeklyReview);
  bundle.referralEvents = (referralRes.data ?? []).map(rowToReferralEvent);

  const formationStatuses: Record<string, FormationItemStatus> = {};
  for (const row of formationRes.data ?? []) {
    formationStatuses[String(row.item_id)] = String(row.status) as FormationItemStatus;
  }
  bundle.formationStatuses = formationStatuses;

  const partnerStatuses: Record<string, PartnerStatus> = {};
  for (const row of partnerRes.data ?? []) {
    partnerStatuses[String(row.partner_id)] = String(row.status) as PartnerStatus;
  }
  bundle.partnerStatuses = partnerStatuses;

  return bundle;
}
