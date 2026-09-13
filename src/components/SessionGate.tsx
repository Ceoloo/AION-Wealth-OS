"use client";

import Link from "next/link";
import { useApp } from "@/lib/store/provider";
import { Button, Card, Disclaimer } from "./ui";

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
      <div className="px-1 py-6 text-sm text-cloud-faint" role="status" aria-live="polite">
        {sessionState === "auth_loading" ? "Loading your account…" : "Starting…"}
      </div>
    );
  }

  if (sessionState === "error") {
    return (
      <div className="space-y-3 py-4">
        <Card className="border-warn/40 bg-warn/5">
          <p className="font-medium text-cloud">We couldn&apos;t load your data</p>
          <p className="mt-1 text-sm text-cloud-muted">
            {error ?? "Something went wrong."} Your information is safe on the server — we haven&apos;t
            changed anything, and we won&apos;t save new entries to this browser.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={retryLoad}>Try again</Button>
            <Link href="/signin">
              <Button variant="secondary">Sign in again</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (sessionState === "session_expired") {
    return (
      <div className="space-y-3 py-4">
        <Card className="border-warn/40 bg-warn/5">
          <p className="font-medium text-cloud">Your session expired</p>
          <p className="mt-1 text-sm text-cloud-muted">
            Nothing was saved to this browser. Sign in again to continue where you left off.
          </p>
          <Link href="/signin" className="mt-3 inline-block">
            <Button>Sign in</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (sessionState === "signed_out") {
    return (
      <div className="space-y-4 py-4">
        <div>
          <h1 className="text-xl font-bold text-cloud">Choose how to start</h1>
          <p className="mt-1 text-sm text-cloud-muted">
            Your real financial information is only ever stored in a signed-in account. The demo is
            synthetic and stays in this browser.
          </p>
        </div>

        <Card>
          <p className="font-medium text-cloud">Use my own information</p>
          <p className="mt-1 text-sm text-cloud-muted">
            {configured
              ? "Sign in or create an account. Your data is stored server-side under row-level security."
              : "Real accounts aren't configured in this build yet (see README setup)."}
          </p>
          {configured ? (
            <Link href="/signin" className="mt-3 inline-block">
              <Button>Sign in / create account</Button>
            </Link>
          ) : null}
        </Card>

        <Card>
          <p className="font-medium text-cloud">Explore the synthetic demo</p>
          <p className="mt-1 text-sm text-cloud-muted">
            Clearly-labeled fake data, stored only in this browser. Don&apos;t enter real figures here —
            nothing in the demo transfers to a real account.
          </p>
          <Button variant="secondary" className="mt-3" onClick={enterDemo}>
            Open synthetic demo
          </Button>
        </Card>

        <Disclaimer>
          Educational only — not legal, tax, or financial advice. No credit scores or guarantees are
          produced.
        </Disclaimer>
      </div>
    );
  }

  return <>{children}</>;
}
