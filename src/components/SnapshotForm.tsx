"use client";

import React, { useState } from "react";
import { useApp } from "@/lib/store/provider";
import { latestSnapshot } from "@/lib/data/bundle";
import { Button, Card, Field, TextInput } from "./ui";
import { MoneyInput } from "./MoneyInput";
import { todayISO } from "@/lib/today";
import type { SnapshotInput } from "@/lib/validation/schemas";

export function SnapshotForm({ onSaved }: { onSaved?: () => void }) {
  const { bundle, saveSnapshot } = useApp();
  const prev = latestSnapshot(bundle);

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
      <p className="text-sm text-cloud-muted">
        Saving records a <strong>new dated snapshot</strong> — past snapshots are kept so you can
        track change over time.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <Field label="Snapshot date">
          <TextInput
            type="date"
            value={form.asOf}
            onChange={(e) => set("asOf", e.target.value)}
          />
        </Field>

        <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-cloud-faint">
          Monthly cash flow
        </p>
        <MoneyInput
          label="Take-home income (monthly)"
          valueCents={form.takeHomeIncomeCents}
          onChangeCents={(v) => set("takeHomeIncomeCents", v)}
        />
        <MoneyInput
          label="Essential spending (monthly)"
          hint="Housing, utilities, food, transport, insurance."
          valueCents={form.essentialSpendingCents}
          onChangeCents={(v) => set("essentialSpendingCents", v)}
        />
        <MoneyInput
          label="Other spending (monthly)"
          hint="Non-essential/discretionary."
          valueCents={form.otherSpendingCents}
          onChangeCents={(v) => set("otherSpendingCents", v)}
        />
        <MoneyInput
          label="Required debt payments (monthly)"
          hint="Total minimums. Don't also count these inside 'essential spending'."
          valueCents={form.requiredDebtPaymentsCents}
          onChangeCents={(v) => set("requiredDebtPaymentsCents", v)}
        />

        <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-cloud-faint">
          Balance sheet
        </p>
        <MoneyInput
          label="Available cash"
          hint="Liquid cash you could use this month."
          valueCents={form.availableCashCents}
          onChangeCents={(v) => set("availableCashCents", v)}
        />
        <MoneyInput
          label="Other assets"
          valueCents={form.otherAssetsCents}
          onChangeCents={(v) => set("otherAssetsCents", v)}
        />
        <MoneyInput
          label="Total liabilities"
          hint="Total owed. Should reconcile with your account balances."
          valueCents={form.liabilitiesCents}
          onChangeCents={(v) => set("liabilitiesCents", v)}
        />

        <Field label="Any past-due accounts?">
          <div className="flex gap-2">
            {(
              [
                ["Yes", true],
                ["No", false],
                ["Unknown", null],
              ] as const
            ).map(([label, val]) => (
              <Button
                key={label}
                type="button"
                variant={form.hasPastDueAccounts === val ? "primary" : "secondary"}
                onClick={() => set("hasPastDueAccounts", val)}
              >
                {label}
              </Button>
            ))}
          </div>
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          disabled={saving}
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
        {saved ? <span className="text-sm text-ok">Saved. Your plan updated.</span> : null}
        {saveError ? (
          <span className="text-sm text-danger" role="alert">
            {saveError} Nothing was saved — your entries are still here.
          </span>
        ) : null}
      </div>
    </Card>
  );
}
