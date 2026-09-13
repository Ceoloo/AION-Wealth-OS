"use client";

import React, { useState } from "react";
import { useApp } from "@/lib/store/provider";
import { Badge, Button, Card, Field, Select, TextInput } from "./ui";
import { MoneyInput } from "./MoneyInput";
import { formatCents } from "@/lib/domain/money";
import type { AccountInput } from "@/lib/validation/schemas";
import type { Account } from "@/lib/domain/types";

const EMPTY: AccountInput = {
  nickname: "",
  classification: "personal",
  kind: "credit_card",
  balanceCents: null,
  aprBps: null,
  minPaymentCents: null,
  pastDueCents: null,
  dueDate: null,
  creditLimitCents: null,
  isRevolving: true,
  includeInSnapshot: true,
};

export function AccountManager() {
  const { bundle, saveAccount, deleteAccount } = useApp();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<AccountInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function startNew() {
    setForm(EMPTY);
    setEditing("new");
  }
  function startEdit(a: Account) {
    setForm({
      nickname: a.nickname,
      classification: a.classification,
      kind: a.kind,
      balanceCents: a.balanceCents,
      aprBps: a.aprBps,
      minPaymentCents: a.minPaymentCents,
      pastDueCents: a.pastDueCents,
      dueDate: a.dueDate,
      creditLimitCents: a.creditLimitCents,
      isRevolving: a.isRevolving,
      includeInSnapshot: a.includeInSnapshot,
    });
    setEditing(a.id);
  }

  function set<K extends keyof AccountInput>(k: K, v: AccountInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.nickname.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    const res = await saveAccount(form, editing === "new" ? undefined : editing ?? undefined);
    setSaving(false);
    // Keep the editor open (and the data in it) unless the save is confirmed.
    if (res.ok) setEditing(null);
    else setSaveError(res.error);
  }

  const revolving = form.kind === "credit_card" || form.kind === "line_of_credit";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-cloud-muted">
          {bundle.accounts.length} account(s). Avoid double counting between here and your snapshot.
        </p>
        {editing === null ? (
          <Button variant="secondary" onClick={startNew}>
            + Add
          </Button>
        ) : null}
      </div>

      {bundle.accounts.map((a) => (
        <Card key={a.id} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-cloud">{a.nickname}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge>{a.classification}</Badge>
                <Badge>{a.kind.replace(/_/g, " ")}</Badge>
                {(a.pastDueCents ?? 0) > 0 ? <Badge tone="danger">past due</Badge> : null}
                {a.isRevolving && a.creditLimitCents === null ? (
                  <Badge tone="warn">limit unknown</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-cloud-faint">
                Balance {formatCents(a.balanceCents)}
                {a.creditLimitCents !== null ? ` · limit ${formatCents(a.creditLimitCents)}` : ""}
                {a.aprBps !== null ? ` · ${(a.aprBps / 100).toFixed(2)}% APR` : " · APR unknown"}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Button variant="ghost" onClick={() => startEdit(a)}>
                Edit
              </Button>
              <Button variant="ghost" onClick={() => deleteAccount(a.id)}>
                Delete
              </Button>
            </div>
          </div>
        </Card>
      ))}

      {editing !== null ? (
        <Card>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Nickname">
              <TextInput
                value={form.nickname}
                onChange={(e) => set("nickname", e.target.value)}
                placeholder="e.g. Everyday card"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select value={form.kind} onChange={(e) => {
                  const kind = e.target.value as AccountInput["kind"];
                  set("kind", kind);
                  set("isRevolving", kind === "credit_card" || kind === "line_of_credit");
                }}>
                  <option value="credit_card">Credit card</option>
                  <option value="line_of_credit">Line of credit</option>
                  <option value="loan">Loan</option>
                  <option value="bank">Bank account</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Class">
                <Select
                  value={form.classification}
                  onChange={(e) => set("classification", e.target.value as AccountInput["classification"])}
                >
                  <option value="personal">Personal</option>
                  <option value="business">Business</option>
                </Select>
              </Field>
            </div>
            <MoneyInput
              label="Balance"
              valueCents={form.balanceCents}
              onChangeCents={(v) => set("balanceCents", v)}
              allowNegative
            />
            <MoneyInput
              label="Minimum payment"
              valueCents={form.minPaymentCents}
              onChangeCents={(v) => set("minPaymentCents", v)}
            />
            <MoneyInput
              label="Past-due amount"
              valueCents={form.pastDueCents}
              onChangeCents={(v) => set("pastDueCents", v)}
            />
            {revolving ? (
              <MoneyInput
                label="Credit limit"
                hint="Needed for utilization. Leave blank if unknown."
                valueCents={form.creditLimitCents}
                onChangeCents={(v) => set("creditLimitCents", v)}
              />
            ) : null}
            <Field label="APR % (optional)" hint="Leave blank if unknown.">
              <TextInput
                inputMode="decimal"
                placeholder="unknown"
                value={form.aprBps === null ? "" : (form.aprBps / 100).toString()}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === "") return set("aprBps", null);
                  const pct = Number(raw);
                  if (Number.isFinite(pct)) set("aprBps", Math.round(pct * 100));
                }}
              />
            </Field>
            <Field label="Due date (optional)">
              <TextInput
                type="date"
                value={form.dueDate ?? ""}
                onChange={(e) => set("dueDate", e.target.value || null)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-cloud">
              <input
                type="checkbox"
                checked={form.includeInSnapshot}
                onChange={(e) => set("includeInSnapshot", e.target.checked)}
              />
              Include this balance in my snapshot totals
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void save()} disabled={!form.nickname.trim() || saving}>
              {saving ? "Saving…" : "Save account"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
          </div>
          {saveError ? (
            <p className="mt-2 text-sm text-danger" role="alert">
              {saveError} Nothing was saved — your entries are still here.
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
