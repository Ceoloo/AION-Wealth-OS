-- =============================================================================
-- Deletion contract: complete, scoped, verified — never a false success
-- =============================================================================
begin;
select test_seed_user('00000000-0000-0000-0000-00000000000a'::uuid);
select test_seed_user('00000000-0000-0000-0000-00000000000b'::uuid);

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  receipt jsonb;
begin
  if test_count_all(a) <> 10 then raise exception 'FIXTURE: A should have 10 rows'; end if;
  if test_count_all(b) <> 10 then raise exception 'FIXTURE: B should have 10 rows'; end if;

  -- A deletes their own data through the supported routine.
  perform test_act_as(a);
  set local role authenticated;
  select public.delete_my_data() into receipt;
  reset role;

  -- 1. Every private table for A is empty — including referral_events and
  --    ai_usage, which have no user DELETE policy and were previously left behind.
  if test_count_all(a) <> 0 then
    raise exception 'FAIL: % rows of user A survived deletion', test_count_all(a);
  end if;

  -- 2. The routine verified its own postcondition.
  if (receipt->>'verified_remaining')::bigint <> 0 then
    raise exception 'FAIL: routine did not verify completion';
  end if;
  if (receipt->>'referral_events')::bigint <> 1 or (receipt->>'ai_usage')::bigint <> 1 then
    raise exception 'FAIL: append-only tables were not actually cleared (receipt %)', receipt;
  end if;

  -- 3. User B is completely untouched.
  if test_count_all(b) <> 10 then
    raise exception 'FAIL: user A''s deletion removed % of user B''s rows', 10 - test_count_all(b);
  end if;

  raise notice 'PASS: deletion removed all 10 of A''s tables, verified, B intact';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- Unauthenticated callers cannot delete.
-- ---------------------------------------------------------------------------
begin;
select test_seed_user('00000000-0000-0000-0000-00000000000a'::uuid);
do $$
declare ok boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  begin
    perform public.delete_my_data();
    ok := true;
  -- Catch ONLY the expected condition. delete_my_data() raises AUTH_REQUIRED
  -- with SQLSTATE 28000; a catch-all here would let an unrelated error pass as
  -- if the guard had worked.
  exception when invalid_authorization_specification then ok := false;
  end;
  reset role;
  if ok then raise exception 'FAIL: an unauthenticated caller deleted data'; end if;
  if test_count_all('00000000-0000-0000-0000-00000000000a'::uuid) <> 10 then
    raise exception 'FAIL: rows disappeared on an unauthenticated call';
  end if;
  raise notice 'PASS: unauthenticated deletion refused, data intact';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- anon must not even be able to execute the routine.
-- ---------------------------------------------------------------------------
do $$
declare ok boolean := false;
begin
  begin
    set local role anon;
    perform public.delete_my_data();
    ok := true;
  -- anon holds no EXECUTE grant, so the expected failure is 42501.
  exception when insufficient_privilege then ok := false;
  end;
  reset role;
  if ok then raise exception 'FAIL: anon executed delete_my_data()'; end if;
  raise notice 'PASS: anon cannot execute the deletion routine';
end $$;
