import type { UserDataBundle } from "./bundle";
import { latestSnapshot, baselineSnapshot } from "./bundle";
import { summarize } from "../domain/finance";
import { formatCents } from "../domain/money";
import { generatePlan } from "../domain/plan/engine";
import { CONTENT_SOURCES } from "../domain/sources";
import { referralFunnel } from "../domain/partners";
import type { Metric } from "../domain/finance";

/**
 * Authenticated data export. Produces:
 *  - a readable Markdown plan (calculations, assumptions, sources, outcomes,
 *    open questions for a professional), and
 *  - structured JSON of the user's own records.
 *
 * Excludes internal secrets and any other user's data (the caller passes only
 * the requester's bundle; owner is asserted upstream).
 */

export interface ExportBundle {
  markdown: string;
  json: string;
}

function metricLine(label: string, m: Metric<number>, isMoney: boolean): string {
  const val =
    m.value === null ? "unavailable" : isMoney ? formatCents(m.value) : String(m.value);
  const parts = [`- **${label}:** ${val} _(data: ${m.completeness})_`];
  if (m.missingInputs.length > 0) parts.push(`  - Missing: ${m.missingInputs.join(", ")}`);
  for (const a of m.assumptions) parts.push(`  - Note: ${a}`);
  return parts.join("\n");
}

export function buildExport(bundle: UserDataBundle, asOf: string, generatedAt: string): ExportBundle {
  const snapshot = latestSnapshot(bundle);
  const baseline = baselineSnapshot(bundle);
  const summary = snapshot ? summarize(snapshot, bundle.accounts) : null;

  const plan = generatePlan({
    asOf,
    generatedAt,
    profile: bundle.profile,
    snapshot,
    snapshots: bundle.snapshots,
    accounts: bundle.accounts,
    creditIssues: bundle.creditIssues,
    events: bundle.actionEvents,
  });

  const lines: string[] = [];
  lines.push(`# AION Wealth OS — Your Plan Export`);
  lines.push("");
  lines.push(`_Generated ${generatedAt} • Engine ${plan.engineVersion}_`);
  lines.push("");
  lines.push(
    `> This is an educational summary of information you entered. It is **not** legal, tax, or financial advice, and no figures here are verified filings, credit scores, or guarantees.`,
  );
  lines.push("");

  // Snapshot + calculations
  lines.push(`## Financial snapshot`);
  if (snapshot && summary) {
    lines.push(`Snapshot as of **${snapshot.asOf}**.`);
    if (baseline && baseline.id !== snapshot.id) {
      lines.push(`Baseline snapshot: **${baseline.asOf}**.`);
    }
    lines.push("");
    lines.push(`### Calculations & assumptions`);
    lines.push(metricLine("Monthly surplus", summary.surplus, true));
    lines.push(metricLine("Net worth", summary.netWorth, true));
    lines.push(metricLine("Cash coverage (months)", summary.cashCoverage, false));
    lines.push(
      metricLine("Revolving utilization", summary.utilization, false),
    );
    if (summary.doubleCount.notes.length > 0) {
      lines.push(`- **Data checks:**`);
      for (const n of summary.doubleCount.notes) lines.push(`  - ${n}`);
    }
  } else {
    lines.push(`No financial snapshot on file yet.`);
  }
  lines.push("");

  // Plan
  lines.push(`## Current priorities`);
  if (plan.notices.length > 0) {
    for (const n of plan.notices) lines.push(`> ${n}`);
    lines.push("");
  }
  if (plan.priorities.length === 0) lines.push(`_No current priorities._`);
  plan.priorities.forEach((a, i) => {
    lines.push(`${i + 1}. **${a.title}** — _${a.status}_`);
    lines.push(`   - Why: ${a.why}`);
    lines.push(`   - Complete when: ${a.completionCriteria}`);
    if (a.verifiedCostCents !== null) lines.push(`   - Verified cost: ${formatCents(a.verifiedCostCents)}`);
  });
  lines.push("");

  lines.push(`## 30-day plan`);
  plan.thirtyDayPlan.forEach((a) => {
    lines.push(`- [${a.status === "complete" ? "x" : " "}] **${a.title}** (${a.category}) — ${a.effortMinutes} min`);
    if (a.sourceIds.length > 0) {
      const srcs = a.sourceIds
        .map((id) => CONTENT_SOURCES[id])
        .filter(Boolean)
        .map((s) => `[${s!.publisher}](${s!.url})`);
      if (srcs.length) lines.push(`  - Sources: ${srcs.join(", ")}`);
    }
  });
  lines.push("");

  // Outcomes (reported vs verified)
  lines.push(`## Recorded outcomes`);
  const completed = bundle.actionEvents.filter(
    (e) => e.type === "completed_user_reported" || e.type === "completed_verified",
  );
  if (completed.length === 0) lines.push(`_No completions recorded yet._`);
  for (const e of completed) {
    const kind = e.type === "completed_verified" ? "independently verified" : "user-reported";
    lines.push(`- ${e.at.slice(0, 10)}: **${e.actionId}** — ${kind}`);
  }
  lines.push("");

  // Credit issues
  if (bundle.creditIssues.length > 0) {
    lines.push(`## Credit issues (for your review)`);
    for (const c of bundle.creditIssues) {
      lines.push(`- **${c.creditorNickname}** (${c.bureau}) — ${c.category}, status: ${c.state}`);
      lines.push(`  - ${c.explanation}`);
    }
    lines.push("");
  }

  // Open questions for a professional
  lines.push(`## Open questions for a professional`);
  const questions: string[] = [];
  if (summary?.surplus.value !== null && (summary?.surplus.value ?? 0) < 0) {
    questions.push("How should I restructure spending or obligations to close a monthly gap?");
  }
  if (bundle.profile?.businessState) {
    questions.push("Which entity type and tax treatment fit my situation (CPA/attorney)?");
  }
  if (bundle.creditIssues.some((c) => c.state !== "resolved")) {
    questions.push("Are my disputed items handled correctly, and what are my rights if unresolved?");
  }
  questions.push("Is anything in this summary a topic I should get individualized professional advice on?");
  for (const q of questions) lines.push(`- ${q}`);
  lines.push("");
  lines.push(`---`);
  lines.push(`_Sources cited are official reference material, not professional approval of your situation._`);

  // Structured JSON — the user's own records + computed plan, no secrets.
  const jsonObject = {
    exportVersion: 1,
    generatedAt,
    engineVersion: plan.engineVersion,
    ownerId: bundle.ownerId,
    profile: bundle.profile,
    snapshots: bundle.snapshots,
    accounts: bundle.accounts,
    creditIssues: bundle.creditIssues,
    actionEvents: bundle.actionEvents,
    weeklyReviews: bundle.weeklyReviews,
    formationStatuses: bundle.formationStatuses,
    partnerStatuses: bundle.partnerStatuses,
    referralEvents: bundle.referralEvents,
    referralFunnel: referralFunnel(bundle.referralEvents),
    computed: {
      summary: summary
        ? {
            surplus: summary.surplus,
            netWorth: summary.netWorth,
            cashCoverage: summary.cashCoverage,
            utilization: {
              value: summary.utilization.value,
              completeness: summary.utilization.completeness,
              includedBalanceCents: summary.utilization.includedBalanceCents,
              includedLimitCents: summary.utilization.includedLimitCents,
              unknownLimitCount: summary.utilization.unknownLimitCount,
            },
          }
        : null,
      plan,
    },
    sourcesCited: Object.values(CONTENT_SOURCES),
  };

  return { markdown: lines.join("\n"), json: JSON.stringify(jsonObject, null, 2) };
}
