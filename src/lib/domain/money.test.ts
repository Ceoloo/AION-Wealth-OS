import { describe, it, expect } from "vitest";
import { dollarsToCents, formatCents, sumKnown, isValidCents } from "./money";

describe("dollarsToCents", () => {
  it("converts without floating-point drift", () => {
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(dollarsToCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004 -> 30
    expect(dollarsToCents("$1,234.56")).toBe(123456);
  });
  it("handles negatives", () => {
    expect(dollarsToCents(-5.5)).toBe(-550);
  });
  it("throws on garbage", () => {
    expect(() => dollarsToCents("abc")).toThrow();
  });
});

describe("formatCents", () => {
  it("formats USD", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(0)).toBe("$0.00");
  });
  it("renders unknown as em dash", () => {
    expect(formatCents(null)).toBe("—");
    expect(formatCents(undefined)).toBe("—");
  });
});

describe("sumKnown", () => {
  it("skips unknowns and counts them", () => {
    const r = sumKnown([100, null, 200, undefined]);
    expect(r.total).toBe(300);
    expect(r.unknownCount).toBe(2);
  });
});

describe("isValidCents", () => {
  it("rejects non-integers", () => {
    expect(isValidCents(10.5)).toBe(false);
    expect(isValidCents(10)).toBe(true);
    expect(isValidCents("10")).toBe(false);
  });
});
