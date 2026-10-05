"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Bot, Download, FlaskConical, LogOut, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, InlineError, Note, PageHeader, PageLoading } from "@/components/app/primitives";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildExport } from "@/lib/data/export";
import { downloadText } from "@/lib/download";
import { nowISO, todayISO } from "@/lib/today";
import { SITUATION_LABELS } from "@/lib/domain/journey";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { ready, bundle, resetAll, mode, userEmail, signOut, busy, error } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteDone, setDeleteDone] = useState(false);
  const pwId = useId();
  if (!ready) return <PageLoading />;

  function doExport() {
    const { markdown, json } = buildExport(bundle, todayISO(), nowISO());
    downloadText("aion-plan.md", markdown, "text/markdown");
    downloadText("aion-data.json", json, "application/json");
  }

  const p = bundle.profile;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Profile, export, consent, and account." />

      <div className="space-y-4">
        <SettingsCard title="Account" icon={mode === "real" ? UserRound : FlaskConical}>
          {mode === "real" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Signed in{userEmail ? <> as <span className="text-foreground">{userEmail}</span></> : ""} — data is
                stored securely server-side with row-level security.
              </p>
              <Button variant="secondary" size="sm" onClick={signOut}>
                <LogOut data-icon="inline-start" />
                Sign out
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                You&apos;re in the synthetic demo (this browser only). Sign in to use real user mode with
                secure server-side storage.
              </p>
              <Button size="sm" asChild>
                <Link href="/signin">
                  Sign in / create account
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </>
          )}
          {busy ? <p className="text-xs text-subtle">Saving…</p> : null}
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </SettingsCard>

        <SettingsCard title="Profile" icon={UserRound}>
          {p ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-subtle">Starting point</dt>
              <dd>{p.situation ? SITUATION_LABELS[p.situation] : "—"}</dd>
              <dt className="text-subtle">Residence</dt>
              <dd>{p.residenceState ?? "—"}</dd>
              <dt className="text-subtle">Business state</dt>
              <dd>{p.businessState ?? "—"}</dd>
              <dt className="text-subtle">Experience</dt>
              <dd className="capitalize">{p.experience ?? "—"}</dd>
              <dt className="text-subtle">Weekly time</dt>
              <dd className="figure">{p.weeklyTimeMinutes ?? "—"} min</dd>
              <dt className="text-subtle">Goals</dt>
              <dd>{p.goals.length ? p.goals.map((g) => g.replace(/_/g, " ")).join(", ") : "—"}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No profile yet.</p>
          )}
          <LinkRow href="/onboarding">Edit profile / re-run onboarding</LinkRow>
        </SettingsCard>

        <SettingsCard title="Starter tools" description="Recommended partner apps to build your foundation.">
          <p className="text-sm text-muted-foreground">
            Set up credit-builder and banking apps, and unlock higher-risk investing tools once your
            foundation is stable.
          </p>
          <LinkRow href="/partners">Open starter tools</LinkRow>
        </SettingsCard>

        <SettingsCard title="Weekly review" description="Record progress and compare to your baseline.">
          <LinkRow href="/review">Open weekly review</LinkRow>
        </SettingsCard>

        <SettingsCard title="Export your data" description="Readable Markdown plan + structured JSON." icon={Download}>
          <p className="text-sm text-muted-foreground">
            Includes your calculations, assumptions, sources, reported outcomes, and open questions for
            a professional. Excludes any other user&apos;s data and all app secrets.
          </p>
          <Button size="sm" onClick={doExport}>
            <Download data-icon="inline-start" />
            Download plan + data
          </Button>
        </SettingsCard>

        <SettingsCard title="AI educator" icon={Bot} badge={<Badge variant="muted">Off</Badge>}>
          <p className="text-sm text-muted-foreground">
            The optional contextual AI educator is <strong className="text-foreground">off</strong>. The
            whole app works without it. When configured, it&apos;s opt-in per use, and only a minimized
            summary is ever sent — never your account identifiers or private notes. It can explain and
            summarize, but can never file, contact creditors, open accounts, or promise outcomes.
          </p>
        </SettingsCard>

        <SettingsCard title="Consent & privacy" icon={ShieldCheck}>
          <p className="text-sm text-muted-foreground">
            In real user mode, financial information is stored server-side with row-level security,
            encrypted at rest by the provider, and never silently saved to your browser. Deleting your
            data requires you to re-enter your password. Export does not require re-entry — it only
            ever returns your own records.
          </p>
          <p className="text-sm text-muted-foreground">
            Deleting removes your records from the live database immediately. We do{" "}
            <strong className="text-foreground">not</strong> claim instant erasure from provider
            backups: backups expire according to the hosting project&apos;s configured retention window,
            which must be confirmed against that project&apos;s settings rather than assumed.
          </p>
        </SettingsCard>

        {/* ---- Danger zone ------------------------------------------------- */}
        <SettingsCard title={mode === "demo" ? "Reset demo data" : "Delete my data"} icon={Trash2} danger>
          {mode === "demo" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Clears the synthetic demo data stored in this browser. Nothing on a server is affected.
              </p>
              {!confirmDelete ? (
                <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                  Reset demo data
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      const res = await resetAll();
                      setConfirmDelete(false);
                      if (!res.ok) toast.error("The demo wasn't reset", { description: res.error });
                      else toast.success("Demo data reset");
                    }}
                  >
                    Yes, reset the demo
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Permanently deletes <strong className="text-foreground">all of your data</strong> —
                snapshots, accounts, credit issues, plan history, weekly reviews, formation and partner
                status, and referral events. This cannot be undone.
              </p>
              <p className="text-sm text-muted-foreground">
                Your <strong className="text-foreground">sign-in is kept</strong> so you can start over.
                This does not close the account itself; to remove the login as well, ask an
                administrator.
              </p>
              {!confirmDelete ? (
                <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                  Delete my data
                </Button>
              ) : (
                <div className="space-y-3 rounded-xl border border-danger/25 bg-danger-surface p-4">
                  <Field label="Confirm it's you: re-enter your password." htmlFor={pwId}>
                    <Input
                      id={pwId}
                      type="password"
                      autoComplete="current-password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="destructive"
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
                          setDeleteError(err instanceof Error ? err.message : "Deletion failed. Nothing was deleted.");
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
                <InlineError>
                  {deleteError} Your data was <strong>not</strong> deleted.
                </InlineError>
              ) : null}
              {deleteDone ? (
                <p className="text-sm text-success" role="status">
                  Deleted and verified — no records of yours remain.
                </p>
              ) : null}
            </>
          )}
        </SettingsCard>

        <Note>
          Educational only — not legal, tax, or financial advice. Before any commercial release, AION
          requires documented review for credit-repair, investment-adviser, and state legal-service
          rules, privacy, and any lending/insurance features.
        </Note>
      </div>
    </div>
  );
}

function SettingsCard({
  title,
  description,
  icon: Icon,
  badge,
  danger = false,
  children,
}: {
  title: string;
  description?: string;
  icon?: typeof UserRound;
  badge?: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(danger && "ring-danger/25")}>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={cn("flex items-center gap-2 font-semibold", danger && "text-danger")}>
              {Icon ? <Icon className={cn("size-4", danger ? "text-danger" : "text-subtle")} /> : null}
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-sm text-subtle">{description}</p> : null}
          </div>
          {badge}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function LinkRow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80">
      {children}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}
