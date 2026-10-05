"use client";

import { useId, useState } from "react";
import { CalendarClock, Download, ExternalLink, FileWarning, Plus } from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { EmptyState, Field, InlineError, Section } from "@/components/app/primitives";
import type { CreditIssueInput } from "@/lib/validation/schemas";
import type { CreditIssue } from "@/lib/domain/types";
import { buildCreditIssueSummary } from "@/lib/data/creditSummary";
import { downloadText } from "@/lib/download";
import { nowISO } from "@/lib/today";
import { CONTENT_SOURCES } from "@/lib/domain/sources";

/**
 * The report-issue workspace. This records what the user tells us, submits
 * nothing to any bureau, and generates no dispute letters.
 */

const EMPTY_ISSUE: CreditIssueInput = {
  bureau: "unknown",
  creditorNickname: "",
  category: "wrong_balance",
  explanation: "",
  relevantDate: null,
  followUpDate: null,
  state: "draft",
};

const STATE_TONE: Record<CreditIssue["state"], "muted" | "info" | "warning" | "success" | "danger"> = {
  draft: "muted",
  user_submitted: "info",
  awaiting_response: "warning",
  resolved: "success",
  unresolved: "danger",
};

export function CreditIssues() {
  const { bundle, createCreditIssue, editCreditIssue } = useApp();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<CreditIssueInput>(EMPTY_ISSUE);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const ids = { bureau: useId(), cat: useId(), nick: useId(), expl: useId(), rel: useId(), fu: useId() };

  function set<K extends keyof CreditIssueInput>(k: K, v: CreditIssueInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <Section
      title="Report issue workspace"
      description="Track suspected inaccuracies. We never submit anything to a bureau."
    >
      <div className="rounded-2xl border border-primary/20 bg-brand-surface p-4">
        <p className="text-sm text-foreground/90">
          Only dispute information you believe is genuinely inaccurate. Accurate, current negative
          information can&apos;t simply be removed.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <a href={CONTENT_SOURCES.annualcreditreport!.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline">
            Get your free reports
            <ExternalLink className="size-3.5" />
          </a>
          <a href={CONTENT_SOURCES.ftc_credit_repair!.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline">
            FTC: how disputes work
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      {bundle.creditIssues.length === 0 && !adding ? (
        <EmptyState
          icon={FileWarning}
          title="No issues recorded"
          body="If something on your report looks wrong, record the facts here so you can follow up through the official process."
        />
      ) : null}

      {bundle.creditIssues.map((c) => (
        <Card key={c.id} size="sm">
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-medium">{c.creditorNickname}</p>
              <Badge variant={STATE_TONE[c.state]} className="capitalize">
                {c.state.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="muted" className="capitalize">{c.bureau}</Badge>
              <Badge variant="muted">{c.category.replace(/_/g, " ")}</Badge>
            </div>
            <p className="text-sm text-muted-foreground text-pretty">{c.explanation}</p>
            {c.followUpDate ? (
              <p className="inline-flex items-center gap-1.5 text-xs text-warning">
                <CalendarClock className="size-3.5" />
                Follow up: <span className="figure">{c.followUpDate}</span>
              </p>
            ) : null}
            <NativeSelect
              aria-label={`Status for ${c.creditorNickname}`}
              className="w-full sm:w-64"
              value={c.state}
              onChange={async (e) => {
                setSaveError(null);
                const res = await editCreditIssue(c.id, {
                  ...toInput(c),
                  state: e.target.value as CreditIssueInput["state"],
                });
                if (!res.ok) setSaveError(res.error);
              }}
            >
              <NativeSelectOption value="draft">Draft</NativeSelectOption>
              <NativeSelectOption value="user_submitted">I submitted a dispute</NativeSelectOption>
              <NativeSelectOption value="awaiting_response">Awaiting response</NativeSelectOption>
              <NativeSelectOption value="resolved">Resolved</NativeSelectOption>
              <NativeSelectOption value="unresolved">Unresolved</NativeSelectOption>
            </NativeSelect>
          </CardContent>
        </Card>
      ))}

      {adding ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="font-semibold">Record a suspected issue</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bureau" htmlFor={ids.bureau}>
                <NativeSelect id={ids.bureau} className="w-full" value={form.bureau} onChange={(e) => set("bureau", e.target.value as CreditIssueInput["bureau"])}>
                  <NativeSelectOption value="equifax">Equifax</NativeSelectOption>
                  <NativeSelectOption value="experian">Experian</NativeSelectOption>
                  <NativeSelectOption value="transunion">TransUnion</NativeSelectOption>
                  <NativeSelectOption value="unknown">Unknown</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field label="Category" htmlFor={ids.cat}>
                <NativeSelect id={ids.cat} className="w-full" value={form.category} onChange={(e) => set("category", e.target.value as CreditIssueInput["category"])}>
                  <NativeSelectOption value="account_not_mine">Account not mine</NativeSelectOption>
                  <NativeSelectOption value="wrong_balance">Wrong balance</NativeSelectOption>
                  <NativeSelectOption value="wrong_status">Wrong status</NativeSelectOption>
                  <NativeSelectOption value="duplicate_account">Duplicate account</NativeSelectOption>
                  <NativeSelectOption value="outdated_info">Outdated info</NativeSelectOption>
                  <NativeSelectOption value="incorrect_personal_info">Incorrect personal info</NativeSelectOption>
                  <NativeSelectOption value="other">Other</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>
            <Field label="Creditor nickname" htmlFor={ids.nick}>
              <Input id={ids.nick} value={form.creditorNickname} onChange={(e) => set("creditorNickname", e.target.value)} placeholder="e.g. Old phone account" />
            </Field>
            <Field label="Factual explanation" htmlFor={ids.expl} hint="Describe only the facts you can support.">
              <Textarea id={ids.expl} value={form.explanation} onChange={(e) => set("explanation", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Relevant date" htmlFor={ids.rel}>
                <Input id={ids.rel} type="date" className="figure" value={form.relevantDate ?? ""} onChange={(e) => set("relevantDate", e.target.value || null)} />
              </Field>
              <Field label="Follow-up reminder" htmlFor={ids.fu}>
                <Input id={ids.fu} type="date" className="figure" value={form.followUpDate ?? ""} onChange={(e) => set("followUpDate", e.target.value || null)} />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={!form.creditorNickname.trim() || !form.explanation.trim() || saving}
                onClick={async () => {
                  setSaving(true);
                  setSaveError(null);
                  const res = await createCreditIssue(form);
                  setSaving(false);
                  if (res.ok) setAdding(false);
                  else setSaveError(res.error);
                }}
              >
                {saving ? "Saving…" : "Save issue"}
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {!adding ? (
          <Button variant="secondary" onClick={() => { setForm(EMPTY_ISSUE); setAdding(true); }}>
            <Plus data-icon="inline-start" />
            Record a suspected issue
          </Button>
        ) : null}
        {bundle.creditIssues.length > 0 ? (
          <Button
            variant="ghost"
            onClick={() =>
              downloadText("credit-issue-summary.md", buildCreditIssueSummary(bundle.creditIssues, nowISO()), "text/markdown")
            }
          >
            <Download data-icon="inline-start" />
            Export issue summary (for your review)
          </Button>
        ) : null}
      </div>

      {saveError ? <InlineError>{saveError} Nothing was saved.</InlineError> : null}
    </Section>
  );
}

function toInput(c: CreditIssue): CreditIssueInput {
  return {
    bureau: c.bureau,
    creditorNickname: c.creditorNickname,
    category: c.category,
    explanation: c.explanation,
    relevantDate: c.relevantDate,
    followUpDate: c.followUpDate,
    state: c.state,
  };
}
