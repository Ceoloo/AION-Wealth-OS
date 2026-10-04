"use client";

import React, { useId, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { EmptyState, Field, InlineError, Money } from "@/components/app/primitives";
import { MoneyInput, useFieldValidity } from "./MoneyInput";
import type { AccountInput } from "@/lib/validation/schemas";
import type { Account } from "@/lib/domain/types";
import { Wallet } from "lucide-react";

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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function startNew() {
    setForm(EMPTY);
    setSaveError(null);
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
    setSaveError(null);
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

  async function remove(a: Account) {
    const res = await deleteAccount(a.id);
    setConfirmDelete(null);
    // An editor still open on the deleted account would "save" into an id
    // that no longer exists — the upsert matches nothing and reports ok.
    if (res.ok && editing === a.id) setEditing(null);
    if (!res.ok) toast.error(`${a.nickname} wasn't deleted`, { description: res.error });
    else toast.success(`Deleted ${a.nickname}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="figure">{bundle.accounts.length}</span> account(s). Avoid double counting
          between here and your snapshot.
        </p>
        {editing === null ? (
          <Button variant="secondary" size="sm" onClick={startNew}>
            <Plus data-icon="inline-start" />
            Add
          </Button>
        ) : null}
      </div>

      {bundle.accounts.length === 0 && editing === null ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          body="Add a card, loan or bank account. A credit card with both its balance and limit lets us estimate utilization."
          action={<Button onClick={startNew}>Add an account</Button>}
        />
      ) : null}

      {bundle.accounts.length > 0 ? (
        <Card className="gap-0 py-0">
          <ul className="divide-y divide-border">
            {bundle.accounts.map((a) => (
              <li key={a.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.nickname}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge variant="muted" className="capitalize">{a.classification}</Badge>
                      <Badge variant="muted" className="capitalize">{a.kind.replace(/_/g, " ")}</Badge>
                      {(a.pastDueCents ?? 0) > 0 ? <Badge variant="danger">Past due</Badge> : null}
                      {a.isRevolving && a.creditLimitCents === null ? <Badge variant="warning">Limit unknown</Badge> : null}
                    </div>
                    <p className="mt-2 text-xs text-subtle">
                      Balance <Money cents={a.balanceCents} className="text-muted-foreground" />
                      {a.creditLimitCents !== null ? (
                        <>
                          {" · limit "}
                          <Money cents={a.creditLimitCents} className="text-muted-foreground" />
                        </>
                      ) : null}
                      {a.aprBps !== null ? (
                        <span className="figure"> · {(a.aprBps / 100).toFixed(2)}% APR</span>
                      ) : (
                        " · APR unknown"
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Edit ${a.nickname}`} onClick={() => startEdit(a)}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${a.nickname}`}
                      onClick={() => setConfirmDelete(confirmDelete === a.id ? null : a.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                {/* Deleting a financial record is irreversible, so it takes a
                    second, deliberate tap — inline, not a modal. */}
                {confirmDelete === a.id ? (
                  <div className="mt-3 flex flex-col gap-2 rounded-xl border border-danger/25 bg-danger-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-danger">Delete {a.nickname}? This can&apos;t be undone.</p>
                    <div className="flex gap-2">
                      <Button variant="destructive" size="sm" onClick={() => void remove(a)}>
                        Delete
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                        Keep it
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {editing !== null ? <AccountEditor key={editing} form={form} set={set} saving={saving} saveError={saveError} onSave={save} onCancel={() => setEditing(null)} isNew={editing === "new"} /> : null}
    </div>
  );
}

function AccountEditor({
  form,
  set,
  saving,
  saveError,
  onSave,
  onCancel,
  isNew,
}: {
  form: AccountInput;
  set: <K extends keyof AccountInput>(k: K, v: AccountInput[K]) => void;
  saving: boolean;
  saveError: string | null;
  onSave: () => Promise<void>;
  onCancel: () => void;
  isNew: boolean;
}) {
  const ids = { nickname: useId(), kind: useId(), cls: useId(), apr: useId(), due: useId(), include: useId() };
  const revolving = form.kind === "credit_card" || form.kind === "line_of_credit";

  // The APR field keeps its own text. Driving it straight from the stored
  // basis points re-rendered "19." as "19" on every keystroke, so a decimal
  // APR like 19.99% could not be typed at all.
  const [aprText, setAprText] = useState(form.aprBps === null ? "" : (form.aprBps / 100).toString());
  const [aprError, setAprError] = useState<string | null>(null);
  const validity = useFieldValidity();

  return (
    <Card>
      <CardContent className="space-y-5">
        <p className="font-semibold">{isNew ? "Add an account" : "Edit account"}</p>
        <Field label="Nickname" htmlFor={ids.nickname}>
          <Input
            id={ids.nickname}
            value={form.nickname}
            onChange={(e) => set("nickname", e.target.value)}
            placeholder="e.g. Everyday card"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type" htmlFor={ids.kind}>
            <NativeSelect
              id={ids.kind}
              className="w-full"
              value={form.kind}
              onChange={(e) => {
                const kind = e.target.value as AccountInput["kind"];
                const isRevolving = kind === "credit_card" || kind === "line_of_credit";
                set("kind", kind);
                set("isRevolving", isRevolving);
                // The credit-limit field unmounts for non-revolving types; its
                // invalid text must not keep blocking Save from beyond the grave.
                if (!isRevolving) validity.report("creditLimitCents")(true);
              }}
            >
              <NativeSelectOption value="credit_card">Credit card</NativeSelectOption>
              <NativeSelectOption value="line_of_credit">Line of credit</NativeSelectOption>
              <NativeSelectOption value="loan">Loan</NativeSelectOption>
              <NativeSelectOption value="bank">Bank account</NativeSelectOption>
              <NativeSelectOption value="other">Other</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field label="Class" htmlFor={ids.cls}>
            <NativeSelect
              id={ids.cls}
              className="w-full"
              value={form.classification}
              onChange={(e) => set("classification", e.target.value as AccountInput["classification"])}
            >
              <NativeSelectOption value="personal">Personal</NativeSelectOption>
              <NativeSelectOption value="business">Business</NativeSelectOption>
            </NativeSelect>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput label="Balance" valueCents={form.balanceCents} onChangeCents={(v) => set("balanceCents", v)} onValidityChange={validity.report("balanceCents")} allowNegative />
          <MoneyInput label="Minimum payment" valueCents={form.minPaymentCents} onChangeCents={(v) => set("minPaymentCents", v)} onValidityChange={validity.report("minPaymentCents")} />
          <MoneyInput label="Past-due amount" valueCents={form.pastDueCents} onChangeCents={(v) => set("pastDueCents", v)} onValidityChange={validity.report("pastDueCents")} />
          {revolving ? (
            <MoneyInput
              label="Credit limit"
              hint="Needed for utilization. Leave blank if unknown."
              valueCents={form.creditLimitCents}
              onChangeCents={(v) => set("creditLimitCents", v)}
              onValidityChange={validity.report("creditLimitCents")}
            />
          ) : null}
          <Field label="APR % (optional)" htmlFor={ids.apr} hint={aprError ? undefined : "Leave blank if unknown."}>
            <Input
              id={ids.apr}
              inputMode="decimal"
              className="figure"
              placeholder="unknown"
              aria-invalid={aprError ? true : undefined}
              value={aprText}
              onChange={(e) => {
                const raw = e.target.value;
                setAprText(raw);
                const trimmed = raw.trim();
                if (trimmed === "") {
                  setAprError(null);
                  return set("aprBps", null);
                }
                const pct = Number(trimmed);
                if (!Number.isFinite(pct) || pct < 0) {
                  setAprError("Enter a percentage, e.g. 19.99");
                  return;
                }
                setAprError(null);
                set("aprBps", Math.round(pct * 100));
              }}
            />
            {aprError ? <span className="block text-xs text-danger">{aprError}</span> : null}
          </Field>
          <Field label="Due date (optional)" htmlFor={ids.due}>
            <Input
              id={ids.due}
              type="date"
              className="figure"
              value={form.dueDate ?? ""}
              onChange={(e) => set("dueDate", e.target.value || null)}
            />
          </Field>
        </div>
        <div className="flex items-start gap-3">
          <Checkbox
            id={ids.include}
            checked={form.includeInSnapshot}
            onCheckedChange={(v) => set("includeInSnapshot", v === true)}
            className="mt-0.5"
          />
          <Label htmlFor={ids.include} className="text-sm leading-snug font-normal">
            Include this balance in my snapshot totals
          </Label>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void onSave()} disabled={!form.nickname.trim() || saving || aprError !== null || validity.hasInvalid}>
            {saving ? "Saving…" : "Save account"}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
        {saveError ? <InlineError>{saveError} Nothing was saved — your entries are still here.</InlineError> : null}
      </CardContent>
    </Card>
  );
}
