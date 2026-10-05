import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import type { WebhookKey } from "./gateway";
import { cachedKeyFetcher, verifyPlaidWebhook } from "./webhookVerify";

const NOW = 1_790_000_000;
const BODY = JSON.stringify({ webhook_type: "ITEM", webhook_code: "ERROR", item_id: "item-1" });
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

let privateKey: CryptoKey;
let publicJwk: WebhookKey;
let otherPrivate: CryptoKey;

beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  privateKey = kp.privateKey;
  const jwk = await exportJWK(kp.publicKey);
  publicJwk = {
    alg: "ES256",
    crv: jwk.crv!,
    kid: "kid-1",
    kty: jwk.kty!,
    use: "sig",
    x: jwk.x!,
    y: jwk.y!,
    created_at: NOW - 1000,
    expired_at: null,
  };
  otherPrivate = (await generateKeyPair("ES256")).privateKey;
});

async function sign(opts: { body?: string; iat?: number; key?: CryptoKey; kid?: string; hash?: string } = {}) {
  return new SignJWT({ request_body_sha256: opts.hash ?? sha(opts.body ?? BODY) })
    .setProtectedHeader({ alg: "ES256", kid: opts.kid ?? "kid-1", typ: "JWT" })
    .setIssuedAt(opts.iat ?? NOW)
    .sign(opts.key ?? privateKey);
}

const getKey = async (kid: string) => {
  if (kid !== "kid-1") throw new Error("unknown kid");
  return publicJwk;
};

const verify = (jwt: string | null, body = BODY, key = getKey) =>
  verifyPlaidWebhook({ body, jwt, getKey: key, nowSeconds: NOW });

describe("verifyPlaidWebhook", () => {
  it("accepts a correctly signed, fresh webhook", async () => {
    expect(await verify(await sign())).toEqual({ ok: true });
  });

  it("rejects a missing or malformed header", async () => {
    expect((await verify(null)).ok).toBe(false);
    expect((await verify("not-a-jwt")).ok).toBe(false);
  });

  it("rejects a valid token replayed with a different body", async () => {
    const jwt = await sign();
    const tampered = BODY.replace("ERROR", "LOGIN_REPAIRED");
    expect(await verify(jwt, tampered)).toEqual({ ok: false, reason: "body hash" });
  });

  it("rejects a body differing only in whitespace (the hash is over exact bytes)", async () => {
    expect((await verify(await sign(), BODY + " ")).ok).toBe(false);
  });

  it("rejects a token older than 5 minutes", async () => {
    expect((await verify(await sign({ iat: NOW - 301 }))).ok).toBe(false);
    expect((await verify(await sign({ iat: NOW - 299 }))).ok).toBe(true);
  });

  it("rejects a token issued in the future", async () => {
    expect((await verify(await sign({ iat: NOW + 3600 }))).ok).toBe(false);
  });

  it("rejects a token signed by a different key", async () => {
    expect(await verify(await sign({ key: otherPrivate }))).toEqual({ ok: false, reason: "signature or age" });
  });

  it("rejects a key Plaid has expired", async () => {
    const expired = async () => ({ ...publicJwk, expired_at: NOW - 10 });
    expect(await verify(await sign(), BODY, expired)).toEqual({ ok: false, reason: "expired key" });
  });

  it("rejects an unknown key id", async () => {
    expect(await verify(await sign({ kid: "kid-unknown" }))).toEqual({ ok: false, reason: "key fetch failed" });
  });

  it("rejects any algorithm other than ES256, including HMAC and none", async () => {
    const hs = await new SignJWT({ request_body_sha256: sha(BODY) })
      .setProtectedHeader({ alg: "HS256", kid: "kid-1" })
      .setIssuedAt(NOW)
      .sign(new TextEncoder().encode("x".repeat(32)));
    expect(await verify(hs)).toEqual({ ok: false, reason: "algorithm HS256" });

    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const none = `${b64({ alg: "none", kid: "kid-1" })}.${b64({ iat: NOW, request_body_sha256: sha(BODY) })}.`;
    expect(await verify(none)).toEqual({ ok: false, reason: "algorithm none" });
  });

  it("rejects a token with no usable body hash claim", async () => {
    expect((await verify(await sign({ hash: "abc" }))).ok).toBe(false);
  });
});

describe("cachedKeyFetcher", () => {
  it("fetches each key once within the TTL", async () => {
    let calls = 0;
    const fetchKey = cachedKeyFetcher(async () => {
      calls++;
      return publicJwk;
    });
    await fetchKey("kid-1");
    await fetchKey("kid-1");
    expect(calls).toBe(1);
  });
});
