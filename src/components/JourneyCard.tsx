"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Check, ChevronDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import {
  SITUATION_LABELS,
  type JourneyAssessment,
  type JourneyStageResult,
  type StageStatus,
} from "@/lib/domain/journey";

/**
 * The journey rail — the product's one signature move.
 *
 * It performs only because it carries state: the track fills to the stage the
 * user's own figures place them in, unknown stages are drawn dashed, and stages
 * this version cannot judge are visibly faded rather than guessed at. Every
 * node is a named condition, never a score.
 */
export function JourneyCard({ journey }: { journey: JourneyAssessment }) {
  const [open, setOpen] = useState(false);

  const currentIndex = journey.stages.findIndex((s) => s.status === "current");
  const provisionalIndex = journey.provisional
    ? journey.stages.findIndex((s) => s.stage === journey.provisional!.stage)
    : -1;
  const lastPassed = journey.stages.reduce((acc, s, i) => (s.status === "passed" ? i : acc), -1);
  // How far the track is filled: to the current stage, else past the last
  // stage that was actually met. A provisional guess never fills the track.
  const fillTo = currentIndex >= 0 ? currentIndex : lastPassed;
  const fillPct = fillTo <= 0 ? (fillTo === 0 ? 0 : -1) : (fillTo / (journey.stages.length - 1)) * 100;

  const headline = headlineFor(journey);

  return (
    <div className="relative rounded-2xl">
      <GlowingEffect spread={40} glow={false} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={1} />
      <div className="relative overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.07] shadow-[inset_0_1px_0_oklch(1_0_0/5%),0_10px_30px_-14px_oklch(0_0_0/55%)]">
        {/* A low wash of brand colour behind the rail — the card's one piece of atmosphere. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_0%_0%,oklch(0.8_0.13_178/10%),transparent)]" />

        <div className="relative p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight text-balance">{headline.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">{headline.body}</p>
            </div>
            {journey.provisional ? (
              <Badge variant="warning" className="shrink-0">
                Your words, not your numbers
              </Badge>
            ) : null}
          </div>

          {/* ---- The rail ---------------------------------------------- */}
          <div className="relative mt-7" role="list" aria-label="Journey stages">
            <div className="absolute inset-x-[calc(100%/12)] top-[15px] h-[2px] rounded-full bg-muted-foreground/20" aria-hidden />
            {fillPct >= 0 ? (
              <motion.div
                aria-hidden
                className="absolute left-[calc(100%/12)] top-[15px] h-[2px] origin-left rounded-full bg-gradient-to-r from-success via-primary to-primary shadow-[0_0_12px_oklch(0.8_0.13_178/60%)]"
                style={{ width: `calc((100% - 100%/6) * ${fillPct / 100})` }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
              />
            ) : null}

            <ol className="relative grid grid-cols-6">
              {journey.stages.map((s, i) => (
                <li key={s.stage} role="listitem" className="flex flex-col items-center text-center">
                  <StageNode stage={s} provisional={i === provisionalIndex && s.status === "unknown"} />
                  <span
                    className={cn(
                      "mt-2 text-[11px] leading-tight font-medium sm:text-xs",
                      s.status === "current" && "text-primary",
                      s.status === "passed" && "text-foreground",
                      (s.status === "upcoming" || s.status === "unknown") && "text-muted-foreground",
                      s.status === "not_assessed" && "text-subtle/70",
                      i === provisionalIndex && s.status === "unknown" && "text-warning",
                    )}
                  >
                    {s.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
          >
            How is this decided?
            <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
          </button>

          {open ? (
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              {journey.stages.map((s) => (
                <div key={s.stage} className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-4">
                  <div className="flex items-center gap-2 sm:block">
                    <p className="text-sm font-medium">{s.label}</p>
                    <Badge variant={toneFor(s.status)} className="sm:mt-1">
                      {statusLabel(s.status)}
                    </Badge>
                  </div>
                  <div className="text-sm">
                    <p className="text-subtle">Checks: {s.gate}</p>
                    <p className="text-muted-foreground">{s.detail}</p>
                  </div>
                </div>
              ))}
              <p className="rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-xs text-muted-foreground">
                {journey.basis} (staging v{journey.version})
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StageNode({ stage, provisional }: { stage: JourneyStageResult; provisional: boolean }) {
  const base = "relative z-10 flex size-8 items-center justify-center rounded-full transition-colors";
  if (provisional) {
    return (
      <span title={stage.detail} className={cn(base, "border-2 border-dashed border-warning/70 bg-warning-surface text-warning")}>
        <HelpCircle className="size-3.5" />
      </span>
    );
  }
  switch (stage.status) {
    case "passed":
      return (
        <span title={stage.detail} className={cn(base, "bg-success text-background")}>
          <Check className="size-4" strokeWidth={3} />
        </span>
      );
    case "current":
      return (
        <span title={stage.detail} className={cn(base, "bg-background ring-2 ring-primary")}>
          <motion.span
            className="absolute inset-0 rounded-full bg-primary/25"
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", delay: 1 }}
          />
          <span className="size-2.5 rounded-full bg-primary shadow-[0_0_10px_oklch(0.8_0.13_178)]" />
        </span>
      );
    case "unknown":
      return (
        <span title={stage.detail} className={cn(base, "border-2 border-dashed border-muted-foreground/50 bg-background text-muted-foreground")}>
          <HelpCircle className="size-3.5" />
        </span>
      );
    case "upcoming":
      return <span title={stage.detail} className={cn(base, "border-2 border-muted-foreground/40 bg-card")} />;
    case "not_assessed":
    default:
      return <span title={stage.detail} className={cn(base, "border-[1.5px] border-dashed border-muted-foreground/35 bg-card")} />;
  }
}

function headlineFor(journey: JourneyAssessment): { title: string; body: string } {
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
}

function statusLabel(status: StageStatus): string {
  switch (status) {
    case "passed":
      return "Met";
    case "current":
      return "Working on this";
    case "upcoming":
      return "Later";
    case "unknown":
      return "Not enough information";
    case "not_assessed":
    default:
      return "Not assessed in this version";
  }
}

function toneFor(status: StageStatus): "success" | "brand" | "warning" | "muted" {
  switch (status) {
    case "passed":
      return "success";
    case "current":
      return "brand";
    case "unknown":
      return "warning";
    default:
      return "muted";
  }
}
