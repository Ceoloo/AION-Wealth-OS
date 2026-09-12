"use client";

import { useApp } from "@/lib/store/provider";
import { latestSnapshot } from "@/lib/data/bundle";
import { summarize } from "@/lib/domain/finance";
import {
  AFFILIATE_DISCLOSURE,
  PARTNERS,
  partnerVisibility,
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
  signed_up: "Signed up",
  already_use: "Already use it",
  skipped: "Skipped",
};

function PartnerRow({ partner }: { partner: Partner }) {
  const { bundle, setPartnerStatus } = useApp();
  const status = bundle.partnerStatuses[partner.id] ?? "not_started";
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-cloud">{partner.name}</p>
          <p className="mt-0.5 text-sm text-cloud-muted">{partner.what}</p>
        </div>
        <Badge tone={status === "signed_up" || status === "already_use" ? "ok" : "neutral"}>
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
        <a href={partner.url} target="_blank" rel="noopener noreferrer nofollow sponsored">
          <Button variant="primary" onClick={() => setPartnerStatus(partner.id, "signed_up")}>
            Open {partner.name} →
          </Button>
        </a>
        <Button variant="secondary" onClick={() => setPartnerStatus(partner.id, "already_use")}>
          I already use it
        </Button>
        <Button variant="ghost" onClick={() => setPartnerStatus(partner.id, "skipped")}>
          Skip for now
        </Button>
      </div>
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

function groupByCategory(list: Partner[]): Record<Partner["category"], Partner[]> {
  return {
    credit_builder: list.filter((p) => p.category === "credit_builder"),
    banking: list.filter((p) => p.category === "banking"),
    investing_speculative: list.filter((p) => p.category === "investing_speculative"),
  };
}

export { PARTNERS };
