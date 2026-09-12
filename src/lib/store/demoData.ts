import type { UserDataBundle } from "../data/bundle";

/**
 * Clearly-labeled SYNTHETIC demo data. This is NOT real financial information
 * and is not seeded from any prior conversation. It exists so the app is fully
 * explorable without credentials. The demo owner id is a fixed synthetic value.
 */
export const DEMO_OWNER_ID = "demo-user-synthetic";

export function buildDemoBundle(): UserDataBundle {
  const now = "2026-09-01T09:00:00.000Z";
  return {
    ownerId: DEMO_OWNER_ID,
    profile: {
      id: "demo-profile",
      ownerId: DEMO_OWNER_ID,
      residenceState: "NY",
      businessState: "NY",
      goals: ["form_business", "improve_credit", "build_cushion"],
      experience: "new",
      weeklyTimeMinutes: 120,
      createdAt: now,
      updatedAt: now,
    },
    snapshots: [
      {
        id: "demo-snap-1",
        ownerId: DEMO_OWNER_ID,
        asOf: "2026-09-01",
        // Synthetic founder: modest positive surplus, thin cash cushion.
        takeHomeIncomeCents: 420000, // $4,200
        essentialSpendingCents: 260000, // $2,600
        otherSpendingCents: 70000, // $700
        requiredDebtPaymentsCents: 55000, // $550
        availableCashCents: 180000, // $1,800
        otherAssetsCents: 0,
        liabilitiesCents: 950000, // $9,500 (matches accounts below)
        hasPastDueAccounts: true,
        selfReportedScore: null, // never fabricated; user may add later
        createdAt: now,
      },
    ],
    accounts: [
      {
        id: "demo-acct-1",
        ownerId: DEMO_OWNER_ID,
        nickname: "Everyday card",
        classification: "personal",
        kind: "credit_card",
        balanceCents: 320000, // $3,200
        aprBps: 2499, // 24.99%
        minPaymentCents: 9500,
        pastDueCents: 0,
        dueDate: "2026-09-20",
        creditLimitCents: 500000, // $5,000
        isRevolving: true,
        includeInSnapshot: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "demo-acct-2",
        ownerId: DEMO_OWNER_ID,
        nickname: "Store card",
        classification: "personal",
        kind: "credit_card",
        balanceCents: 130000, // $1,300
        aprBps: null, // unknown APR — surfaced, not guessed
        minPaymentCents: 4500,
        pastDueCents: 6000, // $60 past due
        dueDate: "2026-08-28",
        creditLimitCents: null, // unknown limit — excluded from utilization
        isRevolving: true,
        includeInSnapshot: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "demo-acct-3",
        ownerId: DEMO_OWNER_ID,
        nickname: "Auto loan",
        classification: "personal",
        kind: "loan",
        balanceCents: 500000, // $5,000
        aprBps: 899,
        minPaymentCents: 41000,
        pastDueCents: 0,
        dueDate: "2026-09-15",
        creditLimitCents: null,
        isRevolving: false,
        includeInSnapshot: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    creditIssues: [
      {
        id: "demo-issue-1",
        ownerId: DEMO_OWNER_ID,
        bureau: "experian",
        creditorNickname: "Old phone account",
        category: "account_not_mine",
        explanation:
          "A collections account appears that I don't recognize; the account number doesn't match any account I've opened.",
        relevantDate: "2026-07-15",
        followUpDate: "2026-09-20",
        state: "draft",
        createdAt: now,
        updatedAt: now,
      },
    ],
    actionEvents: [],
    weeklyReviews: [],
    formationStatuses: {},
    partnerStatuses: {},
    partnersAcknowledged: false,
    referralEvents: [],
  };
}
