"use client";

import { useState } from "react";
import { useApp } from "@/lib/store/provider";
import { Badge, Button, Card, Disclaimer, Field, Select, TextArea, TextInput, SectionTitle } from "@/components/ui";
import type { CreditIssueInput } from "@/lib/validation/schemas";
import { buildCreditIssueSummary } from "@/lib/data/creditSummary";
import { downloadText } from "@/lib/download";
import { nowISO } from "@/lib/today";
import { CONTENT_SOURCES } from "@/lib/domain/sources";

const LESSONS = [
  {
    title: "Report vs. score",
    body: "Your credit report is the record of your accounts and history. Your score is a number derived from that report. Fixing the report is what changes the score over time.",
    sourceId: "annualcreditreport",
  },
  {
    title: "Payment history",
    body: "Paying on time is the single biggest factor in most scoring models. One missed payment can matter more than a high balance.",
    sourceId: "ftc_credit_repair",
  },
  {
    title: "Utilization",
    body: "How much of your revolving limits you use affects your score. Lower is generally better. Our estimate uses limits you enter and is not the bureau's calculation.",
    sourceId: null,
  },
  {
    title: "Legitimate business credit",
    body: "Business credit is built lawfully over time with a real entity, an EIN from the IRS, and on-time payments — never by buying tradelines or substituting an EIN for your identity.",
    sourceId: "irs_ein",
  },
  {
    title: "The cost of borrowing",
    body: "APR is the yearly cost of borrowing. On revolving debt, carrying a balance at a high APR can cost more than it first appears. Know the APR before you borrow.",
    sourceId: null,
  },
];

const EMPTY_ISSUE: CreditIssueInput = {
  bureau: "unknown",
  creditorNickname: "",
  category: "wrong_balance",
  explanation: "",
  relevantDate: null,
  followUpDate: null,
  state: "draft",
};

export default function LearnPage() {
  const { ready, bundle, createCreditIssue, editCreditIssue } = useApp();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<CreditIssueInput>(EMPTY_ISSUE);
  if (!ready) return <p className="text-sm text-cloud-faint">Loading…</p>;

  function set<K extends keyof CreditIssueInput>(k: K, v: CreditIssueInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-cloud">Learn</h1>
        <p className="text-sm text-cloud-muted">Credit foundations and your report-issue workspace.</p>
      </div>

      <div className="space-y-3">
        <SectionTitle title="Credit foundations" />
        {LESSONS.map((l) => {
          const src = l.sourceId ? CONTENT_SOURCES[l.sourceId] : null;
          return (
            <Card key={l.title}>
              <p className="font-medium text-cloud">{l.title}</p>
              <p className="mt-1 text-sm text-cloud-muted">{l.body}</p>
              {src ? (
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs text-teal underline"
                >
                  {src.publisher} →
                </a>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="space-y-3">
        <SectionTitle
          title="Report issue workspace"
          subtitle="Track suspected inaccuracies. We never submit anything to a bureau."
        />

        <Card className="border-teal/30">
          <p className="text-sm text-cloud-muted">
            Only dispute information you believe is genuinely inaccurate. Accurate, current negative
            information can&apos;t simply be removed.
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <a href={CONTENT_SOURCES.annualcreditreport!.url} target="_blank" rel="noopener noreferrer" className="text-teal underline">
              Get your free reports →
            </a>
            <a href={CONTENT_SOURCES.ftc_credit_repair!.url} target="_blank" rel="noopener noreferrer" className="text-teal underline">
              FTC: how disputes work →
            </a>
          </div>
        </Card>

        {bundle.creditIssues.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-cloud">{c.creditorNickname}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge>{c.bureau}</Badge>
                  <Badge>{c.category.replace(/_/g, " ")}</Badge>
                  <Badge tone={c.state === "resolved" ? "ok" : c.state === "unresolved" ? "danger" : "neutral"}>
                    {c.state.replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-cloud-muted">{c.explanation}</p>
                {c.followUpDate ? (
                  <p className="mt-1 text-xs text-warn">Follow up: {c.followUpDate}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Field label="">
                <Select
                  value={c.state}
                  onChange={(e) => editCreditIssue(c.id, { ...toInput(c), state: e.target.value as CreditIssueInput["state"] })}
                >
                  <option value="draft">Draft</option>
                  <option value="user_submitted">I submitted a dispute</option>
                  <option value="awaiting_response">Awaiting response</option>
                  <option value="resolved">Resolved</option>
                  <option value="unresolved">Unresolved</option>
                </Select>
              </Field>
            </div>
          </Card>
        ))}

        {!adding ? (
          <Button variant="secondary" onClick={() => { setForm(EMPTY_ISSUE); setAdding(true); }}>
            + Record a suspected issue
          </Button>
        ) : (
          <Card>
            <div className="grid grid-cols-1 gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bureau">
                  <Select value={form.bureau} onChange={(e) => set("bureau", e.target.value as CreditIssueInput["bureau"])}>
                    <option value="equifax">Equifax</option>
                    <option value="experian">Experian</option>
                    <option value="transunion">TransUnion</option>
                    <option value="unknown">Unknown</option>
                  </Select>
                </Field>
                <Field label="Category">
                  <Select value={form.category} onChange={(e) => set("category", e.target.value as CreditIssueInput["category"])}>
                    <option value="account_not_mine">Account not mine</option>
                    <option value="wrong_balance">Wrong balance</option>
                    <option value="wrong_status">Wrong status</option>
                    <option value="duplicate_account">Duplicate account</option>
                    <option value="outdated_info">Outdated info</option>
                    <option value="incorrect_personal_info">Incorrect personal info</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
              </div>
              <Field label="Creditor nickname">
                <TextInput value={form.creditorNickname} onChange={(e) => set("creditorNickname", e.target.value)} placeholder="e.g. Old phone account" />
              </Field>
              <Field label="Factual explanation" hint="Describe only the facts you can support.">
                <TextArea value={form.explanation} onChange={(e) => set("explanation", e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Relevant date">
                  <TextInput type="date" value={form.relevantDate ?? ""} onChange={(e) => set("relevantDate", e.target.value || null)} />
                </Field>
                <Field label="Follow-up reminder">
                  <TextInput type="date" value={form.followUpDate ?? ""} onChange={(e) => set("followUpDate", e.target.value || null)} />
                </Field>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                disabled={!form.creditorNickname.trim() || !form.explanation.trim()}
                onClick={() => { createCreditIssue(form); setAdding(false); }}
              >
                Save issue
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </Card>
        )}

        {bundle.creditIssues.length > 0 ? (
          <Button
            variant="secondary"
            onClick={() =>
              downloadText(
                "credit-issue-summary.md",
                buildCreditIssueSummary(bundle.creditIssues, nowISO()),
                "text/markdown",
              )
            }
          >
            Export issue summary (for your review)
          </Button>
        ) : null}
      </div>

      <Disclaimer>
        AION does not remove accurate information, generate dispute letters, or contact bureaus in
        v0.1. This workspace helps you organize facts; you act through official channels.
      </Disclaimer>
    </div>
  );
}

function toInput(c: import("@/lib/domain/types").CreditIssue): CreditIssueInput {
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
