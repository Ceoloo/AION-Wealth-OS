"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, InlineError, Note, PageHeader, RadioCards } from "@/components/app/primitives";
import type { ProfileInput } from "@/lib/validation/schemas";
import type { SelfReportedSituation, USState } from "@/lib/domain/types";
import { SITUATION_LABELS } from "@/lib/domain/journey";
import { US_STATES } from "@/lib/usStates";
import { cn } from "@/lib/utils";

/**
 * Asked first, and in the user's own words. This is a self-report used to order
 * what we ask next and to show a provisional stage before any figures exist —
 * it is never treated as evidence of a financial fact.
 */
const SITUATIONS: SelfReportedSituation[] = [
  "behind_on_bills",
  "just_covering",
  "small_cushion",
  "stable_building",
  "unsure",
];

const GOALS: { id: string; label: string }[] = [
  { id: "improve_credit", label: "Understand & improve my credit" },
  { id: "build_cushion", label: "Build a cash cushion" },
  { id: "reduce_debt", label: "Reduce debt" },
  { id: "form_business", label: "Form a business" },
  { id: "get_organized", label: "Get organized / recordkeeping" },
];

export default function OnboardingPage() {
  const { bundle, saveProfile } = useApp();
  const router = useRouter();
  const p = bundle.profile;
  const ids = { res: useId(), biz: useId(), exp: useId(), time: useId(), situation: useId() };

  const [form, setForm] = useState<ProfileInput>({
    residenceState: p?.residenceState ?? null,
    businessState: p?.businessState ?? null,
    situation: p?.situation ?? null,
    goals: p?.goals ?? [],
    experience: p?.experience ?? null,
    weeklyTimeMinutes: p?.weeklyTimeMinutes ?? null,
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function set<K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function toggleGoal(id: string) {
    setForm((f) => ({
      ...f,
      goals: f.goals.includes(id) ? f.goals.filter((g) => g !== id) : [...f.goals, id],
    }));
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Get started" description="A few basics so your plan fits your situation." />

      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-4">
            <div>
              <h2 id={ids.situation} className="font-semibold">Where are you starting from?</h2>
              <p className="mt-1 text-sm text-subtle">
                In your words. This orders what we ask next — your plan itself is computed from the
                figures you enter, not from this answer.
              </p>
            </div>
            {/* "I'm not sure" is the explicit way to decline; a radio never
                clears itself when its selected option is pressed again. */}
            <RadioCards
              labelledBy={ids.situation}
              value={form.situation}
              options={SITUATIONS.map((id) => ({ value: id, label: SITUATION_LABELS[id] }))}
              onChange={(v) => set("situation", v)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="State of residence" htmlFor={ids.res}>
                <NativeSelect
                  id={ids.res}
                  className="w-full"
                  value={form.residenceState ?? ""}
                  onChange={(e) => set("residenceState", (e.target.value || null) as USState | null)}
                >
                  <NativeSelectOption value="">Select…</NativeSelectOption>
                  {US_STATES.map((s) => (
                    <NativeSelectOption key={s} value={s}>
                      {s}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <Field label="Business operating state (if any)" htmlFor={ids.biz}>
                <NativeSelect
                  id={ids.biz}
                  className="w-full"
                  value={form.businessState ?? ""}
                  onChange={(e) => set("businessState", (e.target.value || null) as USState | null)}
                >
                  <NativeSelectOption value="">Not applicable</NativeSelectOption>
                  {US_STATES.map((s) => (
                    <NativeSelectOption key={s} value={s}>
                      {s}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <Field label="Experience with personal/business finance" htmlFor={ids.exp}>
                <NativeSelect
                  id={ids.exp}
                  className="w-full"
                  value={form.experience ?? ""}
                  onChange={(e) => set("experience", (e.target.value || null) as ProfileInput["experience"])}
                >
                  <NativeSelectOption value="">Select…</NativeSelectOption>
                  <NativeSelectOption value="new">New to this</NativeSelectOption>
                  <NativeSelectOption value="some">Some experience</NativeSelectOption>
                  <NativeSelectOption value="experienced">Experienced</NativeSelectOption>
                </NativeSelect>
              </Field>

              <Field label="Time available per week (minutes)" htmlFor={ids.time}>
                <Input
                  id={ids.time}
                  inputMode="numeric"
                  className="figure"
                  placeholder="e.g. 120"
                  value={form.weeklyTimeMinutes ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    set("weeklyTimeMinutes", raw === "" ? null : Math.max(0, Math.round(Number(raw) || 0)));
                  }}
                />
              </Field>
            </div>

            <fieldset>
              <legend className="mb-2.5 text-sm font-medium">Your goals</legend>
              <div className="flex flex-wrap gap-2">
                {GOALS.map((g) => {
                  const on = form.goals.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleGoal(g.id)}
                      className={cn(
                        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors duration-150",
                        on
                          ? "border-primary/50 bg-brand-surface text-primary"
                          : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                      )}
                    >
                      {on ? <Check className="size-3.5" /> : null}
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full sm:w-auto"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setSaveError(null);
            const res = await saveProfile(form);
            setSaving(false);
            // Only navigate once the save is actually confirmed. On failure the
            // form keeps everything the user typed.
            if (res.ok) router.push("/finances");
            else setSaveError(res.error);
          }}
        >
          {saving ? "Saving…" : "Save & add my finances"}
          {!saving ? <ArrowRight data-icon="inline-end" /> : null}
        </Button>
        {saveError ? <InlineError>{saveError} Your answers are still here — try again.</InlineError> : null}

        <Note>
          AION never sees your bank login, SSN or full account numbers, and never asks for identity
          documents or credit-report uploads. You enter your own figures — or, if you choose, connect an
          account: you sign in through Plaid, not AION.
        </Note>
      </div>
    </div>
  );
}
