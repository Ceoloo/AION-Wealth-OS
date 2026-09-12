import type { ISODate } from "./types";

/**
 * Shared, reviewed guidance content — stored SEPARATELY from private user
 * records. Each source carries provenance and a review status. Unverified,
 * expired, or jurisdiction-mismatched sources CANNOT back an actionable filing
 * instruction (see isActionable / requireActionableSource).
 *
 * A source link alone is NOT professional approval.
 */

export type ReviewStatus = "verified" | "unverified" | "expired";

export interface ContentSource {
  id: string;
  url: string;
  publisher: string;
  /** Jurisdiction the content applies to: "US" (federal) or a 2-letter state. */
  jurisdiction: string;
  reviewedAt: ISODate;
  contentVersion: string;
  status: ReviewStatus;
  /** Days after reviewedAt at which time-sensitive guidance is considered stale. */
  expiryDays: number | null; // null = not time-sensitive
  summary: string;
}

/**
 * Sources reviewed during implementation. Fees/deadlines below were fetched
 * from official pages on the reviewedAt date. If a figure could not be verified
 * it is left out here and the dependent instruction is withheld at runtime.
 */
export const CONTENT_SOURCES: Record<string, ContentSource> = {
  ftc_credit_repair: {
    id: "ftc_credit_repair",
    url: "https://consumer.ftc.gov/articles/fixing-your-credit-faqs",
    publisher: "U.S. Federal Trade Commission",
    jurisdiction: "US",
    reviewedAt: "2026-09-12",
    contentVersion: "2026-09",
    status: "verified",
    expiryDays: 365,
    summary:
      "Companies that promise to repair credit cannot remove information that is both accurate and current; charging before delivering services is unlawful (Credit Repair Organizations Act).",
  },
  irs_llc: {
    id: "irs_llc",
    url: "https://www.irs.gov/businesses/small-businesses-self-employed/limited-liability-company-llc",
    publisher: "U.S. Internal Revenue Service",
    jurisdiction: "US",
    reviewedAt: "2026-09-12",
    contentVersion: "2026-09",
    status: "verified",
    expiryDays: 365,
    summary:
      "An LLC is created under state law. Federal tax treatment varies: a single-member LLC is a disregarded entity by default; a multi-member LLC is a partnership by default; either may elect corporate treatment on Form 8832.",
  },
  irs_ein: {
    id: "irs_ein",
    url: "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number",
    publisher: "U.S. Internal Revenue Service",
    jurisdiction: "US",
    reviewedAt: "2026-09-12",
    contentVersion: "2026-09",
    status: "verified",
    expiryDays: 365,
    summary: "An EIN is obtained directly and free of charge from the IRS. Apply on the official IRS site.",
  },
  ny_articles: {
    id: "ny_articles",
    url: "https://dos.ny.gov/articles-organization-domestic-limited-liability-company-0",
    publisher: "New York Department of State",
    jurisdiction: "NY",
    reviewedAt: "2026-09-12",
    contentVersion: "2026-09",
    status: "verified",
    expiryDays: 180, // fees change; re-verify twice a year
    summary: "Filing the Articles of Organization for a domestic NY LLC has a $200 filing fee.",
  },
  ny_publication: {
    id: "ny_publication",
    url: "https://dos.ny.gov/certificate-publication-domestic-limited-liability-company-0",
    publisher: "New York Department of State",
    jurisdiction: "NY",
    reviewedAt: "2026-09-12",
    contentVersion: "2026-09",
    status: "verified",
    expiryDays: 180,
    summary:
      "Within 120 days after formation, a NY LLC must publish in two newspapers designated by the county clerk; a Certificate of Publication is then filed with a $50 filing fee.",
  },
  ny_biennial: {
    id: "ny_biennial",
    url: "https://dos.ny.gov/biennial-statements-business-corporations-and-limited-liability-companies",
    publisher: "New York Department of State",
    jurisdiction: "NY",
    reviewedAt: "2026-09-12",
    contentVersion: "2026-09",
    status: "verified",
    expiryDays: 180,
    summary: "A NY LLC must file a Biennial Statement every two years with a $9 filing fee.",
  },
  annualcreditreport: {
    id: "annualcreditreport",
    url: "https://www.annualcreditreport.com/",
    publisher: "Annual Credit Report (federally authorized)",
    jurisdiction: "US",
    reviewedAt: "2026-09-12",
    contentVersion: "2026-09",
    status: "verified",
    expiryDays: 365,
    summary:
      "The federally authorized source for free credit reports from the three nationwide bureaus.",
  },
};

/**
 * A source can back an actionable instruction only if it is verified, not
 * expired relative to `asOf`, and its jurisdiction matches (federal "US" always
 * applies; a state source must match the requested state).
 */
export function isActionable(
  source: ContentSource | undefined,
  opts: { asOf: ISODate; jurisdiction: string },
): boolean {
  if (!source) return false;
  if (source.status !== "verified") return false;

  // Jurisdiction: US federal sources apply everywhere; state sources must match.
  if (source.jurisdiction !== "US" && source.jurisdiction !== opts.jurisdiction) {
    return false;
  }

  if (source.expiryDays !== null) {
    const reviewed = Date.parse(source.reviewedAt + "T00:00:00Z");
    const asOf = Date.parse(opts.asOf + "T00:00:00Z");
    if (Number.isFinite(reviewed) && Number.isFinite(asOf)) {
      const ageDays = (asOf - reviewed) / (1000 * 60 * 60 * 24);
      if (ageDays > source.expiryDays) return false;
    }
  }
  return true;
}

export function getSource(id: string): ContentSource | undefined {
  return CONTENT_SOURCES[id];
}
