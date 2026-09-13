import type {
  ActionEvent,
  ActionStatus,
  CompletionKind,
  GeneratedPlan,
  IssueState,
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
  /** Dated history (oldest first). Used to count recurring issue episodes. */
  snapshots?: FinancialSnapshot[];
  accounts: Account[];
  creditIssues: CreditIssue[];
  events: ActionEvent[];
}

/** Legacy rows predate occurrence tracking; treat them as the default occurrence. */
const LEGACY_OCCURRENCE = "default";

function eventOccurrence(e: ActionEvent): string {
  return e.occurrenceKey ?? LEGACY_OCCURRENCE;
}

/**
 * Derive an action's status from its event history. Events are the source of
 * truth for progress, so recompute never erases completed work.
 *
 * Terminal states (complete / skipped-deferred) win over the base status; a
 * later "reopened" clears them.
 */
type Derived = {
  status: ActionStatus | null;
  deferredOrSkipped: boolean;
  completedAt: string | null;
  completionKind: CompletionKind | null;
};

/**
 * Derive status from the events recorded against THIS occurrence only.
 *
 * The previous implementation let any completion mark the rule complete
 * forever, so a recurring problem (a fresh past-due account, a relapse into
 * negative surplus) stayed hidden behind an old completion. Scoping derivation
 * to the current occurrence keeps the user's history intact while letting new
 * adverse facts resurface the work.
 */
function deriveFromEvents(
  actionId: string,
  occurrenceKey: string,
  events: ActionEvent[],
): Derived {
  const relevant = events
    .filter((e) => e.actionId === actionId && eventOccurrence(e) === occurrenceKey)
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at));

  let status: ActionStatus | null = null;
  let deferredOrSkipped = false;
  let completedAt: string | null = null;
  let completionKind: CompletionKind | null = null;

  for (const e of relevant) {
    switch (e.type) {
      case "completed_user_reported":
      case "completed_verified":
        status = "complete";
        deferredOrSkipped = false;
        completedAt = e.at;
        completionKind = e.type === "completed_verified" ? "verified" : "user_reported";
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
        completedAt = null;
        completionKind = null;
        break;
      case "generated":
      default:
        break;
    }
  }

  return { status, deferredOrSkipped, completedAt, completionKind };
}

/** Completions recorded against any OTHER occurrence of the same rule. */
function countPriorCompletions(
  actionId: string,
  occurrenceKey: string,
  events: ActionEvent[],
): number {
  return events.filter(
    (e) =>
      e.actionId === actionId &&
      eventOccurrence(e) !== occurrenceKey &&
      (e.type === "completed_user_reported" || e.type === "completed_verified"),
  ).length;
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

  // Dated history, oldest first. Falls back to the single latest snapshot so
  // existing callers keep working.
  const snapshots = (input.snapshots ?? (input.snapshot ? [input.snapshot] : []))
    .slice()
    .sort((a, b) => (a.asOf === b.asOf ? a.createdAt.localeCompare(b.createdAt) : a.asOf.localeCompare(b.asOf)));

  const ctx: RuleContext = {
    asOf: input.asOf,
    profile: input.profile,
    snapshot: input.snapshot,
    snapshots,
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

  const actions: PlanAction[] = [];
  const applicableRuleIds = new Set<string>();

  for (const rule of RULES) {
    const res = rule.evaluate(ctx);
    if (!res.applies) continue;

    const actionId = rule.id; // singleton per rule → stable & duplicate-free
    applicableRuleIds.add(rule.id);
    const occurrenceKey = res.occurrenceKey ?? LEGACY_OCCURRENCE;
    const derived = deriveFromEvents(actionId, occurrenceKey, input.events);

    // Base status from the rule, then overridden by this occurrence's history.
    let status: ActionStatus = res.insufficient ? "insufficient_information" : "needs_attention";
    if (derived.status !== null) status = derived.status;

    // Completion of the ACTION never implies resolution of the ISSUE. A user
    // who contacted a creditor has done the work; the account can still be past
    // due, and the plan says both.
    const issueActive = res.issueActive ?? true;
    const issueState: IssueState = issueActive ? "active" : "not_applicable";

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
      occurrenceKey,
      issueState,
      completedAt: derived.completedAt,
      completionKind: derived.completionKind,
      priorCompletions: countPriorCompletions(actionId, occurrenceKey, input.events),
    };
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

  // ---------------------------------------------------------------------------
  // Retained completions for rules that NO LONGER APPLY.
  //
  // Previously these simply vanished, which both lost the user's history and
  // silently shrank the progress denominator (finishing a task could make the
  // percentage jump for the wrong reason). We keep them, marked resolved.
  // ---------------------------------------------------------------------------
  const archivedCompletions: PlanAction[] = [];
  const seenArchived = new Set<string>();
  for (const rule of RULES) {
    if (applicableRuleIds.has(rule.id) || seenArchived.has(rule.id)) continue;
    const completions = input.events.filter(
      (e) =>
        e.actionId === rule.id &&
        (e.type === "completed_user_reported" || e.type === "completed_verified"),
    );
    if (completions.length === 0) continue;
    seenArchived.add(rule.id);
    const last = completions.slice().sort((a, b) => a.at.localeCompare(b.at)).at(-1)!;
    archivedCompletions.push({
      ...rule.template,
      ruleId: rule.id,
      actionId: rule.id,
      priorityRank: 0,
      status: "complete",
      why: "Completed earlier. This no longer applies to your current situation.",
      supportingInputs: [],
      prerequisites: [],
      occurrenceKey: eventOccurrence(last),
      issueState: "resolved",
      completedAt: last.at,
      completionKind: last.type === "completed_verified" ? "verified" : "user_reported",
      priorCompletions: Math.max(0, completions.length - 1),
    });
  }

  const completedInPlan = thirtyDayPlan.filter((a) => a.status === "complete").length;
  const progress = {
    completed: completedInPlan + archivedCompletions.length,
    total: thirtyDayPlan.length + archivedCompletions.length,
    basis:
      "Current 30-day plan plus retained completions of steps that no longer apply. " +
      "Steps leaving the plan stay in the denominator, so progress never rises just because a step disappeared.",
  };

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: input.generatedAt,
    snapshotId: input.snapshot?.id ?? null,
    priorities,
    thirtyDayPlan: thirtyDayPlan.map((a) => stripInternal(a)),
    archivedCompletions,
    progress,
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
