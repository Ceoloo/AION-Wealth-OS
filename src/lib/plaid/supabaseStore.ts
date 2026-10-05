import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, FinancialSnapshot } from "../domain/types";
import { accountToRow, rowToAccount, rowToSnapshot, snapshotToRow } from "../supabase/mappers";
import type { ConnectionStatus, ConnectionStore, StoredItem } from "./service";

/**
 * ConnectionStore over a SERVICE-ROLE Supabase client. RLS does not apply to
 * that client, so every query below filters by owner_id itself. The single
 * exception, findItemByPlaidId, is how a webhook (which carries only Plaid's
 * item id) learns the owner; everything after it is owner-scoped.
 */

type Row = Record<string, unknown>;

function rowToItem(r: Row): StoredItem {
  const status = String(r.status);
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    plaidItemId: String(r.item_id),
    accessTokenCiphertext: String(r.access_token_ciphertext),
    status: (status === "login_required" || status === "error" ? status : "active") as ConnectionStatus,
  };
}

const ITEM_COLUMNS = "id, owner_id, item_id, access_token_ciphertext, status";

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

function connectedAccountRow(a: Account): Row {
  const row = accountToRow(a);
  return {
    ...row,
    created_at: a.createdAt,
    source: "connected_account",
    plaid_item_id: a.plaidItemId,
    field_sources: a.fieldSources ?? {},
    synced_at: a.syncedAt ?? null,
  };
}

export function createSupabaseConnectionStore(db: SupabaseClient): ConnectionStore {
  return {
    async getItem(ownerId, id) {
      const { data, error } = await db
        .from("plaid_items")
        .select(ITEM_COLUMNS)
        .eq("owner_id", ownerId)
        .eq("id", id)
        .maybeSingle();
      check(error, "getItem");
      return data ? rowToItem(data) : null;
    },

    async findItemByPlaidId(plaidItemId) {
      const { data, error } = await db.from("plaid_items").select(ITEM_COLUMNS).eq("item_id", plaidItemId).maybeSingle();
      check(error, "findItemByPlaidId");
      return data ? rowToItem(data) : null;
    },

    async listItems(ownerId) {
      const { data, error } = await db.from("plaid_items").select(ITEM_COLUMNS).eq("owner_id", ownerId).order("created_at");
      check(error, "listItems");
      return (data ?? []).map(rowToItem);
    },

    async insertItem(row) {
      const { data, error } = await db
        .from("plaid_items")
        .insert({
          owner_id: row.ownerId,
          item_id: row.plaidItemId,
          access_token_ciphertext: row.accessTokenCiphertext,
          institution_id: row.institutionId,
          institution_name: row.institutionName,
        })
        .select(ITEM_COLUMNS)
        .single();
      check(error, "insertItem");
      return rowToItem(data as Row);
    },

    async updateItem(ownerId, id, patch) {
      const update: Row = { updated_at: new Date().toISOString() };
      if (patch.status) update.status = patch.status;
      if (patch.errorCode !== undefined) update.error_code = patch.errorCode;
      if (patch.lastSyncedAt) update.last_synced_at = patch.lastSyncedAt;
      const { error } = await db.from("plaid_items").update(update).eq("owner_id", ownerId).eq("id", id);
      check(error, "updateItem");
    },

    async deleteItem(ownerId, id) {
      const { error } = await db.from("plaid_items").delete().eq("owner_id", ownerId).eq("id", id);
      check(error, "deleteItem");
    },

    async listAccounts(ownerId) {
      const { data, error } = await db.from("accounts").select("*").eq("owner_id", ownerId).order("created_at");
      check(error, "listAccounts");
      return (data ?? []).map((r: Row) => ({
        account: rowToAccount(r),
        plaidAccountId: r.plaid_account_id == null ? null : String(r.plaid_account_id),
      }));
    },

    async insertAccount(account, plaidAccountId) {
      const { error } = await db
        .from("accounts")
        .insert({ ...connectedAccountRow(account), owner_id: account.ownerId, plaid_account_id: plaidAccountId });
      check(error, "insertAccount");
    },

    async updateAccount(account) {
      const row = connectedAccountRow(account);
      delete row.id;
      delete row.owner_id;
      delete row.created_at;
      const { error } = await db.from("accounts").update(row).eq("owner_id", account.ownerId).eq("id", account.id);
      check(error, "updateAccount");
    },

    async deleteAccounts(ownerId, ids) {
      if (ids.length === 0) return;
      // Only connected accounts are ever removed by a sync.
      const { error } = await db
        .from("accounts")
        .delete()
        .eq("owner_id", ownerId)
        .eq("source", "connected_account")
        .in("id", ids);
      check(error, "deleteAccounts");
    },

    async latestSnapshot(ownerId) {
      const { data, error } = await db
        .from("financial_snapshots")
        .select("*")
        .eq("owner_id", ownerId)
        .order("as_of", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      check(error, "latestSnapshot");
      return data ? rowToSnapshot(data) : null;
    },

    async insertSnapshot(s: FinancialSnapshot) {
      const { error } = await db
        .from("financial_snapshots")
        .insert({ ...snapshotToRow(s), field_sources: s.fieldSources ?? {} });
      check(error, "insertSnapshot");
    },
  };
}
