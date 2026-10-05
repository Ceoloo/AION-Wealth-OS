/**
 * Connected-data integration test against a DISPOSABLE local Supabase (started
 * fresh by CI, every migration applied). Plaid is faked; everything else is
 * real: the service-role store, RLS, column grants, the provenance trigger and
 * delete_my_data().
 *
 * Proves, end to end:
 *  - a connection's token column is unreadable by its own user via the API;
 *  - connected figures arrive tagged connected_account, and a user edit is
 *    re-stamped user_reported by the database, whatever the client sends;
 *  - one user cannot see another's connections;
 *  - disconnect revokes at Plaid, then removes the connection and its
 *    accounts, keeping the user's own;
 *  - "delete my data" revokes at Plaid and leaves nothing behind.
 *
 * Env: IT_SUPABASE_URL, IT_SUPABASE_ANON_KEY, IT_SUPABASE_SERVICE_KEY.
 * Missing env => NOT RUN (or a failure when IT_REQUIRED=1). Never production.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accountFigureSource } from "../domain/provenance";
import { loadBundle } from "../supabase/data";
import { PlaidApiError, type PlaidGateway } from "./gateway";
import type { PlaidAccountLike } from "./normalize";
import { connect, disconnect, revokeAll, type ServiceDeps } from "./service";
import { createSupabaseConnectionStore } from "./supabaseStore";

const URL = process.env.IT_SUPABASE_URL;
const ANON = process.env.IT_SUPABASE_ANON_KEY;
const SERVICE = process.env.IT_SUPABASE_SERVICE_KEY;
const configured = Boolean(URL && ANON && SERVICE);

if (!configured && process.env.IT_REQUIRED === "1") {
  throw new Error("IT_REQUIRED=1 but IT_SUPABASE_URL / IT_SUPABASE_ANON_KEY / IT_SUPABASE_SERVICE_KEY are missing");
}
if (configured && /\.supabase\.co/.test(URL!)) {
  throw new Error("REFUSING: this test writes and deletes data; point it at a local, disposable Supabase.");
}
if (!configured) console.log("NOT RUN: connected-data integration (no local Supabase configured). It has NOT passed.");

class FakePlaid implements PlaidGateway {
  removed: string[] = [];
  removeFails = false;
  private n = 0;
  async createLinkToken() {
    return "link-sandbox-x";
  }
  async exchangePublicToken() {
    this.n++;
    return { accessToken: `access-sandbox-it-${randomUUID()}`, itemId: `it-item-${randomUUID()}` };
  }
  async getItem() {
    return { institutionId: "ins_109508", institutionName: "First Platypus Bank" };
  }
  async getAccounts(): Promise<PlaidAccountLike[]> {
    return [
      { account_id: "chk", name: "Checking", mask: "0000", type: "depository", subtype: "checking", balances: { available: 1200, current: 1250, limit: null, iso_currency_code: "USD" } },
      { account_id: "cc", name: "Card", mask: "3333", type: "credit", subtype: "credit card", balances: { available: null, current: 410, limit: 2000, iso_currency_code: "USD" } },
    ];
  }
  async getLiabilities() {
    return { credit: [{ account_id: "cc", aprs: [{ apr_percentage: 19.99, apr_type: "purchase_apr" }], is_overdue: false, minimum_payment_amount: 25, next_payment_due_date: "2026-10-20" }] };
  }
  async removeItem(token: string) {
    if (this.removeFails) throw new PlaidApiError("INTERNAL_SERVER_ERROR", "API_ERROR");
    this.removed.push(token);
  }
  async getWebhookVerificationKey(): Promise<never> {
    throw new Error("unused");
  }
}

async function newUser(admin: SupabaseClient): Promise<{ id: string; client: SupabaseClient }> {
  const email = `it-${randomUUID()}@example.test`;
  const password = randomBytes(18).toString("hex");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`signIn: ${signIn.error.message}`);
  return { id: data.user.id, client };
}

describe.skipIf(!configured)("connected data (local Supabase)", () => {
  let admin: SupabaseClient;
  let plaid: FakePlaid;
  let deps: ServiceDeps;
  let alice: { id: string; client: SupabaseClient };
  let bob: { id: string; client: SupabaseClient };

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } });
    plaid = new FakePlaid();
    deps = {
      store: createSupabaseConnectionStore(admin),
      plaid,
      tokenKey: randomBytes(32),
      now: () => new Date(),
      newId: () => randomUUID(),
      maxItemsPerUser: 3,
    };
    alice = await newUser(admin);
    bob = await newUser(admin);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const u of [alice, bob]) if (u) await admin.auth.admin.deleteUser(u.id);
  });

  it("connects: accounts tagged connected_account, snapshot derived, token stored encrypted", async () => {
    const report = await connect(deps, alice.id, "public-sandbox-it");
    expect(report.accountsAdded).toBe(2);

    const bundle = await loadBundle(alice.client, alice.id);
    expect(bundle.connections).toHaveLength(1);
    expect(bundle.connections[0]).toMatchObject({ institutionName: "First Platypus Bank", status: "active" });
    const card = bundle.accounts.find((a) => a.kind === "credit_card")!;
    expect(card).toMatchObject({ source: "connected_account", balanceCents: 41000, aprBps: 1999 });
    expect(card.fieldSources?.balanceCents).toBe("connected_account");
    const snap = bundle.snapshots.at(-1)!;
    expect(snap.availableCashCents).toBe(120000);
    expect(snap.fieldSources?.availableCashCents).toBe("derived");

    const { data } = await admin.from("plaid_items").select("access_token_ciphertext").eq("owner_id", alice.id).single();
    expect(String(data!.access_token_ciphertext)).toMatch(/^v1\./);
    expect(String(data!.access_token_ciphertext)).not.toContain("access-sandbox");
  });

  it("the token column is unreadable by its own user through the API", async () => {
    const explicit = await alice.client.from("plaid_items").select("access_token_ciphertext");
    expect(explicit.error).not.toBeNull();
    const star = await alice.client.from("plaid_items").select("*");
    expect(star.error).not.toBeNull();
    const safe = await alice.client.from("plaid_items").select("id, institution_name");
    expect(safe.error).toBeNull();
    expect(safe.data).toHaveLength(1);
  });

  it("a user cannot write connections", async () => {
    const ins = await alice.client
      .from("plaid_items")
      .insert({ owner_id: alice.id, item_id: "forged", access_token_ciphertext: "x" });
    expect(ins.error).not.toBeNull();
  });

  it("a user edit is re-stamped user_reported, and provenance cannot be forged", async () => {
    const before = await loadBundle(alice.client, alice.id);
    const card = before.accounts.find((a) => a.kind === "credit_card")!;
    const { error } = await alice.client
      .from("accounts")
      .update({ apr_bps: 2499, field_sources: { aprBps: "verified_source", balanceCents: "verified_source" } })
      .eq("id", card.id);
    expect(error).toBeNull();
    const after = (await loadBundle(alice.client, alice.id)).accounts.find((a) => a.id === card.id)!;
    expect(after.aprBps).toBe(2499);
    expect(accountFigureSource(after, "aprBps")).toBe("user_reported");
    expect(after.fieldSources?.balanceCents).toBe("connected_account"); // untouched figure keeps its source

    // A user-created account cannot claim to be connected.
    const forged = await alice.client.from("accounts").insert({
      owner_id: alice.id,
      nickname: "Forged",
      classification: "personal",
      kind: "bank",
      balance_cents: 1,
      source: "connected_account",
      field_sources: { balanceCents: "connected_account" },
    });
    expect(forged.error).toBeNull();
    const row = (await loadBundle(alice.client, alice.id)).accounts.find((a) => a.nickname === "Forged")!;
    expect(row.source).toBe("user_reported");
    expect(row.fieldSources).toEqual({});
  });

  it("another user sees none of it", async () => {
    const bundle = await loadBundle(bob.client, bob.id);
    expect(bundle.connections).toHaveLength(0);
    const peek = await bob.client.from("plaid_items").select("id").eq("owner_id", alice.id);
    expect(peek.data ?? []).toHaveLength(0);
    const accounts = await bob.client.from("accounts").select("id").eq("owner_id", alice.id);
    expect(accounts.data ?? []).toHaveLength(0);
  });

  it("disconnect deletes nothing when Plaid cannot confirm", async () => {
    const conn = (await loadBundle(alice.client, alice.id)).connections[0]!;
    plaid.removeFails = true;
    await expect(disconnect(deps, alice.id, conn.id)).rejects.toBeInstanceOf(PlaidApiError);
    plaid.removeFails = false;
    expect((await loadBundle(alice.client, alice.id)).connections).toHaveLength(1);
  });

  it("disconnect revokes at Plaid and removes the connection and its accounts, keeping the user's own", async () => {
    const conn = (await loadBundle(alice.client, alice.id)).connections[0]!;
    await disconnect(deps, alice.id, conn.id);
    expect(plaid.removed).toHaveLength(1);
    const bundle = await loadBundle(alice.client, alice.id);
    expect(bundle.connections).toHaveLength(0);
    expect(bundle.accounts.map((a) => a.nickname)).toEqual(["Forged"]);
  });

  it("delete my data: revoke at Plaid, then the database routine leaves nothing", async () => {
    await connect(deps, alice.id, "public-sandbox-it-2");
    const revoked = await revokeAll(deps, alice.id);
    expect(revoked).toBe(1);
    const { data, error } = await alice.client.rpc("delete_my_data");
    expect(error).toBeNull();
    expect((data as Record<string, number>).verified_remaining).toBe(0);
    const after = await loadBundle(alice.client, alice.id);
    expect(after.connections).toHaveLength(0);
    expect(after.accounts).toHaveLength(0);
    expect(after.snapshots).toHaveLength(0);
    const leftover = await admin.from("plaid_items").select("id").eq("owner_id", alice.id);
    expect(leftover.data ?? []).toHaveLength(0);
  });
});
