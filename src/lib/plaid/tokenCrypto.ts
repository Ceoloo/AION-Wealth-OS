import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level encryption for Plaid access tokens.
 *
 * AES-256-GCM: confidentiality plus integrity, so a tampered ciphertext fails
 * to decrypt rather than yielding a wrong token. The key lives only in the
 * server environment (PLAID_TOKEN_ENCRYPTION_KEY, 32 bytes, base64) and never
 * enters the database — so a database dump, a backup, or a service-role read
 * alone does not reveal a usable token.
 *
 * Server-only. Importing this from client code fails the build (node:crypto).
 */

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class TokenCryptoError extends Error {}

export function parseKey(base64Key: string | undefined): Buffer {
  if (!base64Key) throw new TokenCryptoError("PLAID_TOKEN_ENCRYPTION_KEY is not set");
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new TokenCryptoError("PLAID_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

/** Returns `v1.<base64 iv|ciphertext|tag>`. A fresh random IV every time. */
export function encryptToken(plaintext: string, key: Buffer): string {
  if (!plaintext) throw new TokenCryptoError("Refusing to encrypt an empty token");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${Buffer.concat([iv, body, tag]).toString("base64")}`;
}

export function decryptToken(sealed: string, key: Buffer): string {
  const [version, payload] = sealed.split(".", 2);
  if (version !== VERSION || !payload) throw new TokenCryptoError("Unrecognised token format");
  const raw = Buffer.from(payload, "base64");
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new TokenCryptoError("Ciphertext is truncated");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(raw.length - TAG_BYTES);
  const body = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    // GCM authentication failed: wrong key, or the ciphertext was altered.
    throw new TokenCryptoError("Token could not be decrypted (wrong key or tampered ciphertext)");
  }
}
