/**
 * Money is stored and computed as integer cents (USD only in v0.1).
 * Never use floating-point dollars for arithmetic or persistence.
 */

export type Cents = number; // integer number of US cents

/** True when a value is a safe integer usable as cents. */
export function isValidCents(value: unknown): value is Cents {
  return typeof value === "number" && Number.isInteger(value) && Number.isSafeInteger(value);
}

/** Convert a user-entered dollar amount (may be a string) to integer cents. */
export function dollarsToCents(input: number | string): Cents {
  const n = typeof input === "string" ? Number(input.replace(/[$,\s]/g, "")) : input;
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid dollar amount: ${String(input)}`);
  }
  // Round half away from zero to avoid FP drift (e.g. 19.99 -> 1999).
  return Math.sign(n) * Math.round(Math.abs(n) * 100);
}

/** Format integer cents as a human-readable USD string. */
export function formatCents(cents: Cents | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Sum a list of cents, treating null/undefined as "unknown" (skipped, tracked separately). */
export function sumKnown(values: Array<Cents | null | undefined>): {
  total: Cents;
  unknownCount: number;
} {
  let total = 0;
  let unknownCount = 0;
  for (const v of values) {
    if (v === null || v === undefined) {
      unknownCount += 1;
      continue;
    }
    total += v;
  }
  return { total, unknownCount };
}
