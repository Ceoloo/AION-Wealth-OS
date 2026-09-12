"use client";

import type { FinanceSummary, Metric, Completeness } from "@/lib/domain/finance";
import { formatCents } from "@/lib/domain/money";
import { Badge, Card } from "./ui";

function completenessBadge(c: Completeness) {
  const tone = c === "complete" ? "ok" : c === "partial" ? "warn" : "neutral";
  const label = c === "complete" ? "complete" : c === "partial" ? "partial data" : "missing";
  return <Badge tone={tone}>{label}</Badge>;
}

function MetricTile({
  label,
  metric,
  render,
}: {
  label: string;
  metric: Metric<number>;
  render: (v: number) => string;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-cloud-faint">{label}</p>
        {completenessBadge(metric.completeness)}
      </div>
      <p className="mt-1 text-lg font-semibold text-cloud">
        {metric.value === null ? "Unavailable" : render(metric.value)}
      </p>
      {metric.missingInputs.length > 0 ? (
        <p className="mt-0.5 text-[11px] text-cloud-faint">
          Missing: {metric.missingInputs.join(", ")}
        </p>
      ) : null}
      {metric.assumptions.map((a, i) => (
        <p key={i} className="mt-0.5 text-[11px] text-cloud-faint">
          {a}
        </p>
      ))}
    </Card>
  );
}

export function Metrics({ summary }: { summary: FinanceSummary }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <MetricTile label="Monthly surplus" metric={summary.surplus} render={(v) => formatCents(v)} />
      <MetricTile label="Net worth" metric={summary.netWorth} render={(v) => formatCents(v)} />
      <MetricTile
        label="Cash coverage"
        metric={summary.cashCoverage}
        render={(v) => `${v} month(s)`}
      />
      <MetricTile
        label="Revolving utilization"
        metric={summary.utilization}
        render={(v) => `${Math.round(v * 100)}%`}
      />
      {summary.doubleCount.notes.length > 0 ? (
        <Card className="border-warn/40 bg-warn/5 sm:col-span-2">
          <p className="text-xs font-medium text-warn">Data checks</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-cloud-muted">
            {summary.doubleCount.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
