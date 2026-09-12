"use client";

import { useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/store/provider";
import { latestSnapshot } from "@/lib/data/bundle";
import { summarize } from "@/lib/domain/finance";
import { Metrics } from "@/components/Metrics";
import { SnapshotForm } from "@/components/SnapshotForm";
import { AccountManager } from "@/components/AccountManager";
import { Button, Disclaimer, EmptyState, SectionTitle, cn } from "@/components/ui";

type Tab = "overview" | "snapshot" | "accounts";

export default function FinancesPage() {
  const { ready, bundle } = useApp();
  const [tab, setTab] = useState<Tab>("overview");
  if (!ready) return <p className="text-sm text-cloud-faint">Loading…</p>;

  const snapshot = latestSnapshot(bundle);
  const summary = snapshot ? summarize(snapshot, bundle.accounts) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-cloud">My Finances</h1>
        <p className="text-sm text-cloud-muted">Your dated snapshot, calculations, and accounts.</p>
      </div>

      <div className="flex gap-1 rounded-xl border border-ink-line bg-ink-soft p-1 text-sm">
        {(
          [
            ["overview", "Overview"],
            ["snapshot", "Edit snapshot"],
            ["accounts", "Accounts"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2",
              tab === key ? "bg-teal text-ink font-semibold" : "text-cloud-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        summary ? (
          <>
            <p className="text-xs text-cloud-faint">Snapshot as of {snapshot!.asOf}</p>
            <Metrics summary={summary} />
            <Disclaimer>
              These are app-side estimates from figures you entered — not bureau or lender
              calculations. Utilization excludes any revolving account with an unknown limit.
            </Disclaimer>
          </>
        ) : (
          <EmptyState
            title="No snapshot yet"
            body="Add your first dated snapshot to see surplus, net worth, cash coverage, and utilization."
            action={<Button onClick={() => setTab("snapshot")}>Add snapshot</Button>}
          />
        )
      ) : null}

      {tab === "snapshot" ? (
        <div className="space-y-3">
          <SectionTitle title="Financial snapshot" />
          <SnapshotForm onSaved={() => setTab("overview")} />
        </div>
      ) : null}

      {tab === "accounts" ? (
        <div className="space-y-3">
          <SectionTitle title="Accounts & debts" subtitle="No bank logins, SSNs, or full account numbers." />
          <AccountManager />
          <Link href="/business" className="block text-sm text-teal underline">
            Working on a business? See Business Setup →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
