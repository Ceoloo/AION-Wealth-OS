"use client";

import { CircleCheck, ListChecks } from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { ActionCard } from "@/components/ActionCard";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, Note, PageHeader, PageLoading, Section } from "@/components/app/primitives";

export default function PlanPage() {
  const { ready, hasData, bundle, plan } = useApp();
  if (!ready) return <PageLoading />;

  if (!hasData) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="My Plan" />
        <EmptyState
          icon={ListChecks}
          title="No plan yet"
          body="Add your financial snapshot (or load the demo) and a sequenced 30-day plan appears here."
        />
      </div>
    );
  }

  const completedEvents = bundle.actionEvents
    .filter((e) => e.type === "completed_user_reported" || e.type === "completed_verified")
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="My Plan"
        description="Sequenced 30-day plan. Priorities recompute as your facts change; completed work is kept."
        actions={
          <Badge variant="muted" className="figure">
            {plan.progress.completed} / {plan.progress.total} complete
          </Badge>
        }
      />

      <div className="space-y-8">
        <div className="space-y-3">
          {plan.thirtyDayPlan.map((a) => (
            <ActionCard key={a.actionId} action={a} rank={a.priorityRank} />
          ))}
        </div>

        {plan.archivedCompletions.length > 0 ? (
          <Section
            title="Resolved earlier"
            description="Completed steps that no longer apply. Kept so your history — and your progress denominator — stay honest."
          >
            <Card className="gap-0 py-0">
              <ul className="divide-y divide-border">
                {plan.archivedCompletions.map((a) => (
                  <li key={a.actionId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <CircleCheck className="size-4 shrink-0 text-success" />
                      <span className="truncate">{a.title}</span>
                    </span>
                    <span className="figure shrink-0 text-xs text-subtle">
                      resolved{a.completedAt ? ` · ${a.completedAt.slice(0, 10)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        ) : null}

        <Section title="Completion history" description="Actions taken vs. verified outcomes.">
          {completedEvents.length === 0 ? (
            <EmptyState icon={CircleCheck} title="Nothing completed yet" body="Mark an action done and it shows up here." />
          ) : (
            <Card className="gap-0 py-0">
              <ul className="divide-y divide-border">
                {completedEvents.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0 truncate capitalize">{e.actionId.replace(/_/g, " ")}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="figure text-xs text-subtle">{e.at.slice(0, 10)}</span>
                      <Badge variant={e.type === "completed_verified" ? "success" : "muted"}>
                        {e.type === "completed_verified" ? "verified" : "self-reported"}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Section>

        <Note>
          Recording an action as done reflects what you did — it is not proof of a financial outcome,
          and does not by itself mean a filing or dispute is legally complete.
        </Note>
      </div>
    </div>
  );
}
