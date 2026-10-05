"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { readLinkSession, useCompleteLink } from "@/components/ConnectedAccounts";
import { Button } from "@/components/ui/button";
import { PageHeader, PageLoading } from "@/components/app/primitives";
import { useApp } from "@/lib/store/provider";

/**
 * Return point for banks that sign in with an OAuth redirect (e.g. Chase).
 * Plaid sends the user back here; Link resumes with the same token to finish.
 * The URL must match PLAID_REDIRECT_URI and be allow-listed in Plaid's dashboard.
 */
export default function PlaidOAuthReturn() {
  const router = useRouter();
  const { ready: appReady, canWrite } = useApp();
  const [session] = useState(() => (typeof window === "undefined" ? null : readLinkSession()));
  const [redirectUri] = useState(() => (typeof window === "undefined" ? undefined : window.location.href));
  const completeLink = useCompleteLink();
  const opened = useRef(false);

  const { open, ready } = usePlaidLink({
    token: session?.token ?? null,
    receivedRedirectUri: redirectUri,
    onSuccess: (publicToken) => {
      void completeLink(publicToken, session?.repairId ?? null).then(() => router.replace("/finances?tab=accounts"));
    },
    onExit: () => router.replace("/finances?tab=accounts"),
  });

  useEffect(() => {
    if (!opened.current && session && ready && appReady && canWrite) {
      opened.current = true;
      open();
    }
  }, [session, ready, appReady, canWrite, open]);

  if (!session) {
    return (
      <div className="max-w-xl space-y-4">
        <PageHeader title="Connection not found" description="This sign-in session expired or was opened in another tab." />
        <Button asChild>
          <Link href="/finances?tab=accounts">Back to accounts</Link>
        </Button>
      </div>
    );
  }
  return <PageLoading />;
}
