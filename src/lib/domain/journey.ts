import type {
  Account,
  CreditIssue,
  FinancialSnapshot,
  SelfReportedSituation,
} from "./types";
import type { FinanceSummary } from "./finance";

/**
 * Deterministic journey staging.
 *
 * The stages are gates, not a score. Each one is a single plain-language
 * condition checked against figures the user entered. Nothing here produces a
 * composite "readiness" number, and nothing here predicts a credit score.
 *
 * Three hard rules this module keeps:
 *
 *  1. A stage is only ever reported "passed" when the facts needed to judge it
 *     are actually present. Absence of a fact is `unknown`, never a pass.
 *  2. Stages this engine version cannot honestly assess are reported as
 *     `not_assessed` rather than being guessed at or hidden.
 *  3. The user's own description of their situation is provisional only. It is
 *     used when the numbers are missing, and a computed stage always wins.
 */

export const JOURNEY_VERSION = "2026.09.1";

export type JourneyStage =
  | "stabilize"
  | "repair"
  | "build"
  | "leverage"
  | "invest"
  | "protect";

export type StageStatus =
  /** The gate is provably met from figures the user entered. */
  | "passed"
  /** The first gate not met — where the plan is working right now. */
  | "current"
  /** After the current stage, and assessable once earlier stages clear. */
  | "upcoming"
  /** The facts needed to judge this gate have not been entered. */
  | "unknown"
  /** This engine version makes no assessment of this stage at all. */
  | "not_assessed";

export interface JourneyStageResult {
  stage: JourneyStage;
  label: string;
  /** What this stage is for, in plain language. */
  goal: string;
  /** The exact condition being checked. Shown to the user verbatim. */
  gate: string;
  status: StageStatus;
  /** Why this status, stated from the user's own figures. */
  detail: string;
}

export interface JourneyAssessment {
  version: string;
  /** Null when the figures needed to place the user are missing. */
  currentStage: JourneyStage | null;
  stages: JourneyStageResult[];
  /** What this assessment is computed from — and what it is not. */
  basis: string;
  /**
   * Shown only when `currentStage` is null. The user's own description of their
   * situation, with the stage it suggests. Never overrides a computed stage,
   * and never counted as a passed gate.
   */
  provisional: { stage: JourneyStage; situation: SelfReportedSituation } | null;
  /** True when every gate this version assesses was met. */
  allAssessedPassed: boolean;
}

export interface JourneyInput {
  snapshot: FinancialSnapshot | null;
  accounts: Account[];
  creditIssues: CreditIssue[];
  summary: FinanceSummary;
  selfReported: SelfReportedSituation | null;
}

/** Stages this version assesses, in order. The rest are declared, not judged. */
const ASSESSED: JourneyStage[] = ["stabilize", "repair", "build"];

const STAGE_COPY: Record<JourneyStage, { label: string; goal: string; gate: string }> = {
  stabilize: {
    label: "Stabilize",
    goal: "Stop the bleeding: cover the month and clear anything overdue.",
    gate: "Money in covers money out, and nothing is past due.",
  },
  repair: {
    label: "Repair",
    goal: "Fix what is wrong on the record before building on top of it.",
    gate: "No credit-report problems you have recorded are still open.",
  },
  build: {
    label: "Build",
    goal: "Put a cushion between you and the next surprise.",
    gate: "At least three months of essential costs and required debt payments held in cash.",
  },
  leverage: {
    label: "Leverage",
    goal: "Use credit and structure deliberately rather than out of necessity.",
    gate: "Not assessed in this version.",
  },
  invest: {
    label: "Invest",
    goal: "Put surplus to work.",
    gate: "Not assessed in this version.",
  },
  protect: {
    label: "Protect",
    goal: "Keep what has been built.",
    gate: "Not assessed in this version.",
  },
};

/**
 * Whether past-due status is actually KNOWN. `summary.hasPastDue` is false both
 * when nothing is overdue and when the user has told us nothing at all — so it
 * cannot be read as a pass on its own.
 */
function pastDueIsKnown(snapshot: FinancialSnapshot | null, accounts: Account[]): boolean {
  // The user answered the question directly.
  if (snapshot?.hasPastDueAccounts != null) return true;
  // Otherwise the only evidence is the accounts, and it has to be complete:
  // one account carrying a past-due figure says nothing about the others.
  return accounts.length > 0 && accounts.every((a) => a.pastDueCents !== null);
}

const OPEN_ISSUE_STATES = new Set(["draft", "user_submitted", "awaiting_response", "unresolved"]);

type Gate = { met: boolean; known: boolean; detail: string };

function unknownGate(missing: string[]): Gate {
  return { met: false, known: false, detail: `Can't tell yet — we don't know ${joinList(missing)}.` };
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "enough yet";
  return `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
}

/**
 * Money in covers money out, and nothing is past due.
 *
 * Evidence of trouble decides the gate immediately: every figure that could
 * still be missing is a SUBTRACTION, so the true surplus can only be lower than
 * the one computed. A PASS is held to the stricter standard — it needs every
 * component present, because `monthlySurplus` fills unknown spending with 0 and
 * says so itself ("surplus may be overstated").
 */
function stabilizeGate(input: JourneyInput): Gate {
  const surplus = input.summary.surplus;

  if (input.summary.hasPastDue) {
    const n = input.summary.pastDueCount;
    return {
      met: false,
      known: true,
      detail:
        n > 0
          ? `${n} account${n === 1 ? " is" : "s are"} past due.`
          : "You reported that something is past due.",
    };
  }
  if (surplus.value !== null && surplus.value < 0) {
    return {
      met: false,
      known: true,
      detail: "Your monthly spending exceeds your take-home income.",
    };
  }

  const missing: string[] = [];
  if (surplus.value === null) {
    missing.push("your take-home income");
  } else if (surplus.completeness !== "complete") {
    missing.push("all of your spending and debt-payment figures");
  }
  if (!pastDueIsKnown(input.snapshot, input.accounts)) {
    missing.push("whether anything is past due");
  }
  if (missing.length > 0) return unknownGate(missing);

  return {
    met: true,
    known: true,
    detail: "Your take-home income covers your monthly outgoings, and nothing is recorded as past due.",
  };
}

function repairGate(input: JourneyInput): Gate {
  const open = input.creditIssues.filter((i) => OPEN_ISSUE_STATES.has(i.state));
  if (open.length > 0) {
    return {
      met: false,
      known: true,
      detail: `${open.length} credit-report problem${open.length === 1 ? "" : "s"} you recorded ${
        open.length === 1 ? "is" : "are"
      } still open.`,
    };
  }
  return {
    met: true,
    known: true,
    detail:
      input.creditIssues.length === 0
        ? "You haven't recorded any credit-report problems. That isn't the same as your report being clean — it only means nothing is open here."
        : "Every credit-report problem you recorded has been closed out.",
  };
}

/**
 * Three months of essential costs AND required debt payments held in cash.
 *
 * Compared in integer cents against the raw figures, NOT against
 * `summary.cashCoverage` — that metric rounds to one decimal, so 2.95 real
 * months would round to 3.0 and clear a gate the user has not actually met.
 *
 * As with stabilize, a shortfall is decisive even on partial data (an unknown
 * obligation only makes the denominator larger and coverage worse), while a
 * pass requires every component.
 */
function buildGate(input: JourneyInput): Gate {
  const s = input.snapshot;
  const cash = s?.availableCashCents ?? null;
  if (cash === null) return unknownGate(["how much cash you have available"]);

  const essential = s!.essentialSpendingCents;
  const debt = s!.requiredDebtPaymentsCents;

  // Unknown components are excluded, so this denominator is a LOWER bound and
  // the coverage derived from it is an upper bound on the real figure.
  const denomLowerBound = (essential ?? 0) + (debt ?? 0);
  if (denomLowerBound > 0 && cash < 3 * denomLowerBound) {
    return { met: false, known: true, detail: coverageDetail(cash, denomLowerBound) };
  }

  const missing: string[] = [];
  if (essential === null) missing.push("your essential monthly costs");
  if (debt === null) missing.push("your required debt payments");
  if (missing.length > 0) return unknownGate(missing);

  const denom = essential! + debt!;
  if (denom === 0) {
    return {
      met: false,
      known: false,
      detail:
        "You've recorded no essential costs and no required debt payments, so there's nothing to measure a cushion against yet.",
    };
  }

  return { met: cash >= 3 * denom, known: true, detail: coverageDetail(cash, denom) };
}

/** Display only. Rounded DOWN so the figure never overstates the cushion. */
function coverageDetail(cashCents: number, denomCents: number): string {
  const months = Math.floor((cashCents / denomCents) * 10) / 10;
  return `You have about ${months} month(s) of essential costs and required debt payments covered in cash.`;
}

const GATES: Record<"stabilize" | "repair" | "build", (input: JourneyInput) => Gate> = {
  stabilize: stabilizeGate,
  repair: repairGate,
  build: buildGate,
};

/**
 * What the user's own description of their situation SUGGESTS. Used only when
 * the numbers cannot place them, and always labelled as their own words.
 */
const PROVISIONAL_STAGE: Record<SelfReportedSituation, JourneyStage | null> = {
  behind_on_bills: "stabilize",
  just_covering: "stabilize",
  small_cushion: "build",
  stable_building: "build",
  unsure: null,
};

export function provisionalStageFor(situation: SelfReportedSituation | null): JourneyStage | null {
  if (situation === null) return null;
  return PROVISIONAL_STAGE[situation] ?? null;
}

const BASIS =
  "Each stage is one condition checked against figures you entered. It is not a score, a rating, " +
  "or a prediction about your credit. Stages this version does not assess are labelled as such " +
  "rather than assumed.";

export function assessJourney(input: JourneyInput): JourneyAssessment {
  const stages: JourneyStageResult[] = [];
  let currentStage: JourneyStage | null = null;
  /** Once a gate is unknown or failed, later gates cannot be sequenced past it. */
  let blocked = false;
  let blockedByUnknown = false;
  let passedCount = 0;

  for (const stage of ASSESSED) {
    const copy = STAGE_COPY[stage];
    if (blocked) {
      stages.push({
        stage,
        ...copy,
        status: blockedByUnknown ? "unknown" : "upcoming",
        detail: blockedByUnknown
          ? "Not assessed while an earlier stage is still unknown."
          : "Comes after the stage you're working on now.",
      });
      continue;
    }

    const gate = GATES[stage as "stabilize" | "repair" | "build"](input);
    if (!gate.known) {
      stages.push({ stage, ...copy, status: "unknown", detail: gate.detail });
      blocked = true;
      blockedByUnknown = true;
      continue;
    }
    if (!gate.met) {
      stages.push({ stage, ...copy, status: "current", detail: gate.detail });
      currentStage = stage;
      blocked = true;
      continue;
    }
    stages.push({ stage, ...copy, status: "passed", detail: gate.detail });
    passedCount += 1;
  }

  for (const stage of ["leverage", "invest", "protect"] as const) {
    stages.push({
      stage,
      ...STAGE_COPY[stage],
      status: "not_assessed",
      detail:
        "This version of the plan engine makes no assessment here. Its absence is not a judgement about you.",
    });
  }

  const allAssessedPassed = passedCount === ASSESSED.length;

  // Only offered when no gate was computed at all. If even one stage was
  // decided from the user's figures, showing "probably X, by your own
  // description" would contradict something we already know.
  const provisionalStage =
    currentStage === null && passedCount === 0
      ? provisionalStageFor(input.selfReported)
      : null;

  return {
    version: JOURNEY_VERSION,
    currentStage,
    stages,
    basis: BASIS,
    provisional:
      provisionalStage !== null && input.selfReported !== null
        ? { stage: provisionalStage, situation: input.selfReported }
        : null,
    allAssessedPassed,
  };
}

export const SITUATION_LABELS: Record<SelfReportedSituation, string> = {
  behind_on_bills: "I'm behind on bills",
  just_covering: "I cover my bills, but there's nothing left over",
  small_cushion: "I have a small cushion saved",
  stable_building: "I'm stable and want to build",
  unsure: "I'm not sure",
};
