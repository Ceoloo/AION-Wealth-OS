-- =============================================================================
-- Connected accounts: token secrecy, write lockout, unforgeable provenance
-- =============================================================================
-- Each "must be rejected" check catches ONLY the expected SQLSTATE and raises
-- its FAIL outside the handler, as in rls_cross_user.sql.
-- =============================================================================
begin;
select test_seed_user('00000000-0000-0000-0000-00000000000a'::uuid);

-- ---------------------------------------------------------------------------
-- 1. The token column is unreadable — even on the user's OWN connection.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  leaked text;
  readable boolean := false;
  name text;
begin
  perform test_act_as(a);
  set local role authenticated;

  begin
    select access_token_ciphertext into leaked from public.plaid_items where owner_id = a;
    readable := true;
  exception when insufficient_privilege then readable := false;
  end;
  if readable then raise exception 'FAIL: a user READ their access-token ciphertext'; end if;

  -- `select *` must fail too: it is how a careless client would ask.
  begin
    perform * from public.plaid_items;
    readable := true;
  exception when insufficient_privilege then readable := false;
  end;
  if readable then raise exception 'FAIL: select * on plaid_items succeeded for a user'; end if;

  -- The safe columns ARE readable, for the user's own row.
  select institution_name into name from public.plaid_items where owner_id = a;
  if name is distinct from 'Test Bank' then
    raise exception 'FAIL: user cannot read the safe columns of their own connection (got %)', name;
  end if;
  reset role;
  raise notice 'PASS: token column unreadable (explicit and select *); safe columns readable';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Users cannot create, alter or delete connections. Only the server can.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  wrote boolean;
begin
  perform test_act_as(a);
  set local role authenticated;

  wrote := false;
  begin
    insert into public.plaid_items (owner_id, item_id, access_token_ciphertext)
      values (a, 'forged-item', 'forged');
    wrote := true;
  exception when insufficient_privilege then wrote := false;
  end;
  if wrote then raise exception 'FAIL: a user INSERTED a connection'; end if;

  wrote := false;
  begin
    update public.plaid_items set status = 'active' where owner_id = a;
    wrote := true;
  exception when insufficient_privilege then wrote := false;
  end;
  if wrote then raise exception 'FAIL: a user UPDATED a connection'; end if;

  wrote := false;
  begin
    delete from public.plaid_items where owner_id = a;
    wrote := true;
  exception when insufficient_privilege then wrote := false;
  end;
  if wrote then raise exception 'FAIL: a user DELETED a connection directly'; end if;

  reset role;
  set local role anon;
  wrote := false;
  begin
    perform 1 from public.plaid_items;
    wrote := true;
  exception when insufficient_privilege then wrote := false;
  end;
  if wrote then raise exception 'FAIL: anon can read plaid_items'; end if;
  reset role;
  raise notice 'PASS: users cannot insert/update/delete connections; anon has no access';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Provenance can't be forged by a user write.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  item uuid;
  acct record;
  snap record;
begin
  select id into item from public.plaid_items where owner_id = a;

  -- A user tries to pass an account off as bank-sourced.
  perform test_act_as(a);
  set local role authenticated;
  insert into public.accounts (owner_id, nickname, classification, kind, balance_cents,
                               source, plaid_item_id, plaid_account_id, field_sources)
    values (a, 'Forged', 'personal', 'bank', 999,
            'connected_account', item, 'forged-acct', '{"balanceCents":"connected_account"}');
  select * into acct from public.accounts where owner_id = a and nickname = 'Forged';
  if acct.source <> 'user_reported' or acct.plaid_item_id is not null
     or acct.plaid_account_id is not null or acct.field_sources <> '{}'::jsonb then
    raise exception 'FAIL: user forged account provenance: % / % / %', acct.source, acct.plaid_item_id, acct.field_sources;
  end if;

  -- Same for a snapshot.
  insert into public.financial_snapshots (owner_id, as_of, available_cash_cents, field_sources)
    values (a, '2026-10-01', 123, '{"availableCashCents":"connected_account"}');
  select * into snap from public.financial_snapshots where owner_id = a and as_of = '2026-10-01';
  if snap.field_sources <> '{}'::jsonb then
    raise exception 'FAIL: user forged snapshot provenance: %', snap.field_sources;
  end if;
  reset role;
  raise notice 'PASS: user-written accounts and snapshots are stamped user_reported';
end $$;

-- ---------------------------------------------------------------------------
-- 4. The server records institution data; a user's later edit is stamped as
--    theirs, and the user can't re-point or relabel the account.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  item uuid;
  acct record;
begin
  select id into item from public.plaid_items where owner_id = a;

  set local role service_role;
  insert into public.accounts (owner_id, nickname, classification, kind, balance_cents,
                               credit_limit_cents, is_revolving, source, plaid_item_id,
                               plaid_account_id, field_sources)
    values (a, 'Bank card', 'personal', 'credit_card', 40000, 100000, true,
            'connected_account', item, 'acct-1',
            '{"balanceCents":"connected_account","creditLimitCents":"connected_account"}');
  reset role;

  perform test_act_as(a);
  set local role authenticated;
  -- The user fills in the APR the bank didn't report, and tries to relabel.
  update public.accounts
     set apr_bps = 2499, source = 'user_reported', plaid_item_id = null,
         field_sources = '{"aprBps":"connected_account"}'
   where owner_id = a and plaid_account_id = 'acct-1';
  reset role;

  select * into acct from public.accounts where owner_id = a and plaid_account_id = 'acct-1';
  if acct.source <> 'connected_account' or acct.plaid_item_id is distinct from item then
    raise exception 'FAIL: user relabelled or re-pointed a connected account';
  end if;
  if acct.field_sources->>'aprBps' <> 'user_reported' then
    raise exception 'FAIL: user-entered APR not stamped user_reported: %', acct.field_sources;
  end if;
  if acct.field_sources->>'balanceCents' <> 'connected_account' then
    raise exception 'FAIL: untouched institution figure lost its source: %', acct.field_sources;
  end if;
  raise notice 'PASS: server writes keep their source; user edits are stamped as theirs';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Removing a connection removes the accounts that came from it.
-- ---------------------------------------------------------------------------
do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  n bigint;
begin
  set local role service_role;
  delete from public.plaid_items where owner_id = a;
  reset role;
  select count(*) into n from public.accounts where owner_id = a and source = 'connected_account';
  if n <> 0 then raise exception 'FAIL: % connected account(s) survived disconnection', n; end if;
  select count(*) into n from public.accounts where owner_id = a and source = 'user_reported';
  if n = 0 then raise exception 'FAIL: disconnection removed the user''s own accounts'; end if;
  raise notice 'PASS: disconnecting removes connected accounts and keeps the user''s own';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- META: the token test is not vacuous. Grant the column, and the same read
-- must now succeed — proving a broken grant would be caught.
-- ---------------------------------------------------------------------------
begin;
select test_seed_user('00000000-0000-0000-0000-00000000000a'::uuid);
grant select (access_token_ciphertext) on public.plaid_items to authenticated;
do $$
declare
  leaked text;
begin
  perform test_act_as('00000000-0000-0000-0000-00000000000a'::uuid);
  set local role authenticated;
  select access_token_ciphertext into leaked from public.plaid_items limit 1;
  reset role;
  if leaked is null then
    raise exception 'FAIL(meta): sabotaged grant did not expose the column; the test proves nothing';
  end if;
  raise notice 'PASS(meta): a broken grant would be caught by the token-secrecy check';
end $$;
rollback;
