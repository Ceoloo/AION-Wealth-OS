import type {
  ActionEvent,
  ActionStatus,
  GeneratedPlan,
  PlanAction,
} from "../types";
import type { ISODate, Profile, FinancialSnapshot, Account, CreditIssue } from "../types";
import { summarize } from "../finance";
import { ENGINE_VERSION, RULES, type RuleContext } from "./rules";

export interface EngineInput {
  asOf: ISODate;
  generatedAt: string; // ISODateTime — passed in for determinism/testability
  profile: Profile | null;
  snapshot: FinancialSnapshot | null;
  accounts: Account[];
  creditIssues: CreditIssue[];
  events: ActionEvent[];
}

/**
 * Derive an action's status from its event history. Events are the source of
 * truth for progress, so recompute never erases completed work.
 *
 * Terminal states (complete / skipped-deferred) win over the base status; a
 * later "reopened" clears them.
 */
type Derived = { status: ActionStatus | null; deferredOrSkipped: boolean };

function deriveFromEvents(actionId: string, events: ActionEvent[]): Derived {
  const relevant = events
    .filter((e) => e.actionId === actionId)
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at));

  let status: ActionStatus | null = null;
  let deferredOrSkipped = false;

  for (const e of relevant) {
    switch (e.type) {
      case "completed_user_reported":
      case "completed_verified":
        status = "complete";
        deferredOrSkipped = false;
        break;
      case "started":
        if (status !== "complete") status = "in_progress";
        break;
      case "skipped":
      case "deferred":
        deferredOrSkipped = true;
        break;
      case "reopened":
        status = "in_progress";
        deferredOrSkipped = false;
        break;
      case "generated":
      default:
        break;
    }
  }

  return { status, deferredOrSkipped };
}

/**
 * Run the deterministic engine. Produces at most 3 current priorities and a
 * sequenced 30-day plan. Stable ruleId/actionId means recompute preserves
 * completed work and never creates duplicate tasks.
 */
export function generatePlan(input: EngineInput): GeneratedPlan {
  const summary =
    input.snapshot != null
      ? summarize(input.snapshot, input.accounts)
      : summarize(emptySnapshot(input.asOf), input.accounts);

  const ctx: RuleContext = {
    asOf: input.asOf,
    profile: input.profile,
    snapshot: input.snapshot,
    accounts: input.accounts,
    creditIssues: input.creditIssues,
    summary,
  };

  const notices: string[] = [];
  const negativeSurplus =
    summary.surplus.value !== null && summary.surplus.value < 0;
  if (negativeSurplus) {
    notices.push(
      "Your monthly surplus is negative, so stabilization is prioritized before any new borrowing or elective business costs.",
    );
  }
  for (const n of summary.doubleCount.notes) notices.push(n);

  // Evaluate every rule; keep the ones that apply.
  const actions: PlanAction[] = [];
  for (const rule of RULES) {
    const res = rule.evaluate(ctx);
    if (!res.applies) continue;

    const actionId = rule.id; // singleton per rule → stable & duplicate-free
    const derived = deriveFromEvents(actionId, input.events);

    // Base status from the rule, then overridden by event history.
    let status: ActionStatus = res.insufficient ? "insufficient_information" : "needs_attention";
    if (derived.status !== null) status = derived.status;

    const action: PlanAction = {
      ...rule.template,
      ...(res.overrides ?? {}),
      ruleId: rule.id,
      actionId,
      priorityRank: rule.order, // provisional; re-ranked below
      status,
      why: res.why,
      supportingInputs: res.supportingInputs,
      prerequisites: res.overrides?.prerequisites ?? [],
    };
    // Tag deferred/skipped so ranking can exclude from priorities.
    (action as PlanAction & { _deferredOrSkipped?: boolean })._deferredOrSkipped =
      derived.deferredOrSkipped;

    actions.push(action);
  }

  // Sequence the 30-day plan by rule order (already ascending in RULES).
  const thirtyDayPlan = actions
    .slice()
    .sort((a, b) => a.priorityRank - b.priorityRank)
    .map((a, i) => ({ ...a, priorityRank: i + 1 }));

  // Priorities: at most 3 actions that need attention right now.
  // Exclude completed, skipped/deferred; when surplus is negative, formation
  // (an elective-cost action) is excluded from priorities per the guardrail.
  const priorities = thirtyDayPlan
    .filter((a) => {
      const flagged = (a as PlanAction & { _deferredOrSkipped?: boolean })._deferredOrSkipped;
      if (a.status === "complete") return false;
      if (flagged) return false;
      if (negativeSurplus && a.category === "formation") return false;
      return true;
    })
    .slice(0, 3)
    .map((a) => stripInternal(a));

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: input.generatedAt,
    snapshotId: input.snapshot?.id ?? null,
    priorities,
    thirtyDayPlan: thirtyDayPlan.map((a) => stripInternal(a)),
    notices,
  };
}

function stripInternal(a: PlanAction): PlanAction {
  const copy = { ...a } as PlanAction & { _deferredOrSkipped?: boolean };
  delete copy._deferredOrSkipped;
  return copy;
}

function emptySnapshot(asOf: ISODate): FinancialSnapshot {
  return {
    id: "none",
    ownerId: "none",
    asOf,
    takeHomeIncomeCents: null,
    essentialSpendingCents: null,
    otherSpendingCents: null,
    requiredDebtPaymentsCents: null,
    availableCashCents: null,
    otherAssetsCents: null,
    liabilitiesCents: null,
    hasPastDueAccounts: null,
    selfReportedScore: null,
    createdAt: `${asOf}T00:00:00.000Z`,
  };
}

export { ENGINE_VERSION };
