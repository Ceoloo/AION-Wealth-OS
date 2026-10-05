"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Link2, RefreshCw, ShieldCheck, Unlink } from "lucide-react";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import { useApp } from "@/lib/store/provider";
import type { Connection } from "@/lib/domain/types";
import {
  createLinkTokenAction,
  disconnectConnectionAction,
  exchangePublicTokenAction,
  plaidAvailableAction,
  syncConnectionAction,
} from "@/lib/plaid/actions";
import type { SkippedAccount } from "@/lib/plaid/normalize";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Note } from "@/components/app/primitives";

/**
 * "Connect accounts": the optional bank connection, via Plaid's own Link
 * widget. The user signs in to their bank inside Plaid; AION never sees the
 * login, and the resulting access token never leaves the server.
 */

/**
 * What the OAuth return page needs to resume Link: the Link token, and the
 * connection being repaired, if any. A link token grants nothing on its own
 * and expires within hours; it is session-scoped and cleared on completion.
 */
const LINK_SESSION_KEY = "aion.plaid.link";

interface LinkSession {
  token: string;
  repairId: string | null;
}

export function readLinkSession(): LinkSession | null {
  try {
    const raw = window.sessionStorage.getItem(LINK_SESSION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LinkSession>;
    return typeof v.token === "string" ? { token: v.token, repairId: typeof v.repairId === "string" ? v.repairId : null } : null;
  } catch {
    return null;
  }
}

function writeLinkSession(v: LinkSession | null): void {
  try {
    if (v) window.sessionStorage.setItem(LINK_SESSION_KEY, JSON.stringify(v));
    else window.sessionStorage.removeItem(LINK_SESSION_KEY);
  } catch {
    /* storage unavailable: OAuth banks will need a retry */
  }
}

const MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Your session expired. Please sign in again.",
  PLAID_NOT_CONFIGURED: "Bank connections aren't set up on this deployment yet.",
  CONNECTION_LIMIT_REACHED: "You've reached the number of connections available during the pilot.",
  CONNECTION_NOT_FOUND: "That connection no longer exists.",
  CONNECTIONS_CANNOT_BE_REVOKED: "Connections can't be revoked right now, so nothing was deleted.",
  TRANSLATION_FAILED: "Your bank returned figures AION couldn't read. Nothing was changed.",
  PLAID_ITEM_LOGIN_REQUIRED: "Your bank needs you to sign in again. Use “Fix connection”.",
  NOT_AVAILABLE_IN_DEMO: "Connections aren't available in the demo.",
};

export function connectionErrorMessage(code: string): string {
  return MESSAGES[code] ?? (code.startsWith("PLAID_") ? "Plaid couldn't complete that request. Please try again." : "Something went wrong. Please try again.");
}

function skippedNote(skipped: SkippedAccount[]): string | undefined {
  if (skipped.length === 0) return undefined;
  const names = skipped.map((s) => s.label).join(", ");
  return `Not imported (AION tracks US-dollar bank, card and loan accounts only): ${names}.`;
}

function statusBadge(c: Connection) {
  if (c.status === "active") return <Badge variant="success">Connected</Badge>;
  if (c.status === "login_required") return <Badge variant="warning">Needs sign-in</Badge>;
  return <Badge variant="danger">Not syncing</Badge>;
}

function syncedLabel(iso: string | null): string {
  if (!iso) return "Not synced yet";
  const d = new Date(iso);
  return `Synced ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

export function ConnectedAccounts() {
  const { mode, canWrite, bundle, runConnectionAction } = useApp();
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (mode !== "real") return;
    let live = true;
    plaidAvailableAction()
      .then((ok) => live && setAvailable(ok))
      .catch(() => live && setAvailable(false));
    return () => {
      live = false;
    };
  }, [mode]);

  if (mode !== "real") {
    return (
      <Note>
        Connecting a bank is available once you sign in. The demo uses synthetic figures only.
      </Note>
    );
  }
  if (available === null) return null;
  if (!available) {
    return bundle.connections.length > 0 ? (
      <Note>Bank connections are temporarily unavailable. Your imported accounts are still here.</Note>
    ) : null;
  }

  return <ConnectionsPanel canWrite={canWrite} connections={bundle.connections} run={runConnectionAction} />;
}

/**
 * Finishes a Link session: exchange the public token (new connection) or
 * refresh the repaired one (update mode). Shared with the OAuth return page.
 */
export function useCompleteLink(setBusy: (v: string | null) => void = () => {}) {
  const { runConnectionAction: run } = useApp();
  return useCallback(
    async (publicToken: string | null, repairId: string | null): Promise<boolean> => {
      writeLinkSession(null);
      if (repairId) {
        setBusy(repairId);
        const res = await run(() => syncConnectionAction(repairId));
        setBusy(null);
        if (res.ok) toast.success("Connection repaired");
        else toast.error("Couldn't refresh the connection", { description: connectionErrorMessage(res.error) });
        return res.ok;
      }
      if (!publicToken) {
        toast.error("Couldn't connect that account", { description: connectionErrorMessage("PLAID_NO_PUBLIC_TOKEN") });
        return false;
      }
      setBusy("connect");
      let skipped: SkippedAccount[] = [];
      const res = await run(async () => {
        const r = await exchangePublicTokenAction(publicToken);
        if (r.ok) skipped = r.skipped;
        return r;
      });
      setBusy(null);
      if (res.ok) toast.success("Account connected", { description: skippedNote(skipped) });
      else toast.error("Couldn't connect that account", { description: connectionErrorMessage(res.error) });
      return res.ok;
    },
    [run, setBusy],
  );
}

function ConnectionsPanel({
  canWrite,
  connections,
  run,
}: {
  canWrite: boolean;
  connections: Connection[];
  run: ReturnType<typeof useApp>["runConnectionAction"];
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [repairing, setRepairing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const completeLink = useCompleteLink(setBusy);
  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    (publicToken) => {
      setLinkToken(null);
      const id = repairing;
      setRepairing(null);
      void completeLink(publicToken, id);
    },
    [repairing, completeLink],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => {
      setLinkToken(null);
      setRepairing(null);
      writeLinkSession(null);
    },
  });

  // Open Link as soon as the widget has loaded with a fresh token.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function startLink(connectionId?: string) {
    setBusy(connectionId ?? "connect");
    const r = await createLinkTokenAction(connectionId);
    setBusy(null);
    if (!r.ok) {
      toast.error("Couldn't start the connection", { description: connectionErrorMessage(r.code) });
      return;
    }
    // Needed only if the bank uses an OAuth redirect: /plaid/oauth resumes Link.
    writeLinkSession({ token: r.linkToken, repairId: connectionId ?? null });
    setRepairing(connectionId ?? null);
    setLinkToken(r.linkToken);
  }

  async function refresh(c: Connection) {
    setBusy(c.id);
    let skipped: SkippedAccount[] = [];
    const res = await run(async () => {
      const r = await syncConnectionAction(c.id);
      if (r.ok) skipped = r.skipped;
      return r;
    });
    setBusy(null);
    if (res.ok) toast.success("Refreshed", { description: skippedNote(skipped) });
    else toast.error("Couldn't refresh", { description: connectionErrorMessage(res.error) });
  }

  async function remove(c: Connection) {
    setBusy(c.id);
    const res = await run(() => disconnectConnectionAction(c.id));
    setBusy(null);
    setConfirming(null);
    if (res.ok) toast.success(`Disconnected ${c.institutionName ?? "the account"}`);
    else toast.error("Nothing was disconnected", { description: connectionErrorMessage(res.error) });
  }

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-4 px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-surface text-primary">
            <Link2 className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">Connect accounts</p>
            <p className="text-sm text-muted-foreground">
              Optional. Instead of typing balances, let your bank report them. You sign in through
              Plaid, not AION.
            </p>
          </div>
        </div>

        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex gap-2">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" />
            AION never sees your bank login or full account numbers.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" />
            We read balances, limits, minimum payments, due dates and APRs where your bank shares
            them. Transactions are not stored.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" />
            Disconnect any time. Deleting your data also revokes every connection.
          </li>
        </ul>

        {connections.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {connections.map((c) => (
              <li key={c.id} className="space-y-3 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Building2 className="mt-0.5 size-4 shrink-0 text-subtle" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.institutionName ?? "Connected institution"}</p>
                      <p className="text-xs text-subtle">{syncedLabel(c.lastSyncedAt)}</p>
                    </div>
                  </div>
                  {statusBadge(c)}
                </div>

                {confirming === c.id ? (
                  <div className="space-y-2 rounded-lg bg-danger-surface/60 p-3">
                    <p className="text-sm text-danger">
                      Disconnect {c.institutionName ?? "this institution"}? AION&apos;s access is revoked at
                      Plaid and the accounts imported from it are removed. Accounts you added yourself stay.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="destructive" size="sm" disabled={busy !== null} onClick={() => void remove(c)}>
                        Disconnect
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {c.status === "active" ? (
                      <Button variant="secondary" size="sm" disabled={!canWrite || busy !== null} onClick={() => void refresh(c)}>
                        <RefreshCw data-icon="inline-start" className={busy === c.id ? "animate-spin" : undefined} />
                        Refresh
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" disabled={!canWrite || busy !== null} onClick={() => void startLink(c.id)}>
                        Fix connection
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" disabled={!canWrite || busy !== null} onClick={() => setConfirming(c.id)}>
                      <Unlink data-icon="inline-start" />
                      Disconnect
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        <Button className="w-full sm:w-auto" disabled={!canWrite || busy !== null} onClick={() => void startLink()}>
          <Link2 data-icon="inline-start" />
          {busy === "connect" ? "Connecting…" : connections.length > 0 ? "Connect another account" : "Connect an account"}
        </Button>
      </CardContent>
    </Card>
  );
}
