import Link from "next/link";
import { ArrowRight, CreditCard, Landmark, PiggyBank, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/domain/money";
import type { FinanceSummary, Metric } from "@/lib/domain/finance";
import { surplusClassName } from "@/components/Metrics";

/**
 * The four figures the plan is built on. Each tile states its own
 * completeness in plain words, because a figure computed from partial data is
 * an estimate and must not look like a fact. Full assumptions live on the
 * Money screen.
 */
export function KeyFigures({ summary, className }: { summary: FinanceSummary; className?: string }) {
  const surplus = summary.surplus;
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-base font-semibold tracking-tight">Where your money stands</h2>
        <Link
          href="/finances"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          Details
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FigureTile
          icon={TrendingUp}
          label="Monthly surplus"
          metric={surplus}
          render={(v) => formatCents(v)}
          valueClassName={surplusClassName(surplus)}
          hint="Add your income and spending"
        />
        <FigureTile
          icon={PiggyBank}
          label="Cash cushion"
          metric={summary.cashCoverage}
          render={(v) => `${v} mo`}
          hint="Add your cash and essential costs"
        />
        <FigureTile
          icon={CreditCard}
          label="Utilization"
          metric={summary.utilization}
          render={(v) => `${Math.round(v * 100)}%`}
          hint="Add a card with its balance and limit"
          note="Estimate, not the bureau's figure"
        />
        <FigureTile
          icon={Landmark}
          label="Net worth"
          metric={summary.netWorth}
          render={(v) => formatCents(v)}
          hint="Add your assets and liabilities"
        />
      </div>
    </div>
  );
}

function FigureTile({
  icon: Icon,
  label,
  metric,
  render,
  hint,
  note,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  metric: Metric<number>;
  render: (v: number) => string;
  hint: string;
  note?: string;
  valueClassName?: string;
}) {
  const status =
    metric.value === null
      ? { text: hint, className: "text-subtle" }
      : metric.completeness === "partial"
        ? { text: "Estimate — some figures missing", className: "text-warning" }
        : note
          ? { text: note, className: "text-subtle" }
          : null;

  return (
    <div className="flex min-h-[7.5rem] flex-col justify-between rounded-2xl bg-card p-4 ring-1 ring-foreground/[0.07] shadow-[inset_0_1px_0_oklch(1_0_0/5%),0_10px_30px_-14px_oklch(0_0_0/55%)]">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 text-subtle" />
        {label}
      </div>
      <div className="mt-3">
        {metric.value === null ? (
          <p className="text-lg font-medium text-subtle">Not enough data</p>
        ) : (
          <p className={cn("figure text-xl font-semibold tracking-tight sm:text-2xl", valueClassName)}>
            {render(metric.value)}
          </p>
        )}
        {status ? <p className={cn("mt-1 text-[11px] leading-snug sm:text-xs", status.className)}>{status.text}</p> : null}
      </div>
    </div>
  );
}
