/**
 * Contract test against Plaid's SANDBOX (free, synthetic data). Checks that
 * the real API still returns what the translator expects, and that removal
 * really revokes access:
 *
 *   /sandbox/public_token/create -> exchange -> item/get -> accounts/get ->
 *   liabilities/get -> normalize + merge -> item/remove -> access refused.
 *
 * Env: PLAID_SANDBOX_CLIENT_ID, PLAID_SANDBOX_SECRET. Missing => NOT RUN (or a
 * failure when PLAID_CONTRACT_REQUIRED=1). Sandbox only; it never sees
 * production credentials.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Configuration, PlaidApi, PlaidEnvironments, Products } from "plaid";
import { createPlaidGateway, PlaidApiError } from "./gateway";
import { mergeConnectedAccount, normalizeItem } from "./normalize";

const clientId = process.env.PLAID_SANDBOX_CLIENT_ID;
const secret = process.env.PLAID_SANDBOX_SECRET;
const configured = Boolean(clientId && secret);

if (!configured && process.env.PLAID_CONTRACT_REQUIRED === "1") {
  throw new Error("PLAID_CONTRACT_REQUIRED=1 but PLAID_SANDBOX_CLIENT_ID / PLAID_SANDBOX_SECRET are missing");
}
if (!configured) console.log("NOT RUN: Plaid sandbox contract (no sandbox credentials). It has NOT passed.");

describe.skipIf(!configured)("Plaid sandbox contract", () => {
  it("connects, translates, and revokes a sandbox item", { timeout: 60_000 }, async () => {
    const gateway = createPlaidGateway({
      clientId: clientId!,
      secret: secret!,
      env: "sandbox",
      tokenKey: randomBytes(32),
      webhookUrl: null,
      redirectUri: null,
      maxItemsPerUser: 3,
    });

    // Link is a browser widget; the sandbox can mint its result directly.
    const raw = new PlaidApi(
      new Configuration({
        basePath: PlaidEnvironments.sandbox,
        baseOptions: { headers: { "PLAID-CLIENT-ID": clientId!, "PLAID-SECRET": secret! } },
      }),
    );
    const { data: pt } = await raw.sandboxPublicTokenCreate({
      institution_id: "ins_109508", // First Platypus Bank
      initial_products: [Products.Transactions, Products.Liabilities],
    });

    // A Link token can be created with AION's real settings.
    expect(await gateway.createLinkToken({ userId: "contract-test-user" })).toMatch(/^link-sandbox-/);

    const { accessToken } = await gateway.exchangePublicToken(pt.public_token);
    try {
      const item = await gateway.getItem(accessToken);
      expect(item.institutionId).toBe("ins_109508");

      const [accounts, liabilities] = await Promise.all([
        gateway.getAccounts(accessToken),
        gateway.getLiabilities(accessToken),
      ]);
      expect(accounts.length).toBeGreaterThan(0);
      expect(liabilities).not.toBeNull();

      const normalized = normalizeItem(accounts, liabilities);
      const kinds = new Set(normalized.accounts.map((a) => a.kind));
      expect(kinds.has("bank")).toBe(true);
      expect(kinds.has("credit_card")).toBe(true);
      expect(kinds.has("loan")).toBe(true);
      // Sandbox includes investment accounts; they must be reported, not dropped silently.
      expect(normalized.skipped.length).toBeGreaterThan(0);

      const card = normalized.accounts.find((a) => a.kind === "credit_card")!;
      expect(card.figures.balanceCents && "set" in card.figures.balanceCents).toBe(true);
      expect(card.figures.minPaymentCents && "set" in card.figures.minPaymentCents).toBe(true);

      // Every account passes the same validation as user input.
      for (const n of normalized.accounts) {
        const a = mergeConnectedAccount(null, n, {
          id: "00000000-0000-0000-0000-000000000000",
          ownerId: "contract",
          plaidItemId: "item",
          now: new Date().toISOString(),
        });
        expect(a.source).toBe("connected_account");
        // Never more than the last 4 characters of an account number.
        expect(a.nickname).not.toMatch(/\d{5,}/);
      }
    } finally {
      await gateway.removeItem(accessToken);
    }

    // After removal the token no longer works.
    await expect(gateway.getAccounts(accessToken)).rejects.toBeInstanceOf(PlaidApiError);
    // Removing again is treated as already done.
    await expect(gateway.removeItem(accessToken)).resolves.toBeUndefined();
  });
});
