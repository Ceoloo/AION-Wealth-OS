"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  CircleAlert,
  FlaskConical,
  ListChecks,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { ActionCard } from "@/components/ActionCard";
import { JourneyCard } from "@/components/JourneyCard";
import { KeyFigures } from "@/components/app/KeyFigures";
import { EmptyState, Note, PageHeader, PageLoading, Section } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { latestSnapshot } from "@/lib/data/bundle";
import { todayISO } from "@/lib/today";
import { Partners } from "@/components/Partners";
import { PLAN_BEFORE_PARTNERS } from "@/lib/experiments";

export default function TodayPage() {
  const { ready, hasData, bundle, plan, journey, brief, summary, loadDemoSeed, mode } = useApp();

  if (!ready) return <PageLoading />;

  // Soft gate: once the user has started, prompt the starter tools once before
  // showing the plan. They can set up, mark "already use it", or skip — then continue.
  // Under the PLAN_BEFORE_PARTNERS experiment the same step is shown *after* the
  // first plan instead (see lib/experiments.ts) — the step itself, its choices and
  // its disclosures are unchanged either way.
  if (hasData && !bundle.partnersAcknowledged && !PLAN_BEFORE_PARTNERS) {
    return <Partners mode="gate" />;
  }

  if (!hasData) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Welcome" description="Start with the synthetic demo, or enter your own information." />
        <EmptyState
          icon={mode === "demo" ? FlaskConical : ListChecks}
          title="No data yet"
          body={
            mode === "demo"
              ? "Load a clearly-labeled synthetic founder to explore the full loop. This is example data — to work with your own figures, sign in."
              : "Start onboarding to enter your own information. It's stored securely to your account."
          }
          action={
            mode === "demo" ? (
              <>
                <Button onClick={loadDemoSeed}>Load synthetic demo</Button>
                <Button variant="secondary" asChild>
                  <Link href="/signin">Sign in to use my own numbers</Link>
                </Button>
              </>
            ) : (
              <Button asChild>
                <Link href="/onboarding">
                  Start onboarding
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            )
          }
        />
        <Note className="mt-4">
          Educational only — not legal, tax, or financial advice. No credit scores or guarantees are
          produced.
        </Note>
      </div>
    );
  }

  const snapshot = latestSnapshot(bundle);
  // Progress counts retained completions of steps that no longer apply, so a
  // step leaving the plan cannot silently shrink the denominator.
  const total = plan.progress.total;
  const done = plan.progress.completed;
  const freshnessDays = snapshot ? daysSince(snapshot.asOf) : null;
  const stale = freshnessDays !== null && freshnessDays > 7;

  return (
    <div>
      <PageHeader
        title="Today"
        description="Your next steps, in order."
        actions={
          <span className="figure hidden text-sm text-subtle sm:block">{formatLongDate(todayISO())}</span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        {/* Journey — the dashboard's anchor */}
        <div className="lg:col-span-8">
          <JourneyCard journey={journey} />
        </div>

        {/* Progress + snapshot */}
        <div className="grid grid-cols-2 gap-4 lg:col-span-4 lg:grid-cols-1 lg:gap-5">
          <Card size="sm" className="justify-between">
            <CardContent className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground" title={plan.progress.basis}>
                30-day progress
              </p>
              <p className="figure text-2xl font-semibold tracking-tight">
                {done}
                <span className="text-base font-normal text-subtle"> / {total} complete</span>
              </p>
              <Progress value={total ? (done / total) * 100 : 0} className="h-1.5" aria-label={`${done} of ${total} steps complete`} />
            </CardContent>
          </Card>
          <Card size="sm" className={stale ? "ring-warning/25" : undefined}>
            <CardContent className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Snapshot</p>
              {snapshot ? (
                <>
                  <p className="figure text-base font-semibold">{snapshot.asOf}</p>
                  <p className={stale ? "text-xs text-warning" : "text-xs text-subtle"}>
                    {freshnessDays === 0 ? "Updated today" : `${freshnessDays} day(s) old`}
                  </p>
                  {stale ? (
                    <Link href="/finances" className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-primary">
                      <RefreshCw className="size-3" />
                      Update
                    </Link>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">None yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Key figures */}
        <KeyFigures summary={summary} className="lg:col-span-12" />

        {/* Notices from the engine */}
        {plan.notices.length > 0 ? (
          <div className="space-y-2 lg:col-span-12">
            {plan.notices.map((n, i) => (
              <div key={i} className="flex gap-2.5 rounded-xl border border-warning/25 bg-warning-surface px-4 py-3 text-sm text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p>{n}</p>
              </div>
            ))}
          </div>
        ) : null}

        {/* Priorities */}
        <Section
          title="Your 3 priorities now"
          description="Chosen by transparent rules — not AI."
          action={
            <Link href="/plan" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80">
              Full plan
              <ArrowRight className="size-3.5" />
            </Link>
          }
          className="lg:col-span-8"
        >
          {plan.priorities.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No current priorities"
              body="You've handled the current priorities. Check My Plan for your full 30-day sequence."
            />
          ) : (
            <div className="space-y-3">
              {plan.priorities.map((a, i) => (
                <ActionCard key={a.actionId} action={a} rank={i + 1} />
              ))}
            </div>
          )}
        </Section>

        {/* Side rail: the week, and the experiment card */}
        <div className="space-y-4 lg:col-span-4 lg:pt-[3.25rem]">
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <CalendarCheck className="size-3.5 text-subtle" />
                <span className="figure">This week · {brief.periodStart} to {brief.periodEnd}</span>
              </div>
              <p className="font-semibold text-pretty">{brief.headline}</p>
              {brief.overdue.length > 0 ? (
                <ul className="space-y-1.5">
                  {brief.overdue.slice(0, 2).map((o, i) => (
                    <li key={i} className="flex gap-2 text-sm text-warning">
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                      <span className="text-pretty">{o}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button variant="secondary" size="sm" asChild className="w-full">
                <Link href="/review">
                  Open weekly review
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {PLAN_BEFORE_PARTNERS && !bundle.partnersAcknowledged ? (
            <Card>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Sparkles className="size-3.5 text-subtle" />
                  Starter tools
                </div>
                <p className="text-sm text-pretty">
                  Starter tools: free and low-cost apps that help you act on the plan above.
                </p>
                <Link href="/partners" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  See the starter tools
                  <ArrowRight className="size-3.5" />
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Note className="mt-8">
        Actions and priorities are generated by a versioned deterministic rules engine (v
        {plan.engineVersion}). Completions you record are your own reports unless independently
        verified.
      </Note>
    </div>
  );
}

function daysSince(iso: string): number {
  const then = Date.parse(iso + "T00:00:00Z");
  const now = Date.parse(todayISO() + "T00:00:00Z");
  return Math.max(0, Math.round((now - then) / (1000 * 60 * 60 * 24)));
}

function formatLongDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
