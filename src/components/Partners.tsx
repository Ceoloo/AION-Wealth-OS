"use client";

import { toast } from "sonner";
import { ArrowRight, ArrowUpRight, Banknote, CreditCard, Info, Lock, TrendingUp, TriangleAlert, type LucideIcon } from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { latestSnapshot } from "@/lib/data/bundle";
import {
  AFFILIATE_DISCLOSURE,
  PARTNERS,
  partnerVisibility,
  referralFunnel,
  type Partner,
  type PartnerStatus,
} from "@/lib/domain/partners";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, Section } from "@/components/app/primitives";
import type { MutationResult } from "@/lib/store/provider";

const CATEGORY: Record<Partner["category"], { label: string; icon: LucideIcon }> = {
  credit_builder: { label: "Build credit", icon: CreditCard },
  banking: { label: "Banking & money", icon: Banknote },
  investing_speculative: { label: "Investing (higher risk)", icon: TrendingUp },
};

const STATUS_LABEL: Record<PartnerStatus, string> = {
  not_started: "Not set up",
  clicked: "Opened",
  signed_up: "Signed up",
  already_use: "Already use it",
  skipped: "Skipped",
};

/** Partner writes are tracked; a failure must say so rather than vanish. */
function reportFailure(res: MutationResult, what: string) {
  if (!res.ok) toast.error(`${what} wasn't saved`, { description: res.error });
}

function PartnerRow({ partner }: { partner: Partner }) {
  const { bundle, setPartnerStatus, recordReferralClick, reportPartnerSignup } = useApp();
  const status = bundle.partnerStatuses[partner.id] ?? "not_started";
  const clicks = bundle.referralEvents.filter((e) => e.partnerId === partner.id && e.type === "click").length;
  const done = status === "signed_up" || status === "already_use";

  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{partner.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{partner.what}</p>
          </div>
          <Badge variant={done ? "success" : status === "clicked" ? "brand" : "muted"} className="shrink-0">
            {STATUS_LABEL[status]}
          </Badge>
        </div>

        {partner.partnerOffer ? <p className="text-xs text-subtle">Their offer: {partner.partnerOffer}</p> : null}
        {partner.riskNote ? (
          <p className="flex gap-2 rounded-lg border border-warning/25 bg-warning-surface px-3 py-2 text-xs text-warning">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            {partner.riskNote}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {/* The click is tracked before navigation; the link still opens normally. */}
          <Button asChild>
            <a
              href={partner.url}
              target="_blank"
              rel="noopener noreferrer nofollow sponsored"
              onClick={() => {
                void recordReferralClick(partner.id).then((r) => reportFailure(r, "That open"));
              }}
            >
              Open {partner.name}
              <ArrowUpRight data-icon="inline-end" />
            </a>
          </Button>
          <div className="flex flex-wrap gap-2">
            {status !== "signed_up" ? (
              <Button variant="secondary" size="sm" onClick={async () => reportFailure(await reportPartnerSignup(partner.id), "Your signup")}>
                I signed up
              </Button>
            ) : null}
            {!done ? (
              <>
                <Button variant="secondary" size="sm" onClick={async () => reportFailure(await setPartnerStatus(partner.id, "already_use"), "That status")}>
                  I already use it
                </Button>
                <Button variant="ghost" size="sm" onClick={async () => reportFailure(await setPartnerStatus(partner.id, "skipped"), "That status")}>
                  Skip for now
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {clicks > 0 ? (
          <p className="figure text-[11px] text-subtle">
            Opened {clicks} time{clicks === 1 ? "" : "s"}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function Partners({ mode }: { mode: "gate" | "manage" }) {
  const { bundle, acknowledgePartners, summary } = useApp();
  // Unknown foundation ⇒ not stable: with no snapshot, pass null so the
  // speculative tools stay locked, exactly as before.
  const { available, locked, lockReason } = partnerVisibility(latestSnapshot(bundle) ? summary : null);

  const availByCat = groupByCategory(available);

  return (
    <div className="max-w-3xl">
      {mode === "gate" ? (
        <PageHeader
          title="Set up your starter tools"
          description="These are the same free/low-cost apps used to build a real foundation. Setting one or two up now gives you something concrete to work with while you decide whether to go deeper with AION. Totally optional — you can set up what fits, mark what you already use, and skip the rest."
        />
      ) : (
        <PageHeader title="Starter tools" description="Recommended apps to build your foundation. Update your status anytime." />
      )}

      <div className="space-y-6">
        {/* Shown before any link, at reading size: an endorsement disclosure
            has to be clear and conspicuous, not small print. */}
        <div className="flex gap-3 rounded-2xl border border-info/25 bg-info-surface p-4 text-sm text-foreground/90">
          <Info className="mt-0.5 size-4 shrink-0 text-info" />
          <p className="text-pretty">{AFFILIATE_DISCLOSURE}</p>
        </div>

        {mode === "manage" ? <ReferralActivity /> : null}

        {(["credit_builder", "banking", "investing_speculative"] as const).map((cat) => {
          const items = availByCat[cat];
          if (items.length === 0) return null;
          const { label, icon: Icon } = CATEGORY[cat];
          return (
            <section key={cat} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4 text-subtle" />
                {label}
              </h2>
              {items.map((p) => (
                <PartnerRow key={p.id} partner={p} />
              ))}
            </section>
          );
        })}

        {locked.length > 0 ? (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Lock className="size-4 text-subtle" />
              Investing (higher risk) — locked
            </h2>
            <div className="rounded-2xl border border-dashed border-border bg-card/40 p-4">
              <p className="text-sm text-muted-foreground text-pretty">{lockReason}</p>
              <ul className="mt-3 space-y-2">
                {locked.map((p) => (
                  <li key={p.id} className="flex items-start gap-2.5 text-sm text-subtle">
                    <Lock className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      <span className="font-medium text-muted-foreground">{p.name}</span> — {p.what}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {mode === "gate" ? (
          <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-border bg-background/90 px-4 py-4 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border lg:bottom-6">
            {/* Clears the floating tab bar on phones; there is none from lg up. The
                offset is a class, not an inline style, so lg:bottom-6 can win. */}
            <Button
              className="w-full"
              onClick={async () => {
                const res = await acknowledgePartners();
                if (!res.ok) toast.error("Couldn't continue", { description: res.error });
              }}
            >
              Continue to my plan
              <ArrowRight data-icon="inline-end" />
            </Button>
            <p className="mt-2 text-center text-xs text-subtle">
              You can revisit these anytime under Settings → Starter tools.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReferralActivity() {
  const { bundle } = useApp();
  const rows = referralFunnel(bundle.referralEvents).filter((r) => r.clicks > 0 || r.reportedSignups > 0);
  if (rows.length === 0) return null;
  return (
    <Section title="Your referral activity">
      <Card className="gap-0 py-0">
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.partnerId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span>{r.name}</span>
              <span className="figure text-xs text-subtle">
                {r.clicks} open{r.clicks === 1 ? "" : "s"}
                {r.reportedSignups > 0 ? ` · ${r.reportedSignups} signup reported` : ""}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  );
}

function groupByCategory(list: Partner[]): Record<Partner["category"], Partner[]> {
  return {
    credit_builder: list.filter((p) => p.category === "credit_builder"),
    banking: list.filter((p) => p.category === "banking"),
    investing_speculative: list.filter((p) => p.category === "investing_speculative"),
  };
}

export { PARTNERS };
