"use client";

import { useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/store/provider";
import { Button, Card, Disclaimer, SectionTitle } from "@/components/ui";
import { buildExport } from "@/lib/data/export";
import { downloadText } from "@/lib/download";
import { nowISO, todayISO } from "@/lib/today";

export default function SettingsPage() {
  const { ready, bundle, resetAll, mode, userEmail, signOut, busy, error } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!ready) return <p className="text-sm text-cloud-faint">Loading…</p>;

  function doExport() {
    const { markdown, json } = buildExport(bundle, todayISO(), nowISO());
    downloadText("aion-plan.md", markdown, "text/markdown");
    downloadText("aion-data.json", json, "application/json");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-cloud">Settings</h1>
        <p className="text-sm text-cloud-muted">Profile, export, consent, and account.</p>
      </div>

      <div>
        <SectionTitle title="Account" />
        <Card>
          {mode === "real" ? (
            <>
              <p className="text-sm text-cloud">
                Signed in{userEmail ? ` as ${userEmail}` : ""} — data is stored securely server-side
                with row-level security.
              </p>
              <Button variant="secondary" className="mt-3" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-cloud-muted">
                You&apos;re in the synthetic demo (this browser only). Sign in to use real user mode
                with secure server-side storage.
              </p>
              <Link href="/signin" className="mt-2 inline-block text-sm text-teal underline">
                Sign in / create account →
              </Link>
            </>
          )}
          {busy ? <p className="mt-2 text-xs text-cloud-faint">Saving…</p> : null}
          {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        </Card>
      </div>

      <div>
        <SectionTitle title="Profile" />
        <Card>
          {bundle.profile ? (
            <div className="space-y-1 text-sm text-cloud-muted">
              <p>Residence: {bundle.profile.residenceState ?? "—"}</p>
              <p>Business state: {bundle.profile.businessState ?? "—"}</p>
              <p>Experience: {bundle.profile.experience ?? "—"}</p>
              <p>Weekly time: {bundle.profile.weeklyTimeMinutes ?? "—"} min</p>
              <p>Goals: {bundle.profile.goals.length ? bundle.profile.goals.join(", ") : "—"}</p>
            </div>
          ) : (
            <p className="text-sm text-cloud-muted">No profile yet.</p>
          )}
          <Link href="/onboarding" className="mt-2 inline-block text-sm text-teal underline">
            Edit profile / re-run onboarding →
          </Link>
        </Card>
      </div>

      <div>
        <SectionTitle title="Starter tools" subtitle="Recommended partner apps to build your foundation." />
        <Card>
          <p className="text-sm text-cloud-muted">
            Set up credit-builder and banking apps, and unlock higher-risk investing tools once your
            foundation is stable.
          </p>
          <Link href="/partners" className="mt-2 inline-block text-sm text-teal underline">
            Open starter tools →
          </Link>
        </Card>
      </div>

      <div>
        <SectionTitle title="Weekly review" subtitle="Record progress and compare to your baseline." />
        <Card>
          <Link href="/review" className="text-sm text-teal underline">
            Open weekly review →
          </Link>
        </Card>
      </div>

      <div>
        <SectionTitle title="Export your data" subtitle="Readable Markdown plan + structured JSON." />
        <Card>
          <p className="text-sm text-cloud-muted">
            Includes your calculations, assumptions, sources, reported outcomes, and open questions
            for a professional. Excludes any other user&apos;s data and all app secrets.
          </p>
          <Button className="mt-3" onClick={doExport}>
            Download plan + data
          </Button>
        </Card>
      </div>

      <div>
        <SectionTitle title="AI educator" />
        <Card>
          <p className="text-sm text-cloud-muted">
            The optional contextual AI educator is <strong>off</strong>. The whole app works without
            it. When configured, it&apos;s opt-in per use, and only a minimized summary is ever sent —
            never your account identifiers or private notes. It can explain and summarize, but can
            never file, contact creditors, open accounts, or promise outcomes.
          </p>
        </Card>
      </div>

      <div>
        <SectionTitle title="Consent & privacy" />
        <Card>
          <p className="text-sm text-cloud-muted">
            In real user mode, financial information is stored server-side with row-level security,
            encrypted at rest by the provider, and never silently saved to your browser. Data export
            and deletion require reauthentication. Backups follow a documented retention policy
            (see the README) and are purged on deletion per that policy.
          </p>
        </Card>
      </div>

      <div>
        <SectionTitle title="Delete data" />
        <Card className="border-danger/40">
          <p className="text-sm text-cloud-muted">
            This clears all data in this synthetic demo (stored only in this browser). In real user
            mode this performs authenticated account deletion.
          </p>
          {!confirmDelete ? (
            <Button variant="danger" className="mt-3" onClick={() => setConfirmDelete(true)}>
              Delete all data
            </Button>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  resetAll();
                  setConfirmDelete(false);
                }}
              >
                Yes, delete everything
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Disclaimer>
        Educational only — not legal, tax, or financial advice. Before any commercial release, AION
        requires documented review for credit-repair, investment-adviser, and state legal-service
        rules, privacy, and any lending/insurance features.
      </Disclaimer>
    </div>
  );
}
