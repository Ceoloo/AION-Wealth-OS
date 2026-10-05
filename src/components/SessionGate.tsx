"use client";

import Link from "next/link";
import { ArrowRight, FlaskConical, Loader2, LockKeyhole, RefreshCw, TriangleAlert } from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spotlight } from "@/components/ui/spotlight-new";
import { Note } from "@/components/app/primitives";
import { LogoMark } from "@/components/brand/Logo";

/**
 * Renders the app only in a well-defined session state. Critically, there is no
 * path here that silently drops a signed-out or failed-load visitor into the
 * synthetic demo — entering demo is always an explicit button press, because
 * demo writes go to browser localStorage.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const { sessionState, configured, error, enterDemo, retryLoad } = useApp();

  if (sessionState === "initializing" || sessionState === "auth_loading") {
    return (
      <div
        className="flex items-center gap-2.5 py-10 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-4 animate-spin text-primary" />
        {sessionState === "auth_loading" ? "Loading your account…" : "Starting…"}
      </div>
    );
  }

  if (sessionState === "error") {
    return (
      <StateCard
        tone="warning"
        title="We couldn't load your data"
        body={
          <>
            {error ?? "Something went wrong."} Your information is safe on the server — we
            haven&apos;t changed anything, and we won&apos;t save new entries to this browser.
          </>
        }
        actions={
          <>
            <Button onClick={retryLoad}>
              <RefreshCw data-icon="inline-start" />
              Try again
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/signin">Sign in again</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (sessionState === "session_expired") {
    return (
      <StateCard
        tone="warning"
        title="Your session expired"
        body="Nothing was saved to this browser. Sign in again to continue where you left off."
        actions={
          <Button asChild>
            <Link href="/signin">Sign in</Link>
          </Button>
        }
      />
    );
  }

  if (sessionState === "signed_out") {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card/60 px-6 py-10 sm:px-10 sm:py-14">
          <Spotlight
            gradientFirst="radial-gradient(68.54% 68.72% at 55.02% 31.46%, hsla(174, 80%, 70%, .10) 0, hsla(174, 80%, 50%, .03) 50%, hsla(174, 80%, 40%, 0) 80%)"
            gradientSecond="radial-gradient(50% 50% at 50% 50%, hsla(174, 80%, 70%, .07) 0, hsla(174, 80%, 50%, .02) 80%, transparent 100%)"
            gradientThird="radial-gradient(50% 50% at 50% 50%, hsla(210, 80%, 70%, .05) 0, hsla(210, 80%, 45%, .02) 80%, transparent 100%)"
            translateY={-280}
            duration={9}
          />
          <div className="relative">
            <LogoMark className="size-11" />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Choose how to start
            </h1>
            <p className="mt-3 max-w-xl text-[0.95rem] text-muted-foreground text-pretty sm:text-base">
              Your real financial information is only ever stored in a signed-in account. The demo
              is synthetic and stays in this browser.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card className="justify-between">
            <CardContent className="space-y-2">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-surface text-primary">
                <LockKeyhole className="size-5" />
              </span>
              <p className="pt-2 font-semibold">Use my own information</p>
              <p className="text-sm text-muted-foreground">
                {configured
                  ? "Sign in or create an account. Your data is stored server-side under row-level security."
                  : "Real accounts aren't configured in this build yet (see README setup)."}
              </p>
            </CardContent>
            {configured ? (
              <CardContent>
                <Button asChild className="w-full">
                  <Link href="/signin">
                    Sign in / create account
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              </CardContent>
            ) : null}
          </Card>

          <Card className="justify-between">
            <CardContent className="space-y-2">
              <span className="flex size-10 items-center justify-center rounded-xl bg-warning-surface text-warning">
                <FlaskConical className="size-5" />
              </span>
              <p className="pt-2 font-semibold">Explore the synthetic demo</p>
              <p className="text-sm text-muted-foreground">
                Clearly-labeled fake data, stored only in this browser. Don&apos;t enter real figures
                here — nothing in the demo transfers to a real account.
              </p>
            </CardContent>
            <CardContent>
              <Button variant="secondary" className="w-full" onClick={enterDemo}>
                Open synthetic demo
              </Button>
            </CardContent>
          </Card>
        </div>

        <Note className="mt-4">
          Educational only — not legal, tax, or financial advice. No credit scores or guarantees are
          produced.
        </Note>
      </div>
    );
  }

  return <>{children}</>;
}

function StateCard({
  tone,
  title,
  body,
  actions,
}: {
  tone: "warning";
  title: string;
  body: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <Card className="mx-auto max-w-xl ring-warning/25">
      <CardContent className="space-y-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-warning-surface text-warning" data-tone={tone}>
          <TriangleAlert className="size-5" />
        </span>
        <p className="text-lg font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
        <div className="flex flex-wrap gap-2 pt-1">{actions}</div>
      </CardContent>
    </Card>
  );
}
