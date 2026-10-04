"use client";

import React, { useId, useState } from "react";
import { Check } from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { latestSnapshot } from "@/lib/data/bundle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Field, InlineError, Segmented } from "@/components/app/primitives";
import { MoneyInput, useFieldValidity } from "./MoneyInput";
import { todayISO } from "@/lib/today";
import type { SnapshotInput } from "@/lib/validation/schemas";

export function SnapshotForm({ onSaved }: { onSaved?: () => void }) {
  const { bundle, saveSnapshot } = useApp();
  const prev = latestSnapshot(bundle);
  const dateId = useId();
  const validity = useFieldValidity();

  const [form, setForm] = useState<SnapshotInput>(() => ({
    asOf: todayISO(),
    takeHomeIncomeCents: prev?.takeHomeIncomeCents ?? null,
    essentialSpendingCents: prev?.essentialSpendingCents ?? null,
    otherSpendingCents: prev?.otherSpendingCents ?? null,
    requiredDebtPaymentsCents: prev?.requiredDebtPaymentsCents ?? null,
    availableCashCents: prev?.availableCashCents ?? null,
    otherAssetsCents: prev?.otherAssetsCents ?? null,
    liabilitiesCents: prev?.liabilitiesCents ?? null,
    hasPastDueAccounts: prev?.hasPastDueAccounts ?? null,
  }));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function set<K extends keyof SnapshotInput>(key: K, value: SnapshotInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  return (
    <Card>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Saving records a <strong className="text-foreground">new dated snapshot</strong> — past
          snapshots are kept so you can track change over time.
        </p>

        <Field label="Snapshot date" htmlFor={dateId} className="sm:max-w-xs">
          <Input id={dateId} type="date" className="figure" value={form.asOf} onChange={(e) => set("asOf", e.target.value)} />
        </Field>

        <FormGroup title="Monthly cash flow">
          <MoneyInput
            label="Take-home income (monthly)"
            valueCents={form.takeHomeIncomeCents}
            onChangeCents={(v) => set("takeHomeIncomeCents", v)}
            onValidityChange={validity.report("takeHomeIncomeCents")}
          />
          <MoneyInput
            label="Essential spending (monthly)"
            hint="Housing, utilities, food, transport, insurance."
            valueCents={form.essentialSpendingCents}
            onChangeCents={(v) => set("essentialSpendingCents", v)}
            onValidityChange={validity.report("essentialSpendingCents")}
          />
          <MoneyInput
            label="Other spending (monthly)"
            hint="Non-essential/discretionary."
            valueCents={form.otherSpendingCents}
            onChangeCents={(v) => set("otherSpendingCents", v)}
            onValidityChange={validity.report("otherSpendingCents")}
          />
          <MoneyInput
            label="Required debt payments (monthly)"
            hint="Total minimums. Don't also count these inside 'essential spending'."
            valueCents={form.requiredDebtPaymentsCents}
            onChangeCents={(v) => set("requiredDebtPaymentsCents", v)}
            onValidityChange={validity.report("requiredDebtPaymentsCents")}
          />
        </FormGroup>

        <FormGroup title="Balance sheet">
          <MoneyInput
            label="Available cash"
            hint="Liquid cash you could use this month."
            valueCents={form.availableCashCents}
            onChangeCents={(v) => set("availableCashCents", v)}
            onValidityChange={validity.report("availableCashCents")}
          />
          <MoneyInput label="Other assets" valueCents={form.otherAssetsCents} onChangeCents={(v) => set("otherAssetsCents", v)}
            onValidityChange={validity.report("otherAssetsCents")} />
          <MoneyInput
            label="Total liabilities"
            hint="Total owed. Should reconcile with your account balances."
            valueCents={form.liabilitiesCents}
            onChangeCents={(v) => set("liabilitiesCents", v)}
            onValidityChange={validity.report("liabilitiesCents")}
          />
        </FormGroup>

        <Field label="Any past-due accounts?">
          <Segmented
            label="Any past-due accounts?"
            value={form.hasPastDueAccounts}
            onChange={(v) => set("hasPastDueAccounts", v)}
            options={[
              { label: "Yes", value: true },
              { label: "No", value: false },
              { label: "Unknown", value: null },
            ]}
          />
        </Field>

        <Separator />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            disabled={saving || validity.hasInvalid}
            className="sm:w-auto"
            onClick={async () => {
              setSaving(true);
              setSaveError(null);
              setSaved(false);
              const res = await saveSnapshot(form);
              setSaving(false);
              if (res.ok) {
                setSaved(true);
                onSaved?.();
              } else {
                setSaveError(res.error);
              }
            }}
          >
            {saving ? "Saving…" : "Save snapshot"}
          </Button>
          {validity.hasInvalid ? (
            <span className="text-sm text-danger">Fix the highlighted amounts to save.</span>
          ) : null}
          {saved ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-success">
              <Check className="size-4" />
              Saved. Your plan updated.
            </span>
          ) : null}
        </div>
        {saveError ? <InlineError>{saveError} Nothing was saved — your entries are still here.</InlineError> : null}
      </CardContent>
    </Card>
  );
}

function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-4 text-sm font-semibold text-foreground">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
