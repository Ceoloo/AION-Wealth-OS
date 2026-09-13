"use client";

import { useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/store/provider";
import { baselineSnapshot, latestSnapshot } from "@/lib/data/bundle";
import { Button, Card, Disclaimer, Field, TextArea, TextInput, SectionTitle } from "@/components/ui";
import { formatCents } from "@/lib/domain/money";
import { todayISO } from "@/lib/today";
import type { WeeklyReviewInput } from "@/lib/validation/schemas";

export default function ReviewPage() {
  const { ready, bundle, plan, saveWeeklyReview } = useApp();
  const [form, setForm] = useState<WeeklyReviewInput>({
    weekOf: todayISO(),
    updatedBalancesNote: null,
    actionsCompleted: [],
    obstacles: null,
    timeSpentMinutes: null,
    nextPriorities: null,
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  if (!ready) return <p className="text-sm text-cloud-faint">Loading…</p>;

  const baseline = baselineSnapshot(bundle);
  const latest = latestSnapshot(bundle);
  const completedActions = plan.thirtyDayPlan.filter((a) => a.status === "complete");

  function set<K extends keyof WeeklyReviewInput>(k: K, v: WeeklyReviewInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-cloud">Weekly review</h1>
        <p className="text-sm text-cloud-muted">Record progress and compare to your baseline.</p>
      </div>

      {/* Baseline vs latest */}
      <div>
        <SectionTitle title="Baseline vs. latest" />
        {baseline && latest ? (
          <Card className="space-y-2 text-sm">
            <Row label="Snapshot date" a={baseline.asOf} b={latest.asOf} />
            <Row label="Take-home income" a={formatCents(baseline.takeHomeIncomeCents)} b={formatCents(latest.takeHomeIncomeCents)} />
            <Row label="Essential spending" a={formatCents(baseline.essentialSpendingCents)} b={formatCents(latest.essentialSpendingCents)} />
            <Row label="Available cash" a={formatCents(baseline.availableCashCents)} b={formatCents(latest.availableCashCents)} />
            <Row label="Liabilities" a={formatCents(baseline.liabilitiesCents)} b={formatCents(latest.liabilitiesCents)} />
            {baseline.id === latest.id ? (
              <p className="text-xs text-cloud-faint">Only one snapshot so far — add another to see change.</p>
            ) : null}
          </Card>
        ) : (
          <Card>
            <p className="text-sm text-cloud-muted">Add a snapshot in My Finances to enable comparisons.</p>
          </Card>
        )}
      </div>

      <Card className="space-y-3">
        <Field label="Week of">
          <TextInput type="date" value={form.weekOf} onChange={(e) => set("weekOf", e.target.value)} />
        </Field>

        <div>
          <p className="mb-1 text-sm font-medium text-cloud">Actions completed this week</p>
          {completedActions.length === 0 ? (
            <p className="text-sm text-cloud-faint">No actions marked complete yet.</p>
          ) : (
            <div className="space-y-1">
              {completedActions.map((a) => (
                <label key={a.actionId} className="flex items-center gap-2 text-sm text-cloud-muted">
                  <input
                    type="checkbox"
                    checked={form.actionsCompleted.includes(a.actionId)}
                    onChange={(e) =>
                      set(
                        "actionsCompleted",
                        e.target.checked
                          ? [...form.actionsCompleted, a.actionId]
                          : form.actionsCompleted.filter((x) => x !== a.actionId),
                      )
                    }
                  />
                  {a.title}
                </label>
              ))}
            </div>
          )}
        </div>

        <Field label="Updated balances / payment status (note)">
          <TextArea value={form.updatedBalancesNote ?? ""} onChange={(e) => set("updatedBalancesNote", e.target.value || null)} />
        </Field>
        <Field label="Obstacles">
          <TextArea value={form.obstacles ?? ""} onChange={(e) => set("obstacles", e.target.value || null)} />
        </Field>
        <Field label="Time spent (minutes)">
          <TextInput
            inputMode="numeric"
            value={form.timeSpentMinutes ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              set("timeSpentMinutes", raw === "" ? null : Math.max(0, Math.round(Number(raw) || 0)));
            }}
          />
        </Field>
        <Field label="Next priorities">
          <TextArea value={form.nextPriorities ?? ""} onChange={(e) => set("nextPriorities", e.target.value || null)} />
        </Field>

        <div className="flex items-center gap-3">
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setSaveError(null);
              setSaved(false);
              const res = await saveWeeklyReview(form);
              setSaving(false);
              if (res.ok) setSaved(true);
              else setSaveError(res.error);
            }}
          >
            {saving ? "Saving…" : "Save review"}
          </Button>
          {saved ? <span className="text-sm text-ok">Saved.</span> : null}
          {saveError ? (
            <span className="text-sm text-danger" role="alert">
              {saveError} Nothing was saved — your notes are still here.
            </span>
          ) : null}
        </div>
      </Card>

      {bundle.weeklyReviews.length > 0 ? (
        <div>
          <SectionTitle title="Past reviews" />
          <Card className="divide-y divide-ink-line p-0">
            {bundle.weeklyReviews
              .slice()
              .sort((a, b) => b.weekOf.localeCompare(a.weekOf))
              .map((r) => (
                <div key={r.id} className="px-4 py-2 text-sm">
                  <p className="text-cloud">Week of {r.weekOf}</p>
                  <p className="text-xs text-cloud-faint">
                    {r.actionsCompleted.length} action(s) · {r.timeSpentMinutes ?? "—"} min
                  </p>
                </div>
              ))}
          </Card>
        </div>
      ) : null}

      <Disclaimer>
        This records what you did and observed. Financial changes shown are not proof the app caused
        them — correlation isn&apos;t causation.
      </Disclaimer>

      <Link href="/today" className="block text-sm text-teal underline">
        ← Back to Today
      </Link>
    </div>
  );
}

function Row({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <span className="text-cloud-faint">{label}</span>
      <span className="text-cloud-muted">{a}</span>
      <span className="text-cloud">{b}</span>
    </div>
  );
}
