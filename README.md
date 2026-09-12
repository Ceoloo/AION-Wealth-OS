# AION Wealth OS — Founder Pilot (v0.1)

A mobile-first financial education and execution workspace. It helps one U.S. founder
understand their actual financial position, fix foundation gaps, evaluate business
formation, and complete an evidence-backed 30-day action plan — teaching *why* each step
matters along the way.

> **Educational only.** AION Wealth OS is not a licensed wealth manager, credit-repair
> service, or law/accounting firm, and nothing here is legal, tax, or financial advice.
> It never fabricates credit scores, approval odds, filing confirmations, or guaranteed
> outcomes.

Core loop: **assess → explain → plan → act → record evidence → review outcomes.**

---

## What's implemented (v0.1 scope)

- **Onboarding & financial snapshot** — state, goals, experience, weekly time; monthly
  cash-flow and balance-sheet inputs; account/debt inventory. Unknown values stay
  *unknown* (never coerced to 0).
- **Deterministic calculations** (integer cents, USD): monthly surplus, net worth, cash
  coverage, revolving utilization — each with explicit incomplete-data labeling and
  divide-by-zero handling. Debt double-count detection.
- **Versioned deterministic plan engine** — up to 3 current priorities + a sequenced
  30-day plan. Stable rule/action ids preserve completed work and avoid duplicates on
  recompute. Negative surplus triggers a stabilization-first guardrail. AI never chooses
  priorities or computes finances.
- **Teach-back** on every action (what it means / why it matters / what to do / how to
  know it's complete) plus a comprehension check.
- **Credit foundation workspace** — education + a manual report-issue tracker (draft →
  submitted → awaiting → resolved/unresolved) and a factual **issue-summary export** (not
  a dispute letter, not submitted anywhere).
- **Business formation readiness** — one maintained, officially-sourced **New York**
  checklist; every other state gets an honest unsupported-state handoff. Fees/deadlines
  are withheld unless a verified, in-jurisdiction, non-expired source backs them.
- **Weekly review** — baseline vs. latest with dates and data completeness; separates
  actions taken from financial outcomes.
- **Starter tools (partner referrals)** — a soft-gate onboarding step presents recommended
  free/low-cost apps (credit-builders, banking, and — only once the user is financially
  stable — investing). Users can sign up, mark "already use it," or skip, then continue.
  FTC affiliate disclosure is shown wherever links appear; speculative apps (crypto, event
  contracts) are locked behind the same stabilization guardrail the plan engine uses.
  Revisitable anytime under Settings → Starter tools.
- **Export** (Markdown plan + structured JSON) and **account deletion**.
- **Optional AI educator** — server-side adapter, opt-in, minimized summary only,
  rate/spend guardrails. **Off by default; the app is fully usable without it.**

See `COMPLETION_REPORT.md` for verification details and the bounded backlog.

## Verified sources

Formation and credit facts were verified from official pages during implementation
(2026-09-12): NY Department of State (Articles of Organization $200; Certificate of
Publication $50, publish within 120 days; Biennial Statement $9), IRS (LLC tax
classification; EIN is free), and the FTC (accurate/current negative info can't simply
be removed; CROA advance-fee rules). Sources carry an expiry; stale sources stop backing
actionable fee/deadline instructions automatically.

---

## Tech stack

TypeScript · Next.js 15 (App Router) · React 18 · Tailwind CSS · Vitest · Zod ·
Supabase (Auth + Postgres) for real user mode.

Domain logic (`src/lib/domain`) is framework-agnostic and pure, so it's unit-tested in
isolation and reused by both demo and real-user paths.

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

Open the app and choose **Open the demo workspace**. The synthetic demo runs entirely in
the browser with clearly-labeled fake data — no credentials required.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (fails on type/lint errors) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Run the Vitest suite |
| `npm run lint` | ESLint (next/core-web-vitals) |

## Demo mode vs. real user mode

- **Synthetic demo** (default): fully functional, persisted in `localStorage`. This is
  synthetic data only — real financial information is *never* silently written to
  `localStorage`.
- **Real user mode**: requires Supabase configuration (below). Without it, the app shows
  a **setup state** rather than a fake sign-in, and only the demo is available.

## Configuring real user mode (Supabase)

1. Create a Supabase project.
2. Copy env vars: `cp .env.example .env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and (server-only)
   `SUPABASE_SERVICE_ROLE_KEY`.
3. Apply the schema + RLS and seed shared content:

   ```bash
   # Using the Supabase CLI against a local or linked project:
   supabase db reset            # applies supabase/migrations + supabase/seed.sql
   # or apply manually:
   psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
   psql "$DATABASE_URL" -f supabase/migrations/0002_realmode.sql
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```

4. Verify cross-user isolation (acceptance #6):

   ```bash
   psql "$DATABASE_URL" -f supabase/tests/rls_cross_user.sql   # prints PASS
   ```

5. Sign in at `/signin` (email + password, or a magic link). Once authenticated, the app
   switches to **real user mode**: all reads/writes go through authenticated,
   RLS-enforced server actions and persist to Postgres. Sign out returns you to the demo.

Every private table has `owner_id` and row-level security scoped to `auth.uid()`.
Shared reviewed content (`content_sources`) is readable by authenticated users and
writable only by the service role. Service credentials never reach the browser.

## Optional AI educator

Left blank in `.env.example` → **disabled**. When `AI_PROVIDER` and `AI_API_KEY` are set,
the server-side adapter (`src/lib/ai`) enforces opt-in consent, sends only a **minimized
summary** (coarse bands and counts — never account identifiers, exact balances, or private
notes), and applies rate + monthly-spend limits. The model can explain and summarize; it
has no tools and cannot file, contact creditors, open accounts, or promise returns.

## Data, security & privacy

- Integer cents for all money; USD only in v0.1.
- No bank logins, SSNs, full account numbers, identity documents, or raw credit-report
  uploads are ever collected.
- Application events preserve status history without copying raw sensitive values.
- **Backup-retention policy:** in a deployed Supabase project, automated backups follow
  the project's configured retention window. On authenticated account deletion, live data
  is removed immediately (cascades from `profiles`), and any residual copies in backups
  age out within that retention window (target: ≤ 30 days) and are not restored into
  production except for disaster recovery. Document and confirm the exact window for your
  environment before onboarding real users.

## Commercialization gate

Before any commercial release, complete documented review of: credit-repair rules (FTC/
CROA), investment-adviser rules, state legal-service boundaries, privacy obligations, and
any later lending/insurance features. Calling software "educational" does not settle its
regulatory classification. This review gates commercialization — not building the private
pilot.
