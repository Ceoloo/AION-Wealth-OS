import type {
  Account,
  ActionEvent,
  CreditIssue,
  FinancialSnapshot,
  Profile,
  WeeklyReview,
} from "../domain/types";
import type { FormationItemStatus } from "../domain/formation";
import type { PartnerStatus, ReferralEvent } from "../domain/partners";

/**
 * The complete set of one user's private records. This is the unit of export,
 * deletion, and demo persistence. It never contains other users' data or any
 * service secrets.
 */
export interface UserDataBundle {
  ownerId: string;
  profile: Profile | null;
  snapshots: FinancialSnapshot[];
  accounts: Account[];
  creditIssues: CreditIssue[];
  actionEvents: ActionEvent[];
  weeklyReviews: WeeklyReview[];
  /** User-reported status per formation checklist item id. */
  formationStatuses: Record<string, FormationItemStatus>;
  /** User-reported status per partner/referral app id. */
  partnerStatuses: Record<string, PartnerStatus>;
  /** Whether the user has seen and acknowledged the partner-tools prompt. */
  partnersAcknowledged: boolean;
  /** Append-only referral click / signup-reported tracking events. */
  referralEvents: ReferralEvent[];
}

export function emptyBundle(ownerId: string): UserDataBundle {
  return {
    ownerId,
    profile: null,
    snapshots: [],
    accounts: [],
    creditIssues: [],
    actionEvents: [],
    weeklyReviews: [],
    formationStatuses: {},
    partnerStatuses: {},
    partnersAcknowledged: false,
    referralEvents: [],
  };
}

/** Most recent snapshot by asOf date (then createdAt), or null. */
export function latestSnapshot(bundle: UserDataBundle): FinancialSnapshot | null {
  if (bundle.snapshots.length === 0) return null;
  return bundle.snapshots
    .slice()
    .sort((a, b) => (a.asOf === b.asOf ? a.createdAt.localeCompare(b.createdAt) : a.asOf.localeCompare(b.asOf)))
    .at(-1)!;
}

/** Earliest snapshot — the baseline for weekly-review comparisons. */
export function baselineSnapshot(bundle: UserDataBundle): FinancialSnapshot | null {
  if (bundle.snapshots.length === 0) return null;
  return bundle.snapshots
    .slice()
    .sort((a, b) => (a.asOf === b.asOf ? a.createdAt.localeCompare(b.createdAt) : a.asOf.localeCompare(b.asOf)))
    .at(0)!;
}
