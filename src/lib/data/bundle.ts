import type {
  Account,
  ActionEvent,
  CreditIssue,
  FinancialSnapshot,
  Profile,
  WeeklyReview,
} from "../domain/types";

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
