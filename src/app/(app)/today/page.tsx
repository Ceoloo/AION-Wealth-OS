"use client";

import Link from "next/link";
import { useApp } from "@/lib/store/provider";
import { ActionCard } from "@/components/ActionCard";
import { Button, Card, Disclaimer, EmptyState, SectionTitle } from "@/components/ui";
import { latestSnapshot } from "@/lib/data/bundle";
import { todayISO } from "@/lib/today";
import { Partners } from "@/components/Partners";
import { PLAN_BEFORE_PARTNERS } from "@/lib/experiments";
import { JourneyStrip } from "@/components/JourneyStrip";

export default function TodayPage() {
  const { ready, hasData, bundle, plan, journey, loadDemoSeed, mode } = useApp();

  if (!ready) return <p className="text-sm text-cloud-faint">Loading…</p>;

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
      <div className="space-y-4">
        <SectionTitle
          title="Welcome"
          subtitle="Start with the synthetic demo, or enter your own information."
        />
        <EmptyState
          title="No data yet"
          body={
            mode === "demo"
              ? "Load a clearly-labeled synthetic founder to explore the full loop. This is example data — to work with your own figures, sign in."
              : "Start onboarding to enter your own information. It's stored securely to your account."
          }
          action={
            <div className="flex flex-col gap-2">
              {mode === "demo" ? (
                <>
                  <Button onClick={loadDemoSeed}>Load synthetic demo</Button>
                  <Link href="/signin">
                    <Button variant="secondary" className="w-full">
                      Sign in to use my own numbers
                    </Button>
                  </Link>
                </>
              ) : (
                <Link href="/onboarding">
                  <Button className="w-full">Start onboarding</Button>
                </Link>
              )}
            </div>
          }
        />
        <Disclaimer>
          Educational only — not legal, tax, or financial advice. No credit scores or guarantees are
          produced.
        </Disclaimer>
      </div>
    );
  }

  const snapshot = latestSnapshot(bundle);
  // Progress counts retained completions of steps that no longer apply, so a
  // step leaving the plan cannot silently shrink the denominator.
  const total = plan.progress.total;
  const done = plan.progress.completed;
  const freshnessDays = snapshot ? daysSince(snapshot.asOf) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-cloud">Today</h1>
        <p className="text-sm text-cloud-muted">Your next steps, in order.</p>
      </div>

      <JourneyStrip journey={journey} />

      {/* Snapshot freshness + progress */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <p className="text-xs text-cloud-faint">Snapshot</p>
          {snapshot ? (
            <>
              <p className="text-sm font-semibold text-cloud">{snapshot.asOf}</p>
              <p className="text-xs text-cloud-muted">
                {freshnessDays === 0 ? "Updated today" : `${freshnessDays} day(s) old`}
              </p>
            </>
          ) : (
            <p className="text-sm text-cloud-muted">None yet</p>
          )}
        </Card>
        <Card className="p-3">
          <p className="text-xs text-cloud-faint" title={plan.progress.basis}>
            30-day progress
          </p>
          <p className="text-sm font-semibold text-cloud">
            {done} / {total} complete
          </p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-soft">
            <div
              className="h-full rounded-full bg-teal"
              style={{ width: total ? `${(done / total) * 100}%` : "0%" }}
            />
          </div>
        </Card>
      </div>

      {plan.notices.length > 0 ? (
        <Card className="border-warn/40 bg-warn/5">
          {plan.notices.map((n, i) => (
            <p key={i} className="text-sm text-warn">
              {n}
            </p>
          ))}
        </Card>
      ) : null}

      <div>
        <SectionTitle title="Your 3 priorities now" subtitle="Chosen by transparent rules — not AI." />
        <div className="space-y-3">
          {plan.priorities.length === 0 ? (
            <EmptyState
              title="No current priorities"
              body="You've handled the current priorities. Check My Plan for your full 30-day sequence."
            />
          ) : (
            plan.priorities.map((a, i) => <ActionCard key={a.actionId} action={a} rank={i + 1} />)
          )}
        </div>
      </div>

      {PLAN_BEFORE_PARTNERS && !bundle.partnersAcknowledged ? (
        <Card className="border-teal/30">
          <p className="text-sm text-cloud">
            Starter tools: free and low-cost apps that help you act on the plan above.
          </p>
          <Link href="/partners" className="mt-2 inline-block text-sm font-medium text-teal underline">
            See the starter tools →
          </Link>
        </Card>
      ) : null}

      {snapshot && freshnessDays !== null && freshnessDays > 7 ? (
        <Card className="border-teal/30">
          <p className="text-sm text-cloud">Your snapshot is over a week old.</p>
          <Link href="/finances" className="mt-2 inline-block text-sm font-medium text-teal underline">
            Update your finances →
          </Link>
        </Card>
      ) : null}

      <Disclaimer>
        Actions and priorities are generated by a versioned deterministic rules engine
        (v{plan.engineVersion}). Completions you record are your own reports unless independently
        verified.
      </Disclaimer>
    </div>
  );
}

function daysSince(iso: string): number {
  const then = Date.parse(iso + "T00:00:00Z");
  const now = Date.parse(todayISO() + "T00:00:00Z");
  return Math.max(0, Math.round((now - then) / (1000 * 60 * 60 * 24)));
}
