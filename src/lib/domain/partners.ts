import type { FinanceSummary } from "./finance";

/**
 * Partner / referral apps. These are the product owner's affiliate links, used
 * as entry-level value for users who aren't ready for a full subscription.
 *
 * Two rules are enforced here, not left to the UI:
 *  1. FTC disclosure — AION earns a reward when a user signs up through a link.
 *     `AFFILIATE_DISCLOSURE` MUST be shown wherever these links appear.
 *  2. Foundations-first — speculative products (crypto, event contracts) are
 *     LOCKED until the user is financially stable, consistent with the app's
 *     "stabilize before you speculate" plan guardrail. Offers are attributed to
 *     the partner; AION never presents them as its own promise or guarantee.
 */

export type PartnerCategory = "credit_builder" | "banking" | "investing_speculative";

export type PartnerStatus = "not_started" | "clicked" | "signed_up" | "already_use" | "skipped";

/**
 * An append-only referral tracking event. Records only the partner, its
 * category, and when — NO financial content or account identifiers. `click`
 * fires when the user opens a referral link; `signup_reported` is the user's
 * own self-report (a click is not a signup). Used to measure the entry-level
 * referral funnel per user; aggregate across users server-side.
 */
export type ReferralEventType = "click" | "signup_reported";

export interface ReferralEvent {
  id: string;
  ownerId: string;
  partnerId: string;
  category: PartnerCategory;
  type: ReferralEventType;
  at: string; // ISODateTime
}

export interface Partner {
  id: string;
  name: string;
  category: PartnerCategory;
  url: string;
  /** Neutral, factual description of what the app is. */
  what: string;
  /** The partner's own offer, attributed to them — not an AION promise. */
  partnerOffer: string | null;
  /** True for speculative products that require financial stability first. */
  foundationsRequired: boolean;
  /** Risk disclosure for speculative products. */
  riskNote: string | null;
}

export const AFFILIATE_DISCLOSURE =
  "These are referral links. AION may earn a reward if you sign up or transact through them, at no extra cost to you. Any bonuses, rewards, or results are the partner's own offer — terms apply and results vary. This is not investment, credit, tax, or legal advice, and not an endorsement of any product for your situation.";

export const PARTNERS: Partner[] = [
  {
    id: "kikoff",
    name: "Kikoff",
    category: "credit_builder",
    url: "https://kikoff.com/refer/DXWOHKR6",
    what: "A credit-building product designed to help establish payment history.",
    partnerOffer:
      "Kikoff says it starts around the price of a cup of coffee, with no credit check, no interest, and no fees.",
    foundationsRequired: false,
    riskNote: null,
  },
  {
    id: "self",
    name: "Self",
    category: "credit_builder",
    url: "https://self.inc/refer/GI8OOR90",
    what: "A Credit Builder Account that reports payments to help build credit over time.",
    partnerOffer:
      "Self advertises an average 47-point* increase and a reward for both of us when you open a Credit Builder Account. (*Their claim; results vary, terms apply.)",
    foundationsRequired: false,
    riskNote: null,
  },
  {
    id: "chime",
    name: "Chime",
    category: "banking",
    url: "https://www.chime.com/r/loovensguillaume/?c=s",
    what: "A fee-light banking app useful for separating and organizing money.",
    partnerOffer: "Chime advertises a $100 bonus. Terms apply.",
    foundationsRequired: false,
    riskNote: null,
  },
  {
    id: "cashapp",
    name: "Cash App",
    category: "banking",
    url: "https://cash.app/refer/77X9H7T",
    what: "A payments app for sending and receiving money.",
    partnerOffer: "Cash App advertises $5 when you send $5+ using code 77X9H7T. Terms apply.",
    foundationsRequired: false,
    riskNote: null,
  },
  {
    id: "coinbase",
    name: "Coinbase",
    category: "investing_speculative",
    url: "https://coinbase.com/join/MZCMZRZ?src=ios-link",
    what: "A cryptocurrency exchange for buying and selling crypto assets.",
    partnerOffer: null,
    foundationsRequired: true,
    riskNote:
      "Crypto is highly volatile and speculative. You can lose money, including your entire investment. Only consider this after your foundation is stable, and never with money you can't afford to lose.",
  },
  {
    id: "kalshi",
    name: "Kalshi",
    category: "investing_speculative",
    url: "https://kalshi.com/t/drq49cdl",
    what: "A regulated exchange for trading event contracts (yes/no markets on outcomes).",
    partnerOffer: null,
    foundationsRequired: true,
    riskNote:
      "Event-contract trading is speculative and you can lose your stake. It is not saving or investing for your foundation. Only consider this once you are financially stable.",
  },
];

export interface PartnerFunnelRow {
  partnerId: string;
  name: string;
  category: PartnerCategory;
  clicks: number;
  reportedSignups: number;
  lastClickAt: string | null;
}

/**
 * Aggregate referral events into a per-app funnel (clicks + self-reported
 * signups). Pure and deterministic; reused by the export and the UI. For a
 * single user this is their own activity — aggregate across users server-side.
 */
export function referralFunnel(events: ReferralEvent[]): PartnerFunnelRow[] {
  return PARTNERS.map((p) => {
    const mine = events.filter((e) => e.partnerId === p.id);
    const clicks = mine.filter((e) => e.type === "click");
    return {
      partnerId: p.id,
      name: p.name,
      category: p.category,
      clicks: clicks.length,
      reportedSignups: mine.filter((e) => e.type === "signup_reported").length,
      lastClickAt: clicks.reduce<string | null>(
        (max, e) => (max === null || e.at > max ? e.at : max),
        null,
      ),
    };
  });
}

export function partnersByCategory(list: Partner[]): Record<PartnerCategory, Partner[]> {
  return {
    credit_builder: list.filter((p) => p.category === "credit_builder"),
    banking: list.filter((p) => p.category === "banking"),
    investing_speculative: list.filter((p) => p.category === "investing_speculative"),
  };
}

/**
 * Is the user stable enough to be shown speculative products? Requires a known
 * non-negative surplus, no past-due accounts, and at least ~3 months of cash
 * coverage. Unknown data is treated as "not yet stable" (never assumed stable).
 */
export function isFoundationStable(summary: FinanceSummary | null): boolean {
  if (!summary) return false;
  const surplus = summary.surplus.value;
  const coverage = summary.cashCoverage.value;
  if (surplus === null || surplus < 0) return false;
  if (summary.hasPastDue) return false;
  if (coverage === null || coverage < 3) return false;
  return true;
}

export interface PartnerVisibility {
  available: Partner[];
  locked: Partner[];
  lockReason: string | null;
}

/**
 * Split partners into what to show now vs. what's locked behind foundations.
 * Credit-builders and banking are always available; speculative products unlock
 * only when `isFoundationStable` is true.
 */
export function partnerVisibility(summary: FinanceSummary | null): PartnerVisibility {
  const stable = isFoundationStable(summary);
  const available: Partner[] = [];
  const locked: Partner[] = [];
  for (const p of PARTNERS) {
    if (p.foundationsRequired && !stable) locked.push(p);
    else available.push(p);
  }
  return {
    available,
    locked,
    lockReason: locked.length
      ? "Locked until your foundation is stable: a non-negative monthly surplus, no past-due accounts, and about 3+ months of cash coverage. This keeps speculation from coming before stability."
      : null,
  };
}
