"use client";

import React, { useState } from "react";
import type { PlanAction } from "@/lib/domain/types";
import { Badge, Button, Card, cn } from "./ui";
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

  const complete = action.status === "complete";

  return (
    <Card className={cn(complete && "opacity-80")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {rank ? (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal/20 text-xs font-bold text-teal">
                {rank}
              </span>
            ) : null}
            <Badge tone="neutral">{categoryLabel(action.category)}</Badge>
            <Badge tone={statusTone(action.status)}>{statusLabel(action.status)}</Badge>
            {action.issueState === "active" && complete ? (
              <Badge tone="warn">Issue still open</Badge>
            ) : null}
            {action.priorCompletions > 0 ? (
              <Badge tone="neutral">
                {action.priorCompletions}× done before
              </Badge>
            ) : null}
          </div>
          <h3 className="mt-2 font-semibold text-cloud">{action.title}</h3>
          <p className="mt-1 text-sm text-cloud-muted">{action.why}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-xs text-cloud-faint">
        <span>~{action.effortMinutes} min</span>
        {action.verifiedCostCents !== null ? (
          <span>Verified cost: {formatCents(action.verifiedCostCents)}</span>
        ) : (
          <span>Cost: unknown/none verified</span>
        )}
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-3 text-sm font-medium text-teal hover:underline"
        aria-expanded={open}
      >
        {open ? "Hide details" : "Learn about this step"}
      </button>

      {open ? (
        <div className="mt-3 space-y-3 border-t border-ink-line pt-3 text-sm">
          <TeachSection title="What it means" body={action.teachBack.whatItMeans} />
          <TeachSection title="Why it matters" body={action.teachBack.whyItMatters} />
          <TeachSection title="What to do" body={action.teachBack.whatToDo} />
          <div>
            <p className="font-medium text-cloud">Steps</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-cloud-muted">
              {action.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
          <TeachSection title="How to know it's complete" body={action.teachBack.howToKnowComplete} />

          {action.supportingInputs.length > 0 ? (
            <p className="text-xs text-cloud-faint">
              Based on: {action.supportingInputs.join(", ")}
            </p>
          ) : null}

          {action.sourceIds.length > 0 ? (
            <div className="text-xs text-cloud-faint">
              Sources:{" "}
              {action.sourceIds
                .map((id) => CONTENT_SOURCES[id])
                .filter(Boolean)
                .map((s, i) => (
                  <a
                    key={i}
                    href={s!.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal underline"
                  >
                    {s!.publisher}
                    {i < action.sourceIds.length - 1 ? ", " : ""}
                  </a>
                ))}
            </div>
          ) : null}

          <p className="rounded-lg border border-ink-line bg-ink-soft px-2 py-1.5 text-xs text-cloud-faint">
            When to get help: {action.escalation}
          </p>

          {/* Comprehension check */}
          {!showCheck ? (
            <button
              onClick={() => setShowCheck(true)}
              className="text-sm font-medium text-teal hover:underline"
            >
              Quick check →
            </button>
          ) : (
            <div className="rounded-lg border border-ink-line bg-ink-soft p-3">
              <p className="text-sm font-medium text-cloud">
                {action.teachBack.comprehensionCheck.question}
              </p>
              <div className="mt-2 space-y-1">
                {action.teachBack.comprehensionCheck.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => setPicked(i)}
                    className={cn(
                      "block w-full rounded-lg border px-3 py-2 text-left text-sm",
                      picked === null
                        ? "border-ink-line text-cloud-muted hover:border-teal"
                        : i === action.teachBack.comprehensionCheck.correctIndex
                          ? "border-ok/50 bg-ok/10 text-ok"
                          : picked === i
                            ? "border-danger/50 bg-danger/10 text-danger"
                            : "border-ink-line text-cloud-faint",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {picked !== null ? (
                <p className="mt-2 text-xs text-cloud-muted">
                  {action.teachBack.comprehensionCheck.explanation}
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {/* Action controls */}
      {!complete ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() =>
              actionEvent({
                actionId: action.actionId,
                ruleId: action.ruleId,
                type: "completed_user_reported",
                occurrenceKey: action.occurrenceKey,
              })
            }
          >
            Mark done (self-reported)
          </Button>
          {action.status === "needs_attention" || action.status === "insufficient_information" ? (
            <Button
              variant="secondary"
              onClick={() =>
                actionEvent({
                  actionId: action.actionId,
                  ruleId: action.ruleId,
                  type: "started",
                  occurrenceKey: action.occurrenceKey,
                })
              }
            >
              Start
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => setDeferring((d) => !d)}>
            Skip / defer
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-ok">
            {action.issueState === "active"
              ? "You recorded this as done. The underlying issue is still open — it will reappear if new facts arise."
              : "Recorded as user-reported complete."}
          </span>
          <Button
            variant="ghost"
            onClick={() =>
              actionEvent({
                actionId: action.actionId,
                ruleId: action.ruleId,
                type: "reopened",
                occurrenceKey: action.occurrenceKey,
              })
            }
          >
            Reopen
          </Button>
        </div>
      )}

      {deferring ? (
        <div className="mt-3 rounded-lg border border-ink-line bg-ink-soft p-3">
          <label className="block text-sm text-cloud">
            Reason (required)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-sm text-cloud"
              placeholder="e.g. Doing this next week"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <Button
              variant="secondary"
              disabled={!reason.trim()}
              onClick={() => {
                actionEvent({
                  actionId: action.actionId,
                  ruleId: action.ruleId,
                  type: "deferred",
                  reason: reason.trim(),
                  occurrenceKey: action.occurrenceKey,
                });
                setDeferring(false);
                setReason("");
              }}
            >
              Defer
            </Button>
            <Button
              variant="ghost"
              disabled={!reason.trim()}
              onClick={() => {
                actionEvent({
                  actionId: action.actionId,
                  ruleId: action.ruleId,
                  type: "skipped",
                  reason: reason.trim(),
                  occurrenceKey: action.occurrenceKey,
                });
                setDeferring(false);
                setReason("");
              }}
            >
              Skip
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function TeachSection({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="font-medium text-cloud">{title}</p>
      <p className="mt-0.5 text-cloud-muted">{body}</p>
    </div>
  );
}
