"use client";

import { useApp } from "@/lib/store/provider";
import { ActionCard } from "@/components/ActionCard";
import { Card, Disclaimer, EmptyState, SectionTitle } from "@/components/ui";

export default function PlanPage() {
  const { ready, hasData, bundle, plan } = useApp();
  if (!ready) return <p className="text-sm text-cloud-faint">Loading…</p>;

  if (!hasData) {
    return (
      <EmptyState
        title="No plan yet"
        body="Add your financial snapshot (or load the demo) and a sequenced 30-day plan appears here."
      />
    );
  }

  const completedEvents = bundle.actionEvents
    .filter((e) => e.type === "completed_user_reported" || e.type === "completed_verified")
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-cloud">My Plan</h1>
        <p className="text-sm text-cloud-muted">
          Sequenced 30-day plan. Priorities recompute as your facts change; completed work is kept.
        </p>
      </div>

      <div className="space-y-3">
        {plan.thirtyDayPlan.map((a) => (
          <ActionCard key={a.actionId} action={a} rank={a.priorityRank} />
        ))}
      </div>

      {plan.archivedCompletions.length > 0 ? (
        <div>
          <SectionTitle
            title="Resolved earlier"
            subtitle="Completed steps that no longer apply. Kept so your history — and your progress denominator — stay honest."
          />
          <Card className="divide-y divide-ink-line p-0">
            {plan.archivedCompletions.map((a) => (
              <div key={a.actionId} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="text-cloud">{a.title}</span>
                <span className="shrink-0 text-xs text-ok">
                  resolved{a.completedAt ? ` · ${a.completedAt.slice(0, 10)}` : ""}
                </span>
              </div>
            ))}
          </Card>
        </div>
      ) : null}

      <div>
        <SectionTitle title="Completion history" subtitle="Actions taken vs. verified outcomes." />
        {completedEvents.length === 0 ? (
          <EmptyState title="Nothing completed yet" body="Mark an action done and it shows up here." />
        ) : (
          <Card className="divide-y divide-ink-line p-0">
            {completedEvents.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-cloud">{e.actionId.replace(/_/g, " ")}</span>
                <span className="text-xs text-cloud-faint">
                  {e.at.slice(0, 10)} ·{" "}
                  {e.type === "completed_verified" ? "verified" : "self-reported"}
                </span>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Disclaimer>
        Recording an action as done reflects what you did — it is not proof of a financial outcome,
        and does not by itself mean a filing or dispute is legally complete.
      </Disclaimer>
    </div>
  );
}
