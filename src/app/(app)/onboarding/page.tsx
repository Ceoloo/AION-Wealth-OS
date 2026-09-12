"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/provider";
import { Button, Card, Disclaimer, Field, Select, TextInput, SectionTitle } from "@/components/ui";
import type { ProfileInput } from "@/lib/validation/schemas";
import type { USState } from "@/lib/domain/types";

const STATES: USState[] = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
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

  const [form, setForm] = useState<ProfileInput>({
    residenceState: p?.residenceState ?? null,
    businessState: p?.businessState ?? null,
    goals: p?.goals ?? [],
    experience: p?.experience ?? null,
    weeklyTimeMinutes: p?.weeklyTimeMinutes ?? null,
  });

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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-cloud">Get started</h1>
        <p className="text-sm text-cloud-muted">A few basics so your plan fits your situation.</p>
      </div>

      <Card className="space-y-3">
        <Field label="State of residence">
          <Select value={form.residenceState ?? ""} onChange={(e) => set("residenceState", (e.target.value || null) as USState | null)}>
            <option value="">Select…</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>

        <Field label="Business operating state (if any)">
          <Select value={form.businessState ?? ""} onChange={(e) => set("businessState", (e.target.value || null) as USState | null)}>
            <option value="">Not applicable</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>

        <Field label="Experience with personal/business finance">
          <Select value={form.experience ?? ""} onChange={(e) => set("experience", (e.target.value || null) as ProfileInput["experience"])}>
            <option value="">Select…</option>
            <option value="new">New to this</option>
            <option value="some">Some experience</option>
            <option value="experienced">Experienced</option>
          </Select>
        </Field>

        <Field label="Time available per week (minutes)">
          <TextInput
            inputMode="numeric"
            placeholder="e.g. 120"
            value={form.weeklyTimeMinutes ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              set("weeklyTimeMinutes", raw === "" ? null : Math.max(0, Math.round(Number(raw) || 0)));
            }}
          />
        </Field>

        <div>
          <p className="mb-1 text-sm font-medium text-cloud">Your goals</p>
          <div className="flex flex-wrap gap-2">
            {GOALS.map((g) => (
              <Button
                key={g.id}
                type="button"
                variant={form.goals.includes(g.id) ? "primary" : "secondary"}
                onClick={() => toggleGoal(g.id)}
              >
                {g.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Button
        onClick={() => {
          saveProfile(form);
          router.push("/finances");
        }}
      >
        Save & add my finances →
      </Button>

      <Disclaimer>
        We never ask for bank logins, SSNs, full account numbers, identity documents, or credit-report
        uploads. You enter or confirm your own figures.
      </Disclaimer>
    </div>
  );
}
