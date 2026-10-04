"use client";

import { CalendarClock, CircleAlert, ClipboardList, HelpCircle, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Money, Note } from "@/components/app/primitives";
import type { FigureChange, WeeklyBrief } from "@/lib/domain/brief";
import { formatCents } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

/**
 * Renders the deterministic weekly brief. No model wrote any of this text —
 * every line comes from the user's own records, and anything that could not be
 * computed says so rather than being filled in.
 */
export function WeeklyBriefCard({ brief }: { brief: WeeklyBrief }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <p className="figure text-xs font-medium text-muted-foreground">
              {brief.periodStart} to {brief.periodEnd}
            </p>
            <Badge variant="muted" className="shrink-0">Not AI</Badge>
          </div>
          <p className="text-lg font-semibold tracking-tight text-balance">{brief.headline}</p>
          {brief.quiet ? (
            <p className="text-sm text-muted-foreground">
              Nothing to report isn&apos;t a failure. It&apos;s what the records show.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {brief.overdue.length > 0 ? (
          <BriefList icon={CircleAlert} title="Needs attention" items={brief.overdue} tone="warning" />
        ) : null}
        {brief.dueSoon.length > 0 ? <BriefList icon={CalendarClock} title="Coming up" items={brief.dueSoon} /> : null}
        <BriefList icon={ClipboardList} title="What you recorded" items={brief.recorded} empty="Nothing recorded in this period." />
        {brief.stillUnknown.length > 0 ? (
          <BriefList
            icon={HelpCircle}
            title="Still unknown"
            description="These are holding up a stage. Filling them in is what moves it."
            items={brief.stillUnknown}
          />
        ) : null}
      </div>

      <Card>
        <CardContent className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Scale className="size-4 text-subtle" />
            How your figures compare
          </p>
          {brief.comparisonNote ? (
            <p className="text-sm text-muted-foreground">{brief.comparisonNote}</p>
          ) : (
            <>
              <div className="text-xs text-subtle">
                <p className="figure">
                  {brief.comparedFrom} → {brief.comparedTo}
                </p>
                {brief.comparisonBasis ? <p>{brief.comparisonBasis}</p> : null}
              </div>
              <ul className="divide-y divide-border">
                {brief.figureChanges.map((c) => (
                  <ChangeRow key={c.key} change={c} />
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Note>
        {brief.basis} (brief v{brief.version})
      </Note>
    </div>
  );
}

function BriefList({
  icon: Icon,
  title,
  description,
  items,
  empty,
  tone,
}: {
  icon: typeof CircleAlert;
  title: string;
  description?: string;
  items: string[];
  empty?: string;
  tone?: "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl p-5 ring-1",
        tone === "warning" ? "bg-warning-surface ring-warning/25" : "bg-card ring-foreground/[0.07]",
      )}
    >
      <p className={cn("flex items-center gap-2 text-sm font-semibold", tone === "warning" && "text-warning")}>
        <Icon className="size-4" />
        {title}
      </p>
      {description ? <p className="mt-0.5 text-xs text-subtle">{description}</p> : null}
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-subtle">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((t, i) => (
            <li key={i} className="text-sm text-muted-foreground text-pretty">
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChangeRow({ change: c }: { change: FigureChange }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0 truncate text-sm text-muted-foreground">{c.label}</span>
      {c.deltaCents === null ? (
        <span className="shrink-0 text-xs text-subtle" title={c.note ?? undefined}>
          not comparable
        </span>
      ) : (
        <span className="flex shrink-0 items-baseline gap-2.5 text-right">
          <span className="text-sm">
            <Money cents={c.beforeCents} className="text-subtle" /> → <Money cents={c.afterCents} />
          </span>
          <span className="figure w-20 text-xs text-muted-foreground">
            {c.direction === "same" ? "no change" : `${c.deltaCents > 0 ? "+" : "−"}${formatCents(Math.abs(c.deltaCents))}`}
          </span>
        </span>
      )}
    </li>
  );
}
