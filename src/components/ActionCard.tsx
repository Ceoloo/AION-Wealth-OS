"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock,
  ExternalLink,
  LifeBuoy,
  Play,
  RotateCcw,
} from "lucide-react";
import type { ActionEventType, PlanAction } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { statusLabel, statusTone, categoryLabel } from "./format";
import { formatCents } from "@/lib/domain/money";
import { CONTENT_SOURCES } from "@/lib/domain/sources";
import { useApp } from "@/lib/store/provider";

export function ActionCard({ action, rank }: { action: PlanAction; rank?: number }) {
  const { actionEvent } = useApp();
  const [open, setOpen] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [deferring, setDeferring] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<ActionEventType | null>(null);

  const complete = action.status === "complete";

  // Every write reports its outcome. A failed save must never look like it
  // worked — the previous card dropped these results on the floor.
  async function record(type: ActionEventType, extra: { reason?: string } = {}) {
    setPending(type);
    const res = await actionEvent({
      actionId: action.actionId,
      ruleId: action.ruleId,
      type,
      occurrenceKey: action.occurrenceKey,
      ...extra,
    });
    setPending(null);
    if (!res.ok) {
      toast.error("That wasn't saved", { description: res.error });
      return false;
    }
    if (type === "completed_user_reported") toast.success("Recorded as done", { description: action.title });
    return true;
  }

  const sources = action.sourceIds.map((id) => CONTENT_SOURCES[id]).filter(Boolean);

  return (
    <Card className={cn("gap-0 py-0 transition-shadow", complete && "bg-card/70")}>
      <CardContent className="space-y-4 py-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          {rank ? (
            <span className="figure flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-surface text-sm font-semibold text-primary">
              {rank}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="muted">{categoryLabel(action.category)}</Badge>
              <Badge variant={statusTone(action.status)}>{statusLabel(action.status)}</Badge>
              {action.issueState === "active" && complete ? <Badge variant="warning">Issue still open</Badge> : null}
              {action.priorCompletions > 0 ? (
                <Badge variant="muted" className="figure">{action.priorCompletions}× done before</Badge>
              ) : null}
            </div>
            <h3 className={cn("mt-2 text-base font-semibold tracking-tight text-balance", complete && "text-muted-foreground")}>
              {action.title}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">{action.why}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5" />
                <span className="figure">~{action.effortMinutes} min</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CircleDollarSign className="size-3.5" />
                {action.verifiedCostCents !== null ? (
                  <span className="figure">Verified cost: {formatCents(action.verifiedCostCents)}</span>
                ) : (
                  <span>Cost: unknown/none verified</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Teach-back */}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          <BookOpen className="size-4" />
          {open ? "Hide details" : "Learn about this step"}
          <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
        </button>

        {open ? (
          <div className="space-y-4 rounded-xl border border-border bg-secondary/30 p-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-3">
              <TeachSection title="What it means" body={action.teachBack.whatItMeans} />
              <TeachSection title="Why it matters" body={action.teachBack.whyItMatters} />
              <TeachSection title="What to do" body={action.teachBack.whatToDo} />
            </dl>

            <div>
              <p className="font-medium">Steps</p>
              <ol className="mt-2 space-y-2">
                {action.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-muted-foreground">
                    <span className="figure mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground">
                      {i + 1}
                    </span>
                    <span className="text-pretty">{s}</span>
                  </li>
                ))}
              </ol>
            </div>

            <TeachSection title="How to know it's complete" body={action.teachBack.howToKnowComplete} />

            {action.supportingInputs.length > 0 ? (
              <p className="text-xs text-subtle">Based on: {action.supportingInputs.join(", ")}</p>
            ) : null}

            {sources.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-subtle">Sources:</span>
                {sources.map((s, i) => (
                  <a
                    key={i}
                    href={s!.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline"
                  >
                    {s!.publisher}
                    <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            ) : null}

            <div className="flex gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
              <LifeBuoy className="mt-px size-3.5 shrink-0 text-info" />
              <p>
                <span className="font-medium text-foreground">When to get help:</span> {action.escalation}
              </p>
            </div>

            {/* Comprehension check */}
            {!showCheck ? (
              <button
                onClick={() => setShowCheck(true)}
                className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
              >
                Quick check →
              </button>
            ) : (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="font-medium text-pretty">{action.teachBack.comprehensionCheck.question}</p>
                <div className="mt-3 space-y-2">
                  {action.teachBack.comprehensionCheck.options.map((opt, i) => {
                    const correct = i === action.teachBack.comprehensionCheck.correctIndex;
                    const answered = picked !== null;
                    return (
                      <button
                        key={i}
                        onClick={() => setPicked(i)}
                        disabled={answered}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                          !answered && "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                          answered && correct && "border-success/40 bg-success-surface text-success",
                          answered && !correct && picked === i && "border-danger/40 bg-danger-surface text-danger",
                          answered && !correct && picked !== i && "border-border text-subtle",
                        )}
                      >
                        {opt}
                        {answered && correct ? <Check className="size-4 shrink-0" /> : null}
                      </button>
                    );
                  })}
                </div>
                {picked !== null ? (
                  <p className="mt-3 text-sm text-muted-foreground">{action.teachBack.comprehensionCheck.explanation}</p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {/* Actions */}
        {!complete ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button disabled={pending !== null} onClick={() => record("completed_user_reported")}>
              <Check data-icon="inline-start" />
              {pending === "completed_user_reported" ? "Saving…" : "Mark done (self-reported)"}
            </Button>
            <div className="flex gap-2">
              {action.status === "needs_attention" || action.status === "insufficient_information" ? (
                <Button variant="secondary" className="flex-1 sm:flex-none" disabled={pending !== null} onClick={() => record("started")}>
                  <Play data-icon="inline-start" />
                  Start
                </Button>
              ) : null}
              <Button
                variant="ghost"
                className="flex-1 sm:flex-none"
                aria-expanded={deferring}
                onClick={() => setDeferring((d) => !d)}
              >
                Skip / defer
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-success/20 bg-success-surface px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm text-success">
              <Check className="mt-0.5 size-4 shrink-0" />
              {action.issueState === "active"
                ? "You recorded this as done. The underlying issue is still open — it will reappear if new facts arise."
                : "Recorded as user-reported complete."}
            </p>
            <Button variant="ghost" size="sm" disabled={pending !== null} onClick={() => record("reopened")}>
              <RotateCcw data-icon="inline-start" />
              Reopen
            </Button>
          </div>
        )}

        {deferring ? (
          <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4">
            <div className="space-y-1.5">
              <Label htmlFor={`reason-${action.actionId}`}>Reason (required)</Label>
              <Input
                id={`reason-${action.actionId}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Doing this next week"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={!reason.trim() || pending !== null}
                onClick={async () => {
                  if (await record("deferred", { reason: reason.trim() })) {
                    setDeferring(false);
                    setReason("");
                  }
                }}
              >
                Defer
              </Button>
              <Button
                variant="ghost"
                disabled={!reason.trim() || pending !== null}
                onClick={async () => {
                  if (await record("skipped", { reason: reason.trim() })) {
                    setDeferring(false);
                    setReason("");
                  }
                }}
              >
                Skip
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TeachSection({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <dt className="font-medium">{title}</dt>
      <dd className="mt-0.5 text-muted-foreground text-pretty">{body}</dd>
    </div>
  );
}
