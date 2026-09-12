import type { Cents } from "./money";
import type { ISODate, USState } from "./types";
import { getSource, isActionable } from "./sources";

/**
 * Business formation readiness. One maintained state-specific checklist (NY);
 * every other state gets an honest "unsupported — here's how to find official
 * resources" handoff.
 *
 * Fee/deadline facts are gated: if the backing source is missing, expired, or
 * jurisdiction-mismatched, the amount/instruction is withheld (rendered
 * "unavailable") rather than guessed.
 */

export type FormationItemStatus =
  | "not_started"
  | "in_progress"
  | "user_reported_done"
  | "verified";

export interface FormationChecklistItem {
  id: string;
  title: string;
  explanation: string;
  /** Verified state fee in cents, or null when unavailable / not applicable. */
  stateFeeCents: Cents | null;
  /** Third-party (non-state) expenses the user should expect, described honestly. */
  thirdPartyCostNote: string | null;
  /** Deadline text, only populated when backed by an actionable source. */
  deadline: string | null;
  sourceId: string | null;
  /** True when this item may involve professional review (e.g. attorney/CPA). */
  professionalReviewTrigger: boolean;
  officialUrl: string | null;
}

export interface StateFormationChecklist {
  state: USState;
  supported: boolean;
  items: FormationChecklistItem[];
  /** Present when unsupported: how to reach official resources for that state. */
  unsupportedHandoff: string | null;
}

/**
 * Build the NY checklist. `asOf` is used to gate stale sources — a fee whose
 * source has expired relative to asOf is withheld.
 */
export function buildNewYorkChecklist(asOf: ISODate): StateFormationChecklist {
  const j = "NY";
  const articles = getSource("ny_articles");
  const publication = getSource("ny_publication");
  const biennial = getSource("ny_biennial");
  const ein = getSource("irs_ein");
  const irsLlc = getSource("irs_llc");

  const articlesOk = isActionable(articles, { asOf, jurisdiction: j });
  const publicationOk = isActionable(publication, { asOf, jurisdiction: j });
  const biennialOk = isActionable(biennial, { asOf, jurisdiction: j });
  const einOk = isActionable(ein, { asOf, jurisdiction: j });

  const items: FormationChecklistItem[] = [
    {
      id: "ny_activity_location",
      title: "Clarify your business activity and operating location",
      explanation:
        "Formation requirements depend on what you do and where you operate. A professional service (e.g. licensed fields) may require a Professional Service LLC instead of a standard LLC.",
      stateFeeCents: null,
      thirdPartyCostNote: null,
      deadline: null,
      sourceId: null,
      professionalReviewTrigger: true,
      officialUrl: "https://dos.ny.gov/limited-liability-companies",
    },
    {
      id: "ny_entity_options",
      title: "Understand entity options and tax treatment (not automatic savings)",
      explanation:
        "An LLC is a state-law entity; federal tax treatment varies and is a separate decision. An LLC is not an automatic tax saving and not a complete liability shield. Consider professional review before electing corporate tax treatment.",
      stateFeeCents: null,
      thirdPartyCostNote: null,
      deadline: null,
      sourceId: isActionable(irsLlc, { asOf, jurisdiction: "US" }) ? "irs_llc" : null,
      professionalReviewTrigger: true,
      officialUrl: irsLlc?.url ?? null,
    },
    {
      id: "ny_name_research",
      title: "Research and reserve a distinguishable business name",
      explanation:
        "Your LLC name must be distinguishable from existing names on the NY DOS records and include a required designator (e.g. 'LLC').",
      stateFeeCents: null,
      thirdPartyCostNote: null,
      deadline: null,
      sourceId: null,
      professionalReviewTrigger: false,
      officialUrl: "https://apps.dos.ny.gov/publicInquiry/",
    },
    {
      id: "ny_registered_agent",
      title: "Arrange service of process (Secretary of State as agent)",
      explanation:
        "In New York the Secretary of State is automatically the agent for service of process; you provide an address to which process is forwarded. You may optionally designate a registered agent.",
      stateFeeCents: null,
      thirdPartyCostNote:
        "Optional commercial registered-agent services charge their own annual fee (third-party, not a state fee).",
      deadline: null,
      sourceId: null,
      professionalReviewTrigger: false,
      officialUrl: "https://dos.ny.gov/limited-liability-companies",
    },
    {
      id: "ny_articles",
      title: "File the Articles of Organization",
      explanation:
        "The Articles of Organization is the document that forms the LLC with the New York Department of State. Filing this yourself on the official site is what creates the entity — not completing this checklist.",
      stateFeeCents: articlesOk ? 20000 : null, // $200.00, gated
      thirdPartyCostNote: null,
      deadline: null,
      sourceId: articlesOk ? "ny_articles" : null,
      professionalReviewTrigger: false,
      officialUrl: articles?.url ?? null,
    },
    {
      id: "ny_operating_agreement",
      title: "Adopt a written operating agreement",
      explanation:
        "New York requires LLC members to adopt a written operating agreement. This governs ownership and management. Complex ownership or multi-member arrangements are a professional-review topic.",
      stateFeeCents: null,
      thirdPartyCostNote: "Attorney drafting/review is a third-party cost that varies.",
      deadline: null,
      sourceId: null,
      professionalReviewTrigger: true,
      officialUrl: "https://dos.ny.gov/limited-liability-companies",
    },
    {
      id: "ny_publication",
      title: "Meet the newspaper publication requirement",
      explanation:
        "Within 120 days after formation, a NY LLC must publish in two newspapers designated by the county clerk of its county, then file a Certificate of Publication with the Department of State.",
      stateFeeCents: publicationOk ? 5000 : null, // $50.00 certificate filing fee, gated
      thirdPartyCostNote:
        "Newspaper publication charges are third-party costs set by the newspapers; they vary widely by county and are not state fees.",
      deadline: publicationOk ? "Within 120 days after formation" : null,
      sourceId: publicationOk ? "ny_publication" : null,
      professionalReviewTrigger: false,
      officialUrl: publication?.url ?? null,
    },
    {
      id: "ny_ein",
      title: "Get an EIN from the IRS (free, official site only)",
      explanation:
        "An Employer Identification Number is obtained directly and free from the IRS. Do not pay a third party for the number itself, and never substitute an EIN for your personal identity.",
      stateFeeCents: einOk ? 0 : null, // $0.00 — free, when source is actionable
      thirdPartyCostNote: null,
      deadline: null,
      sourceId: einOk ? "irs_ein" : null,
      professionalReviewTrigger: false,
      officialUrl: ein?.url ?? null,
    },
    {
      id: "ny_bank_separation",
      title: "Separate business and personal finances",
      explanation:
        "Open a dedicated business bank account and keep business and personal money separate. Commingling funds can undermine the liability protection an LLC is meant to provide.",
      stateFeeCents: null,
      thirdPartyCostNote: "Bank account fees, if any, are set by your bank (third-party).",
      deadline: null,
      sourceId: null,
      professionalReviewTrigger: false,
      officialUrl: null,
    },
    {
      id: "ny_recordkeeping_biennial",
      title: "Set up recordkeeping and calendar the Biennial Statement",
      explanation:
        "Keep formation documents, the operating agreement, and financial records organized. New York LLCs must file a Biennial Statement every two years.",
      stateFeeCents: biennialOk ? 900 : null, // $9.00, gated
      thirdPartyCostNote: null,
      deadline: biennialOk ? "Every two years, in the anniversary month of formation" : null,
      sourceId: biennialOk ? "ny_biennial" : null,
      professionalReviewTrigger: false,
      officialUrl: biennial?.url ?? null,
    },
  ];

  return { state: "NY", supported: true, items, unsupportedHandoff: null };
}

/**
 * Resolve a checklist for any US state. NY is supported; everything else gets an
 * honest handoff to official resources rather than a fabricated checklist.
 */
export function resolveChecklist(state: USState | null, asOf: ISODate): StateFormationChecklist | null {
  if (state === null) return null;
  if (state === "NY") return buildNewYorkChecklist(asOf);
  return {
    state,
    supported: false,
    items: [],
    unsupportedHandoff:
      `AION maintains a verified formation checklist for New York only in v0.1. For ${state}, ` +
      `start with your state's Secretary of State (or equivalent business filing office) and the IRS. ` +
      `We won't show ${state}-specific fees or deadlines we haven't verified.`,
  };
}
