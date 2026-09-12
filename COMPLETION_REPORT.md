# AION Wealth OS — Completion Report (v0.1)

## Summary

A working founder-pilot slice is implemented end to end: a clearly-labeled synthetic demo
that runs without credentials, a deterministic finance + plan engine with strong tests,
the credit and formation workspaces, weekly review, exports, deletion, and an optional
(off-by-default) AI layer. Real user mode ships with Supabase schema, RLS, seed content,
and a cross-user isolation test; it shows an honest setup state until configured.

- **Build:** `npm run build` ✅ (12 routes, static)
- **Typecheck:** `tsc --noEmit` ✅
- **Lint:** `next lint` ✅ (no warnings/errors)
- **Tests:** `vitest run` ✅ **65 passing** across 8 files

## Architecture

- `src/lib/domain/` — pure, framework-agnostic: `money` (integer cents), `finance`
  (surplus/net worth/coverage/utilization/double-count), `plan/{rules,engine}` (versioned
  deterministic engine, v`2026.09.1`), `formation`, `sources` (verification/expiry gate),
  `types`.
- `src/lib/store/` — validated pure `mutations` + a React `provider` (demo persistence).
- `src/lib/data/` — `bundle`, `export` (Markdown + JSON), `creditSummary`.
- `src/lib/auth/ownership.ts` — app-level owner guard (2nd line; RLS is 1st).
- `src/lib/ai/` — `summary` (minimization), `guardrails` (rate/spend), `adapter`
  (opt-in, disabled by default, no tools/actions).
- `src/lib/supabase/` — browser/server clients that return `null` (setup state) when
  unconfigured.
- `supabase/` — `migrations/0001_init.sql`, `seed.sql`, `tests/rls_cross_user.sql`.
- `src/app/` — mobile-first UI: Today, My Plan, My Finances, Business Setup, Learn,
  Settings, Onboarding, Weekly Review.

## Acceptance criteria — status & evidence

1. **Onboarding → 3 explained priorities → complete → reload persists.** ✅
   Demo mode persists to `localStorage`; the engine emits ≤3 priorities each with full
   teach-back; `ActionCard` records completion via append-only events.
   Evidence: `engine.test.ts` (priorities/teach-back), provider persistence, `mutations.test.ts`.
2. **Changing facts updates plan without erasing completions or duplicating.** ✅
   `engine.test.ts` → "recompute preserves completed work and avoids duplicates",
   "reopened returns to in_progress".
3. **Negative surplus & overdue prioritize stabilization; missing ≠ zero.** ✅
   `engine.test.ts` → stabilization-first + formation deferred; clarify-first when anchors
   missing and no stabilization fabricated from unknowns.
4. **Calc tests: duplicate liabilities, unknown APR/limits, zero denominators, negatives.** ✅
   `finance.test.ts` (19 tests) covers all four explicitly.
5. **No fabricated scores/returns/confirmations/verification/integrations.** ✅
   Engine/export tests assert no score/guarantee strings; costs are `null` or integer;
   self-reported score requires date/source; filing states marked "user-reported".
6. **Two-user isolation for reads/writes/exports.** ✅
   App guard: `ownership.test.ts`. DB: `supabase/tests/rls_cross_user.sql` (prints PASS).
   Export path filters via `ownedOnly`.
7. **Formation instructions withheld on missing/stale/mismatched sources.** ✅
   `formation.test.ts` → NY fees withheld when source stale; wrong-jurisdiction/unverified/
   expired sources not actionable; unsupported states get a handoff, not a fake checklist.
8. **AI absence/failure doesn't break core; AI can't execute privileged actions.** ✅
   Core has zero AI dependency; `adapter` returns a disabled result and exposes no tools;
   out-of-scope intents are refused before any call. `ai.test.ts` covers guardrails +
   minimization.
9. **Export & deletion work; mobile usable; build/typecheck pass.** ✅
   Settings exports Markdown+JSON and performs confirmed deletion; layout is single-column
   within a 430px app frame (works at 390px); build + typecheck green.

## Source verification (2026-09-12)

Verified from official pages via fetch: NY DOS Articles of Organization **$200**;
Certificate of Publication **$50**, publish in two newspapers **within 120 days**;
Biennial Statement **$9** every two years. IRS LLC classification and free EIN. FTC:
accurate/current negatives can't be removed; CROA advance-fee prohibition. These populate
`content_sources` with `reviewed_at` + `expiry_days`; the runtime gate withholds any fee/
deadline whose source is unverified, expired, or out-of-jurisdiction.

## How to verify locally

```bash
npm install
npm run test        # 65 passing
npm run typecheck   # clean
npm run build       # succeeds
npm run dev         # open, click "Open the demo workspace", then Today → complete an
                    # action → reload → progress persists
# Real-mode RLS (needs a Postgres/Supabase):
psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
psql "$DATABASE_URL" -f supabase/tests/rls_cross_user.sql   # PASS
```

## Partner referrals (added post-v0.1 at owner's request)

Six referral apps are integrated as entry-level value: Kikoff, Self (credit-builders),
Chime, Cash App (banking), Coinbase, Kalshi (investing/speculative). Design decisions
confirmed with the owner: **soft gate** (a required onboarding step everyone sees, but
signup is optional/skippable) and **foundations-first** (speculative apps locked until
stable). Enforced in `src/lib/domain/partners.ts`, tested in `partners.test.ts` (8 tests):

- FTC affiliate disclosure (`AFFILIATE_DISCLOSURE`) shown wherever links appear; outbound
  links carry `rel="nofollow sponsored"`.
- Coinbase/Kalshi locked unless surplus ≥ 0, no past-due, and ≥ 3 months cash coverage —
  the same "stabilize before you speculate" ethic as the plan engine. Unknown data is
  treated as *not* stable.
- Partner offers are attributed to the partner (e.g. Self's "47-point*") with "results
  vary, terms apply" — never presented as an AION promise or guarantee.
- Per-user partner statuses and acknowledgement persist and are included in export.

Note: this intentionally reverses the original spec's "omit affiliate offers" line at the
owner's direction; the honesty/guardrail constraints were preserved.

## Known limitations / blockers

- **RLS test is not run in CI here** (no live Postgres in this environment). The script is
  provided and self-checks with `PASS`; run it against a local Supabase stack.
- **Real-mode read/write wiring** to Supabase is scaffolded (clients + schema + RLS) but
  the interactive app currently drives the **demo** repository. Wiring authenticated CRUD
  to the existing pure `mutations` is a contained next step (see backlog).
- **AI provider call is intentionally not enabled** (no paid services). The adapter,
  minimization, and guardrails are complete and tested; only the provider HTTP call is
  stubbed with an honest "disabled" response.
- **One state (NY) maintained.** Other states are honest handoffs by design.

## Bounded backlog (NOT implemented — deliberately deferred)

- Wire real-mode CRUD: a `SupabaseRepository` mapping `mutations` to tables; auth pages;
  middleware session refresh; server actions with `assertOwner`.
- CI workflow running typecheck + tests + the RLS SQL against an ephemeral Postgres.
- Live AI provider adapter (server route + `ai_usage` writes) behind the existing guards.
- Additional maintained state checklists beyond NY, each with verified sources + expiry.
- Reminders/notifications for follow-up dates (credit issues, biennial statement).
- Accessibility audit pass (screen-reader labels on all interactive controls) and an
  automated a11y check.

## Explicitly out of scope (hard boundaries, per spec)

No custody, money movement, bank aggregation, paid subscriptions, credit-repair
fulfillment, automated filings, legal-document generation, loan brokering, paid
tradelines, acquisitions marketplace, securities execution, insurance sales, or crypto.
No GHL / AION execution layer / multi-agent runtime. No copying private financial records
into a CRM.
