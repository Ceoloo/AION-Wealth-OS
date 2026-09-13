import type { Account, CreditIssue, FinancialSnapshot, PlanAction, PlanCategory, Profile } from "../types";
import type { FinanceSummary } from "../finance";
import type { ISODate } from "../types";

/**
 * Versioned, deterministic rule set. A rule inspects the (already-computed)
 * finance summary and records, and — if it applies — emits a candidate action
 * with a STABLE ruleId. AI is never involved here: priorities and finances are
 * decided by these rules only.
 */

export const ENGINE_VERSION = "2026.09.2"; // occurrence-aware completion vs issue resolution

export interface RuleContext {
  asOf: ISODate;
  profile: Profile | null;
  snapshot: FinancialSnapshot | null;
  /** Full dated history, oldest first. Used to count issue episodes. */
  snapshots: FinancialSnapshot[];
  accounts: Account[];
  creditIssues: CreditIssue[];
  summary: FinanceSummary;
}

/**
 * Counts how many times a condition newly became true across the dated snapshot
 * history (false -> true transitions). This gives a recurring issue a stable
 * EPISODE number: while the condition holds the number is unchanged, and if it
 * clears and later returns it increments — producing a new occurrence rather
 * than letting an old completion hide the fresh problem.
 */
export function episodeIndex(
  snapshots: FinancialSnapshot[],
  predicate: (s: FinancialSnapshot) => boolean,
): number {
  let episodes = 0;
  let previous = false;
  for (const s of snapshots) {
    const now = predicate(s);
    if (now && !previous) episodes += 1;
    previous = now;
  }
  return episodes;
}

function surplusIsNegative(s: FinancialSnapshot): boolean {
  if (s.takeHomeIncomeCents === null) return false;
  const value =
    s.takeHomeIncomeCents -
    (s.essentialSpendingCents ?? 0) -
    (s.otherSpendingCents ?? 0) -
    (s.requiredDebtPaymentsCents ?? 0);
  return value < 0;
}

function coverageIsThin(s: FinancialSnapshot): boolean {
  if (s.availableCashCents === null) return false;
  const denom = (s.essentialSpendingCents ?? 0) + (s.requiredDebtPaymentsCents ?? 0);
  if (denom <= 0) return false;
  return s.availableCashCents / denom < 3;
}

export interface RuleResult {
  /** When false, the action is not emitted at all. */
  applies: boolean;
  /** When true, the required inputs are missing → status insufficient_information. */
  insufficient?: boolean;
  why: string;
  supportingInputs: string[];
  /**
   * Fingerprint of the facts driving this occurrence. Defaults to "default" for
   * one-off tasks that never recur. A change here means genuinely new adverse
   * facts, so a previous completion no longer suppresses the action.
   */
  occurrenceKey?: string;
  /**
   * Does the underlying adverse fact still hold? Defaults to `applies`. Set
   * false for tasks that are not fact-driven issues.
   */
  issueActive?: boolean;
  /** Optional dynamic overrides merged onto the static template. */
  overrides?: Partial<PlanAction>;
}

export interface Rule {
  id: string;
  category: PlanCategory;
  /** Lower number = evaluated/ranked earlier (more urgent). */
  order: number;
  /** Static template; `evaluate` supplies dynamic why/inputs/overrides. */
  template: Omit<
    PlanAction,
    | "ruleId"
    | "actionId"
    | "priorityRank"
    | "status"
    | "why"
    | "supportingInputs"
    | "prerequisites"
    // Occurrence/issue fields are computed per evaluation, never templated.
    | "occurrenceKey"
    | "issueState"
    | "completedAt"
    | "completionKind"
    | "priorCompletions"
  >;
  evaluate: (ctx: RuleContext) => RuleResult;
}

const anchorFields: Array<[keyof FinancialSnapshot, string]> = [
  ["takeHomeIncomeCents", "monthly take-home income"],
  ["essentialSpendingCents", "essential spending"],
  ["requiredDebtPaymentsCents", "required debt payments"],
  ["availableCashCents", "available cash"],
];

export const RULES: Rule[] = [
  // 1. Clarify missing facts ------------------------------------------------
  {
    id: "clarify_missing_facts",
    category: "clarify",
    order: 10,
    template: {
      category: "clarify",
      title: "Fill in your core financial facts",
      steps: [
        "Open My Finances and enter (or confirm) your monthly take-home income.",
        "Enter essential spending, other spending, and required debt payments — leave anything you truly don't know as unknown, don't guess a zero.",
        "Enter available cash, other assets, and total liabilities.",
      ],
      effortMinutes: 15,
      verifiedCostCents: 0,
      sourceIds: [],
      completionCriteria: "All four core facts (income, essentials, required debt payments, cash) are entered or explicitly marked unknown.",
      escalation: "If your income is irregular or you're unsure how to categorize spending, note it for a bookkeeper or financial counselor.",
      teachBack: {
        whatItMeans: "A financial snapshot is a dated summary of what comes in, what goes out, what you own, and what you owe.",
        whyItMatters: "Every recommendation depends on accurate inputs. Missing values are kept as 'unknown' so we never quietly assume a zero and mislead you.",
        whatToDo: "Enter the numbers you know and leave the rest marked unknown; you can refine them anytime.",
        howToKnowComplete: "Your Today screen shows a dated snapshot with no critical fields missing.",
        comprehensionCheck: {
          question: "If you don't know your essential spending yet, what should you do?",
          options: ["Enter 0", "Leave it marked unknown", "Skip the whole snapshot"],
          correctIndex: 1,
          explanation: "Marking it unknown keeps calculations honest; a 0 would overstate your surplus.",
        },
      },
    },
    evaluate: (ctx) => {
      const missing: string[] = [];
      if (!ctx.snapshot) {
        return {
          applies: true,
          insufficient: true,
          why: "You haven't recorded a financial snapshot yet.",
          supportingInputs: ["no snapshot on file"],
        };
      }
      for (const [field, label] of anchorFields) {
        if (ctx.snapshot[field] === null) missing.push(label);
      }
      if (missing.length === 0) return { applies: false, why: "", supportingInputs: [] };
      return {
        applies: true,
        insufficient: true,
        why: `Core facts are missing: ${missing.join(", ")}. These drive every calculation.`,
        supportingInputs: missing,
        // A different set of gaps is a different ask.
        occurrenceKey: missing.slice().sort().join("|"),
        issueActive: true,
      };
    },
  },

  // 2. Stabilize (negative surplus) ----------------------------------------
  {
    id: "stabilize_negative_surplus",
    category: "stabilize",
    order: 20,
    template: {
      category: "stabilize",
      title: "Stabilize a negative monthly surplus",
      steps: [
        "Confirm the numbers are right — check that required debt payments aren't double-counted with your accounts.",
        "List essential vs. non-essential spending and identify what can pause this month.",
        "Contact essential creditors/utilities about hardship or payment options before missing a payment.",
        "Avoid taking on new borrowing or elective business costs until the gap closes.",
      ],
      effortMinutes: 30,
      verifiedCostCents: 0,
      sourceIds: [],
      completionCriteria: "You have a written plan that closes or shrinks the monthly gap, and no essential payment is at immediate risk.",
      escalation: "If you cannot cover essentials (housing, utilities, food) this month, contact a nonprofit credit counselor or 211 for local assistance.",
      teachBack: {
        whatItMeans: "A negative surplus means more is going out each month than coming in.",
        whyItMatters: "Spending down cash or adding debt to cover a gap gets more expensive fast. Stabilizing first protects your foundation.",
        whatToDo: "Cut or pause non-essentials, protect essential payments, and pause new borrowing or elective entity costs until the gap closes.",
        howToKnowComplete: "Your recalculated surplus is at or above zero, or you have a concrete plan and protected essentials.",
        comprehensionCheck: {
          question: "With a negative surplus, what should you generally avoid right now?",
          options: ["Reviewing your spending", "Taking on new borrowing or elective business costs", "Contacting creditors early"],
          correctIndex: 1,
          explanation: "New borrowing or optional costs deepen the gap; stabilize first.",
        },
      },
    },
    evaluate: (ctx) => {
      const s = ctx.summary.surplus;
      if (s.value === null) {
        return { applies: false, why: "", supportingInputs: [] };
      }
      if (s.value < 0) {
        return {
          applies: true,
          why: `Your estimated monthly surplus is negative (${s.value} cents). Stabilizing comes before new borrowing or elective costs.`,
          supportingInputs: ["monthly surplus", ...s.missingInputs],
          // Stable while this episode of negative surplus lasts; a later relapse
          // is a new episode, so an old completion cannot mask it.
          occurrenceKey: `episode:${episodeIndex(ctx.snapshots, surplusIsNegative)}`,
          issueActive: true,
        };
      }
      return { applies: false, why: "", supportingInputs: [] };
    },
  },

  // 3a. Past-due accounts ---------------------------------------------------
  {
    id: "review_past_due",
    category: "past_due",
    order: 30,
    template: {
      category: "past_due",
      title: "Address past-due accounts",
      steps: [
        "Open My Finances and confirm which accounts show a past-due amount and due date.",
        "Prioritize essentials and accounts closest to serious delinquency.",
        "Contact each creditor about bringing the account current or arranging a plan.",
        "Record the outcome and any promised dates.",
      ],
      effortMinutes: 25,
      verifiedCostCents: null,
      sourceIds: [],
      completionCriteria: "Each past-due account has a recorded next step (paid, plan arranged, or disputed if inaccurate).",
      escalation: "For collections, lawsuits, or garnishment threats, consult a consumer attorney or legal aid.",
      teachBack: {
        whatItMeans: "A past-due account is one where a required payment was missed and not yet made up.",
        whyItMatters: "Past-due status can add fees, raise rates, and hurt payment history — the biggest driver of credit standing.",
        whatToDo: "Contact creditors quickly; ask about hardship options; bring essentials current first.",
        howToKnowComplete: "No account is silently past due — each has a decision and a recorded next step.",
        comprehensionCheck: {
          question: "Which factor does past-due status most directly affect?",
          options: ["Your net worth only", "Payment history", "Your business's legal name"],
          correctIndex: 1,
          explanation: "Payment history is the largest factor in most credit scoring models.",
        },
      },
    },
    evaluate: (ctx) => {
      if (!ctx.summary.hasPastDue) return { applies: false, why: "", supportingInputs: [] };
      // Keyed on WHICH accounts are past due. Contacting the creditor completes
      // the action for those accounts and the completion sticks; a different
      // account falling past due is a new occurrence that reactivates it.
      const pastDueIds = ctx.accounts
        .filter((a) => (a.pastDueCents ?? 0) > 0)
        .map((a) => a.id)
        .sort();
      return {
        applies: true,
        why: `You have ${ctx.summary.pastDueCount || "one or more"} account(s) marked past due.`,
        supportingInputs: ["accounts with past-due amounts"],
        occurrenceKey: pastDueIds.length ? pastDueIds.join("|") : "reported",
        issueActive: true,
      };
    },
  },

  // 3b. Cash deficit --------------------------------------------------------
  {
    id: "build_cash_coverage",
    category: "cash",
    order: 40,
    template: {
      category: "cash",
      title: "Build a starter cash cushion",
      steps: [
        "Estimate one month of essentials plus required debt payments.",
        "Set a small, automatic transfer toward a separate cash buffer.",
        "Revisit after your next weekly review.",
      ],
      effortMinutes: 15,
      verifiedCostCents: 0,
      sourceIds: [],
      completionCriteria: "You have a target buffer amount and a recurring transfer set up.",
      escalation: "If you can't set aside anything after essentials, focus on the stabilization action first.",
      teachBack: {
        whatItMeans: "Cash coverage is how many months your liquid cash would cover essentials and required debt payments.",
        whyItMatters: "A cushion keeps a surprise expense from turning into new high-cost debt.",
        whatToDo: "Automate a small transfer to a separate buffer and grow it over time.",
        howToKnowComplete: "Your cash-coverage estimate is trending up week over week.",
        comprehensionCheck: {
          question: "Cash coverage is measured in…",
          options: ["Dollars of income", "Months of essential obligations", "Credit score points"],
          correctIndex: 1,
          explanation: "It's liquid cash divided by monthly essentials + required debt payments.",
        },
      },
    },
    evaluate: (ctx) => {
      const c = ctx.summary.cashCoverage;
      if (c.value === null) return { applies: false, why: "", supportingInputs: [] };
      if (c.value < 3) {
        return {
          applies: true,
          why: `Estimated cash coverage is about ${c.value} month(s), below a 3-month starting cushion.`,
          supportingInputs: ["cash coverage estimate", ...c.missingInputs],
          occurrenceKey: `episode:${episodeIndex(ctx.snapshots, coverageIsThin)}`,
          issueActive: true,
        };
      }
      return { applies: false, why: "", supportingInputs: [] };
    },
  },

  // 4. Review credit report -------------------------------------------------
  {
    id: "review_credit_report",
    category: "credit_report",
    order: 50,
    template: {
      category: "credit_report",
      title: "Review your credit reports for accuracy",
      steps: [
        "Get your free reports from the federally authorized source.",
        "Check identity info, account balances, statuses, and any accounts you don't recognize.",
        "Record any suspected inaccuracy in the Credit workspace with a factual explanation and dates.",
      ],
      effortMinutes: 30,
      verifiedCostCents: 0,
      sourceIds: ["annualcreditreport", "ftc_credit_repair"],
      completionCriteria: "You've reviewed at least one report and logged any suspected issues (or confirmed none).",
      escalation: "For identity theft or complex disputes, see the FTC's IdentityTheft.gov and consider legal aid.",
      teachBack: {
        whatItMeans: "Your credit report is the record of your accounts and payment history; your score is a number derived from it.",
        whyItMatters: "Errors can raise borrowing costs. Only inaccurate information can be disputed — accurate, current negative items cannot simply be removed.",
        whatToDo: "Review reports for errors and log factual disputes; never dispute accurate information.",
        howToKnowComplete: "You've reviewed a report and recorded issues (or confirmed it's accurate).",
        comprehensionCheck: {
          question: "Which can legitimately be disputed?",
          options: ["Accurate, current late payments", "Genuinely inaccurate information", "Any negative item you dislike"],
          correctIndex: 1,
          explanation: "Per the FTC, accurate and current information can't be removed; only inaccuracies are disputable.",
        },
      },
    },
    evaluate: (ctx) => {
      const openIssues = ctx.creditIssues.filter(
        (i) => i.state !== "resolved" && i.state !== "unresolved",
      );
      const util = ctx.summary.utilization.value;
      if (openIssues.length > 0) {
        return {
          applies: true,
          why: `You have ${openIssues.length} credit issue(s) in progress to follow up on.`,
          supportingInputs: ["open credit issues"],
          // A newly logged issue is new adverse information.
          occurrenceKey: openIssues.map((i) => i.id).sort().join("|"),
          issueActive: true,
        };
      }
      if (util !== null && util > 0.3) {
        return {
          applies: true,
          why: `Estimated revolving utilization is about ${Math.round(util * 100)}% (app estimate). Reviewing your report is a good next step.`,
          supportingInputs: ["revolving utilization estimate"],
          occurrenceKey: "utilization_over_30",
          issueActive: true,
        };
      }
      // Still worth doing, but lower urgency (kept in the 30-day plan).
      return {
        applies: true,
        why: "Reviewing your reports establishes a baseline and catches errors early.",
        supportingInputs: [],
        // The no-adverse-facts baseline IS the default occurrence, so existing
        // completions/deferrals recorded before occurrence tracking still apply.
        occurrenceKey: "default",
        issueActive: false, // a good habit, not an outstanding adverse fact
      };
    },
  },

  // 5. Establish recordkeeping ---------------------------------------------
  {
    id: "establish_recordkeeping",
    category: "recordkeeping",
    order: 60,
    template: {
      category: "recordkeeping",
      title: "Set up simple recordkeeping",
      steps: [
        "Pick one place to keep financial documents (statements, bills, IDs of accounts).",
        "Note where each account lives and its key dates.",
        "Schedule your weekly review.",
      ],
      effortMinutes: 20,
      verifiedCostCents: 0,
      sourceIds: [],
      completionCriteria: "You have one organized location and a weekly review time.",
      escalation: "If bookkeeping feels overwhelming, a bookkeeper or free small-business counseling can help.",
      teachBack: {
        whatItMeans: "Recordkeeping is keeping your financial documents and key dates organized in one place.",
        whyItMatters: "Good records make every future task — taxes, disputes, formation — faster and more accurate.",
        whatToDo: "Choose one location, log your accounts and dates, and set a weekly review.",
        howToKnowComplete: "You can find any account's status in under a minute.",
        comprehensionCheck: {
          question: "Why set up recordkeeping early?",
          options: ["It boosts your score directly", "It makes future tasks faster and more accurate", "It's legally required for individuals"],
          correctIndex: 1,
          explanation: "Organized records save time and reduce errors on later tasks.",
        },
      },
    },
    evaluate: () => ({
      applies: true,
      why: "A simple system now makes every later step easier.",
      supportingInputs: [],
      occurrenceKey: "default", // one-off setup task, never recurs
      issueActive: false,
    }),
  },

  // 6. Evaluate formation readiness ----------------------------------------
  {
    id: "evaluate_formation_readiness",
    category: "formation",
    order: 70,
    template: {
      category: "formation",
      title: "Evaluate business formation readiness",
      steps: [
        "Open Business Setup and confirm your operating state and activity.",
        "Review the entity-options explainer and the sourced checklist.",
        "Note verified state fees and third-party costs before deciding.",
      ],
      effortMinutes: 25,
      verifiedCostCents: null,
      sourceIds: ["irs_llc"],
      completionCriteria: "You understand your options, the honest costs, and your next official step.",
      escalation: "For tax elections, multi-owner arrangements, or liability questions, consult a CPA or attorney.",
      teachBack: {
        whatItMeans: "Formation is registering a legal entity with a state; it's separate from federal tax treatment.",
        whyItMatters: "An LLC isn't an automatic tax saving or a complete liability shield — deciding well avoids wasted fees.",
        whatToDo: "Review options and verified costs; file yourself on the official site when ready.",
        howToKnowComplete: "You know your entity choice, the real costs, and your next official step.",
        comprehensionCheck: {
          question: "Forming an LLC by completing this checklist…",
          options: ["Creates the entity automatically", "Does not itself create the entity — you file on the official state site", "Replaces your personal identity"],
          correctIndex: 1,
          explanation: "Only the official state filing creates the entity; the checklist prepares you.",
        },
      },
    },
    evaluate: (ctx) => {
      const wantsFormation =
        ctx.profile?.businessState != null ||
        (ctx.profile?.goals ?? []).includes("form_business");
      if (!wantsFormation) return { applies: false, why: "", supportingInputs: [] };
      // Guardrail: negative surplus defers elective formation cost.
      const surplus = ctx.summary.surplus.value;
      if (surplus !== null && surplus < 0) {
        return {
          applies: true,
          why: "Formation involves elective costs; because your surplus is negative, stabilize first. Kept in your plan but not a current priority.",
          supportingInputs: ["monthly surplus (negative)"],
          occurrenceKey: `state:${ctx.profile?.businessState ?? "none"}`,
          issueActive: false,
          overrides: { effortMinutes: 25 },
        };
      }
      return {
        applies: true,
        why: "You've indicated interest in forming a business; here's an honest readiness review.",
        supportingInputs: ["profile goals / business state"],
        // Changing operating state means re-evaluating against a different regime.
        occurrenceKey: `state:${ctx.profile?.businessState ?? "none"}`,
        issueActive: false,
      };
    },
  },
];
