"use client";

import { useApp } from "@/lib/store/provider";
import { latestSnapshot } from "@/lib/data/bundle";
import { summarize } from "@/lib/domain/finance";
import {
  AFFILIATE_DISCLOSURE,
  PARTNERS,
  partnerVisibility,
  referralFunnel,
  type Partner,
  type PartnerStatus,
} from "@/lib/domain/partners";
import { Badge, Button, Card, Disclaimer, SectionTitle } from "./ui";

const CATEGORY_LABEL: Record<Partner["category"], string> = {
  credit_builder: "Build credit",
  banking: "Banking & money",
  investing_speculative: "Investing (higher risk)",
};

const STATUS_LABEL: Record<PartnerStatus, string> = {
  not_started: "Not set up",
  clicked: "Opened",
  signed_up: "Signed up",
  already_use: "Already use it",
  skipped: "Skipped",
};

function PartnerRow({ partner }: { partner: Partner }) {
  const { bundle, setPartnerStatus, recordReferralClick, reportPartnerSignup } = useApp();
  const status = bundle.partnerStatuses[partner.id] ?? "not_started";
  const clicks = bundle.referralEvents.filter(
    (e) => e.partnerId === partner.id && e.type === "click",
  ).length;
  const done = status === "signed_up" || status === "already_use";
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-cloud">{partner.name}</p>
          <p className="mt-0.5 text-sm text-cloud-muted">{partner.what}</p>
        </div>
        <Badge tone={done ? "ok" : status === "clicked" ? "teal" : "neutral"}>
          {STATUS_LABEL[status]}
        </Badge>
      </div>

      {partner.partnerOffer ? (
        <p className="mt-2 text-xs text-cloud-faint">Their offer: {partner.partnerOffer}</p>
      ) : null}
      {partner.riskNote ? (
        <p className="mt-2 rounded-lg border border-warn/40 bg-warn/5 px-2 py-1.5 text-xs text-warn">
          {partner.riskNote}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {/* The click is tracked before navigation; the link still opens normally. */}
        <a
          href={partner.url}
          target="_blank"
          rel="noopener noreferrer nofollow sponsored"
          onClick={() => recordReferralClick(partner.id)}
        >
          <Button variant="primary">Open {partner.name} →</Button>
        </a>
        {status !== "signed_up" ? (
          <Button variant="secondary" onClick={() => reportPartnerSignup(partner.id)}>
            I signed up
          </Button>
        ) : null}
        {!done ? (
          <>
            <Button variant="secondary" onClick={() => setPartnerStatus(partner.id, "already_use")}>
              I already use it
            </Button>
            <Button variant="ghost" onClick={() => setPartnerStatus(partner.id, "skipped")}>
              Skip for now
            </Button>
          </>
        ) : null}
      </div>

      {clicks > 0 ? (
        <p className="mt-2 text-[11px] text-cloud-faint">
          Opened {clicks} time{clicks === 1 ? "" : "s"}
        </p>
      ) : null}
    </Card>
  );
}

export function Partners({ mode }: { mode: "gate" | "manage" }) {
  const { bundle, acknowledgePartners } = useApp();
  const snapshot = latestSnapshot(bundle);
  const summary = snapshot ? summarize(snapshot, bundle.accounts) : null;
  const { available, locked, lockReason } = partnerVisibility(summary);

  const availByCat = groupByCategory(available);

  return (
    <div className="space-y-4">
      {mode === "gate" ? (
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal">Before you dive in</p>
          <h1 className="mt-1 text-xl font-bold text-cloud">Set up your starter tools</h1>
          <p className="mt-1 text-sm text-cloud-muted">
            These are the same free/low-cost apps used to build a real foundation. Setting one or two
            up now gives you something concrete to work with while you decide whether to go deeper
            with AION. Totally optional — you can set up what fits, mark what you already use, and
            skip the rest.
          </p>
        </div>
      ) : (
        <SectionTitle
          title="Starter tools"
          subtitle="Recommended apps to build your foundation. Update your status anytime."
        />
      )}

      <Disclaimer>{AFFILIATE_DISCLOSURE}</Disclaimer>

      {mode === "manage" ? <ReferralActivity /> : null}

      {(["credit_builder", "banking", "investing_speculative"] as const).map((cat) => {
        const items = availByCat[cat];
        if (items.length === 0) return null;
        return (
          <div key={cat} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-cloud-faint">
              {CATEGORY_LABEL[cat]}
            </p>
            {items.map((p) => (
              <PartnerRow key={p.id} partner={p} />
            ))}
          </div>
        );
      })}

      {locked.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-cloud-faint">
            Investing (higher risk) — locked
          </p>
          <Card className="border-ink-line bg-ink-soft">
            <p className="text-sm text-cloud-muted">{lockReason}</p>
            <ul className="mt-2 space-y-1 text-sm text-cloud-faint">
              {locked.map((p) => (
                <li key={p.id}>
                  🔒 {p.name} — {p.what}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {mode === "gate" ? (
        <div className="sticky bottom-16 -mx-4 border-t border-ink-line bg-ink/95 px-4 py-3 backdrop-blur">
          <Button className="w-full" onClick={acknowledgePartners}>
            Continue to my plan →
          </Button>
          <p className="mt-1 text-center text-xs text-cloud-faint">
            You can revisit these anytime under Settings → Starter tools.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ReferralActivity() {
  const { bundle } = useApp();
  const rows = referralFunnel(bundle.referralEvents).filter(
    (r) => r.clicks > 0 || r.reportedSignups > 0,
  );
  if (rows.length === 0) return null;
  return (
    <Card className="p-0">
      <p className="border-b border-ink-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-cloud-faint">
        Your referral activity
      </p>
      {rows.map((r) => (
        <div key={r.partnerId} className="flex items-center justify-between px-4 py-2 text-sm">
          <span className="text-cloud">{r.name}</span>
          <span className="text-xs text-cloud-faint">
            {r.clicks} open{r.clicks === 1 ? "" : "s"}
            {r.reportedSignups > 0 ? ` · ${r.reportedSignups} signup reported` : ""}
          </span>
        </div>
      ))}
    </Card>
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
