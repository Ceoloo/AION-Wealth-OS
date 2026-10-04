"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, ExternalLink, Landmark, MapPin, Scale, TriangleAlert, UserRoundCheck } from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { resolveChecklist, type FormationItemStatus } from "@/lib/domain/formation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { EmptyState, Field, InlineError, Money, Note, PageHeader, PageLoading, Section } from "@/components/app/primitives";
import { todayISO } from "@/lib/today";
import { US_STATES } from "@/lib/usStates";
import type { USState } from "@/lib/domain/types";

const STATUS_LABEL: Record<FormationItemStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  user_reported_done: "Done (you reported)",
  verified: "Verified",
};

const STATUS_TONE: Record<FormationItemStatus, "muted" | "brand" | "success"> = {
  not_started: "muted",
  in_progress: "brand",
  user_reported_done: "success",
  verified: "success",
};

export default function BusinessPage() {
  const { ready, bundle, plan, saveProfile, setFormationStatus } = useApp();
  const [stateOverride, setStateOverride] = useState<USState | "">("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const stateId = useId();
  if (!ready) return <PageLoading />;

  const chosenState = (stateOverride || bundle.profile?.businessState || null) as USState | null;
  const checklist = resolveChecklist(chosenState, todayISO());

  const negativeSurplus = plan.notices.some((n) => /stabiliz/i.test(n));

  async function setStatus(itemId: string, title: string, status: FormationItemStatus) {
    const res = await setFormationStatus(itemId, status);
    if (!res.ok) toast.error(`"${title}" wasn't updated`, { description: res.error });
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Business Setup"
        description="Understand your options and the honest costs before you file. This checklist prepares you — it does not create an entity."
      />

      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-3">
              <Field label="Operating state" htmlFor={stateId} hint="We maintain a verified checklist for New York in v0.1.">
                <NativeSelect
                  id={stateId}
                  className="w-full"
                  value={chosenState ?? ""}
                  onChange={async (e) => {
                    const v = e.target.value as USState | "";
                    setStateOverride(v);
                    setSaveError(null);
                    if (v && bundle.profile) {
                      const res = await saveProfile({
                        residenceState: bundle.profile.residenceState,
                        businessState: v,
                        situation: bundle.profile.situation,
                        goals: Array.from(new Set([...(bundle.profile.goals ?? []), "form_business"])),
                        experience: bundle.profile.experience,
                        weeklyTimeMinutes: bundle.profile.weeklyTimeMinutes,
                      });
                      if (!res.ok) setSaveError(res.error);
                    }
                  }}
                >
                  <NativeSelectOption value="">Select a state…</NativeSelectOption>
                  {US_STATES.map((s) => (
                    <NativeSelectOption key={s} value={s}>
                      {s}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              {saveError ? <InlineError>{saveError} Your operating state wasn&apos;t saved.</InlineError> : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Scale className="size-4 text-subtle" />
                Entity vs. tax vs. obligations
              </p>
              <p className="text-sm text-muted-foreground text-pretty">
                Forming a legal entity (like an LLC) is a state-law step. How it&apos;s taxed federally
                is a separate choice, and there are ongoing obligations after formation. An LLC is{" "}
                <strong className="text-foreground">not</strong> an automatic tax saving and{" "}
                <strong className="text-foreground">not</strong> a complete liability shield.
              </p>
              <a
                href="https://www.irs.gov/businesses/small-businesses-self-employed/limited-liability-company-llc"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary underline"
              >
                IRS: how LLCs are taxed
                <ExternalLink className="size-3.5" />
              </a>
            </CardContent>
          </Card>
        </div>

        {negativeSurplus ? (
          <div className="flex gap-3 rounded-2xl border border-warning/25 bg-warning-surface p-4 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Your monthly surplus is negative. Formation involves elective costs — stabilize your
              finances first. This section stays available to learn, but it isn&apos;t a current priority.
            </p>
          </div>
        ) : null}

        {!checklist ? (
          <EmptyState icon={MapPin} title="Pick your operating state" body="Choose your operating state to see next steps." />
        ) : !checklist.supported ? (
          <Card>
            <CardContent className="space-y-2">
              <p className="font-semibold">{checklist.state}: not yet maintained</p>
              <p className="text-sm text-muted-foreground">{checklist.unsupportedHandoff}</p>
            </CardContent>
          </Card>
        ) : (
          <Section title="New York checklist" description="Every fee/deadline shown is from an official source verified during build.">
            <ol className="space-y-3">
              {checklist.items.map((item, i) => {
                const status = bundle.formationStatuses[item.id] ?? "not_started";
                const done = status === "user_reported_done" || status === "verified";
                return (
                  <li key={item.id}>
                    <Card>
                      <CardContent className="space-y-4">
                        <div className="flex items-start gap-3">
                          <span
                            className={
                              done
                                ? "flex size-7 shrink-0 items-center justify-center rounded-lg bg-success text-background"
                                : "figure flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-semibold"
                            }
                          >
                            {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <p className="font-semibold text-balance">{item.title}</p>
                              <Badge variant={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground text-pretty">{item.explanation}</p>
                          </div>
                        </div>

                        <dl className="grid gap-2 rounded-xl bg-secondary/40 p-3.5 text-sm sm:grid-cols-2">
                          <div className="flex items-center gap-2">
                            <Landmark className="size-3.5 text-subtle" />
                            <dt className="text-muted-foreground">State fee:</dt>
                            <dd>
                              {item.stateFeeCents === null ? (
                                <span className="text-subtle">unavailable / not applicable</span>
                              ) : (
                                <Money cents={item.stateFeeCents} className="font-semibold" />
                              )}
                            </dd>
                          </div>
                          {item.deadline ? (
                            <div className="flex items-center gap-2 text-warning">
                              <CalendarClock className="size-3.5" />
                              <dt>Deadline:</dt>
                              <dd>{item.deadline}</dd>
                            </div>
                          ) : null}
                          {item.thirdPartyCostNote ? (
                            <p className="text-xs text-subtle sm:col-span-2">Third-party: {item.thirdPartyCostNote}</p>
                          ) : null}
                          {item.professionalReviewTrigger ? (
                            <p className="flex items-center gap-2 text-xs text-info sm:col-span-2">
                              <UserRoundCheck className="size-3.5" />
                              May warrant professional (CPA/attorney) review.
                            </p>
                          ) : null}
                        </dl>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          {item.officialUrl ? (
                            <a
                              href={item.officialUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm font-medium text-primary underline"
                            >
                              Official source
                              <ExternalLink className="size-3.5" />
                            </a>
                          ) : (
                            <span />
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 sm:flex-none"
                              variant={status === "in_progress" ? "default" : "secondary"}
                              aria-pressed={status === "in_progress"}
                              onClick={() => void setStatus(item.id, item.title, "in_progress")}
                            >
                              In progress
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 sm:flex-none"
                              variant={status === "user_reported_done" ? "default" : "secondary"}
                              aria-pressed={status === "user_reported_done"}
                              onClick={() => void setStatus(item.id, item.title, "user_reported_done")}
                            >
                              I did this
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ol>
            <Note>
              Marking an item done records what <em>you</em> reported — it is not an externally verified
              filing, and reviewing this checklist is not legal review. Only filing on the official
              state site creates the entity.
            </Note>
          </Section>
        )}
      </div>
    </div>
  );
}
