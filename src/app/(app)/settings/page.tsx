"use client";

import { useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/store/provider";
import { Button, Card, Disclaimer, SectionTitle, TextInput } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildExport } from "@/lib/data/export";
import { downloadText } from "@/lib/download";
import { nowISO, todayISO } from "@/lib/today";

export default function SettingsPage() {
  const { ready, bundle, resetAll, mode, userEmail, signOut, busy, error } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteDone, setDeleteDone] = useState(false);
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
            encrypted at rest by the provider, and never silently saved to your browser. Deleting
            your data requires you to re-enter your password. Export does not require re-entry — it
            only ever returns your own records.
          </p>
          <p className="mt-2 text-sm text-cloud-muted">
            Deleting removes your records from the live database immediately. We do <strong>not</strong>{" "}
            claim instant erasure from provider backups: backups expire according to the hosting
            project&apos;s configured retention window, which must be confirmed against that project&apos;s
            settings rather than assumed.
          </p>
        </Card>
      </div>

      <div>
        <SectionTitle title={mode === "demo" ? "Reset demo data" : "Delete my data"} />
        <Card className="border-danger/40">
          {mode === "demo" ? (
            <>
              <p className="text-sm text-cloud-muted">
                Clears the synthetic demo data stored in this browser. Nothing on a server is
                affected.
              </p>
              {!confirmDelete ? (
                <Button variant="danger" className="mt-3" onClick={() => setConfirmDelete(true)}>
                  Reset demo data
                </Button>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="danger"
                    onClick={async () => {
                      await resetAll();
                      setConfirmDelete(false);
                    }}
                  >
                    Yes, reset the demo
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-cloud-muted">
                Permanently deletes <strong>all of your data</strong> — snapshots, accounts, credit
                issues, plan history, weekly reviews, formation and partner status, and referral
                events. This cannot be undone.
              </p>
              <p className="mt-2 text-sm text-cloud-muted">
                Your <strong>sign-in is kept</strong> so you can start over. This does not close the
                account itself; to remove the login as well, ask an administrator.
              </p>
              {!confirmDelete ? (
                <Button variant="danger" className="mt-3" onClick={() => setConfirmDelete(true)}>
                  Delete my data
                </Button>
              ) : (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-cloud">
                    Confirm it&apos;s you: re-enter your password.
                  </p>
                  <TextInput
                    type="password"
                    autoComplete="current-password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      disabled={!password || deleting}
                      onClick={async () => {
                        setDeleting(true);
                        setDeleteError(null);
                        setDeleteDone(false);
                        try {
                          const supabase = createSupabaseBrowserClient();
                          if (!supabase || !userEmail) throw new Error("Not signed in.");
                          // Recent reauthentication — the server independently
                          // requires a fresh sign-in before it will delete.
                          const { error: authErr } = await supabase.auth.signInWithPassword({
                            email: userEmail,
                            password,
                          });
                          if (authErr) throw new Error("That password didn't match.");
                          const res = await resetAll();
                          if (!res.ok) throw new Error(res.error);
                          setDeleteDone(true);
                          setConfirmDelete(false);
                          setPassword("");
                        } catch (err) {
                          setDeleteError(
                            err instanceof Error ? err.message : "Deletion failed. Nothing was deleted.",
                          );
                        } finally {
                          setDeleting(false);
                        }
                      }}
                    >
                      {deleting ? "Deleting…" : "Permanently delete my data"}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={deleting}
                      onClick={() => {
                        setConfirmDelete(false);
                        setPassword("");
                        setDeleteError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {deleteError ? (
                <p className="mt-2 text-sm text-danger" role="alert">
                  {deleteError} Your data was <strong>not</strong> deleted.
                </p>
              ) : null}
              {deleteDone ? (
                <p className="mt-2 text-sm text-ok" role="status">
                  Deleted and verified — no records of yours remain.
                </p>
              ) : null}
            </>
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
