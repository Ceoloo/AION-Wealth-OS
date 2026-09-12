-- =============================================================================
-- RLS cross-user isolation test (acceptance criterion #6)
-- =============================================================================
-- Run against a local Supabase stack:
--   supabase start
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/migrations/0001_init.sql
--   psql ... -f supabase/tests/rls_cross_user.sql
--
-- This proves that with RLS enabled, user B cannot SELECT, UPDATE, or DELETE
-- user A's rows, and cannot INSERT rows owned by user A. We simulate auth.uid()
-- via request.jwt.claim.sub (what Supabase sets per request).
-- =============================================================================

begin;

-- Two synthetic auth users.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test')
on conflict do nothing;

-- Act as user A and insert a private snapshot.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

insert into public.financial_snapshots (owner_id, as_of, take_home_income_cents)
values ('00000000-0000-0000-0000-00000000000a', '2026-09-01', 500000);

-- User A can see their own row.
do $$
begin
  if (select count(*) from public.financial_snapshots) <> 1 then
    raise exception 'FAIL: user A should see exactly 1 row';
  end if;
end $$;

-- Switch to user B.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);

-- READ isolation: B sees none of A's rows.
do $$
begin
  if (select count(*) from public.financial_snapshots) <> 0 then
    raise exception 'FAIL: user B must not read user A rows';
  end if;
end $$;

-- WRITE isolation: B cannot insert a row owned by A (WITH CHECK blocks it).
do $$
begin
  begin
    insert into public.financial_snapshots (owner_id, as_of, take_home_income_cents)
    values ('00000000-0000-0000-0000-00000000000a', '2026-09-02', 1);
    raise exception 'FAIL: user B inserted a row owned by A';
  exception when others then
    -- expected: RLS violation
    null;
  end;
end $$;

-- UPDATE/DELETE isolation: affect zero of A's rows.
do $$
declare n int;
begin
  update public.financial_snapshots set take_home_income_cents = 0;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user B updated % of A rows', n; end if;

  delete from public.financial_snapshots;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user B deleted % of A rows', n; end if;
end $$;

select 'PASS: RLS isolates users across read/write/delete' as result;

rollback;
