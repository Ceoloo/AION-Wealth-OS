"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Note, PageHeader, PageLoading } from "@/components/app/primitives";
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
  if (!ready) return <PageLoading />;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Learn" description="Credit foundations, in plain language." />

      <div className="space-y-6">
        <Card className="gap-0 py-0">
          <ol className="divide-y divide-border">
            {LESSONS.map((l) => {
              const src = l.sourceId ? CONTENT_SOURCES[l.sourceId] : null;
              return (
                <li key={l.title} className="px-5 py-5 sm:px-6">
                  <h2 className="font-semibold tracking-tight">{l.title}</h2>
                  <p className="mt-1.5 max-w-prose text-[0.95rem] leading-relaxed text-muted-foreground text-pretty">
                    {l.body}
                  </p>
                  {src ? (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2.5 inline-flex items-center gap-1 text-sm font-medium text-primary underline"
                    >
                      {src.publisher}
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Card>

        <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-brand-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-pretty">
            Tracking a suspected error on your report? The report-issue workspace now lives with your
            credit figures.
          </p>
          <Button variant="secondary" size="sm" asChild className="shrink-0">
            <Link href="/credit">
              Go to Credit
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>

        <Note>
          AION does not remove accurate information, generate dispute letters, or contact bureaus in
          v0.1. This workspace helps you organize facts; you act through official channels.
        </Note>
      </div>
    </div>
  );
}
