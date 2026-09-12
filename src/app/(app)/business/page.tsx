"use client";

import { useState } from "react";
import { useApp } from "@/lib/store/provider";
import { resolveChecklist, type FormationItemStatus } from "@/lib/domain/formation";
import { Badge, Button, Card, Disclaimer, Field, Select, SectionTitle } from "@/components/ui";
import { formatCents } from "@/lib/domain/money";
import { todayISO } from "@/lib/today";
import type { USState } from "@/lib/domain/types";

const STATES: USState[] = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

const STATUS_LABEL: Record<FormationItemStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  user_reported_done: "Done (you reported)",
  verified: "Verified",
};

export default function BusinessPage() {
  const { ready, bundle, plan, saveProfile, setFormationStatus } = useApp();
  const [stateOverride, setStateOverride] = useState<USState | "">("");
  const [saveError, setSaveError] = useState<string | null>(null);
  if (!ready) return <p className="text-sm text-cloud-faint">Loading…</p>;

  const chosenState = (stateOverride || bundle.profile?.businessState || null) as USState | null;
  const checklist = resolveChecklist(chosenState, todayISO());

  const negativeSurplus = plan.notices.some((n) => /stabiliz/i.test(n));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-cloud">Business Setup</h1>
        <p className="text-sm text-cloud-muted">
          Understand your options and the honest costs before you file. This checklist prepares you
          — it does not create an entity.
        </p>
      </div>

      <Card>
        <Field label="Operating state" hint="We maintain a verified checklist for New York in v0.1.">
          <Select
            value={chosenState ?? ""}
            onChange={async (e) => {
              const v = e.target.value as USState | "";
              setStateOverride(v);
              setSaveError(null);
              if (v && bundle.profile) {
                const res = await saveProfile({
                  residenceState: bundle.profile.residenceState,
                  businessState: v,
                  goals: Array.from(new Set([...(bundle.profile.goals ?? []), "form_business"])),
                  experience: bundle.profile.experience,
                  weeklyTimeMinutes: bundle.profile.weeklyTimeMinutes,
                });
                if (!res.ok) setSaveError(res.error);
              }
            }}
          >
            <option value="">Select a state…</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        {saveError ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {saveError} Your operating state wasn&apos;t saved.
          </p>
        ) : null}
      </Card>

      {negativeSurplus ? (
        <Card className="border-warn/40 bg-warn/5">
          <p className="text-sm text-warn">
            Your monthly surplus is negative. Formation involves elective costs — stabilize your
            finances first. This section stays available to learn, but it isn&apos;t a current priority.
          </p>
        </Card>
      ) : null}

      <Card>
        <p className="text-sm font-medium text-cloud">Entity vs. tax vs. obligations</p>
        <p className="mt-1 text-sm text-cloud-muted">
          Forming a legal entity (like an LLC) is a state-law step. How it&apos;s taxed federally is a
          separate choice, and there are ongoing obligations after formation. An LLC is{" "}
          <strong>not</strong> an automatic tax saving and <strong>not</strong> a complete liability
          shield.
        </p>
        <a
          href="https://www.irs.gov/businesses/small-businesses-self-employed/limited-liability-company-llc"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm text-teal underline"
        >
          IRS: how LLCs are taxed →
        </a>
      </Card>

      {!checklist ? (
        <Card>
          <p className="text-sm text-cloud-muted">Choose your operating state to see next steps.</p>
        </Card>
      ) : !checklist.supported ? (
        <Card className="border-teal/30">
          <SectionTitle title={`${checklist.state}: not yet maintained`} />
          <p className="text-sm text-cloud-muted">{checklist.unsupportedHandoff}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          <SectionTitle
            title="New York checklist"
            subtitle="Every fee/deadline shown is from an official source verified during build."
          />
          {checklist.items.map((item) => {
            const status = bundle.formationStatuses[item.id] ?? "not_started";
            return (
              <Card key={item.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-cloud">{item.title}</p>
                  <Badge tone={status === "user_reported_done" ? "ok" : "neutral"}>
                    {STATUS_LABEL[status]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-cloud-muted">{item.explanation}</p>

                <div className="mt-2 space-y-1 text-xs">
                  <p className="text-cloud">
                    State fee:{" "}
                    {item.stateFeeCents === null ? (
                      <span className="text-cloud-faint">unavailable / not applicable</span>
                    ) : (
                      <span className="font-semibold text-cloud">{formatCents(item.stateFeeCents)}</span>
                    )}
                  </p>
                  {item.thirdPartyCostNote ? (
                    <p className="text-cloud-faint">Third-party: {item.thirdPartyCostNote}</p>
                  ) : null}
                  {item.deadline ? <p className="text-warn">Deadline: {item.deadline}</p> : null}
                  {item.professionalReviewTrigger ? (
                    <p className="text-cloud-faint">May warrant professional (CPA/attorney) review.</p>
                  ) : null}
                </div>

                {item.officialUrl ? (
                  <a
                    href={item.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm text-teal underline"
                  >
                    Official source →
                  </a>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant={status === "in_progress" ? "primary" : "secondary"}
                    onClick={() => setFormationStatus(item.id, "in_progress")}
                  >
                    In progress
                  </Button>
                  <Button
                    variant={status === "user_reported_done" ? "primary" : "secondary"}
                    onClick={() => setFormationStatus(item.id, "user_reported_done")}
                  >
                    I did this
                  </Button>
                </div>
              </Card>
            );
          })}
          <Disclaimer>
            Marking an item done records what <em>you</em> reported — it is not an externally verified
            filing, and reviewing this checklist is not legal review. Only filing on the official
            state site creates the entity.
          </Disclaimer>
        </div>
      )}
    </div>
  );
}
