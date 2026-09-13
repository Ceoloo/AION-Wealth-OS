-- Minimal stand-in for the Supabase-managed pieces our migrations depend on, so
-- the schema + RLS can be exercised on a disposable local Postgres.
--
-- This APPROXIMATES Supabase (GoTrue + PostgREST), it is not identical: it
-- provides auth.users, auth.uid(), auth.role() and the three Supabase roles.
-- Tests that pass here are evidence the policies behave as written; they are
-- not a substitute for running against a real Supabase instance.
create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- PostgREST sets request.jwt.claim.* per request; mirror that contract.
create or replace function auth.uid() returns uuid
  language sql stable
  as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;

create or replace function auth.role() returns text
  language sql stable
  as $fn$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $fn$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public, auth to anon, authenticated, service_role;
