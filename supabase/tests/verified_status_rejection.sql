-- =============================================================================
-- Ordinary users cannot self-assert INDEPENDENT VERIFICATION
-- =============================================================================
-- Ownership is not verification. These paths are the direct database API (what
-- a user could call with their own anon key + JWT), i.e. bypassing the app.
-- =============================================================================
begin;
select test_seed_user('00000000-0000-0000-0000-00000000000a'::uuid);

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  ok boolean;
begin
  perform test_act_as(a);
  set local role authenticated;

  -- 1. action_events: 'completed_verified' must be rejected even for own rows
  ok := false;
  begin
    insert into public.action_events (owner_id, action_id, rule_id, type)
      values (a, 'review_past_due', 'review_past_due', 'completed_verified');
    ok := true;
  exception when insufficient_privilege then ok := false;
  end;
  if ok then raise exception 'FAIL: user self-asserted completed_verified via the database API'; end if;

  -- 2. self-reported completion is still allowed
  insert into public.action_events (owner_id, action_id, rule_id, type)
    values (a, 'review_past_due', 'review_past_due', 'completed_user_reported');

  -- 3. formation_checklists: 'verified' must be rejected on INSERT
  ok := false;
  begin
    insert into public.formation_checklists (owner_id, state, item_id, status)
      values (a, 'NY', 'ny_publication', 'verified');
    ok := true;
  exception when insufficient_privilege then ok := false;
  end;
  if ok then raise exception 'FAIL: user self-asserted formation verified on INSERT'; end if;

  -- 4. ...and on UPDATE of an existing own row
  ok := false;
  begin
    update public.formation_checklists set status = 'verified'
      where owner_id = a and item_id = 'ny_articles';
    ok := found;
  exception when insufficient_privilege then ok := false;
  end;
  if ok then raise exception 'FAIL: user escalated an existing row to formation verified'; end if;

  -- 5. self-reportable statuses still work
  update public.formation_checklists set status = 'user_reported_done'
    where owner_id = a and item_id = 'ny_articles';

  raise notice 'PASS: verified statuses rejected at the database boundary; self-reporting works';
end $$;
rollback;
