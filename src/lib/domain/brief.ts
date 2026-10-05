import type {
  ActionEvent,
  CreditIssue,
  FinancialSnapshot,
  GeneratedPlan,
  ISODate,
  ISODateTime,
} from "./types";
import type { Cents } from "./money";
import type { JourneyAssessment } from "./journey";

/**
 * The weekly brief. Deterministic: it reports what the user recorded during a
 * period and what their own figures did between two dated snapshots. No model
 * is involved, nothing is summarised by inference, and nothing is predicted.
 *
 * The distinction this file is built around: a change between two snapshots is
 * a change in WHAT THE USER REPORTED. It is not evidence that something changed
 * in the world, and it is never evidence that this app caused anything. Every
 * line of copy here is written to keep that straight.
 */

export const BRIEF_VERSION = "2026.10.1";

export const DEFAULT_PERIOD_DAYS = 7;

export type ChangeDirection = "up" | "down" | "same" | "unknown";

export interface FigureChange {
  key: string;
  label: string;
  beforeCents: Cents | null;
  afterCents: Cents | null;
  /** Null whenever either side is unknown — never computed against an assumed 0. */
  deltaCents: Cents | null;
  direction: ChangeDirection;
  /** Why there is no delta, when there isn't one. */
  note: string | null;
}

export interface WeeklyBrief {
  version: string;
  generatedAt: ISODateTime;
  periodStart: ISODate;
  periodEnd: ISODate;
  /** The dates of the two snapshots compared, when a comparison was possible. */
  comparedFrom: ISODate | null;
  comparedTo: ISODate | null;
  /** Why no comparison was made, when none was. */
  comparisonNote: string | null;
  /** Which two entries were compared, when a comparison was made. */
  comparisonBasis: string | null;
  figureChanges: FigureChange[];
  /** What the user recorded doing during the period. */
  recorded: string[];
  overdue: string[];
  dueSoon: string[];
  /** Facts still missing that are holding up a journey stage. */
  stillUnknown: string[];
  /** True when the user recorded nothing and no figure moved. */
  quiet: boolean;
  headline: string;
  basis: string;
}

export interface BriefInput {
  asOf: ISODate;
  generatedAt: ISODateTime;
  snapshots: FinancialSnapshot[];
  creditIssues: CreditIssue[];
  events: ActionEvent[];
  plan: GeneratedPlan;
  journey: JourneyAssessment;
  periodDays?: number;
}

/** Shift an ISO date by whole days, in UTC. Returns an ISO date. */
export function shiftDays(iso: ISODate, days: number): ISODate {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * No "good"/"bad" direction is attached to these on purpose. The brief reports
 * what the figures did; calling a move good or bad is a judgement about someone
 * whose circumstances it cannot see.
 */
const FIGURES: { key: string; label: string; pick: (s: FinancialSnapshot) => Cents | null }[] = [
  { key: "takeHomeIncome", label: "Take-home income", pick: (s) => s.takeHomeIncomeCents },
  { key: "essentialSpending", label: "Essential spending", pick: (s) => s.essentialSpendingCents },
  { key: "otherSpending", label: "Other spending", pick: (s) => s.otherSpendingCents },
  { key: "requiredDebtPayments", label: "Required debt payments", pick: (s) => s.requiredDebtPaymentsCents },
  { key: "availableCash", label: "Available cash", pick: (s) => s.availableCashCents },
  { key: "liabilities", label: "Total liabilities", pick: (s) => s.liabilitiesCents },
];

function sortSnapshots(snapshots: FinancialSnapshot[]): FinancialSnapshot[] {
  return snapshots
    .slice()
    .sort((a, b) => (a.asOf === b.asOf ? a.createdAt.localeCompare(b.createdAt) : a.asOf.localeCompare(b.asOf)));
}

function describeChange(
  label: string,
  key: string,
  before: Cents | null,
  after: Cents | null,
): FigureChange {
  if (before === null || after === null) {
    const which =
      before === null && after === null
        ? "You haven't recorded this figure."
        : before === null
          ? "There's no earlier figure to compare against."
          : "You haven't recorded this figure in the newer entry.";
    return {
      key,
      label,
      beforeCents: before,
      afterCents: after,
      // Deliberately not 0: an unknown minus a number is unknown, not a change.
      deltaCents: null,
      direction: "unknown",
      note: which,
    };
  }
  const delta = after - before;
  return {
    key,
    label,
    beforeCents: before,
    afterCents: after,
    deltaCents: delta,
    direction: delta === 0 ? "same" : delta > 0 ? "up" : "down",
    note: null,
  };
}

const EVENT_VERBS: Partial<Record<ActionEvent["type"], string>> = {
  completed_user_reported: "marked done",
  completed_verified: "verified as done",
  started: "started",
  skipped: "skipped",
  deferred: "deferred",
  reopened: "reopened",
};

function titleFor(plan: GeneratedPlan, actionId: string): string {
  const found =
    plan.thirtyDayPlan.find((a) => a.actionId === actionId) ??
    plan.archivedCompletions.find((a) => a.actionId === actionId);
  return found?.title ?? actionId.replace(/_/g, " ");
}

export function generateWeeklyBrief(input: BriefInput): WeeklyBrief {
  const periodDays = input.periodDays ?? DEFAULT_PERIOD_DAYS;
  const periodEnd = input.asOf;
  const periodStart = shiftDays(periodEnd, -periodDays);

  // ---- Figure comparison -------------------------------------------------
  // Compare the newest snapshot in the period against the newest one BEFORE
  // the period. Comparing the period's own first and last entries would miss
  // movement for anyone who recorded only once this week.
  const sorted = sortSnapshots(input.snapshots);
  const inPeriod = sorted.filter((s) => s.asOf > periodStart && s.asOf <= periodEnd);
  const beforePeriod = sorted.filter((s) => s.asOf <= periodStart);

  const to = inPeriod.at(-1) ?? null;
  // Prefer the newest entry from BEFORE the period. Failing that, fall back to
  // the earliest entry inside it — otherwise someone who started recording this
  // week would be told it was a quiet week while their figures plainly moved.
  const earlier = beforePeriod.at(-1) ?? null;
  const from = earlier ?? (inPeriod.length > 1 ? inPeriod[0]! : null);

  let figureChanges: FigureChange[] = [];
  let comparisonNote: string | null = null;
  let comparisonBasis: string | null = null;
  let comparedFrom: ISODate | null = null;
  let comparedTo: ISODate | null = null;

  if (to !== null && from !== null) {
    comparedFrom = from.asOf;
    comparedTo = to.asOf;
    comparisonBasis =
      earlier !== null
        ? `Compared against your most recent entry before ${periodStart}.`
        : `Compared against your earliest entry this period — there was nothing recorded before ${periodStart}.`;
    figureChanges = FIGURES.map((f) => describeChange(f.label, f.key, f.pick(from), f.pick(to)));
  } else if (to !== null && from === null) {
    comparedTo = to.asOf;
    comparisonNote =
      "This is your first recorded entry, so there's nothing earlier to compare it against.";
  } else if (sorted.length > 0) {
    comparisonNote = `You didn't record new figures between ${periodStart} and ${periodEnd}, so nothing has moved to report.`;
  } else {
    comparisonNote = "No figures recorded yet.";
  }

  // ---- What the user recorded -------------------------------------------
  const periodEvents = input.events
    .filter((e) => {
      const day = e.at.slice(0, 10);
      return day > periodStart && day <= periodEnd;
    })
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at));

  const recorded: string[] = [];
  for (const e of periodEvents) {
    const verb = EVENT_VERBS[e.type];
    if (!verb) continue; // "generated" is bookkeeping, not something the user did
    const reason = e.reason ? ` — "${e.reason}"` : "";
    recorded.push(`${e.at.slice(0, 10)}: ${verb} "${titleFor(input.plan, e.actionId)}"${reason}`);
  }

  // ---- Follow-ups --------------------------------------------------------
  const overdue: string[] = [];
  const dueSoon: string[] = [];
  const soonCutoff = shiftDays(periodEnd, periodDays);
  for (const c of input.creditIssues) {
    if (c.state === "resolved" || c.followUpDate === null) continue;
    if (c.followUpDate < periodEnd) {
      overdue.push(`${c.creditorNickname} (${c.bureau}) — follow-up was due ${c.followUpDate}`);
    } else if (c.followUpDate <= soonCutoff) {
      dueSoon.push(`${c.creditorNickname} (${c.bureau}) — follow-up due ${c.followUpDate}`);
    }
  }

  const newest = sorted.at(-1);
  if (newest) {
    const age = daysBetween(newest.asOf, periodEnd);
    if (age > periodDays) {
      overdue.push(`Your figures are ${age} days old — last recorded ${newest.asOf}.`);
    }
  }

  // ---- What's still missing ---------------------------------------------
  // Taken from the journey assessment so the brief and the stage strip can
  // never disagree about what is blocking progress.
  const stillUnknown = input.journey.stages
    .filter((s) => s.status === "unknown")
    .map((s) => `${s.label}: ${s.detail}`);

  const moved = figureChanges.some((c) => c.direction === "up" || c.direction === "down");
  const quiet = recorded.length === 0 && !moved && overdue.length === 0 && dueSoon.length === 0;

  return {
    version: BRIEF_VERSION,
    generatedAt: input.generatedAt,
    periodStart,
    periodEnd,
    comparedFrom,
    comparedTo,
    comparisonNote,
    comparisonBasis,
    figureChanges,
    recorded,
    overdue,
    dueSoon,
    stillUnknown,
    quiet,
    headline: headlineFor({ quiet, recorded, moved, overdue, dueSoon }),
    basis:
      "This brief reports what you recorded between these dates and how the figures you entered " +
      "compare. A change here is a change in what you reported — it is not proof that something " +
      "changed in the world, and it is not evidence that this app caused anything.",
  };
}

function headlineFor(args: {
  quiet: boolean;
  recorded: string[];
  moved: boolean;
  overdue: string[];
  dueSoon: string[];
}): string {
  if (args.quiet) return "A quiet week — nothing recorded and no figures changed.";
  if (args.overdue.length > 0) {
    return `${args.overdue.length} thing(s) need attention${args.recorded.length > 0 ? `, and you recorded ${args.recorded.length} step(s)` : ""}.`;
  }
  if (args.recorded.length > 0 && args.moved) {
    return `You recorded ${args.recorded.length} step(s), and your figures moved.`;
  }
  if (args.recorded.length > 0) return `You recorded ${args.recorded.length} step(s).`;
  if (args.moved) return "Your figures moved this week.";
  // Reached only when the sole reason this week isn't quiet is an upcoming
  // follow-up. Claiming movement here would describe a week that didn't happen.
  return `Nothing recorded, but ${args.dueSoon.length} follow-up(s) are coming up.`;
}

function daysBetween(fromISO: ISODate, toISO: ISODate): number {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
