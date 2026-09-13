-- Shared test helpers. Loaded once per test database.
-- Seeding runs as the database owner so it bypasses RLS: fixtures must not
-- depend on the very policies under test.

create or replace function test_seed_user(u uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into auth.users (id, email) values (u, u::text || '@example.test')
    on conflict (id) do nothing;

  insert into public.profiles (owner_id, residence_state, goals, experience, weekly_time_minutes)
    values (u, 'NY', array['improve_credit'], 'new', 120)
    on conflict (owner_id) do nothing;
  insert into public.financial_snapshots (owner_id, as_of, take_home_income_cents)
    values (u, '2026-09-01', 500000);
  insert into public.accounts (owner_id, nickname, classification, kind, balance_cents)
    values (u, 'Card', 'personal', 'credit_card', 30000);
  insert into public.credit_issues (owner_id, bureau, creditor_nickname, category, explanation)
    values (u, 'experian', 'Old account', 'wrong_balance', 'Balance looks wrong.');
  insert into public.action_events (owner_id, action_id, rule_id, type)
    values (u, 'review_past_due', 'review_past_due', 'completed_user_reported');
  insert into public.weekly_reviews (owner_id, week_of) values (u, '2026-09-07');
  insert into public.formation_checklists (owner_id, state, item_id, status)
    values (u, 'NY', 'ny_articles', 'in_progress');
  insert into public.partner_statuses (owner_id, partner_id, status)
    values (u, 'kikoff', 'clicked');
  insert into public.referral_events (owner_id, partner_id, category, type)
    values (u, 'kikoff', 'credit_builder', 'click');
  insert into public.ai_usage (owner_id, prompt_tokens, output_tokens, cost_cents)
    values (u, 10, 20, 1);
end $$;

/** Count every private row belonging to a user, bypassing RLS. */
create or replace function test_count_all(u uuid) returns bigint
language sql security definer set search_path = public, pg_temp as $$
  select (select count(*) from public.profiles             where owner_id = u)
       + (select count(*) from public.financial_snapshots  where owner_id = u)
       + (select count(*) from public.accounts             where owner_id = u)
       + (select count(*) from public.credit_issues        where owner_id = u)
       + (select count(*) from public.action_events        where owner_id = u)
       + (select count(*) from public.weekly_reviews       where owner_id = u)
       + (select count(*) from public.formation_checklists where owner_id = u)
       + (select count(*) from public.partner_statuses     where owner_id = u)
       + (select count(*) from public.referral_events      where owner_id = u)
       + (select count(*) from public.ai_usage             where owner_id = u);
$$;

/** Act as a signed-in user for subsequent statements in this transaction. */
create or replace function test_act_as(u uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end $$;

/** Every table holding private, owner-scoped rows. */
create or replace function test_private_tables() returns text[]
language sql immutable as $$
  select array[
    'profiles','financial_snapshots','accounts','credit_issues','action_events',
    'weekly_reviews','formation_checklists','partner_statuses','referral_events','ai_usage'
  ]::text[];
$$;
