# AION Wealth OS — Commercialization Compliance Review (v0.1)

**Prepared:** 2026-09-12 · **Scope:** founder-pilot codebase at this revision, with
emphasis on the partner **referral links**.

> ## This is not legal advice
> This document is a **scoping / gap analysis** written by the engineering team to satisfy
> the build spec's requirement to *"document the actual feature and marketing review needed
> for credit-repair rules, investment-adviser rules, state legal-service boundaries,
> privacy, and any later lending or insurance features."* It flags where **licensed
> professional review is required** and organizes the questions for those professionals. It
> is **not** a legal opinion, does not create an attorney–client relationship, and must not
> be relied on as clearance to launch. Before onboarding anyone beyond the founder, engage
> qualified counsel in each area named below. Calling the software "educational" does not by
> itself settle its regulatory classification.

---

## How to read this

Each area has: **what could apply**, **why it's triggered here (esp. referrals)**, **what
the code already does to reduce risk**, and **what a professional must review**. Residual
risk is rated for *a commercial launch* (the private single-founder pilot is lower risk
across the board, which is why the spec treats this as a commercialization gate, not a
blocker on building).

| Area | Residual risk at commercial launch | Primary reviewer |
|---|---|---|
| A. Credit repair (CROA + state CSO) | **High** | Consumer-finance attorney |
| B. Referral / affiliate links | **High** | Advertising + consumer-finance + securities counsel |
| C. Investing/crypto/event-contract referrals | **High / novel** | Securities & commodities attorney |
| D. State legal-service boundaries (UPL) | **Medium** | Attorney (per state) |
| E. Privacy & data security (GLBA/Safeguards, state privacy) | **High** | Privacy/data-security counsel |
| F. Advertising / UDAP (claims, guarantees) | **Medium** | Advertising counsel |
| G. Future lending / insurance | **Deferred** | Specialist counsel when built |

---

## A. Credit-repair rules — federal CROA + state Credit Services Organization (CSO) laws

**What could apply.** The federal **Credit Repair Organizations Act (CROA)** governs any
person that sells services to improve a consumer's credit record *for money or other
valuable consideration*. Key duties: **no advance fees** (no charging before the service is
fully performed — no "enrollment/set-up/processing" workaround), a written contract with
required disclosures, and a **3-day right to cancel**. Nonprofits, banks/lenders, and
licensed attorneys giving legal services are generally exempt. **Labeling a program
"education," "coaching," "advisory," or "file optimization" does not remove it from CROA if
the real service sold is credit repair for money.** Most states also have **Credit Services
Organization (CSO) statutes** that are often *broader* than CROA (registration, surety
bond, contract, and advance-fee rules), and some are triggered even without a direct fee.

**Why it's triggered here.** v0.1 is free and does not perform disputes, so federal CROA is
likely not yet engaged. But the commercial model changes that: (1) a **paid subscription**
that bundles credit-improvement features could make the paid product a "credit repair
organization"; (2) **referral revenue earned specifically from credit-builder apps
(Kikoff, Self)** is "valuable consideration" connected to improving credit and needs to be
analyzed under CROA and each state CSO law; (3) the credit-issue workspace + issue-summary
export sit near the CROA line even though they don't submit disputes.

**What the code already does.** No advance-fee credit-repair service exists; no automated
dispute letters or submissions (`src/lib/data/creditSummary.ts` is a factual,
user-reviewed export only); the app repeatedly states accurate, current negative
information cannot simply be removed and discourages disputing accurate info
(`src/lib/domain/plan/rules.ts` → `review_credit_report`, sourced to the FTC); issue states
are tracked without claiming bureau integration.

**What a professional must review before charging money.**
- Whether any paid tier or the credit-builder referral revenue makes AION a "credit repair
  organization" under CROA, and if so: contract, disclosures, 3-day cancellation, and the
  advance-fee structure (subscriptions that front-load credit help are the danger).
- **State-by-state CSO registration/bonding** for every state you accept users from —
  several require registration/bond *regardless of fee*.
- Whether the issue-summary export or teach-back content crosses into "performing a service
  to improve credit" for consideration.

---

## B. Referral / affiliate links — the emphasis area

The six partners are: **Kikoff, Self** (credit builders), **Chime, Cash App** (banking /
payments), **Coinbase** (crypto), **Kalshi** (event contracts). Referral compensation
changes AION from a neutral educator into a paid promoter, which pulls in several regimes at
once.

### B1. FTC endorsement / material-connection disclosure (16 CFR Part 255)
**Requirement.** Any material connection (you earn a reward when a user signs up) must be
disclosed **clearly and conspicuously**, and the FTC's guidance is that the disclosure
should be **close to the recommendation** — a single disclosure elsewhere on the page may be
insufficient.
**Code today.** `AFFILIATE_DISCLOSURE` is defined and rendered at the top of the partner
list, and outbound links carry `rel="nofollow sponsored"` (`src/lib/domain/partners.ts`,
`src/components/Partners.tsx`). Partner-authored offers (e.g. Self's "47-point*") are
**attributed to the partner**, not adopted as AION's claim.
**Gaps for review.** (a) Move/duplicate the disclosure **adjacent to each link/button**, not
only atop the list. (b) Ensure the onboarding "starter tools" step's disclosure is equally
conspicuous. (c) Advertising counsel should confirm wording ("AION may earn a reward…").

### B2. Substantiation & adoption of partner claims
Even attributed claims can create liability if AION is seen to **adopt** them. "Build
credit," "average 47-point increase," "$100," "$5" are **partner** claims; AION must not
present them as its own outcomes and should keep "results vary / terms apply." Advertising
counsel should confirm the attribution is adequate and that AION makes **no** independent
performance promise.

### B3. Each partner's own affiliate-program terms
Every program (Kikoff, Self, Chime/Chime's issuing-bank rules, Block/Cash App, Coinbase,
Kalshi) has an **affiliate/referral agreement** with prohibited claims, required
disclosures, trademark-use limits, and audience/geo restrictions. **These are contracts** —
review each before earning revenue; some prohibit exactly the kind of "sign up to grow your
portfolio" framing, or bar incentivized/again-and-again prompting.

### B4. "Finder" status → GLBA/Safeguards (see §E)
The FTC's 2021 Safeguards Rule amendments list **"finders — companies that bring together
buyers and sellers and then the parties themselves negotiate and consummate the
transaction"** as an example of a covered **financial institution**. A referral hub that
routes users to financial products for compensation may be characterized as a finder,
**triggering the FTC Safeguards Rule** (written security program, encryption, access
controls, breach notification). This is a direct consequence of the referral model — see §E.

### B5. CROA / CSO interaction for credit-builder referrals
Referral fees from **Kikoff and Self** are consideration connected to improving credit →
analyze under §A (CROA + state CSO), not just advertising law.

### B6. Vulnerable-audience / UDAAP & "foundations-first"
A product that tells users to stabilize their finances, then earns money steering them to
**speculative** products (crypto, event contracts), invites unfair/deceptive-practice
(UDAP/UDAAP) and reputational scrutiny.
**Code today.** Speculative partners (Coinbase, Kalshi) are **locked** until the user is
financially stable (non-negative surplus, no past-due, ≥3 months cash coverage) with risk
notes; unknown data is treated as not-stable (`isFoundationStable` /
`partnerVisibility`). Signup is **optional/skippable** (soft gate), reducing coercion/tying
concerns.
**For review.** Counsel should weigh whether a "financial foundations" brand should carry
crypto/event-contract referrals at all, and confirm the gating + disclosures are adequate.

### B7. Onboarding placement
The referral step is prompted before the plan but is **not** a hard paywall (users can skip
/ "already use it"). Keep it genuinely optional; a mandatory sign-up-to-proceed design would
raise tying and deceptive-onboarding issues.

---

## C. Investing / crypto / event-contract referrals — securities & commodities

**Investment Advisers Act.** AION does **not** give personalized securities advice or manage
assets, so it is likely **not** an "investment adviser," and the SEC **Marketing Rule
(206(4)-1)** governs *advisers'* testimonials/endorsements — not directly applicable unless
AION's role changes. Do not begin recommending specific securities, allocations, or
"portfolio" strategies without securities counsel, or that analysis changes.

**Broker / "finder" / solicitor.** Being paid to route users to a securities or crypto
venue can raise **unregistered broker / finder** questions depending on how it's done and
how compensation is structured. Securities counsel must review the Coinbase/Kalshi
arrangements specifically.

**Coinbase (crypto).** Crypto's securities/commodities classification remains contested and
volatile; marketing must carry loss-of-principal risk (the code does) and make **no** return
promises. Review state money-transmission-adjacent marketing rules and Coinbase's affiliate
terms.

**Kalshi (event contracts).** Event contracts are **CFTC**-regulated, and their
**availability and legality vary by state** and have been the subject of active regulatory
action and litigation. Counsel must review: state-by-state permissibility, honoring Kalshi's
own geo-restrictions, gambling-adjacency perception, and whether to include event-contract
referrals in a financial-foundations product at all.

**Net:** these two partners carry the **most novel and jurisdiction-dependent** risk. A
defensible option is to **withhold Coinbase and Kalshi from the commercial product** until
securities/commodities counsel clears them, keeping the four foundation-aligned partners.

---

## D. State legal-service boundaries — Unauthorized Practice of Law (UPL)

**What could apply.** State UPL rules restrict giving **legal advice** or preparing legal
documents. The business-formation module explains entity options and a NY checklist.
**Code today.** The app explains that formation is a legal step separate from tax treatment,
does **not** auto-recommend an LLC, does **not** generate legal documents, states that only
the official state filing creates the entity, marks filing states "user-reported," and
routes complex topics (operating agreements, tax elections, multi-owner) to "professional
review" (`src/lib/domain/formation.ts`). Sources are gated by verification/expiry/jurisdiction.
**For review.** An attorney (per state you support) should confirm the formation content
reads as **general education**, not individualized legal advice, and that the "professional
review" triggers are drawn correctly — especially as you add states beyond NY.

---

## E. Privacy & data security

**GLBA / FTC Safeguards Rule.** The Rule's examples of covered **"financial institutions"**
include *credit counselors and other financial advisors*, *investment advisors not
SEC-registered*, and — since 2021 — **finders**. Given AION collects consumer financial
information **and** operates a referral/finder model, a privacy attorney must determine
whether AION is a "financial institution." If so, the Safeguards Rule requires a **written
information security program** (designated qualified individual, risk assessment, access
controls, **encryption** of customer info at rest and in transit, MFA, logging, vendor
oversight, incident response) and **breach notification to the FTC within 30 days** for
incidents affecting ≥500 consumers.
**Code today.** Row-level security on every table with `owner_id = auth.uid()`
(`supabase/migrations/0001_init.sql`), provider-managed encryption at rest, HTTPS in transit,
an app-level ownership guard (`src/lib/auth/ownership.ts`), minimized data sent to the
optional AI (coarse bands only, no identifiers/notes — `src/lib/ai/summary.ts`), no bank
logins / SSNs / full account numbers collected, and authenticated export + deletion.
**Gaps for review.** No published **Privacy Policy** or **Terms of Service** yet; no formal
written Safeguards program; confirm the anon key + RLS posture with counsel; document vendor
(Supabase, Vercel, any AI provider) data-processing terms; finalize the **backup-retention
& deletion** policy (drafted in the README) with a concrete window.

**State privacy laws (CCPA/CPRA and successors).** If you accept users from states with
comprehensive privacy laws and hit their thresholds, you'll owe notice-at-collection,
consumer rights (access/delete/correct/opt-out), and possibly data-processing agreements.
Financial data and any "sharing" with partners (even referral attribution) must be reviewed.

**Children/COPPA.** Restrict to adults (18+); confirm onboarding enforces this.

---

## F. Advertising / UDAP (general)

No guaranteed returns, guaranteed funding, guaranteed credit-history deletion, or guaranteed
financial independence — the code avoids these and never fabricates scores/approval-odds
(`src/lib/domain/plan/engine.test.ts` asserts this). Before commercial marketing, advertising
counsel should review **all** outward copy (landing page, app store text, emails, the
referral framing "build and grow your portfolio") for substantiation and UDAP.

---

## G. Future lending / insurance (deferred)

Not built. When added, they bring their own regimes (TILA/ECOA/state lending licenses;
state insurance producer licensing). Out of scope now; flagged for specialist review at
build time.

---

## What is already mitigated in the codebase (evidence map)

- **No advance-fee credit repair, no automated disputes** — `creditSummary.ts`, plan rules.
- **Affiliate disclosure + `rel="nofollow sponsored"` + partner-attributed claims** —
  `partners.ts`, `Partners.tsx`.
- **Foundations-first gating of speculative referrals; optional (skippable) onboarding** —
  `isFoundationStable`, `partnerVisibility`, `Today` soft gate.
- **No fabricated scores / returns / guarantees; deterministic engine** — engine + tests.
- **RLS + ownership guard + minimized AI data + no sensitive identifiers collected** —
  migrations, `ownership.ts`, `ai/summary.ts`.
- **Source verification/expiry/jurisdiction gate for formation facts** — `sources.ts`,
  `formation.ts`.
- **Authenticated export + deletion; documented (draft) retention policy** — `export.ts`,
  Settings, README.

## Open gaps to close before commercial launch

1. Engage **consumer-finance counsel** (CROA + state CSO; credit-builder referral analysis).
2. Engage **securities/commodities counsel** for Coinbase & Kalshi (or drop them from the
   commercial product until cleared).
3. Engage **advertising counsel** for endorsement disclosures (place them adjacent to each
   link), claim substantiation, and all marketing copy.
4. Engage **privacy/data-security counsel**: determine financial-institution/finder status,
   stand up a written Safeguards program if required, publish **Privacy Policy + ToS**,
   finalize retention/deletion, and cover applicable state privacy laws.
5. Review and comply with **each partner's affiliate-program agreement** (contracts).
6. Confirm **UPL** posture for formation content per supported state.
7. Enforce **18+**; confirm state-by-state availability for Kalshi and any state where a
   partner or AION itself isn't permitted.
8. Keep the referral prompt **optional**; never gate core access behind third-party signups.

---

## Sources reviewed (2026-09-12)

- FTC — *Fixing Your Credit FAQs* (accurate/current negatives can't be removed; CROA
  advance-fee prohibition): https://consumer.ftc.gov/articles/fixing-your-credit-faqs
- Credit Repair Organizations Act, 15 U.S.C. §§ 1679–1679j (advance-fee ban, written
  contract, 3-day cancellation; "credit repair organization" definition).
- FTC — *Endorsements, Influencers, and Reviews* / 16 CFR Part 255 (material-connection
  disclosure, clear & conspicuous, near the recommendation):
  https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews
- SEC — *Investment Adviser Marketing* (Marketing Rule 206(4)-1; testimonials/endorsements
  by advisers): https://www.sec.gov/resources-small-businesses/small-business-compliance-guides/investment-adviser-marketing
- FTC — *Safeguards Rule: What Your Business Needs to Know* and the 2021/2023 amendments
  adding "finders" and breach notification:
  https://www.ftc.gov/business-guidance/resources/ftc-safeguards-rule-what-your-business-needs-know
- FTC — *Gramm-Leach-Bliley Act* business guidance:
  https://www.ftc.gov/business-guidance/privacy-security/gramm-leach-bliley-act
- IRS — *Limited Liability Company (LLC)* (formation is state law; federal tax treatment
  varies): https://www.irs.gov/businesses/small-businesses-self-employed/limited-liability-company-llc

*State Credit Services Organization statutes, state money-transmission and event-contract
rules, and state comprehensive privacy laws vary and must be reviewed per jurisdiction by
counsel; they are not enumerated here.*
