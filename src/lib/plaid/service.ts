import type { Account, FinancialSnapshot } from "../domain/types";
import type { PlaidGateway } from "./gateway";
import { PlaidApiError } from "./gateway";
import { deriveSnapshot, mergeConnectedAccount, normalizeItem, type SkippedAccount } from "./normalize";
import { decryptToken, encryptToken } from "./tokenCrypto";

/**
 * Connection workflows: connect, sync, disconnect, revoke-all, webhooks.
 *
 * Storage and Plaid are both injected, so these run unchanged against a fake
 * in unit tests, against local Supabase in CI, and against production.
 *
 * Invariants:
 *  - Every storage call is scoped by owner_id, even under the service role
 *    (which bypasses RLS). The one lookup that cannot be — a webhook arrives
 *    with only Plaid's item_id — returns the owner, which then scopes the rest.
 *  - The access token is decrypted only in memory, only for the Plaid call
 *    that needs it, and is never logged, returned, or written anywhere else.
 */

export type ConnectionStatus = "active" | "login_required" | "error";

export interface StoredItem {
  id: string;
  ownerId: string;
  plaidItemId: string;
  accessTokenCiphertext: string;
  status: ConnectionStatus;
}

export interface StoredAccount {
  account: Account;
  plaidAccountId: string | null;
}

export interface ConnectionStore {
  getItem(ownerId: string, id: string): Promise<StoredItem | null>;
  /** Webhook-only: Plaid identifies items by its own id. */
  findItemByPlaidId(plaidItemId: string): Promise<StoredItem | null>;
  listItems(ownerId: string): Promise<StoredItem[]>;
  insertItem(row: {
    ownerId: string;
    plaidItemId: string;
    accessTokenCiphertext: string;
    institutionId: string | null;
    institutionName: string | null;
  }): Promise<StoredItem>;
  updateItem(
    ownerId: string,
    id: string,
    patch: { status?: ConnectionStatus; errorCode?: string | null; lastSyncedAt?: string },
  ): Promise<void>;
  deleteItem(ownerId: string, id: string): Promise<void>;
  listAccounts(ownerId: string): Promise<StoredAccount[]>;
  insertAccount(account: Account, plaidAccountId: string): Promise<void>;
  updateAccount(account: Account): Promise<void>;
  deleteAccounts(ownerId: string, ids: string[]): Promise<void>;
  latestSnapshot(ownerId: string): Promise<FinancialSnapshot | null>;
  insertSnapshot(snapshot: FinancialSnapshot): Promise<void>;
}

export interface ServiceDeps {
  store: ConnectionStore;
  plaid: PlaidGateway;
  tokenKey: Buffer;
  now: () => Date;
  newId: () => string;
  maxItemsPerUser: number;
}

export interface SyncReport {
  connectionId: string;
  accountsUpdated: number;
  accountsAdded: number;
  accountsRemoved: number;
  skipped: SkippedAccount[];
  snapshotCreated: boolean;
}

export class ConnectionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ConnectionError";
  }
}

/** Plaid codes that mean the user must sign in to their bank again. */
const LOGIN_REQUIRED = new Set(["ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "PENDING_DISCONNECT"]);

// ---------------------------------------------------------------------------

export async function createLinkToken(deps: ServiceDeps, ownerId: string, connectionId?: string): Promise<string> {
  if (!connectionId) {
    const items = await deps.store.listItems(ownerId);
    if (items.length >= deps.maxItemsPerUser) throw new ConnectionError("CONNECTION_LIMIT_REACHED");
    return deps.plaid.createLinkToken({ userId: ownerId });
  }
  // Update mode, to repair a connection that needs the user to sign in again.
  const item = await deps.store.getItem(ownerId, connectionId);
  if (!item) throw new ConnectionError("CONNECTION_NOT_FOUND");
  return deps.plaid.createLinkToken({ userId: ownerId, accessToken: decryptToken(item.accessTokenCiphertext, deps.tokenKey) });
}

/**
 * Finishes Link: swaps the one-time public token for the permanent access
 * token, stores it encrypted, and runs the first sync.
 *
 * If storing fails after Plaid issued the token, the token is revoked at Plaid
 * so no live access exists that AION has no record of.
 */
export async function connect(deps: ServiceDeps, ownerId: string, publicToken: string): Promise<SyncReport> {
  const items = await deps.store.listItems(ownerId);
  if (items.length >= deps.maxItemsPerUser) throw new ConnectionError("CONNECTION_LIMIT_REACHED");

  const { accessToken, itemId } = await deps.plaid.exchangePublicToken(publicToken);
  let stored: StoredItem;
  try {
    const inst = await deps.plaid.getItem(accessToken);
    stored = await deps.store.insertItem({
      ownerId,
      plaidItemId: itemId,
      accessTokenCiphertext: encryptToken(accessToken, deps.tokenKey),
      institutionId: inst.institutionId,
      institutionName: inst.institutionName,
    });
  } catch (err) {
    await deps.plaid.removeItem(accessToken).catch(() => undefined);
    throw err;
  }
  return sync(deps, ownerId, stored.id);
}

/**
 * Refreshes one connection: accounts, liabilities, then a derived snapshot.
 * Accounts Plaid no longer returns (closed, or deselected by the user in Link)
 * are removed rather than left to go stale.
 */
export async function sync(deps: ServiceDeps, ownerId: string, connectionId: string): Promise<SyncReport> {
  const item = await deps.store.getItem(ownerId, connectionId);
  if (!item) throw new ConnectionError("CONNECTION_NOT_FOUND");
  const accessToken = decryptToken(item.accessTokenCiphertext, deps.tokenKey);

  let plaidAccounts, liabilities;
  try {
    [plaidAccounts, liabilities] = await Promise.all([
      deps.plaid.getAccounts(accessToken),
      deps.plaid.getLiabilities(accessToken),
    ]);
  } catch (err) {
    if (err instanceof PlaidApiError) {
      await deps.store.updateItem(ownerId, item.id, {
        status: LOGIN_REQUIRED.has(err.code) ? "login_required" : "error",
        errorCode: err.code,
      });
    }
    throw err;
  }

  const now = deps.now().toISOString();
  const normalized = normalizeItem(plaidAccounts, liabilities);
  const stored = await deps.store.listAccounts(ownerId);
  const byPlaidId = new Map(
    stored.filter((s) => s.account.plaidItemId === item.id && s.plaidAccountId).map((s) => [s.plaidAccountId!, s.account]),
  );

  // Translate and validate everything before writing anything, so one bad
  // figure cannot leave a half-applied sync behind.
  const planned = normalized.accounts.map((n) => {
    const existing = byPlaidId.get(n.plaidAccountId) ?? null;
    const account = mergeConnectedAccount(existing, n, { id: deps.newId(), ownerId, plaidItemId: item.id, now });
    return { account, plaidAccountId: n.plaidAccountId, isNew: existing === null };
  });

  let added = 0;
  let updated = 0;
  for (const p of planned) {
    if (p.isNew) {
      await deps.store.insertAccount(p.account, p.plaidAccountId);
      added++;
    } else {
      await deps.store.updateAccount(p.account);
      updated++;
    }
  }
  const merged = planned.map((p) => p.account);

  const seen = new Set(normalized.accounts.map((n) => n.plaidAccountId));
  const gone = [...byPlaidId.entries()].filter(([pid]) => !seen.has(pid)).map(([, a]) => a.id);
  if (gone.length > 0) await deps.store.deleteAccounts(ownerId, gone);

  // The snapshot is derived from ALL of the owner's accounts, not just this
  // connection's, so it reflects their whole picture.
  const goneSet = new Set(gone);
  const mergedIds = new Set(merged.map((a) => a.id));
  const allAccounts = [
    ...stored.map((s) => s.account).filter((a) => !goneSet.has(a.id) && !mergedIds.has(a.id)),
    ...merged,
  ];
  const prev = await deps.store.latestSnapshot(ownerId);
  const snapshot = deriveSnapshot(
    prev,
    allAccounts,
    normalized.accounts.some((n) => n.overdue),
    { id: deps.newId(), ownerId, asOf: now.slice(0, 10), now },
  );
  if (snapshot) await deps.store.insertSnapshot(snapshot);

  await deps.store.updateItem(ownerId, item.id, { status: "active", errorCode: null, lastSyncedAt: now });

  return {
    connectionId: item.id,
    accountsAdded: added,
    accountsUpdated: updated,
    accountsRemoved: gone.length,
    skipped: normalized.skipped,
    snapshotCreated: snapshot !== null,
  };
}

/**
 * Disconnects: revokes access at Plaid FIRST, then deletes the connection
 * (its accounts cascade). If Plaid cannot confirm, nothing is deleted, so AION
 * never forgets a token that still works.
 */
export async function disconnect(deps: ServiceDeps, ownerId: string, connectionId: string): Promise<void> {
  const item = await deps.store.getItem(ownerId, connectionId);
  if (!item) throw new ConnectionError("CONNECTION_NOT_FOUND");
  await deps.plaid.removeItem(decryptToken(item.accessTokenCiphertext, deps.tokenKey));
  await deps.store.deleteItem(ownerId, item.id);
}

/**
 * Before "delete my data": revoke every connection at Plaid. Throws on the
 * first one Plaid cannot confirm; the caller then deletes nothing.
 */
export async function revokeAll(deps: ServiceDeps, ownerId: string): Promise<number> {
  const items = await deps.store.listItems(ownerId);
  for (const item of items) {
    await deps.plaid.removeItem(decryptToken(item.accessTokenCiphertext, deps.tokenKey));
  }
  return items.length;
}

// ---------------------------------------------------------------------------
// Webhooks (already signature-verified by the caller).
// ---------------------------------------------------------------------------

export interface PlaidWebhook {
  webhook_type?: unknown;
  webhook_code?: unknown;
  item_id?: unknown;
  error?: { error_code?: unknown } | null;
}

export type WebhookOutcome = "synced" | "sync_failed" | "status_updated" | "ignored" | "unknown_item";

const REFRESH = new Set([
  "TRANSACTIONS:SYNC_UPDATES_AVAILABLE",
  "TRANSACTIONS:DEFAULT_UPDATE",
  "TRANSACTIONS:INITIAL_UPDATE",
  "TRANSACTIONS:HISTORICAL_UPDATE",
  "LIABILITIES:DEFAULT_UPDATE",
  "ITEM:LOGIN_REPAIRED",
]);

export async function handleWebhook(deps: ServiceDeps, body: PlaidWebhook): Promise<WebhookOutcome> {
  const type = typeof body.webhook_type === "string" ? body.webhook_type : "";
  const code = typeof body.webhook_code === "string" ? body.webhook_code : "";
  const plaidItemId = typeof body.item_id === "string" ? body.item_id : "";
  if (!plaidItemId) return "ignored";

  const item = await deps.store.findItemByPlaidId(plaidItemId);
  if (!item) return "unknown_item";
  const key = `${type}:${code}`;

  if (REFRESH.has(key)) {
    try {
      await sync(deps, item.ownerId, item.id);
      return "synced";
    } catch {
      // sync() already recorded the connection's status for the user to see.
      return "sync_failed";
    }
  }

  if (type === "ITEM") {
    const errCode = typeof body.error?.error_code === "string" ? body.error.error_code : null;
    switch (code) {
      case "ERROR":
        await deps.store.updateItem(item.ownerId, item.id, {
          status: errCode && LOGIN_REQUIRED.has(errCode) ? "login_required" : "error",
          errorCode: errCode,
        });
        return "status_updated";
      case "PENDING_EXPIRATION":
      case "PENDING_DISCONNECT":
        await deps.store.updateItem(item.ownerId, item.id, { status: "login_required", errorCode: code });
        return "status_updated";
      case "USER_PERMISSION_REVOKED":
      case "USER_ACCOUNT_REVOKED":
        await deps.store.updateItem(item.ownerId, item.id, { status: "error", errorCode: code });
        return "status_updated";
    }
  }
  return "ignored";
}
