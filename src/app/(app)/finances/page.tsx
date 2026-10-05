"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, ReceiptText } from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { latestSnapshot } from "@/lib/data/bundle";
import { Metrics } from "@/components/Metrics";
import { SnapshotForm } from "@/components/SnapshotForm";
import { AccountManager } from "@/components/AccountManager";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, Note, PageHeader, PageLoading } from "@/components/app/primitives";

type Tab = "overview" | "snapshot" | "accounts";

export default function FinancesPage() {
  const { ready, bundle, summary: sharedSummary } = useApp();
  const [tab, setTab] = useState<Tab>("overview");
  if (!ready) return <PageLoading />;

  const snapshot = latestSnapshot(bundle);
  // The provider's summary — one computation for every screen. Null when
  // there is no snapshot, so the empty state still shows.
  const summary = snapshot ? sharedSummary : null;

  return (
    <div className="max-w-4xl">
      <PageHeader title="My Finances" description="Your dated snapshot, calculations, and accounts." />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="snapshot">Edit snapshot</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-4">
          {summary ? (
            <>
              <p className="text-xs text-subtle">
                Snapshot as of <span className="figure">{snapshot!.asOf}</span>
              </p>
              <Metrics summary={summary} />
              <Note>
                These are app-side estimates from figures you entered — not bureau or lender
                calculations. Utilization excludes any revolving account with an unknown limit.
              </Note>
            </>
          ) : (
            <EmptyState
              icon={ReceiptText}
              title="No snapshot yet"
              body="Add your first dated snapshot to see surplus, net worth, cash coverage, and utilization."
              action={
                <Button onClick={() => setTab("snapshot")}>
                  <Plus data-icon="inline-start" />
                  Add snapshot
                </Button>
              }
            />
          )}
        </TabsContent>

        <TabsContent value="snapshot" className="mt-5">
          <SnapshotForm onSaved={() => setTab("overview")} />
        </TabsContent>

        <TabsContent value="accounts" className="mt-5 space-y-4">
          <p className="text-sm text-muted-foreground">No bank logins, SSNs, or full account numbers.</p>
          <AccountManager />
          <Link href="/business" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80">
            Working on a business? See Business Setup
            <ArrowRight className="size-3.5" />
          </Link>
        </TabsContent>
      </Tabs>
    </div>
  );
}
