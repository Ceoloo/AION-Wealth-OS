import "server-only";
import { parseKey } from "./tokenCrypto";

/**
 * Server-only Plaid configuration. Every value here is a secret or
 * server-side setting; none is NEXT_PUBLIC_ and none may reach the browser.
 * Missing configuration means "connections are off", never a pretend success.
 */
export interface PlaidConfig {
  clientId: string;
  secret: string;
  env: "sandbox" | "production";
  /** 32-byte AES key for access tokens at rest. Lives outside the database. */
  tokenKey: Buffer;
  webhookUrl: string | null;
  redirectUri: string | null;
  maxItemsPerUser: number;
}

export type PlaidConfigResult =
  | { ok: true; config: PlaidConfig }
  | { ok: false; missing: string[] };

export function readPlaidConfig(env: NodeJS.ProcessEnv = process.env): PlaidConfigResult {
  const missing: string[] = [];
  const clientId = env.PLAID_CLIENT_ID?.trim();
  const secret = env.PLAID_SECRET?.trim();
  const rawEnv = env.PLAID_ENV?.trim() || "sandbox";
  const rawKey = env.PLAID_TOKEN_ENCRYPTION_KEY?.trim();
  if (!clientId) missing.push("PLAID_CLIENT_ID");
  if (!secret) missing.push("PLAID_SECRET");
  if (!rawKey) missing.push("PLAID_TOKEN_ENCRYPTION_KEY");
  // Writing a connection needs the service role (users cannot write plaid_items).
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (rawEnv !== "sandbox" && rawEnv !== "production") missing.push("PLAID_ENV (sandbox|production)");

  let tokenKey: Buffer | null = null;
  if (rawKey) {
    try {
      tokenKey = parseKey(rawKey);
    } catch {
      missing.push("PLAID_TOKEN_ENCRYPTION_KEY (must be 32 bytes, base64)");
    }
  }
  if (missing.length > 0 || !clientId || !secret || !tokenKey) return { ok: false, missing };

  const max = Number(env.PLAID_MAX_ITEMS_PER_USER ?? "3");
  return {
    ok: true,
    config: {
      clientId,
      secret,
      env: rawEnv as PlaidConfig["env"],
      tokenKey,
      webhookUrl: env.PLAID_WEBHOOK_URL?.trim() || null,
      redirectUri: env.PLAID_REDIRECT_URI?.trim() || null,
      maxItemsPerUser: Number.isInteger(max) && max > 0 ? max : 3,
    },
  };
}
