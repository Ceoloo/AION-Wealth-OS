"use client";

import { Badge, Card, Disclaimer, SectionTitle } from "./ui";
import { formatCents } from "@/lib/domain/money";
import type { FigureChange, WeeklyBrief } from "@/lib/domain/brief";

/**
 * Renders the deterministic weekly brief. No model wrote any of this text —
 * every line comes from the user's own records, and anything that could not be
 * computed says so rather than being filled in.
 */
export function WeeklyBriefCard({ brief }: { brief: WeeklyBrief }) {
  return (
    <div className="space-y-3">
      <SectionTitle
        title="Your week"
        subtitle={`${brief.periodStart} to ${brief.periodEnd}`}
      />

      <Card>
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-cloud">{brief.headline}</p>
          <Badge tone="neutral" className="shrink-0 whitespace-nowrap">
            Not AI
          </Badge>
        </div>
        {brief.quiet ? (
          <p className="mt-1 text-sm text-cloud-muted">
            Nothing to report isn&apos;t a failure. It&apos;s what the records show.
          </p>
        ) : null}
      </Card>

      {brief.overdue.length > 0 ? (
        <Card className="border-warn/40 bg-warn/5">
          <p className="text-sm font-medium text-warn">Needs attention</p>
          <ul className="mt-1 space-y-1 text-sm text-cloud-muted">
            {brief.overdue.map((t, i) => (
              <li key={i}>• {t}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {brief.dueSoon.length > 0 ? (
        <Card>
          <p className="text-sm font-medium text-cloud">Coming up</p>
          <ul className="mt-1 space-y-1 text-sm text-cloud-muted">
            {brief.dueSoon.map((t, i) => (
              <li key={i}>• {t}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <p className="text-sm font-medium text-cloud">What you recorded</p>
        {brief.recorded.length === 0 ? (
          <p className="mt-1 text-sm text-cloud-faint">Nothing recorded in this period.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm text-cloud-muted">
            {brief.recorded.map((t, i) => (
              <li key={i}>• {t}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <p className="text-sm font-medium text-cloud">How your figures compare</p>
        {brief.comparisonNote ? (
          <p className="mt-1 text-sm text-cloud-faint">{brief.comparisonNote}</p>
        ) : (
          <>
            <p className="mt-0.5 text-xs text-cloud-faint">
              {brief.comparedFrom} → {brief.comparedTo}
            </p>
            {brief.comparisonBasis ? (
              <p className="text-xs text-cloud-faint">{brief.comparisonBasis}</p>
            ) : null}
            <div className="mt-2 divide-y divide-ink-line">
              {brief.figureChanges.map((c) => (
                <ChangeRow key={c.key} change={c} />
              ))}
            </div>
          </>
        )}
      </Card>

      {brief.stillUnknown.length > 0 ? (
        <Card>
          <p className="text-sm font-medium text-cloud">Still unknown</p>
          <p className="text-xs text-cloud-faint">
            These are holding up a stage. Filling them in is what moves it.
          </p>
          <ul className="mt-1 space-y-1 text-sm text-cloud-muted">
            {brief.stillUnknown.map((t, i) => (
              <li key={i}>• {t}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Disclaimer>
        {brief.basis} (brief v{brief.version})
      </Disclaimer>
    </div>
  );
}

function ChangeRow({ change: c }: { change: FigureChange }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="min-w-0 truncate text-sm text-cloud-muted">{c.label}</span>
      <span className="shrink-0 text-right">
        {c.deltaCents === null ? (
          <span className="text-xs text-cloud-faint" title={c.note ?? undefined}>
            not comparable
          </span>
        ) : (
          <>
            <span className="text-sm text-cloud">
              {formatCents(c.beforeCents)} → {formatCents(c.afterCents)}
            </span>
            {c.direction !== "same" ? (
              <span className="ml-2 text-xs text-cloud-faint">
                {c.deltaCents > 0 ? "+" : "−"}
                {formatCents(Math.abs(c.deltaCents))}
              </span>
            ) : (
              <span className="ml-2 text-xs text-cloud-faint">no change</span>
            )}
          </>
        )}
      </span>
    </div>
  );
}
