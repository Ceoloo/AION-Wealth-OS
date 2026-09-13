# AION Wealth OS — Completion Report (v0.1)

## Summary

A working founder-pilot slice is implemented end to end: a clearly-labeled synthetic demo
that runs without credentials, a deterministic finance + plan engine with strong tests,
the credit and formation workspaces, weekly review, exports, deletion, and an optional
(off-by-default) AI layer. Real user mode ships with Supabase schema, RLS, seed content,
and a cross-user isolation test; it shows an honest setup state until configured.

- **Build:** `npm run build` ✅ (14 routes, static)
- **Typecheck:** `tsc --noEmit` ✅
- **Lint:** `next lint` ✅ (no warnings/errors)
- **Tests:** `vitest run` ✅ **111 passing** (see the reliability-sprint evidence table below)

## Architecture

- `src/lib/domain/` — pure, framework-agnostic: `money` (integer cents), `finance`
  (surplus/net worth/coverage/utilization/double-count), `plan/{rules,engine}` (versioned
  deterministic engine, v`2026.09.2`), `formation`, `sources` (verification/expiry gate),
  `types`.
- `src/lib/store/` — validated pure `mutations`, `sessionGuard` (generation + write
  serialization), and a React `provider` with an explicit session state machine.
- `src/lib/analytics/pilotEvents.ts` — derived pilot milestones (no financial content).
- `src/lib/data/` — `bundle`, `export` (Markdown + JSON), `creditSummary`.
- `src/lib/auth/ownership.ts` — app-level owner guard (2nd line; RLS is 1st).
- `src/lib/ai/` — `summary` (minimization), `guardrails` (rate/spend), `adapter`
  (opt-in, disabled by default, no tools/actions).
- `src/lib/supabase/` — browser/server clients that return `null` (setup state) when
  unconfigured.
- `supabase/` — `migrations/0001`–`0004`, `seed.sql`, and a database test suite
  (`tests/`, run via `scripts/db-test.sh` against a disposable Postgres).
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
   (Deletion was materially rewritten in the reliability sprint — the original
   implementation reported success without deleting everything.)
   Settings exports Markdown+JSON and performs verified deletion; layout is single-column
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
npm run test        # 111 passing
npm run test:db     # database isolation + deletion, disposable Postgres
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
- **Per-app referral-click tracking:** append-only `referralEvents` record every link
  open (`click`) and self-reported signup (`signup_reported`) with partner id + category
  + timestamp — no financial content. A click marks status `clicked` (not `signed_up`);
  users self-report actual signups separately, so the funnel stays honest. `referralFunnel`
  aggregates clicks/signups per app (shown on `/partners`, included in export as
  `referralFunnel`). Mirrored server-side by the `referral_events` table (RLS, append-only).
  Aggregate across users server-side for portfolio-level conversion.

Note: this intentionally reverses the original spec's "omit affiliate offers" line at the
owner's direction; the honesty/guardrail constraints were preserved.

## Real user mode (Supabase CRUD) — wired

The app now runs against Supabase when configured and the user is signed in; otherwise it
falls back to the synthetic demo (no fake sign-in).

- **Repository abstraction** (`src/lib/repo/`): `Repository` interface with `DemoRepository`
  (localStorage + pure `mutations`) and `SupabaseRepository` (server actions). The provider
  picks one at runtime from auth state and exposes the *same* `useApp()` API, so no page
  changed.
- **Server actions** (`src/lib/supabase/actions.ts`, `"use server"`): every write resolves
  the authenticated user (or throws `AUTH_REQUIRED`), validates with the shared Zod schemas,
  stamps `owner_id`, writes as the user (RLS applies — service role never used), and returns
  a freshly-loaded bundle. Covers profile, snapshots, accounts, credit issues, action
  events, weekly reviews, formation + partner statuses, referral events, and data deletion
  (via the transactional `delete_my_data()` routine added in migration 0003 — the original
  "cascades from profiles" claim was wrong; see the reliability sprint).
- **Loader** (`src/lib/supabase/data.ts`): assembles a `UserDataBundle` from all tables,
  filtering by `owner_id` explicitly as defense-in-depth on top of RLS.
- **Mappers** (`src/lib/supabase/mappers.ts`): pure snake↔camel row mapping, unit-tested
  (6 tests), preserving `null` as unknown.
- **Auth**: `/signin` (email+password or magic link) with a setup state when unconfigured;
  `middleware.ts` refreshes the session cookie (no-op without config). Settings shows
  signed-in status and sign-out.
- **Migrations**: `0001_init.sql` + `0002_realmode.sql` (adds `partner_statuses` and
  `profiles.partners_acknowledged`).

Verified: typecheck, lint, and build pass (14 routes + middleware); 82 tests pass; demo
mode smoke-tested with Supabase unconfigured. Not verified here: live CRUD against a real
project (no Supabase available in this environment).

## Known limitations / blockers

- **RLS test is not run in CI here** (no live Postgres in this environment). The script is
  provided and self-checks with `PASS`; run it against a local Supabase stack.
- **Real-mode CRUD is now wired** (see below). It is build/typecheck-verified; full runtime
  verification requires a live Supabase project, which this environment doesn't have. Run
  the migrations + `supabase/tests/rls_cross_user.sql` against a project to confirm.
- **AI provider call is intentionally not enabled** (no paid services). The adapter,
  minimization, and guardrails are complete and tested; only the provider HTTP call is
  stubbed with an honest "disabled" response.
- **One state (NY) maintained.** Other states are honest handoffs by design.

## Bounded backlog (NOT implemented — deliberately deferred)

- Run the real-mode CRUD path against a live Supabase project end-to-end and add
  integration tests (the code is wired; only live verification remains).
- CI workflow running typecheck + tests + the RLS SQL against an ephemeral Postgres.
- Optimistic UI updates in real mode (currently each write reloads the bundle) and a
  `/r/:partnerId` server redirect for airtight referral-click attribution.
- Live AI provider adapter (server route + `ai_usage` writes) behind the existing guards.
- Additional maintained state checklists beyond NY, each with verified sources + expiry.
- Reminders/notifications for follow-up dates (credit issues, biennial statement).
- Accessibility audit pass (screen-reader labels on all interactive controls) and an
  automated a11y check.

## Pilot reliability sprint (PR1–PR3)

Addresses the September 2026 source review. Every finding was re-verified against
HEAD before changes were written; all six reproduced.

### PR1 — explicit session state and confirmed saves
- Session state machine replaces catch-to-demo: `initializing / signed_out / demo /
  auth_loading / auth_ready / session_expired / error`. A failed real-mode load or an
  expired session can no longer route a pending financial write to localStorage.
- Demo is entered only by explicit choice (persisted opt-in); anonymous visitors get a
  chooser, and the demo is labelled synthetic with a sign-in handoff instead of inviting
  real figures. No demo → real migration path.
- `SessionGuard` (unit-tested) provides session-generation guarding and a serialized write
  queue: stale-generation loads/mutations are discarded and older responses cannot
  overwrite newer state. Activations guarded at start and completion; auth-callback errors
  caught; private state cleared on sign-out/account change.
- Mutations return `MutationResult`; all six previously fire-and-forget forms now await
  confirmation, retain input on failure, show actionable errors, and block double submits.
- **Bug found by behavioural testing and fixed:** Supabase emits `INITIAL_SESSION` with a
  null session on subscribe; the old handler read that as a sign-out, cancelling the
  in-flight activation and bouncing the user to the chooser after every reload.

### PR2 — truthful deletion and independent verification
- Migration `0003` adds `delete_my_data()`: transactional, `SECURITY DEFINER`, hard-scoped
  to `auth.uid()`, returns per-table counts and re-checks that zero rows remain before
  committing. It clears `referral_events` and `ai_usage` (which have no user DELETE
  policy) **without** broadening ordinary user access.
- The server action requires a **recent sign-in**, inspects the RPC error, validates the
  routine's receipt, and independently re-reads the bundle. Any failure throws — a partial
  delete can never render as success.
- Contract is now labelled accurately: it deletes **data**, not the auth identity; the
  sign-in is retained and the UI says so. Demo reset is separate.
- Reauthentication promise honoured for deletion; export copy corrected (needs none). The
  unevidenced "backups purged within 30 days" claim was removed — backup retention must be
  read from the hosting project's actual configuration.
- Self-asserted verification (`completed_verified`, formation `verified`) is rejected in
  RLS `WITH CHECK` **and** by new Zod schemas at the server actions, closing the direct
  database-API path. `service_role` still bypasses for a future trusted workflow.

### PR3 — executable pilot evidence
- `supabase/tests/rls_cross_user.sql` rewritten: catches only the expected SQLSTATE with
  the unexpected-success assertion **outside** the handler (the old
  `when others then null` swallowed its own `FAIL`, making the assertion vacuous). Extends
  to **all 10 private tables** across read / update / delete / insert-on-behalf /
  owner-reassignment, plus export-path visibility.
- `meta_detects_broken_policy.sql` deliberately loosens a policy and asserts the suite
  goes red — evidence the assertions have teeth.
- `scripts/db-test.sh` runs everything with `ON_ERROR_STOP=1` against a disposable
  database and **refuses** to run destructive fixtures against a hosted project.
- `.github/workflows/ci.yml`: install from lockfile, typecheck, lint, unit tests, build,
  and the database suite against a disposable `postgres:16` service container.
- `scripts/e2e-real-mode.mjs`: real-mode browser journey (sign in → onboarding → snapshot →
  action completion → reload → export → verified deletion). It refuses to target the
  production project and reports **NOT RUN** when a disposable Supabase project is absent,
  rather than reporting a pass it did not earn.

### PR4 — action completion vs. issue resolution (review finding 6)
- Two concepts are now distinct: **ActionStatus** (what the user did — permanent history)
  and **IssueState** (whether the adverse fact still holds — recomputed every run).
  Contacting a creditor keeps the action `complete` while the account still reports
  `issueState: "active"`, and the UI says both ("Issue still open").
- **Occurrences:** each rule fingerprints the facts that triggered it, and a completion only
  suppresses that occurrence. `review_past_due` keys on *which* accounts are past due (a
  different account reactivates the work, earlier completion retained as
  `priorCompletions`); `stabilize_negative_surplus` and `build_cash_coverage` key on an
  **episode index** counted from the dated snapshot history, so a relapse after recovery is
  a new occurrence rather than something an old completion can mask.
- **Legacy safety:** one-off tasks stay on the `"default"` occurrence and rows with
  `occurrence_key IS NULL` are read as `"default"`, so existing completions/deferrals
  survive the upgrade. A test covers this and caught a regression where keying the baseline
  credit-report action as `"baseline"` would have dropped existing deferrals.
- **Honest denominator:** completions of rules that no longer apply are retained in
  `archivedCompletions` (marked resolved) and counted in *both* numerator and denominator of
  `plan.progress`, whose `basis` string states what is counted. A step leaving the plan can
  no longer inflate the percentage.
- **Pilot milestones** (`src/lib/analytics/pilotEvents.ts`): onboarding completed, first plan
  viewed, first action completed, weekly review submitted — *derived* from existing records
  (no second data copy), carrying no financial values, free text or owner identifiers, with
  demo activity excluded and referral conversion deliberately kept separate.
- **`PLAN_BEFORE_PARTNERS`** ordering experiment implemented behind a flag that defaults to
  current behaviour (`src/lib/experiments.ts`) — proposed, not imposed. Partner choices,
  disclosures and the foundations-first lock are unchanged either way.
- Migration `0004` adds `action_events.occurrence_key` (nullable = legacy default) + index.
  Engine version bumped to `2026.09.2`.

### What was actually executed (2026-09-12)
| Gate | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run test` (Vitest) | **111 pass** (+29 new: SessionGuard 7, runtime schemas 7, occurrence/issue-state 10, pilot milestones 5) |
| `npm run build` | pass (14 routes) |
| `npm run test:db` (disposable Postgres 16) | **10 assertions pass**, incl. meta-test |
| Migrations 0001–0004 applied to a scratch DB | pass (0003 and 0004 executed for the first time) |
| Browser pass — demo chooser / opt-in / seed / complete / reload | pass (scripted) |
| `npm run test:e2e` real-mode journey | **NOT RUN** — no disposable Supabase project |


### Activating the real-mode e2e gate later

The browser journey is written, self-guarded and wired into CI, but is **NOT RUN** — it
needs a disposable Supabase project, and the free tier caps this account at **2 active
projects**, both currently in use (`aion-wealth-os`, `AION EMPIRE SYSTEM`). Two routes were
attempted and are recorded here so they are not re-tried blindly:

- **Preview branch** — rejected by Supabase: *"Branching is supported only on the Pro plan
  or above."* ($0.01344/hour once on Pro.)
- **New free project** — rejected: *"2 project limit"* for active free projects.

To switch it on, free a slot (pause any project — pausing does not delete data) or upgrade,
create a throwaway project, then:

```bash
# 1. apply the schema to the throwaway project
psql "$E2E_DATABASE_URL" -f supabase/migrations/0001_init.sql
psql "$E2E_DATABASE_URL" -f supabase/migrations/0002_realmode.sql
psql "$E2E_DATABASE_URL" -f supabase/migrations/0003_deletion_and_verification.sql
psql "$E2E_DATABASE_URL" -f supabase/migrations/0004_action_occurrences.sql
psql "$E2E_DATABASE_URL" -f supabase/seed.sql

# 2. turn OFF "Confirm email" in that project's Auth settings, then create the test user
#    (or insert a pre-confirmed user directly), and run:
E2E_SUPABASE_URL=... E2E_SUPABASE_ANON_KEY=... E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e
```

For CI, add the same four values as repository secrets — `E2E_SUPABASE_URL`,
`E2E_SUPABASE_ANON_KEY`, `E2E_EMAIL`, `E2E_PASSWORD`. The `integration` job picks them up
automatically. The script refuses to run against the production project (verified: exit 2)
and reports NOT RUN rather than passing when the secrets are absent (verified).

### Remaining limits (explicitly not claimed)
- The real-mode browser journey has **not** been executed; it needs a disposable Supabase
  project with credentials in CI secrets.
- The database suite runs against local Postgres with a **shim** for `auth.users` /
  `auth.uid()` (`supabase/tests/harness/`). It approximates Supabase/GoTrue and is not a
  substitute for running against a real instance.
- Migration `0003` has **not** been applied to the live pilot project — the sprint brief
  forbids modifying production. Deployment order below.
- Recent-reauth uses `last_sign_in_at` within a 10-minute window; it is not a WebAuthn-grade
  re-assertion.
- Engine completion semantics (finding 6) are addressed in PR4 above. The occurrence keys
  are deliberately coarse (which accounts, which episode); they are not a general-purpose
  change-detection system, and a rule whose facts churn frequently would reactivate often.

### Deployment / migration order
1. Apply `supabase/migrations/0003_deletion_and_verification.sql` to the target project
   **before** deploying this app revision — the deletion action calls `delete_my_data()`
   and will fail until the routine exists.
2. Deploy the app.
3. Optionally add `E2E_*` CI secrets pointing at a **disposable** project to activate the
   real-mode journey gate.

## Commercialization compliance review

A full commercialization-gate review — credit-repair (CROA + state CSO), the referral/
affiliate links (FTC endorsement disclosure, per-partner terms, the GLBA "finder" trigger),
investing/crypto/event-contract referrals, UPL for formation, privacy/data-security
(GLBA Safeguards + state privacy laws), and advertising/UDAP — is documented in
`docs/COMPLIANCE_REVIEW.md`. It grounds each area in primary FTC/SEC/IRS/CROA sources, maps
what the codebase already mitigates, lists open gaps, and names the licensed reviewer needed
per area. It is a scoping document, not legal advice, and is a gate on commercial launch —
not on the private pilot.

## Explicitly out of scope (hard boundaries, per spec)

No custody, money movement, bank aggregation, paid subscriptions, credit-repair
fulfillment, automated filings, legal-document generation, loan brokering, paid
tradelines, acquisitions marketplace, securities execution, insurance sales, or crypto.
No GHL / AION execution layer / multi-agent runtime. No copying private financial records
into a CRM.
