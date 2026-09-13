-- =============================================================================
-- META-TEST: prove the isolation suite can FAIL
-- =============================================================================
-- A green suite is only evidence if it is capable of going red. Here we
-- deliberately loosen one policy so user A's rows leak to user B, then assert
-- that the same check the real suite performs actually raises. If this test
-- reports PASS, the isolation assertions have teeth.
--
-- Everything happens inside a transaction that is rolled back.
-- =============================================================================
begin;
select test_seed_user('00000000-0000-0000-0000-00000000000a'::uuid);
select test_seed_user('00000000-0000-0000-0000-00000000000b'::uuid);

-- Sabotage: make financial_snapshots readable by anyone signed in.
alter policy snap_select on public.financial_snapshots using (true);

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  visible bigint;
  detected boolean := false;
begin
  perform test_act_as(b);
  set local role authenticated;

  -- This is the exact read assertion used by rls_cross_user.sql.
  begin
    select count(*) into visible from public.financial_snapshots where owner_id = a;
    if visible <> 0 then
      raise exception 'FAIL[financial_snapshots]: user B can READ % of user A''s rows', visible;
    end if;
  exception
    when raise_exception then detected := true;
  end;
  reset role;

  if not detected then
    raise exception 'META-FAIL: the isolation check did NOT detect a deliberately broken policy';
  end if;
  raise notice 'PASS(meta): broken policy was detected — isolation assertions are effective';
end $$;
rollback;

-- Confirm the sabotage was rolled back and the real policy is restored.
do $$
declare qual text;
begin
  select pg_get_expr(polqual, polrelid) into qual
  from pg_policy where polname = 'snap_select';
  if qual is null or qual = 'true' then
    raise exception 'META-FAIL: sabotage leaked out of the transaction (qual=%)', qual;
  end if;
  raise notice 'PASS(meta): sabotage rolled back; snap_select restored to %', qual;
end $$;
