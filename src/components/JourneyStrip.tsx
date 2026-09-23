"use client";

import { useState } from "react";
import { Badge, Card, cn } from "./ui";
import { SITUATION_LABELS, type JourneyAssessment, type StageStatus } from "@/lib/domain/journey";

/**
 * Shows where the user stands on the journey. Deliberately NOT a score: every
 * marker is a named condition with the user's own figures behind it, and a
 * stage we cannot judge says so rather than guessing.
 */
export function JourneyStrip({ journey }: { journey: JourneyAssessment }) {
  const [open, setOpen] = useState(false);

  const headline = (() => {
    if (journey.currentStage !== null) {
      const s = journey.stages.find((x) => x.stage === journey.currentStage)!;
      return { title: `You're in ${s.label}`, body: s.goal };
    }
    if (journey.allAssessedPassed) {
      return {
        title: "Every stage we assess is clear",
        body: "Stabilize, Repair and Build are all met. Later stages aren't assessed in this version.",
      };
    }
    if (journey.provisional) {
      const s = journey.stages.find((x) => x.stage === journey.provisional!.stage)!;
      return {
        title: `Probably ${s.label} — by your own description`,
        body: `You told us: "${SITUATION_LABELS[journey.provisional.situation]}". Add your figures and this is computed instead of assumed.`,
      };
    }
    return {
      title: "Not placed yet",
      body: "Add your income, spending and cash and your stage is computed from those figures.",
    };
  })();

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-cloud-faint">Your journey</p>
          <h2 className="mt-0.5 font-semibold text-cloud">{headline.title}</h2>
          <p className="mt-0.5 text-sm text-cloud-muted">{headline.body}</p>
        </div>
        {journey.provisional ? <Badge tone="warn">Your words, not your numbers</Badge> : null}
      </div>

      <ol className="flex flex-wrap gap-1.5">
        {journey.stages.map((s) => (
          <li key={s.stage}>
            <span
              className={cn(
                "inline-block rounded-full border px-2 py-0.5 text-xs",
                // Only an undecided stage can carry the provisional styling; a
                // stage computed from real figures always shows its own status.
                stageClass(s.status, journey.provisional?.stage === s.stage && s.status === "unknown"),
              )}
              title={s.detail}
            >
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-teal hover:underline"
        aria-expanded={open}
      >
        {open ? "Hide how this is decided" : "How is this decided?"}
      </button>

      {open ? (
        <div className="space-y-2 border-t border-ink-line pt-3">
          {journey.stages.map((s) => (
            <div key={s.stage} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-cloud">{s.label}</span>
                <Badge tone={statusTone(s.status)}>{statusLabel(s.status)}</Badge>
              </div>
              <p className="text-xs text-cloud-faint">Checks: {s.gate}</p>
              <p className="text-xs text-cloud-muted">{s.detail}</p>
            </div>
          ))}
          <p className="rounded-lg border border-ink-line bg-ink-soft px-2 py-1.5 text-xs text-cloud-faint">
            {journey.basis} (staging v{journey.version})
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function stageClass(status: StageStatus, isProvisional: boolean): string {
  if (isProvisional) return "border-warn/50 bg-warn/10 text-warn";
  switch (status) {
    case "passed":
      return "border-ok/50 bg-ok/10 text-ok";
    case "current":
      return "border-teal/60 bg-teal/15 font-semibold text-teal";
    case "upcoming":
      return "border-ink-line text-cloud-muted";
    case "unknown":
      return "border-ink-line border-dashed text-cloud-faint";
    case "not_assessed":
    default:
      return "border-ink-line border-dashed text-cloud-faint opacity-60";
  }
}

function statusLabel(status: StageStatus): string {
  switch (status) {
    case "passed":
      return "met";
    case "current":
      return "working on this";
    case "upcoming":
      return "later";
    case "unknown":
      return "not enough information";
    case "not_assessed":
    default:
      return "not assessed in this version";
  }
}

function statusTone(status: StageStatus): "ok" | "teal" | "neutral" | "warn" {
  switch (status) {
    case "passed":
      return "ok";
    case "current":
      return "teal";
    case "unknown":
      return "warn";
    default:
      return "neutral";
  }
}
