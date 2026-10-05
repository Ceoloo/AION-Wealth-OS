import type { Account } from "./types";
import type { Cents } from "./money";
import { revolvingUtilization } from "./finance";

/**
 * Revolving-utilization planning.
 *
 * Everything here is arithmetic on figures the user entered. Three things this
 * module deliberately does NOT do:
 *
 *  1. It never claims an effect on a credit score. Utilization is one input
 *     among many to scoring models we do not run, and the size of any score
 *     change is not knowable from this data.
 *  2. It never tells the user where to put their money. It reports what each
 *     option does to one number, and says out loud which factors it ignores.
 *  3. It never quietly drops an account. An account that cannot be included —
 *     unknown limit, unknown balance — is counted and named.
 */

/** Common reference points. These are widely cited guidance, not rules. */
export const UTILIZATION_TARGETS = [0.3, 0.1] as const;

export type ExclusionReason = "unknown_limit" | "zero_limit" | "unknown_balance" | "not_revolving";

export interface AccountUtilization {
  accountId: string;
  nickname: string;
  balanceCents: Cents;
  limitCents: Cents;
  /** Balance ÷ limit, to 3 decimals. */
  ratio: number;
  /** Cents to pay down to reach each target on THIS account alone. */
  paydownToTarget: { target: number; cents: Cents }[];
  isPastDue: boolean;
}

export interface ExcludedAccount {
  accountId: string;
  nickname: string;
  reason: ExclusionReason;
  explanation: string;
}

export interface PaydownScenario {
  accountId: string;
  nickname: string;
  /** How much of the user's amount this account can absorb (capped at balance). */
  appliedCents: Cents;
  /** Amount left over because the balance was smaller than the sum offered. */
  unusedCents: Cents;
  /** Estimated overall utilization afterwards, to 3 decimals. */
  resultingOverallRatio: number;
  /** Change in the overall ratio (negative = lower). */
  deltaRatio: number;
}

export interface UtilizationPlan {
  /** Overall estimate, straight from the existing finance calculation. */
  overallRatio: number | null;
  includedBalanceCents: Cents;
  includedLimitCents: Cents;
  accounts: AccountUtilization[];
  excluded: ExcludedAccount[];
  /** Cents to pay down across included accounts to reach each overall target. */
  overallPaydownToTarget: { target: number; cents: Cents }[];
  /** Things the user should know about how this was computed. */
  notes: string[];
}

/**
 * Note on `includeInSnapshot`: it is NOT consulted here, on purpose. That flag
 * means "this balance is already reflected in the snapshot's aggregate
 * liabilities" and exists only so `debtDoubleCountCheck` can reconcile the two.
 * A card counts toward utilization whether or not its balance was folded into
 * an aggregate, so filtering on it would understate the ratio.
 */
function isRevolvingKind(a: Account): boolean {
  return a.isRevolving && (a.kind === "credit_card" || a.kind === "line_of_credit");
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Cents needed to bring `balance` to at most `target × limit`. Never negative. */
function paydownFor(balanceCents: Cents, limitCents: Cents, target: number): Cents {
  const allowed = Math.floor(target * limitCents);
  return Math.max(0, balanceCents - allowed);
}

export function buildUtilizationPlan(accounts: Account[]): UtilizationPlan {
  const overall = revolvingUtilization(accounts);
  const revolving = accounts.filter(isRevolvingKind);

  const included: AccountUtilization[] = [];
  const excluded: ExcludedAccount[] = [];

  for (const a of revolving) {
    if (a.creditLimitCents === null) {
      excluded.push({
        accountId: a.id,
        nickname: a.nickname,
        reason: "unknown_limit",
        explanation:
          "No credit limit recorded, so this account has no utilization ratio and is left out of the estimate. Add its limit to include it.",
      });
      continue;
    }
    if (a.creditLimitCents <= 0) {
      // Distinct from an absent limit: telling someone to "add its limit" when
      // they typed 0 contradicts what they entered.
      excluded.push({
        accountId: a.id,
        nickname: a.nickname,
        reason: "zero_limit",
        explanation:
          "Its credit limit is recorded as zero, so there is nothing to divide by and no utilization ratio for it.",
      });
      continue;
    }
    if (a.balanceCents === null) {
      excluded.push({
        accountId: a.id,
        nickname: a.nickname,
        reason: "unknown_balance",
        explanation:
          "No balance recorded. It is left out rather than counted as zero, which would understate your utilization.",
      });
      continue;
    }
    const limit = a.creditLimitCents;
    const balance = a.balanceCents;
    included.push({
      accountId: a.id,
      nickname: a.nickname,
      balanceCents: balance,
      limitCents: limit,
      ratio: round3(balance / limit),
      paydownToTarget: UTILIZATION_TARGETS.map((t) => ({
        target: t,
        cents: paydownFor(balance, limit, t),
      })),
      isPastDue: (a.pastDueCents ?? 0) > 0,
    });
  }

  const notes: string[] = [
    "This is an app-side estimate from the limits and balances you entered — not the credit bureau's official utilization, which is reported on its own schedule.",
    "Utilization is one input to scoring models this app does not run. Nothing here predicts a score or a score change.",
  ];
  if (excluded.length > 0) {
    notes.push(
      `${excluded.length} revolving account(s) could not be included. They are listed below with the reason.`,
    );
  }
  if (included.some((a) => a.isPastDue)) {
    notes.push(
      "One or more of these accounts is past due. Anything past due is handled first in your plan — utilization is a separate question from bringing an account current.",
    );
  }

  const totalLimit = overall.includedLimitCents;
  const totalBalance = overall.includedBalanceCents;

  return {
    overallRatio: overall.value,
    includedBalanceCents: totalBalance,
    includedLimitCents: totalLimit,
    accounts: included,
    excluded,
    overallPaydownToTarget:
      totalLimit > 0
        ? UTILIZATION_TARGETS.map((t) => ({ target: t, cents: paydownFor(totalBalance, totalLimit, t) }))
        : [],
    notes,
  };
}

/**
 * What a given sum does to the estimated OVERALL utilization, applied to each
 * account in turn.
 *
 * Ordered by the resulting ratio purely so the numbers are readable. That order
 * reflects ONE factor and is not a recommendation — see `caveats`.
 */
export function paydownScenarios(
  plan: UtilizationPlan,
  amountCents: Cents,
): { scenarios: PaydownScenario[]; caveats: string[] } {
  const caveats = [
    "This compares one factor only: the effect on your estimated utilization. It ignores interest rates, past-due status, fees, and anything else going on in your finances.",
    "It is not a recommendation about where to put your money.",
  ];

  if (amountCents <= 0 || plan.includedLimitCents <= 0) return { scenarios: [], caveats };

  const before = plan.includedBalanceCents / plan.includedLimitCents;

  const scenarios = plan.accounts.map((a) => {
    // You cannot pay down more than is owed on the account.
    const applied = Math.min(amountCents, a.balanceCents);
    const after = (plan.includedBalanceCents - applied) / plan.includedLimitCents;
    return {
      accountId: a.accountId,
      nickname: a.nickname,
      appliedCents: applied,
      unusedCents: amountCents - applied,
      resultingOverallRatio: round3(after),
      deltaRatio: round3(after - before),
    };
  });

  scenarios.sort((x, y) =>
    x.resultingOverallRatio === y.resultingOverallRatio
      ? x.nickname.localeCompare(y.nickname)
      : x.resultingOverallRatio - y.resultingOverallRatio,
  );

  return { scenarios, caveats };
}
