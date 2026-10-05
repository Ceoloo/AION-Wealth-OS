"use client";

import { useId, useState } from "react";
import { Check, History } from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { baselineSnapshot, latestSnapshot } from "@/lib/data/bundle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Field, InlineError, Money, Note, PageHeader, PageLoading, Section } from "@/components/app/primitives";
import { WeeklyBriefCard } from "@/components/WeeklyBriefCard";
import { todayISO } from "@/lib/today";
import type { WeeklyReviewInput } from "@/lib/validation/schemas";

export default function ReviewPage() {
  const { ready, bundle, plan, brief, saveWeeklyReview } = useApp();
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
  const ids = { week: useId(), bal: useId(), obs: useId(), time: useId(), next: useId() };
  if (!ready) return <PageLoading />;

  const baseline = baselineSnapshot(bundle);
  const latest = latestSnapshot(bundle);
  const completedActions = plan.thirtyDayPlan.filter((a) => a.status === "complete");

  function set<K extends keyof WeeklyReviewInput>(k: K, v: WeeklyReviewInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Weekly review" description="Your week, computed from your own records — then your notes on it." />

      <div className="space-y-8">
        <WeeklyBriefCard brief={brief} />

        <Section title="Baseline vs. latest">
          {baseline && latest ? (
            <Card className="gap-0 py-0">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-5 border-b border-border px-5 py-3 text-xs font-medium text-subtle">
                <span />
                <span className="w-24 text-right">Baseline</span>
                <span className="w-24 text-right">Latest</span>
              </div>
              <dl className="divide-y divide-border">
                <Row label="Snapshot date" a={<span className="figure">{baseline.asOf}</span>} b={<span className="figure">{latest.asOf}</span>} />
                <Row label="Take-home income" a={<Money cents={baseline.takeHomeIncomeCents} />} b={<Money cents={latest.takeHomeIncomeCents} />} />
                <Row label="Essential spending" a={<Money cents={baseline.essentialSpendingCents} />} b={<Money cents={latest.essentialSpendingCents} />} />
                <Row label="Available cash" a={<Money cents={baseline.availableCashCents} />} b={<Money cents={latest.availableCashCents} />} />
                <Row label="Liabilities" a={<Money cents={baseline.liabilitiesCents} />} b={<Money cents={latest.liabilitiesCents} />} />
              </dl>
              {baseline.id === latest.id ? (
                <p className="border-t border-border px-5 py-3 text-xs text-subtle">Only one snapshot so far — add another to see change.</p>
              ) : null}
            </Card>
          ) : (
            <Card size="sm">
              <CardContent>
                <p className="text-sm text-muted-foreground">Add a snapshot in My Finances to enable comparisons.</p>
              </CardContent>
            </Card>
          )}
        </Section>

        <Section title="Your notes on the week">
          <Card>
            <CardContent className="space-y-5">
              <Field label="Week of" htmlFor={ids.week} className="sm:max-w-xs">
                <Input id={ids.week} type="date" className="figure" value={form.weekOf} onChange={(e) => set("weekOf", e.target.value)} />
              </Field>

              <fieldset>
                <legend className="mb-2 text-sm font-medium">Actions completed this week</legend>
                {completedActions.length === 0 ? (
                  <p className="text-sm text-subtle">No actions marked complete yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {completedActions.map((a) => {
                      const id = `done-${a.actionId}`;
                      return (
                        <div key={a.actionId} className="flex items-center gap-3">
                          <Checkbox
                            id={id}
                            checked={form.actionsCompleted.includes(a.actionId)}
                            onCheckedChange={(checked) =>
                              set(
                                "actionsCompleted",
                                checked === true
                                  ? [...form.actionsCompleted, a.actionId]
                                  : form.actionsCompleted.filter((x) => x !== a.actionId),
                              )
                            }
                          />
                          <Label htmlFor={id} className="text-sm font-normal text-muted-foreground">
                            {a.title}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </fieldset>

              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Updated balances / payment status (note)" htmlFor={ids.bal}>
                  <Textarea id={ids.bal} value={form.updatedBalancesNote ?? ""} onChange={(e) => set("updatedBalancesNote", e.target.value || null)} />
                </Field>
                <Field label="Obstacles" htmlFor={ids.obs}>
                  <Textarea id={ids.obs} value={form.obstacles ?? ""} onChange={(e) => set("obstacles", e.target.value || null)} />
                </Field>
                <Field label="Time spent (minutes)" htmlFor={ids.time}>
                  <Input
                    id={ids.time}
                    inputMode="numeric"
                    className="figure"
                    value={form.timeSpentMinutes ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      set("timeSpentMinutes", raw === "" ? null : Math.max(0, Math.round(Number(raw) || 0)));
                    }}
                  />
                </Field>
                <Field label="Next priorities" htmlFor={ids.next}>
                  <Textarea id={ids.next} value={form.nextPriorities ?? ""} onChange={(e) => set("nextPriorities", e.target.value || null)} />
                </Field>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                {saved ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-success">
                    <Check className="size-4" />
                    Saved.
                  </span>
                ) : null}
              </div>
              {saveError ? <InlineError>{saveError} Nothing was saved — your notes are still here.</InlineError> : null}
            </CardContent>
          </Card>
        </Section>

        {bundle.weeklyReviews.length > 0 ? (
          <Section title="Past reviews">
            <Card className="gap-0 py-0">
              <ul className="divide-y divide-border">
                {bundle.weeklyReviews
                  .slice()
                  .sort((a, b) => b.weekOf.localeCompare(a.weekOf))
                  .map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <span className="flex items-center gap-2.5">
                        <History className="size-4 text-subtle" />
                        Week of <span className="figure">{r.weekOf}</span>
                      </span>
                      <span className="figure text-xs text-subtle">
                        {r.actionsCompleted.length} action(s) · {r.timeSpentMinutes ?? "—"} min
                      </span>
                    </li>
                  ))}
              </ul>
            </Card>
          </Section>
        ) : null}

        <Note>
          This records what you did and observed. Financial changes shown are not proof the app caused
          them — correlation isn&apos;t causation.
        </Note>
      </div>
    </div>
  );
}

function Row({ label, a, b }: { label: string; a: React.ReactNode; b: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-5 px-5 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="w-24 text-right text-subtle">{a}</dd>
      <dd className="w-24 text-right">{b}</dd>
    </div>
  );
}
