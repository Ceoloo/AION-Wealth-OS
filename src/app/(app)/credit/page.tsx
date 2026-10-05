"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, CreditCard, Gauge, PenLine } from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CreditIssues } from "@/components/CreditIssues";
import { MoneyInput } from "@/components/MoneyInput";
import { EmptyState, Field, InlineError, Money, Note, PageHeader, PageLoading, Section } from "@/components/app/primitives";
import { buildUtilizationPlan, paydownScenarios } from "@/lib/domain/utilization";
import { latestSnapshot, mostRecentScore } from "@/lib/data/bundle";
import { todayISO } from "@/lib/today";
import { cn } from "@/lib/utils";
import type { FinancialSnapshot, SelfReportedScore } from "@/lib/domain/types";
import type { SnapshotInput } from "@/lib/validation/schemas";

/**
 * Credit Command Center.
 *
 * Everything on this screen comes from figures the user typed in. There is no
 * report import, no score prediction, and no composite rating — see
 * docs/COMPLIANCE_REVIEW.md for why those were ruled out rather than deferred.
 */
export default function CreditPage() {
  const { ready, bundle, saveSnapshot } = useApp();
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);

  const plan = useMemo(() => buildUtilizationPlan(bundle.accounts), [bundle.accounts]);
  const { scenarios, caveats } = useMemo(() => paydownScenarios(plan, amountCents ?? 0), [plan, amountCents]);

  if (!ready) return <PageLoading />;

  const snapshot = latestSnapshot(bundle);
  // The most recent snapshot that actually carries a score — not just the most
  // recent snapshot, or a score would disappear the next time figures change.
  const score = mostRecentScore(bundle.snapshots);

  return (
    <div>
      <PageHeader title="Credit" description="Built entirely from figures you enter. We never import your report." />

      <div className="grid gap-5 lg:grid-cols-12">
        {/* ---- Utilization ---------------------------------------------- */}
        <div className="space-y-5 lg:col-span-7">
          <Section title="Revolving utilization" description="How much of your revolving limits you're using, estimated from your entries.">
            {plan.overallRatio === null ? (
              <EmptyState
                icon={CreditCard}
                title="No utilization yet"
                body="Add a credit card or line of credit with both its balance and its limit, and the estimate appears here."
                action={
                  <Button variant="secondary" asChild>
                    <Link href="/finances">Add an account</Link>
                  </Button>
                }
              />
            ) : (
              <Card>
                <CardContent className="space-y-5">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Overall</p>
                      <p className="figure mt-1 text-4xl font-semibold tracking-tight">
                        {(plan.overallRatio * 100).toFixed(1)}
                        <span className="text-xl text-muted-foreground">%</span>
                      </p>
                    </div>
                    <p className="text-right text-xs text-subtle">
                      <Money cents={plan.includedBalanceCents} className="text-muted-foreground" /> of{" "}
                      <Money cents={plan.includedLimitCents} className="text-muted-foreground" />
                      <br />
                      across <span className="figure">{plan.accounts.length}</span> account(s)
                    </p>
                  </div>
                  <UtilizationBar ratio={plan.overallRatio} showMarks />

                  {plan.overallPaydownToTarget.some((t) => t.cents > 0) ? (
                    <div className="space-y-2 border-t border-border pt-4">
                      <p className="text-xs text-subtle">To reach commonly-cited reference points overall:</p>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {plan.overallPaydownToTarget.map((t) => (
                          <li key={t.target} className="rounded-xl bg-secondary/50 px-3.5 py-3 text-sm">
                            {t.cents === 0 ? (
                              <span className="text-success">Already under {Math.round(t.target * 100)}%.</span>
                            ) : (
                              <>
                                <span className="text-muted-foreground">Pay down </span>
                                <Money cents={t.cents} className="font-semibold text-foreground" />
                                <span className="text-muted-foreground"> to reach {Math.round(t.target * 100)}%.</span>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}

            {plan.accounts.length > 0 ? (
              <Card className="gap-0 py-0">
                <ul className="divide-y divide-border">
                  {plan.accounts.map((a) => (
                    <li key={a.accountId} className="space-y-2 px-5 py-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{a.nickname}</span>
                        <span className="figure shrink-0 text-sm font-semibold">{(a.ratio * 100).toFixed(1)}%</span>
                      </div>
                      <UtilizationBar ratio={a.ratio} />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-subtle">
                          <Money cents={a.balanceCents} /> of <Money cents={a.limitCents} />
                        </p>
                        {a.isPastDue ? <Badge variant="danger">Past due — handled first in your plan</Badge> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {plan.excluded.length > 0 ? (
              <div className="rounded-2xl border border-warning/25 bg-warning-surface p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-warning">
                  <CircleAlert className="size-4" />
                  {plan.excluded.length} account(s) couldn&apos;t be included
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {plan.excluded.map((e) => (
                    <li key={e.accountId} className="text-pretty">
                      <strong className="font-medium text-foreground">{e.nickname}</strong> — {e.explanation}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>

          {/* ---- Paydown planner ---------------------------------------- */}
          {plan.accounts.length > 0 ? (
            <Section title="What would a payment do?" description="Enter an amount to see its effect on the estimate above.">
              <Card>
                <CardContent className="space-y-4">
                  <div className="sm:max-w-xs">
                    <MoneyInput label="Amount you're considering" valueCents={amountCents} onChangeCents={setAmountCents} />
                  </div>
                  {scenarios.length === 0 ? (
                    <p className="text-sm text-subtle">Enter an amount to compare.</p>
                  ) : (
                    <>
                      <ul className="divide-y divide-border rounded-xl border border-border">
                        {scenarios.map((s) => (
                          <li key={s.accountId} className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{s.nickname}</p>
                              <p className="text-xs text-subtle">
                                Applies <Money cents={s.appliedCents} />
                                {s.unusedCents > 0 ? <> · <Money cents={s.unusedCents} /> more than this balance</> : null}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="figure text-sm font-semibold">{(s.resultingOverallRatio * 100).toFixed(1)}%</p>
                              {/* "pts" is avoided deliberately: beside credit content
                                  it reads as SCORE points. This is a change in the
                                  utilization percentage and nothing else. */}
                              <p className="figure text-xs text-muted-foreground">
                                {s.deltaRatio === 0
                                  ? "no change to utilization"
                                  : `${(s.deltaRatio * 100).toFixed(1)} percentage points of utilization`}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <Note>
                        {caveats.map((c, i) => (
                          <p key={i}>{c}</p>
                        ))}
                      </Note>
                    </>
                  )}
                </CardContent>
              </Card>
            </Section>
          ) : null}
        </div>

        {/* ---- Self-reported score + method notes ------------------------ */}
        <div className="space-y-5 lg:col-span-5">
          <Card>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Gauge className="size-3.5 text-subtle" />
                  Your score
                </p>
                <Badge variant="muted" className="shrink-0">As you reported it</Badge>
              </div>
              {score ? (
                <div>
                  <p className="figure text-4xl font-semibold tracking-tight">{score.score}</p>
                  <p className="mt-1 text-xs text-subtle">
                    {score.model ?? "Model not recorded"} · as of <span className="figure">{score.date}</span>
                    {score.source ? ` · from ${score.source}` : ""}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  None recorded. If you have a score from your own report or your card issuer, you can
                  record it here.
                </p>
              )}

              {recording ? (
                <ScoreForm
                  snapshot={snapshot}
                  onCancel={() => setRecording(false)}
                  onSave={async (input, s) => {
                    const res = await saveSnapshot(input, s);
                    if (res.ok) setRecording(false);
                    return res;
                  }}
                />
              ) : (
                <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setRecording(true)}>
                  <PenLine data-icon="inline-start" />
                  {score ? "Record a new score" : "Record my score"}
                </Button>
              )}

              <p className="text-xs text-subtle">
                This is the number you told us, shown back to you. AION never estimates, predicts, or
                projects a credit score.
              </p>
            </CardContent>
          </Card>

          <Note>
            {plan.notes.map((n, i) => (
              <p key={i} className={i > 0 ? "mt-1.5" : undefined}>
                {n}
              </p>
            ))}
          </Note>
        </div>

        {/* ---- Report issues -------------------------------------------- */}
        <div className="lg:col-span-12">
          <CreditIssues />
        </div>
      </div>

      <Note className="mt-8">
        Educational only — not legal, tax, or financial advice. AION does not import credit reports,
        remove accurate information, generate dispute letters, or contact bureaus.
      </Note>
    </div>
  );
}

/**
 * Records a score. Scores live on dated snapshots, so this writes a NEW dated
 * entry carrying the user's current figures forward unchanged — it never edits
 * history, and it never invents a figure the user didn't give.
 */
function ScoreForm({
  snapshot,
  onSave,
  onCancel,
}: {
  snapshot: FinancialSnapshot | null;
  onSave: (input: SnapshotInput, score: SelfReportedScore) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [model, setModel] = useState("");
  const [source, setSource] = useState("");
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { score: useId(), model: useId(), date: useId(), source: useId() };

  const numeric = Number(value);
  const valid = /^\d{3}$/.test(value.trim()) && numeric >= 250 && numeric <= 900;

  if (snapshot === null) {
    return (
      <div className="rounded-xl border border-border bg-secondary/40 p-4">
        <p className="text-sm text-muted-foreground">
          Add your financial snapshot first — a score is recorded against a dated entry.
        </p>
        <Link href="/finances" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary">
          Go to Finances
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-secondary/30 p-4">
      <Field label="Score" htmlFor={ids.score} hint="250–900. Enter it exactly as your report or issuer shows it.">
        <Input id={ids.score} inputMode="numeric" className="figure" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 640" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Model (if shown)" htmlFor={ids.model}>
          <Input id={ids.model} value={model} onChange={(e) => setModel(e.target.value)} placeholder="FICO 8" />
        </Field>
        <Field label="Date on the report" htmlFor={ids.date}>
          <Input id={ids.date} type="date" className="figure" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Where it came from" htmlFor={ids.source}>
        <Input id={ids.source} value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. annualcreditreport.com, card issuer app" />
      </Field>
      <p className="text-xs text-subtle">
        This adds a new dated entry carrying your current figures forward unchanged. Your existing
        figures are not edited.
      </p>
      {!valid && value.trim() !== "" ? (
        <p className="text-xs text-warning">Enter a three-digit score between 250 and 900.</p>
      ) : null}
      <div className="flex gap-2">
        <Button
          disabled={!valid || saving}
          onClick={async () => {
            setSaving(true);
            setError(null);
            const res = await onSave(carryForward(snapshot), {
              score: numeric,
              date,
              source: source.trim() || null,
              model: model.trim() || null,
            });
            setSaving(false);
            if (!res.ok) setError(res.error);
          }}
        >
          {saving ? "Saving…" : "Save score"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
      {error ? <InlineError>{error} Nothing was saved.</InlineError> : null}
    </div>
  );
}

/** Copies the latest figures onto a new dated entry. Invents nothing. */
function carryForward(s: FinancialSnapshot): SnapshotInput {
  return {
    asOf: todayISO(),
    takeHomeIncomeCents: s.takeHomeIncomeCents,
    essentialSpendingCents: s.essentialSpendingCents,
    otherSpendingCents: s.otherSpendingCents,
    requiredDebtPaymentsCents: s.requiredDebtPaymentsCents,
    availableCashCents: s.availableCashCents,
    otherAssetsCents: s.otherAssetsCents,
    liabilitiesCents: s.liabilitiesCents,
    hasPastDueAccounts: s.hasPastDueAccounts,
  };
}

/**
 * Utilization bar. Colour marks the commonly-cited reference points; it is not
 * a rating. The optional ticks make those points visible instead of implied.
 */
function UtilizationBar({ ratio, showMarks = false }: { ratio: number; showMarks?: boolean }) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const tone = ratio > 0.3 ? "bg-warning" : ratio > 0.1 ? "bg-primary" : "bg-success";
  return (
    <div className="relative">
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", tone)} style={{ width: `${pct}%` }} />
      </div>
      {showMarks ? (
        <div className="relative mt-1.5 h-4 text-[10px] text-subtle">
          {[10, 30].map((m) => (
            <span key={m} className="figure absolute -translate-x-1/2" style={{ left: `${m}%` }}>
              <span className="mx-auto mb-0.5 block h-1.5 w-px bg-subtle/60" />
              {m}%
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
