-- =============================================================================
-- 0006 — Connected accounts (Plaid) + per-figure provenance
-- =============================================================================
-- Three guarantees this migration makes at the database boundary:
--
-- 1. THE PLAID ACCESS TOKEN NEVER REACHES A USER. It is stored only as
--    application-encrypted ciphertext (AES-256-GCM, key held outside the
--    database), and `authenticated` is granted SELECT on the safe columns of
--    its own rows only — the token column is not granted at all. Users have no
--    INSERT/UPDATE/DELETE on connections; only the server (service_role) writes.
--
-- 2. PROVENANCE CAN'T BE FORGED. Every tracked figure on accounts and
--    snapshots carries a source. A trigger stamps anything a user writes as
--    `user_reported`, whatever the request claimed; only the server can record
--    a figure as `connected_account` or `derived`. Same principle as 0003's
--    rejection of self-asserted "verified" statuses: ownership isn't provenance.
--
-- 3. DELETION COVERS CONNECTED DATA. delete_my_data() now removes connections
--    and verifies them in its postcondition. (Disconnecting the item at Plaid
--    itself happens in the application BEFORE this runs — the database cannot
--    call Plaid. See revokeAll() in src/lib/plaid/service.ts.)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Connections
-- ---------------------------------------------------------------------------
create table if not exists public.plaid_items (
  id                       uuid primary key default gen_random_uuid(),
  owner_id                 uuid not null references auth.users(id) on delete cascade,
  item_id                  text not null unique,
  -- base64(iv | ciphertext | auth tag). Readable only by the server, and
  -- useless without PLAID_TOKEN_ENCRYPTION_KEY, which never enters the DB.
  access_token_ciphertext  text not null,
  institution_id           text,
  institution_name         text,
  status                   text not null default 'active'
                           check (status in ('active', 'login_required', 'error')),
  error_code               text,
  last_synced_at           timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists idx_plaid_items_owner on public.plaid_items(owner_id);

alter table public.plaid_items enable row level security;

-- Supabase's default privileges grant everything on new tables; take it all
-- back, then grant users exactly the columns they may see.
revoke all on public.plaid_items from anon, authenticated;
grant select (id, owner_id, institution_id, institution_name, status, error_code,
              last_synced_at, created_at, updated_at)
  on public.plaid_items to authenticated;

drop policy if exists plaid_items_select on public.plaid_items;
create policy plaid_items_select on public.plaid_items
  for select using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- 2. Provenance columns
-- ---------------------------------------------------------------------------
alter table public.accounts
  add column if not exists source text not null default 'user_reported',
  add column if not exists plaid_item_id uuid references public.plaid_items(id) on delete cascade,
  add column if not exists plaid_account_id text,
  add column if not exists field_sources jsonb not null default '{}'::jsonb,
  add column if not exists synced_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'accounts_source_check') then
    alter table public.accounts
      add constraint accounts_source_check
      check (source in ('user_reported', 'connected_account'));
  end if;
  -- A connected account always belongs to a connection, and only then.
  if not exists (select 1 from pg_constraint where conname = 'accounts_connected_link_check') then
    alter table public.accounts
      add constraint accounts_connected_link_check
      check ((source = 'connected_account') = (plaid_item_id is not null and plaid_account_id is not null));
  end if;
end $$;

create unique index if not exists accounts_owner_plaid_account
  on public.accounts(owner_id, plaid_account_id)
  where plaid_account_id is not null;

alter table public.financial_snapshots
  add column if not exists field_sources jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Provenance guard
-- ---------------------------------------------------------------------------
-- `field_sources` maps a domain field name to its source. An absent key means
-- user_reported (every row written before this migration).
create or replace function public.guard_provenance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  cols text[];
  keys text[];
  i int;
  changed boolean;
begin
  -- The server (service_role, or the owner running migrations) is trusted to
  -- record where a figure came from. A user is not.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_table_name = 'accounts' then
    cols := array['balance_cents', 'apr_bps', 'min_payment_cents', 'past_due_cents',
                  'due_date', 'credit_limit_cents'];
    keys := array['balanceCents', 'aprBps', 'minPaymentCents', 'pastDueCents',
                  'dueDate', 'creditLimitCents'];
  else
    cols := array['take_home_income_cents', 'essential_spending_cents', 'other_spending_cents',
                  'required_debt_payments_cents', 'available_cash_cents', 'other_assets_cents',
                  'liabilities_cents', 'has_past_due_accounts'];
    keys := array['takeHomeIncomeCents', 'essentialSpendingCents', 'otherSpendingCents',
                  'requiredDebtPaymentsCents', 'availableCashCents', 'otherAssetsCents',
                  'liabilitiesCents', 'hasPastDueAccounts'];
  end if;

  if tg_op = 'INSERT' then
    new.field_sources := '{}'::jsonb;          -- everything a user enters is theirs
    if tg_table_name = 'accounts' then
      new.source := 'user_reported';
      new.plaid_item_id := null;
      new.plaid_account_id := null;
      new.synced_at := null;
    end if;
    return new;
  end if;

  -- UPDATE: link and provenance columns are server-owned; a user's request
  -- can't change them. Any figure the user actually changes becomes theirs.
  new.field_sources := old.field_sources;
  if tg_table_name = 'accounts' then
    new.source := old.source;
    new.plaid_item_id := old.plaid_item_id;
    new.plaid_account_id := old.plaid_account_id;
    new.synced_at := old.synced_at;
  end if;
  for i in 1 .. array_length(cols, 1) loop
    execute format('select ($1).%I is distinct from ($2).%I', cols[i], cols[i])
      into changed using new, old;
    if changed then
      new.field_sources := new.field_sources || jsonb_build_object(keys[i], 'user_reported');
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists accounts_provenance on public.accounts;
create trigger accounts_provenance
  before insert or update on public.accounts
  for each row execute function public.guard_provenance();

drop trigger if exists snapshots_provenance on public.financial_snapshots;
create trigger snapshots_provenance
  before insert or update on public.financial_snapshots
  for each row execute function public.guard_provenance();

-- ---------------------------------------------------------------------------
-- 4. Deletion covers connections
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  counts jsonb := '{}'::jsonb;
  n bigint;
  remaining bigint;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  delete from public.financial_snapshots where owner_id = uid;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('financial_snapshots', n);

  delete from public.accounts where owner_id = uid;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('accounts', n);

  delete from public.plaid_items where owner_id = uid;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('plaid_items', n);

  delete from public.credit_issues where owner_id = uid;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('credit_issues', n);

  delete from public.action_events where owner_id = uid;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('action_events', n);

  delete from public.weekly_reviews where owner_id = uid;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('weekly_reviews', n);

  delete from public.formation_checklists where owner_id = uid;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('formation_checklists', n);

  delete from public.partner_statuses where owner_id = uid;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('partner_statuses', n);

  delete from public.referral_events where owner_id = uid;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('referral_events', n);

  delete from public.ai_usage where owner_id = uid;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('ai_usage', n);

  delete from public.profiles where owner_id = uid;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('profiles', n);

  select
    (select count(*) from public.financial_snapshots where owner_id = uid)
  + (select count(*) from public.accounts             where owner_id = uid)
  + (select count(*) from public.plaid_items          where owner_id = uid)
  + (select count(*) from public.credit_issues        where owner_id = uid)
  + (select count(*) from public.action_events        where owner_id = uid)
  + (select count(*) from public.weekly_reviews       where owner_id = uid)
  + (select count(*) from public.formation_checklists where owner_id = uid)
  + (select count(*) from public.partner_statuses     where owner_id = uid)
  + (select count(*) from public.referral_events      where owner_id = uid)
  + (select count(*) from public.ai_usage             where owner_id = uid)
  + (select count(*) from public.profiles             where owner_id = uid)
  into remaining;

  if remaining <> 0 then
    raise exception 'DELETION_INCOMPLETE: % rows remain', remaining using errcode = 'P0001';
  end if;

  return counts || jsonb_build_object('verified_remaining', remaining);
end;
$$;

revoke all on function public.delete_my_data() from public;
revoke all on function public.delete_my_data() from anon;
grant execute on function public.delete_my_data() to authenticated;
