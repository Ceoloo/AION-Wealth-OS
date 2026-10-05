import "server-only";
import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type LinkTokenCreateRequest,
} from "plaid";
import type { PlaidConfig } from "./config";
import type { PlaidAccountLike, PlaidLiabilitiesLike } from "./normalize";

/**
 * Everything AION asks of Plaid, behind one interface so the sync, deletion
 * and webhook logic can be tested with a fake. The real implementation is a
 * thin wrapper over Plaid's official SDK.
 *
 * Products: Transactions (keeps balances fresh) with Liabilities where the
 * institution supports it. Auth is deliberately NOT requested, so full account
 * and routing numbers are never retrieved.
 */
export interface PlaidGateway {
  createLinkToken(args: { userId: string; accessToken?: string }): Promise<string>;
  exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }>;
  getItem(accessToken: string): Promise<{ institutionId: string | null; institutionName: string | null }>;
  getAccounts(accessToken: string): Promise<PlaidAccountLike[]>;
  /** null when the institution has no liability data for this connection. */
  getLiabilities(accessToken: string): Promise<PlaidLiabilitiesLike | null>;
  /** Revokes the access token at Plaid. An item Plaid no longer has counts as removed. */
  removeItem(accessToken: string): Promise<void>;
  getWebhookVerificationKey(kid: string): Promise<WebhookKey>;
}

export interface WebhookKey {
  alg: string;
  crv: string;
  kid: string;
  kty: string;
  use: string;
  x: string;
  y: string;
  created_at: number;
  expired_at: number | null;
}

/** A Plaid API error, carrying only Plaid's code (never the request or token). */
export class PlaidApiError extends Error {
  constructor(
    readonly code: string,
    readonly type: string | null,
  ) {
    super(`PLAID_${code}`);
    this.name = "PlaidApiError";
  }
}

/** Extracts Plaid's error code from an SDK (axios) error without its payload. */
export function toPlaidError(err: unknown): PlaidApiError {
  const data = (err as { response?: { data?: { error_code?: unknown; error_type?: unknown } } })?.response?.data;
  const code = typeof data?.error_code === "string" ? data.error_code : "REQUEST_FAILED";
  const type = typeof data?.error_type === "string" ? data.error_type : null;
  return new PlaidApiError(code, type);
}

/** Liability errors that mean "nothing to report", not "something broke". */
const NO_LIABILITIES = new Set(["PRODUCTS_NOT_SUPPORTED", "NO_LIABILITY_ACCOUNTS", "PRODUCT_NOT_READY"]);

export function createPlaidGateway(cfg: PlaidConfig): PlaidGateway {
  const api = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[cfg.env],
      baseOptions: {
        headers: { "PLAID-CLIENT-ID": cfg.clientId, "PLAID-SECRET": cfg.secret },
        timeout: 20_000,
      },
    }),
  );

  async function call<T>(fn: () => Promise<{ data: T }>): Promise<T> {
    try {
      return (await fn()).data;
    } catch (err) {
      // Re-throw a clean error: SDK errors embed the request config, which
      // includes the secret header and sometimes the access token.
      throw toPlaidError(err);
    }
  }

  return {
    async createLinkToken({ userId, accessToken }) {
      const req: LinkTokenCreateRequest = {
        client_name: "AION Wealth OS",
        language: "en",
        country_codes: [CountryCode.Us],
        user: { client_user_id: userId },
        ...(cfg.webhookUrl ? { webhook: cfg.webhookUrl } : {}),
        ...(cfg.redirectUri ? { redirect_uri: cfg.redirectUri } : {}),
      };
      if (accessToken) {
        // Update mode: re-authenticate an existing connection. No products.
        req.access_token = accessToken;
      } else {
        req.products = [Products.Transactions];
        req.required_if_supported_products = [Products.Liabilities];
        // Only the account types AION can represent are offered.
        req.account_filters = {
          depository: { account_subtypes: ["all" as never] },
          credit: { account_subtypes: ["all" as never] },
          loan: { account_subtypes: ["all" as never] },
        };
      }
      const data = await call(() => api.linkTokenCreate(req));
      return data.link_token;
    },

    async exchangePublicToken(publicToken) {
      const data = await call(() => api.itemPublicTokenExchange({ public_token: publicToken }));
      return { accessToken: data.access_token, itemId: data.item_id };
    },

    async getItem(accessToken) {
      const data = await call(() => api.itemGet({ access_token: accessToken }));
      return {
        institutionId: data.item.institution_id ?? null,
        institutionName: data.item.institution_name ?? null,
      };
    },

    async getAccounts(accessToken) {
      const data = await call(() => api.accountsGet({ access_token: accessToken }));
      return data.accounts as PlaidAccountLike[];
    },

    async getLiabilities(accessToken) {
      try {
        const data = await call(() => api.liabilitiesGet({ access_token: accessToken }));
        return data.liabilities as PlaidLiabilitiesLike;
      } catch (err) {
        if (err instanceof PlaidApiError && NO_LIABILITIES.has(err.code)) return null;
        throw err;
      }
    },

    async removeItem(accessToken) {
      try {
        await call(() => api.itemRemove({ access_token: accessToken }));
      } catch (err) {
        // Already gone at Plaid (or the token was already invalidated): the
        // goal — no live access — holds.
        if (err instanceof PlaidApiError && (err.code === "ITEM_NOT_FOUND" || err.code === "INVALID_ACCESS_TOKEN")) {
          return;
        }
        throw err;
      }
    },

    async getWebhookVerificationKey(kid) {
      const data = await call(() => api.webhookVerificationKeyGet({ key_id: kid }));
      return data.key as WebhookKey;
    },
  };
}
