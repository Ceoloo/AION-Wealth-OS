-- =============================================================================
-- RLS cross-user isolation — every private table, every operation
-- =============================================================================
-- Run with ON_ERROR_STOP=1 (see scripts/db-test.sh). Any failure raises.
--
-- Structure note: each "must be rejected" check catches ONLY the expected
-- SQLSTATE, and the unexpected-success assertion is raised OUTSIDE the
-- exception handler. The previous version wrapped its own FAIL exception in
-- `when others then null`, which swallowed the failure and made the assertion
-- vacuous.
-- =============================================================================
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'

begin;

select test_seed_user(:'A'::uuid);
select test_seed_user(:'B'::uuid);

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  t text;
  n bigint;
  visible bigint;
  succeeded boolean;
begin
  perform test_act_as(b);
  set local role authenticated;

  foreach t in array test_private_tables() loop
    -------------------------------------------------------------------- READ
    execute format('select count(*) from public.%I where owner_id = $1', t)
      into visible using a;
    if visible <> 0 then
      raise exception 'FAIL[%]: user B can READ % of user A''s rows', t, visible;
    end if;

    ------------------------------------------------------------------ UPDATE
    -- Either the policy rejects it outright, or it must affect zero rows.
    begin
      execute format('update public.%I set owner_id = owner_id where owner_id = $1', t) using a;
      get diagnostics n = row_count;
      if n <> 0 then
        raise exception 'FAIL[%]: user B UPDATED % of user A''s rows', t, n;
      end if;
    exception
      when insufficient_privilege then null;  -- no update policy: also correct
    end;

    ------------------------------------------------------------------ DELETE
    begin
      execute format('delete from public.%I where owner_id = $1', t) using a;
      get diagnostics n = row_count;
      if n <> 0 then
        raise exception 'FAIL[%]: user B DELETED % of user A''s rows', t, n;
      end if;
    exception
      when insufficient_privilege then null;  -- no delete policy: also correct
    end;

    ------------------------------------------------ OWNER REASSIGNMENT (theft)
    -- B must not be able to relabel its own row as belonging to A.
    succeeded := false;
    begin
      execute format('update public.%I set owner_id = $1 where owner_id = $2', t) using a, b;
      get diagnostics n = row_count;
      succeeded := n > 0;
    exception
      when insufficient_privilege then succeeded := false;
    end;
    if succeeded then
      raise exception 'FAIL[%]: user B REASSIGNED its row to user A', t;
    end if;
  end loop;

  raise notice 'PASS: read/update/delete/reassign isolation across % tables',
    array_length(test_private_tables(), 1);
end $$;

-- ---------------------------------------------------------------------------
-- INSERT on behalf of another user must be rejected (WITH CHECK).
-- The unexpected-success assertion is deliberately outside the handler.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  inserted boolean := false;
begin
  perform test_act_as(b);
  set local role authenticated;

  begin
    insert into public.financial_snapshots (owner_id, as_of, take_home_income_cents)
      values (a, '2026-09-02', 1);
    inserted := true;
  exception
    when insufficient_privilege then inserted := false;  -- expected RLS rejection
  end;

  if inserted then
    raise exception 'FAIL: user B INSERTED a row owned by user A';
  end if;
  raise notice 'PASS: insert-on-behalf-of-another-user rejected';
end $$;

-- ---------------------------------------------------------------------------
-- The export path reads through the same policies: B's readable set must be
-- exactly B's own rows, and A's must be untouched by any of the above.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  t text;
  own bigint;
begin
  perform test_act_as(b);
  set local role authenticated;
  foreach t in array test_private_tables() loop
    execute format('select count(*) from public.%I', t) into own;
    if own <> 1 then
      raise exception 'FAIL[%]: B''s visible set is % rows, expected exactly its own 1', t, own;
    end if;
  end loop;
  reset role;
  if test_count_all(a) <> 10 then
    raise exception 'FAIL: user A lost rows to user B (has %)', test_count_all(a);
  end if;
  raise notice 'PASS: export-path visibility is own-rows-only; user A intact';
end $$;

rollback;
