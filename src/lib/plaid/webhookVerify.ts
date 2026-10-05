import { createHash, timingSafeEqual } from "node:crypto";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import type { WebhookKey } from "./gateway";

/**
 * Verifies a Plaid webhook before anything in it is trusted.
 * https://plaid.com/docs/api/webhooks/webhook-verification/
 *
 *  1. The Plaid-Verification header is a JWT signed with ES256 — and only
 *     ES256 is accepted, so a token claiming "none" or an HMAC algorithm fails.
 *  2. The signing key is fetched from Plaid by the token's key id, and a key
 *     Plaid has marked expired is refused.
 *  3. The token was issued within the last 5 minutes (replay window).
 *  4. The SHA-256 of the exact request body matches the signed claim, compared
 *     in constant time, so a valid token cannot be reused with another body.
 *
 * Any failure returns a reason for server logs; the HTTP response never says
 * which check failed.
 */

export type VerifyResult = { ok: true } | { ok: false; reason: string };

const MAX_AGE_SECONDS = 5 * 60;

export async function verifyPlaidWebhook(args: {
  body: string;
  jwt: string | null;
  getKey: (kid: string) => Promise<WebhookKey>;
  nowSeconds?: number;
}): Promise<VerifyResult> {
  const { body, jwt } = args;
  if (!jwt) return { ok: false, reason: "missing header" };

  let header;
  try {
    header = decodeProtectedHeader(jwt);
  } catch {
    return { ok: false, reason: "malformed token" };
  }
  if (header.alg !== "ES256") return { ok: false, reason: `algorithm ${String(header.alg)}` };
  if (typeof header.kid !== "string" || header.kid.length === 0) return { ok: false, reason: "no key id" };

  let jwk: WebhookKey;
  try {
    jwk = await args.getKey(header.kid);
  } catch {
    return { ok: false, reason: "key fetch failed" };
  }
  if (jwk.expired_at !== null && jwk.expired_at !== undefined) return { ok: false, reason: "expired key" };

  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  let payload;
  try {
    const key = await importJWK({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, "ES256");
    ({ payload } = await jwtVerify(jwt, key, {
      algorithms: ["ES256"],
      maxTokenAge: MAX_AGE_SECONDS,
      currentDate: new Date(now * 1000),
    }));
  } catch {
    return { ok: false, reason: "signature or age" };
  }
  // jose bounds the age from the past; also refuse tokens from the future.
  if (typeof payload.iat !== "number" || payload.iat > now + 60) return { ok: false, reason: "issued-at" };

  const claimed = payload.request_body_sha256;
  if (typeof claimed !== "string" || !/^[0-9a-f]{64}$/i.test(claimed)) return { ok: false, reason: "no body hash" };
  const actual = createHash("sha256").update(body, "utf8").digest();
  if (!timingSafeEqual(actual, Buffer.from(claimed.toLowerCase(), "hex"))) return { ok: false, reason: "body hash" };

  return { ok: true };
}

/**
 * Small in-memory cache of Plaid's verification keys. Keys rotate rarely, so
 * this avoids one Plaid round-trip per webhook. An entry is refetched after
 * ten minutes so a key Plaid expires stops being accepted promptly.
 */
export function cachedKeyFetcher(fetchKey: (kid: string) => Promise<WebhookKey>, ttlMs = 10 * 60 * 1000) {
  const cache = new Map<string, { key: WebhookKey; at: number }>();
  return async (kid: string): Promise<WebhookKey> => {
    const hit = cache.get(kid);
    if (hit && Date.now() - hit.at < ttlMs) return hit.key;
    const key = await fetchKey(kid);
    if (cache.size > 50) cache.clear();
    cache.set(kid, { key, at: Date.now() });
    return key;
  };
}
