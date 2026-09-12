-- =============================================================================
-- AION Wealth OS — initial schema (v0.1)
-- =============================================================================
-- Design principles:
--  * Money is stored as integer cents (bigint). USD only in v0.1.
--  * Every PRIVATE record has owner_id = auth.uid() and is protected by RLS.
--  * SHARED reviewed content (content_sources) is readable by all authenticated
--    users but writable only by service role — it is NOT private user data.
--  * Application events preserve status history without copying raw sensitive
--    financial values.
--  * Deleting a profile cascades to all of that user's private records.
-- =============================================================================

-- Enable required extensions (pgcrypto for gen_random_uuid)
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null unique references auth.users(id) on delete cascade,
  residence_state    text,
  business_state     text,
  goals              text[] not null default '{}',
  experience         text check (experience in ('new','some','experienced')),
  weekly_time_minutes integer check (weekly_time_minutes >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- financial_snapshots (dated; never overwritten — history preserved)
-- ---------------------------------------------------------------------------
create table if not exists public.financial_snapshots (
  id                          uuid primary key default gen_random_uuid(),
  owner_id                    uuid not null references auth.users(id) on delete cascade,
  as_of                       date not null,
  take_home_income_cents      bigint,
  essential_spending_cents    bigint,
  other_spending_cents        bigint,
  required_debt_payments_cents bigint,
  available_cash_cents        bigint,
  other_assets_cents          bigint,
  liabilities_cents           bigint,
  has_past_due_accounts       boolean,
  self_reported_score         jsonb,   -- {score,date,source,model} — user-entered only
  created_at                  timestamptz not null default now()
);
create index if not exists idx_snapshots_owner on public.financial_snapshots(owner_id, as_of);

-- ---------------------------------------------------------------------------
-- accounts (debts/assets inventory)
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  nickname            text not null,
  classification      text not null check (classification in ('personal','business')),
  kind                text not null check (kind in ('credit_card','loan','line_of_credit','bank','other')),
  balance_cents       bigint,
  apr_bps             integer,          -- basis points; null = unknown
  min_payment_cents   bigint,
  past_due_cents      bigint,
  due_date            date,
  credit_limit_cents  bigint,           -- revolving only
  is_revolving        boolean not null default false,
  include_in_snapshot boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_accounts_owner on public.accounts(owner_id);

-- ---------------------------------------------------------------------------
-- credit_issues (user-tracked suspected report inaccuracies)
-- ---------------------------------------------------------------------------
create table if not exists public.credit_issues (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  bureau            text not null check (bureau in ('equifax','experian','transunion','unknown')),
  creditor_nickname text not null,
  category          text not null,
  explanation       text not null,
  relevant_date     date,
  follow_up_date    date,
  state             text not null default 'draft'
                      check (state in ('draft','user_submitted','awaiting_response','resolved','unresolved')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_credit_issues_owner on public.credit_issues(owner_id);

-- ---------------------------------------------------------------------------
-- action_events (append-only history of action progress; no raw money copied)
-- ---------------------------------------------------------------------------
create table if not exists public.action_events (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  action_id  text not null,   -- stable engine action id
  rule_id    text not null,   -- stable engine rule id
  type       text not null check (type in
               ('generated','started','completed_user_reported','completed_verified',
                'skipped','deferred','reopened')),
  reason     text,            -- required by app for skip/defer
  at         timestamptz not null default now()
);
create index if not exists idx_action_events_owner on public.action_events(owner_id, action_id);

-- ---------------------------------------------------------------------------
-- formation_checklists (per-user reported status per checklist item)
-- ---------------------------------------------------------------------------
create table if not exists public.formation_checklists (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null references auth.users(id) on delete cascade,
  state     text not null,
  item_id   text not null,
  status    text not null default 'not_started'
              check (status in ('not_started','in_progress','user_reported_done','verified')),
  updated_at timestamptz not null default now(),
  unique (owner_id, state, item_id)
);
create index if not exists idx_formation_owner on public.formation_checklists(owner_id);

-- ---------------------------------------------------------------------------
-- weekly_reviews
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_reviews (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references auth.users(id) on delete cascade,
  week_of              date not null,
  updated_balances_note text,
  actions_completed    text[] not null default '{}',
  obstacles            text,
  time_spent_minutes   integer check (time_spent_minutes >= 0),
  next_priorities      text,
  created_at           timestamptz not null default now()
);
create index if not exists idx_weekly_owner on public.weekly_reviews(owner_id, week_of);

-- ---------------------------------------------------------------------------
-- ai_usage (optional; token/cost accounting WITHOUT financial content)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  at            timestamptz not null default now(),
  prompt_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_cents    integer not null default 0,
  model         text
  -- NOTE: no financial content, notes, or account identifiers are stored here.
);
create index if not exists idx_ai_usage_owner on public.ai_usage(owner_id, at);

-- ---------------------------------------------------------------------------
-- content_sources (SHARED reviewed guidance — NOT private user data)
-- ---------------------------------------------------------------------------
create table if not exists public.content_sources (
  id              text primary key,
  url             text not null,
  publisher       text not null,
  jurisdiction    text not null,       -- 'US' (federal) or 2-letter state
  reviewed_at     date not null,
  content_version text not null,
  status          text not null check (status in ('verified','unverified','expired')),
  expiry_days     integer,             -- null = not time-sensitive
  summary         text not null
);

-- =============================================================================
-- Row-Level Security
-- =============================================================================
alter table public.profiles            enable row level security;
alter table public.financial_snapshots enable row level security;
alter table public.accounts            enable row level security;
alter table public.credit_issues       enable row level security;
alter table public.action_events       enable row level security;
alter table public.formation_checklists enable row level security;
alter table public.weekly_reviews      enable row level security;
alter table public.ai_usage            enable row level security;
alter table public.content_sources     enable row level security;

-- Helper: a private-table policy set is identical across tables. Each policy
-- restricts every operation to rows the caller owns (auth.uid() = owner_id).
-- We define them explicitly per table for clarity and auditability.

-- profiles ------------------------------------------------------------------
create policy profiles_select on public.profiles for select using (auth.uid() = owner_id);
create policy profiles_insert on public.profiles for insert with check (auth.uid() = owner_id);
create policy profiles_update on public.profiles for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy profiles_delete on public.profiles for delete using (auth.uid() = owner_id);

-- financial_snapshots -------------------------------------------------------
create policy snap_select on public.financial_snapshots for select using (auth.uid() = owner_id);
create policy snap_insert on public.financial_snapshots for insert with check (auth.uid() = owner_id);
create policy snap_update on public.financial_snapshots for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy snap_delete on public.financial_snapshots for delete using (auth.uid() = owner_id);

-- accounts ------------------------------------------------------------------
create policy acct_select on public.accounts for select using (auth.uid() = owner_id);
create policy acct_insert on public.accounts for insert with check (auth.uid() = owner_id);
create policy acct_update on public.accounts for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy acct_delete on public.accounts for delete using (auth.uid() = owner_id);

-- credit_issues -------------------------------------------------------------
create policy ci_select on public.credit_issues for select using (auth.uid() = owner_id);
create policy ci_insert on public.credit_issues for insert with check (auth.uid() = owner_id);
create policy ci_update on public.credit_issues for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy ci_delete on public.credit_issues for delete using (auth.uid() = owner_id);

-- action_events -------------------------------------------------------------
create policy ae_select on public.action_events for select using (auth.uid() = owner_id);
create policy ae_insert on public.action_events for insert with check (auth.uid() = owner_id);
create policy ae_delete on public.action_events for delete using (auth.uid() = owner_id);
-- (no update policy: events are append-only)

-- formation_checklists ------------------------------------------------------
create policy fc_select on public.formation_checklists for select using (auth.uid() = owner_id);
create policy fc_insert on public.formation_checklists for insert with check (auth.uid() = owner_id);
create policy fc_update on public.formation_checklists for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy fc_delete on public.formation_checklists for delete using (auth.uid() = owner_id);

-- weekly_reviews ------------------------------------------------------------
create policy wr_select on public.weekly_reviews for select using (auth.uid() = owner_id);
create policy wr_insert on public.weekly_reviews for insert with check (auth.uid() = owner_id);
create policy wr_update on public.weekly_reviews for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy wr_delete on public.weekly_reviews for delete using (auth.uid() = owner_id);

-- ai_usage ------------------------------------------------------------------
create policy ai_select on public.ai_usage for select using (auth.uid() = owner_id);
create policy ai_insert on public.ai_usage for insert with check (auth.uid() = owner_id);

-- content_sources: readable by any authenticated user; writes are service-role
-- only (service role bypasses RLS). No public policy grants writes.
create policy cs_select on public.content_sources for select
  using (auth.role() = 'authenticated');
