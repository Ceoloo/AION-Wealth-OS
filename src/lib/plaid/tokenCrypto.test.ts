import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptToken, encryptToken, parseKey, TokenCryptoError } from "./tokenCrypto";

const key = randomBytes(32);
const TOKEN = "access-sandbox-de3ce8ef-33f8-452c-a685-8671031fc0f6";

describe("token encryption", () => {
  it("round-trips", () => {
    expect(decryptToken(encryptToken(TOKEN, key), key)).toBe(TOKEN);
  });

  it("never stores the token in the clear", () => {
    const sealed = encryptToken(TOKEN, key);
    expect(sealed).not.toContain(TOKEN);
    expect(Buffer.from(sealed.split(".")[1]!, "base64").toString("utf8")).not.toContain("access-sandbox");
  });

  it("uses a fresh IV, so the same token never encrypts the same way twice", () => {
    expect(encryptToken(TOKEN, key)).not.toBe(encryptToken(TOKEN, key));
  });

  it("rejects the wrong key", () => {
    const sealed = encryptToken(TOKEN, key);
    expect(() => decryptToken(sealed, randomBytes(32))).toThrow(TokenCryptoError);
  });

  it("rejects a tampered ciphertext instead of returning a wrong token", () => {
    const sealed = encryptToken(TOKEN, key);
    const raw = Buffer.from(sealed.split(".")[1]!, "base64");
    raw[15] = raw[15]! ^ 0x01; // flip one bit in the body
    expect(() => decryptToken(`v1.${raw.toString("base64")}`, key)).toThrow(TokenCryptoError);
  });

  it("rejects truncated and unversioned input", () => {
    expect(() => decryptToken("v1.AAAA", key)).toThrow(TokenCryptoError);
    expect(() => decryptToken("plaintext-token", key)).toThrow(TokenCryptoError);
  });

  it("requires a 32-byte key", () => {
    expect(() => parseKey(undefined)).toThrow(/not set/);
    expect(() => parseKey(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
    expect(parseKey(randomBytes(32).toString("base64")).length).toBe(32);
  });
});
