"use client";

import Link from "next/link";
import { useApp } from "@/lib/store/provider";
import { Card, Disclaimer, SectionTitle } from "@/components/ui";
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

export default function LearnPage() {
  const { ready } = useApp();
  if (!ready) return <p className="text-sm text-cloud-faint">Loading…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-cloud">Learn</h1>
        <p className="text-sm text-cloud-muted">Credit foundations, in plain language.</p>
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

      <Card className="border-teal/30">
        <p className="text-sm text-cloud">
          Tracking a suspected error on your report? The report-issue workspace now lives with your
          credit figures.
        </p>
        <Link href="/credit" className="mt-2 inline-block text-sm font-medium text-teal underline">
          Go to Credit →
        </Link>
      </Card>

      <Disclaimer>
        AION does not remove accurate information, generate dispute letters, or contact bureaus in
        v0.1. This workspace helps you organize facts; you act through official channels.
      </Disclaimer>
    </div>
  );
}
