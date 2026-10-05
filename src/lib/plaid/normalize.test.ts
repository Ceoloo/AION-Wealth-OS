import { describe, expect, it } from "vitest";
import type { Account, FinancialSnapshot } from "../domain/types";
import {
  deriveSnapshot,
  mergeConnectedAccount,
  normalizeItem,
  TranslationError,
  type PlaidAccountLike,
  type PlaidLiabilitiesLike,
} from "./normalize";

// Shapes follow Plaid's sandbox "user_good" item (First Platypus Bank).
type AcctOverrides = Omit<Partial<PlaidAccountLike>, "balances"> & { balances?: Partial<PlaidAccountLike["balances"]> };

const acct = (over: AcctOverrides): PlaidAccountLike => ({
  account_id: "acc",
  name: "Plaid Checking",
  official_name: "Plaid Gold Standard 0% Interest Checking",
  mask: "0000",
  type: "depository",
  subtype: "checking",
  ...over,
  balances: {
    available: 100,
    current: 110,
    limit: null,
    iso_currency_code: "USD",
    unofficial_currency_code: null,
    ...over.balances,
  },
});

const ACCOUNTS: PlaidAccountLike[] = [
  acct({ account_id: "chk", name: "Plaid Checking", mask: "0000", balances: { available: 100, current: 110 } }),
  acct({ account_id: "sav", name: "Plaid Saving", mask: "1111", subtype: "savings", balances: { available: null, current: 210 } }),
  acct({ account_id: "cc", name: "Plaid Credit Card", mask: "3333", type: "credit", subtype: "credit card", balances: { available: null, current: 410, limit: 2000 } }),
  acct({ account_id: "stu", name: "Plaid Student Loan", mask: "6666", type: "loan", subtype: "student", balances: { available: null, current: 65262 } }),
  acct({ account_id: "mtg", name: "Plaid Mortgage", mask: "8888", type: "loan", subtype: "mortgage", balances: { available: null, current: 56302.06 } }),
  acct({ account_id: "inv", name: "Plaid IRA", mask: "5555", type: "investment", subtype: "ira", balances: { available: null, current: 320.76 } }),
  acct({ account_id: "cad", name: "Maple Chequing", mask: "9999", balances: { iso_currency_code: "CAD" } }),
];

type CardLiability = NonNullable<PlaidLiabilitiesLike["credit"]>[number];

const CARD: CardLiability = {
  account_id: "cc",
  aprs: [
    { apr_percentage: 27.95, apr_type: "cash_apr" },
    { apr_percentage: 15.24, apr_type: "purchase_apr" },
  ],
  is_overdue: false,
  minimum_payment_amount: 20,
  next_payment_due_date: "2026-10-15",
};

const LIABILITIES: PlaidLiabilitiesLike = {
  credit: [
    {
      account_id: "cc",
      aprs: [
        { apr_percentage: 27.95, apr_type: "cash_apr" },
        { apr_percentage: 15.24, apr_type: "purchase_apr" },
      ],
      is_overdue: false,
      minimum_payment_amount: 20,
      next_payment_due_date: "2026-10-15",
    },
  ],
  student: [
    {
      account_id: "stu",
      interest_rate_percentage: 5.25,
      is_overdue: false,
      minimum_payment_amount: 25,
      next_payment_due_date: "2026-10-12",
    },
  ],
  mortgage: [
    {
      account_id: "mtg",
      interest_rate: { percentage: 3.99 },
      next_monthly_payment: 3141.54,
      next_payment_due_date: "2026-11-15",
      past_due_amount: 2304,
    },
  ],
};

const CTX = { id: "new-id", ownerId: "owner-1", plaidItemId: "item-row-1", now: "2026-10-05T12:00:00.000Z" };

function byId(id: string) {
  const r = normalizeItem(ACCOUNTS, LIABILITIES);
  const n = r.accounts.find((a) => a.plaidAccountId === id);
  if (!n) throw new Error(`missing ${id}`);
  return n;
}

describe("normalizeItem", () => {
  it("keeps USD bank, credit and loan accounts and reports what it skipped", () => {
    const r = normalizeItem(ACCOUNTS, LIABILITIES);
    expect(r.accounts.map((a) => [a.plaidAccountId, a.kind])).toEqual([
      ["chk", "bank"],
      ["sav", "bank"],
      ["cc", "credit_card"],
      ["stu", "loan"],
      ["mtg", "loan"],
    ]);
    expect(r.skipped).toEqual([
      { plaidAccountId: "inv", label: "Plaid IRA ••5555", type: "investment", reason: "unsupported_type" },
      { plaidAccountId: "cad", label: "Maple Chequing ••9999", type: "depository", reason: "not_usd" },
    ]);
  });

  it("converts dollars to integer cents without float drift", () => {
    expect(byId("mtg").figures.balanceCents).toEqual({ set: 5630206 });
    expect(byId("mtg").figures.minPaymentCents).toEqual({ set: 314154 });
  });

  it("uses spendable balance for banks, falling back to the ledger balance", () => {
    expect(byId("chk").figures.balanceCents).toEqual({ set: 10000 });
    expect(byId("sav").figures.balanceCents).toEqual({ set: 21000 });
  });

  it("takes the purchase APR, not the first APR listed", () => {
    expect(byId("cc").figures.aprBps).toEqual({ set: 1524 });
  });

  it("reads limit, minimum, due date and a not-overdue card as $0 past due", () => {
    const cc = byId("cc");
    expect(cc.figures.creditLimitCents).toEqual({ set: 200000 });
    expect(cc.figures.minPaymentCents).toEqual({ set: 2000 });
    expect(cc.figures.dueDate).toEqual({ set: "2026-10-15" });
    expect(cc.figures.pastDueCents).toEqual({ set: 0 });
    expect(cc.isRevolving).toBe(true);
    expect(cc.overdue).toBe(false);
  });

  it("an overdue card with no amount clears the figure instead of guessing", () => {
    const r = normalizeItem(ACCOUNTS, {
      credit: [{ ...CARD, is_overdue: true }],
    });
    const cc = r.accounts.find((a) => a.plaidAccountId === "cc")!;
    expect(cc.figures.pastDueCents).toEqual({ clear: true });
    expect(cc.overdue).toBe(true);
  });

  it("an unknown overdue status says nothing about past due", () => {
    const r = normalizeItem(ACCOUNTS, { credit: [{ ...CARD, is_overdue: null }] });
    expect(r.accounts.find((a) => a.plaidAccountId === "cc")!.figures.pastDueCents).toBeUndefined();
  });

  it("reads a mortgage's past-due amount and flags it overdue", () => {
    const m = byId("mtg");
    expect(m.figures.pastDueCents).toEqual({ set: 230400 });
    expect(m.figures.aprBps).toEqual({ set: 399 });
    expect(m.overdue).toBe(true);
  });

  it("without liabilities data, reports balances only", () => {
    const r = normalizeItem(ACCOUNTS, null);
    const cc = r.accounts.find((a) => a.plaidAccountId === "cc")!;
    expect(Object.keys(cc.figures).sort()).toEqual(["balanceCents", "creditLimitCents"]);
  });

  it("never exposes more than the last 4 characters of an account number", () => {
    const r = normalizeItem([acct({ account_id: "x", name: "Checking", mask: "123456789" })], null);
    expect(r.accounts[0]!.nickname).toBe("Checking ••6789");
    const long = normalizeItem([acct({ account_id: "y", name: "A".repeat(100), mask: "4321" })], null);
    expect(long.accounts[0]!.nickname.length).toBeLessThanOrEqual(60);
    expect(long.accounts[0]!.nickname.endsWith("••4321")).toBe(true);
  });

  it("drops a malformed due date rather than storing it", () => {
    const r = normalizeItem(ACCOUNTS, { credit: [{ ...CARD, next_payment_due_date: "10/15/2026" }] });
    expect(r.accounts.find((a) => a.plaidAccountId === "cc")!.figures.dueDate).toBeUndefined();
  });

  it("treats a line of credit as revolving", () => {
    const r = normalizeItem([acct({ account_id: "loc", type: "loan", subtype: "line of credit" })], null);
    expect(r.accounts[0]).toMatchObject({ kind: "line_of_credit", isRevolving: true });
  });
});

describe("mergeConnectedAccount", () => {
  it("tags every reported figure connected_account and leaves the rest untagged", () => {
    const a = mergeConnectedAccount(null, byId("cc"), CTX);
    expect(a).toMatchObject({
      id: "new-id",
      ownerId: "owner-1",
      source: "connected_account",
      plaidItemId: "item-row-1",
      balanceCents: 41000,
      aprBps: 1524,
      includeInSnapshot: true,
    });
    expect(a.fieldSources).toEqual({
      balanceCents: "connected_account",
      creditLimitCents: "connected_account",
      aprBps: "connected_account",
      minPaymentCents: "connected_account",
      dueDate: "connected_account",
      pastDueCents: "connected_account",
    });
  });

  it("a bank account is not counted in snapshot liabilities", () => {
    expect(mergeConnectedAccount(null, byId("chk"), CTX).includeInSnapshot).toBe(false);
  });

  it("keeps a figure the user typed when the institution does not report it", () => {
    const first = mergeConnectedAccount(null, normalizeItem(ACCOUNTS, null).accounts.find((a) => a.plaidAccountId === "cc")!, CTX);
    // The user fills in the APR their bank does not share.
    const edited: Account = { ...first, aprBps: 2299, fieldSources: { ...first.fieldSources } };
    const resynced = mergeConnectedAccount(edited, normalizeItem(ACCOUNTS, null).accounts.find((a) => a.plaidAccountId === "cc")!, CTX);
    expect(resynced.aprBps).toBe(2299);
    expect(resynced.fieldSources?.aprBps).toBeUndefined(); // ⇒ user_reported
  });

  it("an institution-reported figure overwrites a user edit on the next sync", () => {
    const first = mergeConnectedAccount(null, byId("cc"), CTX);
    const { balanceCents: _drop, ...rest } = first.fieldSources!;
    const edited: Account = { ...first, balanceCents: 1, fieldSources: rest };
    const resynced = mergeConnectedAccount(edited, byId("cc"), CTX);
    expect(resynced.balanceCents).toBe(41000);
    expect(resynced.fieldSources?.balanceCents).toBe("connected_account");
  });

  it("'overdue, amount unknown' clears a connection-sourced $0 but not a user's amount", () => {
    const first = mergeConnectedAccount(null, byId("cc"), CTX);
    expect(first.pastDueCents).toBe(0);
    const overdue = normalizeItem(ACCOUNTS, { credit: [{ ...CARD, is_overdue: true }] })
      .accounts.find((a) => a.plaidAccountId === "cc")!;

    const cleared = mergeConnectedAccount(first, overdue, CTX);
    expect(cleared.pastDueCents).toBeNull();
    expect(cleared.fieldSources?.pastDueCents).toBeUndefined();

    const { pastDueCents: _p, ...rest } = first.fieldSources!;
    const userEntered: Account = { ...first, pastDueCents: 7500, fieldSources: rest };
    expect(mergeConnectedAccount(userEntered, overdue, CTX).pastDueCents).toBe(7500);
  });

  it("keeps the user's nickname and classification across syncs", () => {
    const first = mergeConnectedAccount(null, byId("chk"), CTX);
    const renamed: Account = { ...first, nickname: "Bills account", classification: "business" };
    const resynced = mergeConnectedAccount(renamed, byId("chk"), CTX);
    expect(resynced).toMatchObject({ nickname: "Bills account", classification: "business", id: first.id });
  });

  it("refuses to write figures outside the app's valid ranges", () => {
    const n = byId("cc");
    expect(() =>
      mergeConnectedAccount(null, { ...n, figures: { ...n.figures, aprBps: { set: 1_000_000 } } }, CTX),
    ).toThrow(TranslationError);
  });
});

describe("deriveSnapshot", () => {
  const SNAP_CTX = { id: "snap-new", ownerId: "owner-1", asOf: "2026-10-05", now: CTX.now };
  const prev: FinancialSnapshot = {
    id: "snap-1",
    ownerId: "owner-1",
    asOf: "2026-09-01",
    takeHomeIncomeCents: 420000,
    essentialSpendingCents: 260000,
    otherSpendingCents: 70000,
    requiredDebtPaymentsCents: 55000,
    availableCashCents: 180000,
    otherAssetsCents: 0,
    liabilitiesCents: 950000,
    hasPastDueAccounts: false,
    selfReportedScore: { value: 640, model: "unknown", source: "user_reported", asOf: "2026-09-01" } as never,
    createdAt: "2026-09-01T09:00:00.000Z",
  };

  const connected = () => {
    const r = normalizeItem(ACCOUNTS, LIABILITIES);
    return r.accounts.map((n, i) => mergeConnectedAccount(null, n, { ...CTX, id: `a${i}` }));
  };

  it("derives cash, liabilities and payments from accounts and tags them derived", () => {
    const s = deriveSnapshot(prev, connected(), false, SNAP_CTX)!;
    expect(s.availableCashCents).toBe(10000 + 21000);
    expect(s.liabilitiesCents).toBe(41000 + 6526200 + 5630206);
    expect(s.requiredDebtPaymentsCents).toBe(2000 + 2500 + 314154);
    expect(s.fieldSources).toMatchObject({
      availableCashCents: "derived",
      liabilitiesCents: "derived",
      requiredDebtPaymentsCents: "derived",
    });
  });

  it("carries income and spending forward with their original source", () => {
    const s = deriveSnapshot(prev, connected(), false, SNAP_CTX)!;
    expect(s.takeHomeIncomeCents).toBe(420000);
    expect(s.essentialSpendingCents).toBe(260000);
    expect(s.fieldSources?.takeHomeIncomeCents).toBeUndefined(); // still user_reported
    expect(s.selfReportedScore).toBeNull(); // not copied; found via mostRecentScore
  });

  it("does not derive a total when any contributing figure is unknown", () => {
    const accounts = connected();
    accounts.push({ ...accounts[0]!, id: "manual", source: "user_reported", fieldSources: {}, balanceCents: null });
    const s = deriveSnapshot(prev, accounts, false, SNAP_CTX)!;
    expect(s.availableCashCents).toBe(180000); // carried forward, not a partial sum
    expect(s.fieldSources?.availableCashCents).toBeUndefined();
  });

  it("does not derive from user-entered accounts alone", () => {
    const manual = connected().map((a) => ({ ...a, source: "user_reported" as const, fieldSources: {} }));
    expect(deriveSnapshot(prev, manual, false, SNAP_CTX)).toBeNull();
  });

  it("marks past due from the institution, and later returns to unknown, not 'no'", () => {
    const flagged = deriveSnapshot(prev, connected(), true, SNAP_CTX)!;
    expect(flagged.hasPastDueAccounts).toBe(true);
    expect(flagged.fieldSources?.hasPastDueAccounts).toBe("connected_account");

    const after = deriveSnapshot(flagged, connected(), false, { ...SNAP_CTX, id: "snap-3" })!;
    expect(after.hasPastDueAccounts).toBeNull();
    expect(after.fieldSources?.hasPastDueAccounts).toBeUndefined();
  });

  it("returns null when a sync changes nothing", () => {
    const s = deriveSnapshot(prev, connected(), false, SNAP_CTX)!;
    expect(deriveSnapshot(s, connected(), false, { ...SNAP_CTX, id: "snap-3" })).toBeNull();
  });

  it("creates a first snapshot from connected accounts alone", () => {
    const s = deriveSnapshot(null, connected(), false, SNAP_CTX)!;
    expect(s.availableCashCents).toBe(31000);
    expect(s.takeHomeIncomeCents).toBeNull(); // unknown, never 0
  });
});
