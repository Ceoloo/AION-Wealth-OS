-- =============================================================================
-- AION Wealth OS — truthful deletion + independent-verification integrity
-- =============================================================================
-- Two problems this migration closes:
--
-- 1. DELETION WAS NOT TRUTHFUL. Every private table's foreign key references
--    auth.users, NOT profiles, so deleting the profile row cascaded to nothing.
--    referral_events and ai_usage additionally have no user DELETE policy, so
--    a client-side delete silently affected zero rows while the caller reported
--    success. We replace the per-table client deletes with one transactional,
--    SECURITY DEFINER routine that deletes only the caller's own rows and
--    verifies the postcondition before committing.
--
--    Note this is DATA deletion. It does not delete the auth.users identity --
--    that requires service-role administration -- so the product copy must say
--    "delete my data", not "delete my account".
--
-- 2. USERS COULD SELF-ASSERT INDEPENDENT VERIFICATION. RLS allowed owners to
--    insert action_events of type 'completed_verified' and to set the formation
--    status 'verified' directly through the database API, bypassing the
--    application. Ownership is not verification. Until a trusted verification
--    workflow exists, ordinary users may only self-report. service_role (used
--    by a future trusted workflow) still bypasses RLS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Reject self-asserted verification at the database boundary
-- ---------------------------------------------------------------------------
drop policy if exists ae_insert on public.action_events;
create policy ae_insert on public.action_events
  for insert
  with check (
    auth.uid() = owner_id
    and type <> 'completed_verified'
  );

drop policy if exists fc_insert on public.formation_checklists;
create policy fc_insert on public.formation_checklists
  for insert
  with check (
    auth.uid() = owner_id
    and status <> 'verified'
  );

drop policy if exists fc_update on public.formation_checklists;
create policy fc_update on public.formation_checklists
  for update
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and status <> 'verified'
  );

-- ---------------------------------------------------------------------------
-- 2. Transactional "delete all my data" routine
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so it can clear append-only tables (referral_events,
-- ai_usage) WITHOUT granting ordinary users a broad DELETE policy on them.
-- It is hard-scoped to auth.uid() and therefore cannot touch another user.
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

  -- Postcondition: nothing of this user's may survive. Any leftover aborts the
  -- whole routine (single transaction), so a partial delete can never be
  -- reported to the caller as success.
  select
    (select count(*) from public.financial_snapshots where owner_id = uid)
  + (select count(*) from public.accounts             where owner_id = uid)
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

-- Only signed-in users may call it, and only ever for themselves.
revoke all on function public.delete_my_data() from public;
revoke all on function public.delete_my_data() from anon;
grant execute on function public.delete_my_data() to authenticated;
