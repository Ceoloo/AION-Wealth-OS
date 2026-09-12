import { describe, it, expect } from "vitest";
import { assertOwner, ownedOnly, stampOwner, OwnershipError } from "./ownership";

const recA = { ownerId: "user-a", id: "1" };
const recB = { ownerId: "user-b", id: "2" };

describe("acceptance #6 — ownership boundaries (app-level guard)", () => {
  it("assertOwner allows the owner", () => {
    expect(assertOwner(recA, "user-a")).toBe(recA);
  });

  it("assertOwner blocks a cross-owner READ", () => {
    expect(() => assertOwner(recA, "user-b")).toThrow(OwnershipError);
  });

  it("assertOwner blocks unauthenticated access", () => {
    expect(() => assertOwner(recA, "")).toThrow(OwnershipError);
  });

  it("ownedOnly filters EXPORTS to the requester's records", () => {
    const exported = ownedOnly([recA, recB], "user-a");
    expect(exported).toEqual([recA]);
    expect(ownedOnly([recA, recB], "user-b")).toEqual([recB]);
    expect(ownedOnly([recA, recB], "")).toEqual([]);
  });

  it("stampOwner refuses to WRITE on behalf of another user", () => {
    expect(() => stampOwner(recB, "user-a")).toThrow(OwnershipError);
    // but stamps a fresh record correctly
    const fresh = stampOwner({ ownerId: "", id: "3" }, "user-a");
    expect(fresh.ownerId).toBe("user-a");
  });
});
