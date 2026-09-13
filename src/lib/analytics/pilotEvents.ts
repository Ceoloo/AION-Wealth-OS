import type { UserDataBundle } from "../data/bundle";

/**
 * Minimal pilot instrumentation.
 *
 * Deliberate constraints:
 *  - Milestones only. No raw financial values, no free-text notes, no account
 *    identifiers — just that a milestone happened and when.
 *  - DERIVED from records the user already has rather than a separate tracking
 *    pipeline, so there is no second copy of anything to leak or to delete.
 *  - Synthetic demo activity is excluded: pilot learning must come from real use.
 *  - Referral conversion is NOT included here. Partner click/signup metrics live
 *    in `referralFunnel` and stay separate from the user's financial progress,
 *    so commercial performance can never be read as user benefit.
 */

export type PilotMilestoneName =
  | "onboarding_completed"
  | "first_plan_viewed"
  | "first_action_completed"
  | "weekly_review_submitted";

export interface PilotMilestone {
  name: PilotMilestoneName;
  /** ISO timestamp of the first occurrence. */
  at: string;
}

export interface PilotMilestoneOptions {
  /** Demo activity is excluded from pilot measurement. */
  isDemo: boolean;
  /** Supplied by the caller so derivation stays pure/testable. */
  planViewedAt?: string | null;
}

function earliest(times: string[]): string | null {
  if (times.length === 0) return null;
  return times.slice().sort((a, b) => a.localeCompare(b))[0]!;
}

export function derivePilotMilestones(
  bundle: UserDataBundle,
  opts: PilotMilestoneOptions,
): PilotMilestone[] {
  if (opts.isDemo) return []; // synthetic activity is never pilot evidence

  const out: PilotMilestone[] = [];

  // Onboarding is complete once a profile exists AND a snapshot has been saved.
  const firstSnapshot = earliest(bundle.snapshots.map((s) => s.createdAt));
  if (bundle.profile && firstSnapshot) {
    out.push({
      name: "onboarding_completed",
      at: bundle.profile.createdAt > firstSnapshot ? bundle.profile.createdAt : firstSnapshot,
    });
  }

  if (opts.planViewedAt) {
    out.push({ name: "first_plan_viewed", at: opts.planViewedAt });
  }

  const firstCompletion = earliest(
    bundle.actionEvents
      .filter((e) => e.type === "completed_user_reported" || e.type === "completed_verified")
      .map((e) => e.at),
  );
  if (firstCompletion) out.push({ name: "first_action_completed", at: firstCompletion });

  const firstReview = earliest(bundle.weeklyReviews.map((r) => r.createdAt));
  if (firstReview) out.push({ name: "weekly_review_submitted", at: firstReview });

  return out.sort((a, b) => a.at.localeCompare(b.at));
}
