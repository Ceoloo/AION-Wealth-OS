import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Account, FinancialSnapshot } from "../domain/types";
import { PlaidApiError, type PlaidGateway } from "./gateway";
import type { PlaidAccountLike, PlaidLiabilitiesLike } from "./normalize";
import {
  connect,
  ConnectionError,
  createLinkToken,
  disconnect,
  handleWebhook,
  revokeAll,
  sync,
  type ConnectionStore,
  type ServiceDeps,
  type StoredAccount,
  type StoredItem,
} from "./service";
import { decryptToken } from "./tokenCrypto";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class MemoryStore implements ConnectionStore {
  items: (StoredItem & { institutionName: string | null; errorCode: string | null; lastSyncedAt: string | null })[] = [];
  accounts: StoredAccount[] = [];
  snapshots: FinancialSnapshot[] = [];
  failInsertItem = false;
  private n = 0;

  async getItem(ownerId: string, id: string) {
    return this.items.find((i) => i.ownerId === ownerId && i.id === id) ?? null;
  }
  async findItemByPlaidId(pid: string) {
    return this.items.find((i) => i.plaidItemId === pid) ?? null;
  }
  async listItems(ownerId: string) {
    return this.items.filter((i) => i.ownerId === ownerId);
  }
  async insertItem(row: Parameters<ConnectionStore["insertItem"]>[0]) {
    if (this.failInsertItem) throw new Error("db down");
    const item = {
      id: `row-${++this.n}`,
      ownerId: row.ownerId,
      plaidItemId: row.plaidItemId,
      accessTokenCiphertext: row.accessTokenCiphertext,
      status: "active" as const,
      institutionName: row.institutionName,
      errorCode: null,
      lastSyncedAt: null,
    };
    this.items.push(item);
    return item;
  }
  async updateItem(ownerId: string, id: string, patch: Parameters<ConnectionStore["updateItem"]>[2]) {
    const i = this.items.find((x) => x.ownerId === ownerId && x.id === id);
    if (!i) return;
    if (patch.status) i.status = patch.status;
    if (patch.errorCode !== undefined) i.errorCode = patch.errorCode;
    if (patch.lastSyncedAt) i.lastSyncedAt = patch.lastSyncedAt;
  }
  async deleteItem(ownerId: string, id: string) {
    this.items = this.items.filter((i) => !(i.ownerId === ownerId && i.id === id));
    // ON DELETE CASCADE
    this.accounts = this.accounts.filter((a) => a.account.plaidItemId !== id);
  }
  async listAccounts(ownerId: string) {
    return this.accounts.filter((a) => a.account.ownerId === ownerId);
  }
  async insertAccount(account: Account, plaidAccountId: string) {
    this.accounts.push({ account, plaidAccountId });
  }
  async updateAccount(account: Account) {
    const s = this.accounts.find((a) => a.account.id === account.id && a.account.ownerId === account.ownerId);
    if (s) s.account = account;
  }
  async deleteAccounts(ownerId: string, ids: string[]) {
    this.accounts = this.accounts.filter((a) => !(a.account.ownerId === ownerId && ids.includes(a.account.id)));
  }
  async latestSnapshot(ownerId: string) {
    return this.snapshots.filter((s) => s.ownerId === ownerId).at(-1) ?? null;
  }
  async insertSnapshot(s: FinancialSnapshot) {
    this.snapshots.push(s);
  }
}

const bank = (id: string, available: number): PlaidAccountLike => ({
  account_id: id,
  name: "Checking",
  mask: "0000",
  type: "depository",
  subtype: "checking",
  balances: { available, current: available, limit: null, iso_currency_code: "USD" },
});
const card = (id: string, owed: number): PlaidAccountLike => ({
  account_id: id,
  name: "Card",
  mask: "3333",
  type: "credit",
  subtype: "credit card",
  balances: { available: null, current: owed, limit: 1000, iso_currency_code: "USD" },
});

class FakePlaid implements PlaidGateway {
  accounts: PlaidAccountLike[] = [bank("chk", 500), card("cc", 250)];
  liabilities: PlaidLiabilitiesLike | null = {
    credit: [{ account_id: "cc", aprs: [], is_overdue: false, minimum_payment_amount: 25, next_payment_due_date: "2026-10-20" }],
  };
  removed: string[] = [];
  removeError: string | null = null;
  accountsError: string | null = null;
  linkCalls: { userId: string; accessToken?: string }[] = [];
  private n = 0;

  async createLinkToken(args: { userId: string; accessToken?: string }) {
    this.linkCalls.push(args);
    return "link-sandbox-token";
  }
  async exchangePublicToken(_pt: string) {
    this.n++;
    return { accessToken: `access-sandbox-${this.n}`, itemId: `plaid-item-${this.n}` };
  }
  async getItem() {
    return { institutionId: "ins_109508", institutionName: "First Platypus Bank" };
  }
  async getAccounts() {
    if (this.accountsError) throw new PlaidApiError(this.accountsError, "ITEM_ERROR");
    return this.accounts;
  }
  async getLiabilities() {
    return this.liabilities;
  }
  async removeItem(token: string) {
    if (this.removeError) throw new PlaidApiError(this.removeError, "API_ERROR");
    this.removed.push(token);
  }
  async getWebhookVerificationKey(): Promise<never> {
    throw new Error("unused");
  }
}

// ---------------------------------------------------------------------------

const OWNER = "owner-a";
const OTHER = "owner-b";
let store: MemoryStore;
let plaid: FakePlaid;
let deps: ServiceDeps;

beforeEach(() => {
  store = new MemoryStore();
  plaid = new FakePlaid();
  let id = 0;
  deps = {
    store,
    plaid,
    tokenKey: randomBytes(32),
    now: () => new Date("2026-10-05T12:00:00.000Z"),
    newId: () => `uuid-${++id}`,
    maxItemsPerUser: 2,
  };
});

describe("connect", () => {
  it("stores the access token encrypted, never in the clear", async () => {
    await connect(deps, OWNER, "public-sandbox-x");
    const item = store.items[0]!;
    expect(item.accessTokenCiphertext).not.toContain("access-sandbox");
    expect(decryptToken(item.accessTokenCiphertext, deps.tokenKey)).toBe("access-sandbox-1");
    expect(item.institutionName).toBe("First Platypus Bank");
  });

  it("runs the first sync: accounts tagged connected_account and a derived snapshot", async () => {
    const report = await connect(deps, OWNER, "public-sandbox-x");
    expect(report).toMatchObject({ accountsAdded: 2, accountsUpdated: 0, snapshotCreated: true });
    expect(store.accounts.every((a) => a.account.source === "connected_account")).toBe(true);
    expect(store.snapshots[0]).toMatchObject({ availableCashCents: 50000, liabilitiesCents: 25000, requiredDebtPaymentsCents: 2500 });
    expect(store.items[0]!.lastSyncedAt).toBe("2026-10-05T12:00:00.000Z");
  });

  it("revokes the new token at Plaid if it cannot be stored", async () => {
    store.failInsertItem = true;
    await expect(connect(deps, OWNER, "public-sandbox-x")).rejects.toThrow("db down");
    expect(plaid.removed).toEqual(["access-sandbox-1"]);
  });

  it("enforces the per-user connection limit before calling Plaid", async () => {
    await connect(deps, OWNER, "p1");
    await connect(deps, OWNER, "p2");
    await expect(connect(deps, OWNER, "p3")).rejects.toEqual(new ConnectionError("CONNECTION_LIMIT_REACHED"));
    await expect(createLinkToken(deps, OWNER)).rejects.toEqual(new ConnectionError("CONNECTION_LIMIT_REACHED"));
    // Another user is unaffected.
    await expect(createLinkToken(deps, OTHER)).resolves.toBe("link-sandbox-token");
  });
});

describe("createLinkToken", () => {
  it("uses the user id as Plaid's client_user_id and opens update mode for a repair", async () => {
    await connect(deps, OWNER, "p1");
    await createLinkToken(deps, OWNER, store.items[0]!.id);
    expect(plaid.linkCalls.at(-1)).toEqual({ userId: OWNER, accessToken: "access-sandbox-1" });
  });

  it("refuses update mode for another user's connection", async () => {
    await connect(deps, OWNER, "p1");
    await expect(createLinkToken(deps, OTHER, store.items[0]!.id)).rejects.toEqual(
      new ConnectionError("CONNECTION_NOT_FOUND"),
    );
  });
});

describe("sync", () => {
  it("updates in place on re-sync and does not duplicate accounts", async () => {
    await connect(deps, OWNER, "p1");
    plaid.accounts = [bank("chk", 800), card("cc", 250)];
    const r = await sync(deps, OWNER, store.items[0]!.id);
    expect(r).toMatchObject({ accountsAdded: 0, accountsUpdated: 2 });
    expect(store.accounts).toHaveLength(2);
    expect(store.accounts.find((a) => a.plaidAccountId === "chk")!.account.balanceCents).toBe(80000);
  });

  it("does not add a snapshot when nothing changed", async () => {
    await connect(deps, OWNER, "p1");
    const r = await sync(deps, OWNER, store.items[0]!.id);
    expect(r.snapshotCreated).toBe(false);
    expect(store.snapshots).toHaveLength(1);
  });

  it("removes accounts Plaid no longer returns", async () => {
    await connect(deps, OWNER, "p1");
    plaid.accounts = [bank("chk", 500)];
    const r = await sync(deps, OWNER, store.items[0]!.id);
    expect(r.accountsRemoved).toBe(1);
    expect(store.accounts.map((a) => a.plaidAccountId)).toEqual(["chk"]);
  });

  it("never touches the user's own accounts", async () => {
    const mine: Account = {
      id: "manual-1",
      ownerId: OWNER,
      nickname: "Car loan",
      classification: "personal",
      kind: "loan",
      balanceCents: 900000,
      aprBps: null,
      minPaymentCents: 30000,
      pastDueCents: 0,
      dueDate: null,
      creditLimitCents: null,
      isRevolving: false,
      includeInSnapshot: true,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    store.accounts.push({ account: mine, plaidAccountId: null });
    await connect(deps, OWNER, "p1");
    expect(store.accounts.find((a) => a.account.id === "manual-1")!.account).toEqual(mine);
    // ...but they count toward the derived totals.
    expect(store.snapshots[0]!.liabilitiesCents).toBe(25000 + 900000);
  });

  it("marks the connection login_required when the bank needs a fresh sign-in", async () => {
    await connect(deps, OWNER, "p1");
    plaid.accountsError = "ITEM_LOGIN_REQUIRED";
    await expect(sync(deps, OWNER, store.items[0]!.id)).rejects.toBeInstanceOf(PlaidApiError);
    expect(store.items[0]).toMatchObject({ status: "login_required", errorCode: "ITEM_LOGIN_REQUIRED" });
  });

  it("cannot sync another user's connection", async () => {
    await connect(deps, OWNER, "p1");
    await expect(sync(deps, OTHER, store.items[0]!.id)).rejects.toEqual(new ConnectionError("CONNECTION_NOT_FOUND"));
  });

  it("writes nothing if any account fails validation", async () => {
    await connect(deps, OWNER, "p1");
    const before = JSON.stringify(store.accounts);
    plaid.accounts = [bank("chk", 999), { ...card("cc", 250), balances: { ...card("cc", 250).balances, limit: -5 } }];
    await expect(sync(deps, OWNER, store.items[0]!.id)).rejects.toThrow(/failed validation/);
    expect(JSON.stringify(store.accounts)).toBe(before);
  });
});

describe("disconnect", () => {
  it("revokes at Plaid, then deletes the connection and its accounts", async () => {
    const mine = { account: { id: "manual", ownerId: OWNER, plaidItemId: null } as Account, plaidAccountId: null };
    store.accounts.push(mine);
    await connect(deps, OWNER, "p1");
    await disconnect(deps, OWNER, store.items[0]!.id);
    expect(plaid.removed).toEqual(["access-sandbox-1"]);
    expect(store.items).toHaveLength(0);
    expect(store.accounts.map((a) => a.account.id)).toEqual(["manual"]);
  });

  it("deletes nothing if Plaid cannot confirm the revocation", async () => {
    await connect(deps, OWNER, "p1");
    plaid.removeError = "INTERNAL_SERVER_ERROR";
    await expect(disconnect(deps, OWNER, store.items[0]!.id)).rejects.toBeInstanceOf(PlaidApiError);
    expect(store.items).toHaveLength(1);
    expect(store.accounts).toHaveLength(2);
  });

  it("cannot disconnect another user's connection", async () => {
    await connect(deps, OWNER, "p1");
    await expect(disconnect(deps, OTHER, store.items[0]!.id)).rejects.toEqual(new ConnectionError("CONNECTION_NOT_FOUND"));
    expect(plaid.removed).toEqual([]);
  });
});

describe("revokeAll", () => {
  it("revokes every one of the owner's connections and nobody else's", async () => {
    await connect(deps, OWNER, "p1");
    await connect(deps, OTHER, "p2");
    await connect(deps, OWNER, "p3");
    expect(await revokeAll(deps, OWNER)).toBe(2);
    expect(plaid.removed).toEqual(["access-sandbox-1", "access-sandbox-3"]);
  });

  it("stops at the first failure so the caller deletes nothing", async () => {
    await connect(deps, OWNER, "p1");
    plaid.removeError = "INTERNAL_SERVER_ERROR";
    await expect(revokeAll(deps, OWNER)).rejects.toBeInstanceOf(PlaidApiError);
  });
});

describe("handleWebhook", () => {
  beforeEach(async () => {
    await connect(deps, OWNER, "p1");
  });

  it("refreshes on a liabilities or transactions update", async () => {
    plaid.accounts = [bank("chk", 1234), card("cc", 250)];
    expect(await handleWebhook(deps, { webhook_type: "LIABILITIES", webhook_code: "DEFAULT_UPDATE", item_id: "plaid-item-1" })).toBe("synced");
    expect(store.accounts.find((a) => a.plaidAccountId === "chk")!.account.balanceCents).toBe(123400);
  });

  it("records a login-required error", async () => {
    const out = await handleWebhook(deps, {
      webhook_type: "ITEM",
      webhook_code: "ERROR",
      item_id: "plaid-item-1",
      error: { error_code: "ITEM_LOGIN_REQUIRED" },
    });
    expect(out).toBe("status_updated");
    expect(store.items[0]!.status).toBe("login_required");
  });

  it("records a revoked permission", async () => {
    await handleWebhook(deps, { webhook_type: "ITEM", webhook_code: "USER_PERMISSION_REVOKED", item_id: "plaid-item-1" });
    expect(store.items[0]).toMatchObject({ status: "error", errorCode: "USER_PERMISSION_REVOKED" });
  });

  it("ignores unknown items and unknown codes", async () => {
    expect(await handleWebhook(deps, { webhook_type: "ITEM", webhook_code: "ERROR", item_id: "nope" })).toBe("unknown_item");
    expect(await handleWebhook(deps, { webhook_type: "AUTH", webhook_code: "X", item_id: "plaid-item-1" })).toBe("ignored");
    expect(await handleWebhook(deps, { webhook_type: 7, item_id: null })).toBe("ignored");
  });
});
