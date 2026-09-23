"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/store/provider";
import { Badge, Button, Card, Disclaimer, EmptyState, Field, SectionTitle, TextInput } from "@/components/ui";
import { CreditIssues } from "@/components/CreditIssues";
import { MoneyInput } from "@/components/MoneyInput";
import { buildUtilizationPlan, paydownScenarios } from "@/lib/domain/utilization";
import type { SnapshotInput } from "@/lib/validation/schemas";
import { formatCents } from "@/lib/domain/money";
import { latestSnapshot, mostRecentScore } from "@/lib/data/bundle";
import { todayISO } from "@/lib/today";
import type { FinancialSnapshot, SelfReportedScore } from "@/lib/domain/types";

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
  const { scenarios, caveats } = useMemo(
    () => paydownScenarios(plan, amountCents ?? 0),
    [plan, amountCents],
  );

  if (!ready) return <p className="text-sm text-cloud-faint">Loading…</p>;

  const snapshot = latestSnapshot(bundle);
  // The most recent snapshot that actually carries a score — not just the most
  // recent snapshot, or a score would disappear the next time figures change.
  const score = mostRecentScore(bundle.snapshots);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-cloud">Credit</h1>
        <p className="text-sm text-cloud-muted">
          Built entirely from figures you enter. We never import your report.
        </p>
      </div>

      {/* ---- Self-reported score ------------------------------------------ */}
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-cloud-faint">Your score</p>
            {score ? (
              <>
                <p className="mt-0.5 text-2xl font-bold text-cloud">{score.score}</p>
                <p className="text-xs text-cloud-muted">
                  {score.model ?? "Model not recorded"} · as of {score.date}
                  {score.source ? ` · from ${score.source}` : ""}
                </p>
              </>
            ) : (
              <p className="mt-0.5 text-sm text-cloud-muted">
                None recorded. If you have a score from your own report or your card issuer, you can
                record it here.
              </p>
            )}
          </div>
          <Badge tone="neutral" className="shrink-0 whitespace-nowrap">
            As you reported it
          </Badge>
        </div>

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
          <Button variant="secondary" className="mt-3" onClick={() => setRecording(true)}>
            {score ? "Record a new score" : "Record my score"}
          </Button>
        )}

        <p className="mt-2 text-xs text-cloud-faint">
          This is the number you told us, shown back to you. AION never estimates, predicts, or
          projects a credit score.
        </p>
      </Card>

      {/* ---- Utilization -------------------------------------------------- */}
      <div>
        <SectionTitle
          title="Revolving utilization"
          subtitle="How much of your revolving limits you're using, estimated from your entries."
        />

        {plan.overallRatio === null ? (
          <EmptyState
            title="No utilization yet"
            body="Add a credit card or line of credit with both its balance and its limit, and the estimate appears here."
            action={
              <Link href="/finances">
                <Button variant="secondary">Add an account</Button>
              </Link>
            }
          />
        ) : (
          <Card className="space-y-3">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-cloud-muted">Overall</span>
                <span className="text-2xl font-bold text-cloud">
                  {(plan.overallRatio * 100).toFixed(1)}%
                </span>
              </div>
              <Bar ratio={plan.overallRatio} />
              <p className="mt-1 text-xs text-cloud-faint">
                {formatCents(plan.includedBalanceCents)} of {formatCents(plan.includedLimitCents)}{" "}
                across {plan.accounts.length} account(s).
              </p>
            </div>

            {plan.overallPaydownToTarget.some((t) => t.cents > 0) ? (
              <div className="border-t border-ink-line pt-2">
                <p className="text-xs text-cloud-faint">
                  To reach commonly-cited reference points overall:
                </p>
                <ul className="mt-1 space-y-0.5 text-sm text-cloud-muted">
                  {plan.overallPaydownToTarget.map((t) => (
                    <li key={t.target}>
                      {t.cents === 0 ? (
                        <>Already under {Math.round(t.target * 100)}%.</>
                      ) : (
                        <>
                          Pay down <strong className="text-cloud">{formatCents(t.cents)}</strong> to
                          reach {Math.round(t.target * 100)}%.
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        )}

        {plan.accounts.length > 0 ? (
          <div className="mt-3 space-y-2">
            {plan.accounts.map((a) => (
              <Card key={a.accountId} className="p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-cloud">{a.nickname}</span>
                  <span className="shrink-0 text-sm font-semibold text-cloud">
                    {(a.ratio * 100).toFixed(1)}%
                  </span>
                </div>
                <Bar ratio={a.ratio} />
                <p className="mt-1 text-xs text-cloud-faint">
                  {formatCents(a.balanceCents)} of {formatCents(a.limitCents)}
                </p>
                {a.isPastDue ? (
                  <Badge tone="danger" className="mt-1">
                    Past due — handled first in your plan
                  </Badge>
                ) : null}
              </Card>
            ))}
          </div>
        ) : null}

        {plan.excluded.length > 0 ? (
          <Card className="mt-3 border-warn/40 bg-warn/5">
            <p className="text-sm font-medium text-warn">
              {plan.excluded.length} account(s) couldn&apos;t be included
            </p>
            <ul className="mt-1 space-y-1 text-xs text-cloud-muted">
              {plan.excluded.map((e) => (
                <li key={e.accountId}>
                  <strong className="text-cloud">{e.nickname}</strong> — {e.explanation}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      {/* ---- Paydown planner ---------------------------------------------- */}
      {plan.accounts.length > 0 ? (
        <div>
          <SectionTitle
            title="What would a payment do?"
            subtitle="Enter an amount to see its effect on the estimate above."
          />
          <Card className="space-y-3">
            <MoneyInput
              label="Amount you're considering"
              valueCents={amountCents}
              onChangeCents={setAmountCents}
            />

            {scenarios.length === 0 ? (
              <p className="text-sm text-cloud-faint">Enter an amount to compare.</p>
            ) : (
              <>
                <div className="divide-y divide-ink-line">
                  {scenarios.map((s) => (
                    <div key={s.accountId} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-cloud">{s.nickname}</p>
                        <p className="text-xs text-cloud-faint">
                          Applies {formatCents(s.appliedCents)}
                          {s.unusedCents > 0
                            ? ` · ${formatCents(s.unusedCents)} more than this balance`
                            : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-cloud">
                          {(s.resultingOverallRatio * 100).toFixed(1)}%
                        </p>
                        {/* "pts" is avoided deliberately: beside credit content
                            it reads as SCORE points. This is a change in the
                            utilization percentage and nothing else. */}
                        <p className="text-xs text-ok">
                          {s.deltaRatio === 0
                            ? "no change to utilization"
                            : `${(s.deltaRatio * 100).toFixed(1)} percentage points of utilization`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-ink-line bg-ink-soft p-2">
                  {caveats.map((c, i) => (
                    <p key={i} className="text-xs text-cloud-faint">
                      {c}
                    </p>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      ) : null}

      {/* ---- Report issues ------------------------------------------------ */}
      <CreditIssues />

      <Card className="bg-ink-soft">
        {plan.notes.map((n, i) => (
          <p key={i} className="text-xs text-cloud-faint">
            {n}
          </p>
        ))}
      </Card>

      <Disclaimer>
        Educational only — not legal, tax, or financial advice. AION does not import credit reports,
        remove accurate information, generate dispute letters, or contact bureaus.
      </Disclaimer>
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
  onSave: (
    input: SnapshotInput,
    score: SelfReportedScore,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [model, setModel] = useState("");
  const [source, setSource] = useState("");
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numeric = Number(value);
  const valid = /^\d{3}$/.test(value.trim()) && numeric >= 250 && numeric <= 900;

  if (snapshot === null) {
    return (
      <div className="mt-3 rounded-lg border border-ink-line bg-ink-soft p-3">
        <p className="text-sm text-cloud-muted">
          Add your financial snapshot first — a score is recorded against a dated entry.
        </p>
        <Link href="/finances" className="mt-1 inline-block text-sm font-medium text-teal underline">
          Go to Finances →
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-ink-line bg-ink-soft p-3">
      <Field label="Score" hint="250–900. Enter it exactly as your report or issuer shows it.">
        <TextInput
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 640"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Model (if shown)">
          <TextInput value={model} onChange={(e) => setModel(e.target.value)} placeholder="FICO 8" />
        </Field>
        <Field label="Date on the report">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Where it came from">
        <TextInput
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="e.g. annualcreditreport.com, card issuer app"
        />
      </Field>
      <p className="text-xs text-cloud-faint">
        This adds a new dated entry carrying your current figures forward unchanged. Your existing
        figures are not edited.
      </p>
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
      {!valid && value.trim() !== "" ? (
        <p className="text-xs text-warn">Enter a three-digit score between 250 and 900.</p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error} Nothing was saved.
        </p>
      ) : null}
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

function Bar({ ratio }: { ratio: number }) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  // Colour marks the commonly-cited reference points; it is not a rating.
  const tone = ratio > 0.3 ? "bg-warn" : ratio > 0.1 ? "bg-teal" : "bg-ok";
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-soft">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
