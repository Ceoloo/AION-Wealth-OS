"use client";

import { CreditCard, Landmark, PiggyBank, TrendingUp, TriangleAlert, type LucideIcon } from "lucide-react";
import type { FinanceSummary, Metric, Completeness } from "@/lib/domain/finance";
import { formatCents } from "@/lib/domain/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Full-detail figures. Unlike the dashboard strip, every assumption and every
 * missing input is printed here — this is where the user checks our working.
 */
/**
 * A negative surplus is a fact the plan acts on first, so every screen shows
 * it the same way — the rule the engine uses to prioritize stabilization.
 */
export function surplusClassName(surplus: Metric<number>): string | undefined {
  return surplus.value !== null && surplus.value < 0 ? "text-danger" : undefined;
}

function completenessBadge(c: Completeness) {
  if (c === "complete") return <Badge variant="success">Complete</Badge>;
  if (c === "partial") return <Badge variant="warning">Partial data</Badge>;
  return <Badge variant="muted">Missing</Badge>;
}

function MetricTile({
  icon: Icon,
  label,
  metric,
  render,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  metric: Metric<number>;
  render: (v: number) => string;
  valueClassName?: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Icon className="size-3.5 text-subtle" />
            {label}
          </p>
          {completenessBadge(metric.completeness)}
        </div>
        <p className={cn("figure text-2xl font-semibold tracking-tight", metric.value === null && "text-lg font-medium text-subtle", valueClassName)}>
          {metric.value === null ? "Unavailable" : render(metric.value)}
        </p>
        {metric.missingInputs.length > 0 || metric.assumptions.length > 0 ? (
          <ul className="space-y-1 border-t border-border pt-3 text-xs text-subtle">
            {metric.missingInputs.length > 0 ? (
              <li className="text-warning">Missing: {metric.missingInputs.join(", ")}</li>
            ) : null}
            {metric.assumptions.map((a, i) => (
              <li key={i} className="text-pretty">{a}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function Metrics({ summary }: { summary: FinanceSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <MetricTile
        icon={TrendingUp}
        label="Monthly surplus"
        metric={summary.surplus}
        render={(v) => formatCents(v)}
        valueClassName={surplusClassName(summary.surplus)}
      />
      <MetricTile icon={Landmark} label="Net worth" metric={summary.netWorth} render={(v) => formatCents(v)} />
      <MetricTile icon={PiggyBank} label="Cash coverage" metric={summary.cashCoverage} render={(v) => `${v} month(s)`} />
      <MetricTile
        icon={CreditCard}
        label="Revolving utilization"
        metric={summary.utilization}
        render={(v) => `${Math.round(v * 100)}%`}
      />
      {summary.doubleCount.notes.length > 0 ? (
        <div className="flex gap-3 rounded-2xl border border-warning/25 bg-warning-surface p-4 sm:col-span-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-medium text-warning">Data checks</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              {summary.doubleCount.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
