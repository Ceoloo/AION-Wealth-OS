import type { UserDataBundle } from "../data/bundle";
import { latestSnapshot } from "../data/bundle";
import { summarize } from "../domain/finance";

/**
 * Builds the MINIMIZED financial summary that may be sent to the AI provider
 * AFTER explicit user opt-in. It deliberately excludes:
 *   - account identifiers / nicknames
 *   - private free-text notes (credit issue explanations, review notes)
 *   - exact balances of individual accounts
 *   - any user identifier
 * The `categories` array is shown to the user so they know exactly what leaves.
 */
export interface MinimizedSummary {
  categories: string[];
  payload: Record<string, unknown>;
}

export function buildMinimizedSummary(bundle: UserDataBundle): MinimizedSummary {
  const snap = latestSnapshot(bundle);
  const summary = snap ? summarize(snap, bundle.accounts) : null;

  const categories = [
    "Coarse financial ratios (surplus sign, coverage band, utilization band)",
    "Counts of accounts and open credit issues (no names or balances)",
    "Your goals and residence/business state",
    "Current plan action categories and statuses",
  ];

  const payload: Record<string, unknown> = {
    residenceState: bundle.profile?.residenceState ?? null,
    businessState: bundle.profile?.businessState ?? null,
    goals: bundle.profile?.goals ?? [],
    accountsCount: bundle.accounts.length,
    openCreditIssuesCount: bundle.creditIssues.filter(
      (c) => c.state !== "resolved" && c.state !== "unresolved",
    ).length,
    // Bands, not raw values — avoids sending exact financial figures.
    surplusSign: summary?.surplus.value == null ? "unknown" : summary.surplus.value < 0 ? "negative" : "non_negative",
    cashCoverageBand: coverageBand(summary?.cashCoverage.value ?? null),
    utilizationBand: utilBand(summary?.utilization.value ?? null),
    hasPastDue: summary?.hasPastDue ?? null,
  };

  return { categories, payload };
}

function coverageBand(months: number | null): string {
  if (months === null) return "unknown";
  if (months < 1) return "under_1_month";
  if (months < 3) return "1_to_3_months";
  if (months < 6) return "3_to_6_months";
  return "6_plus_months";
}

function utilBand(ratio: number | null): string {
  if (ratio === null) return "unknown";
  if (ratio < 0.1) return "under_10pct";
  if (ratio < 0.3) return "10_to_30pct";
  if (ratio < 0.5) return "30_to_50pct";
  return "over_50pct";
}
