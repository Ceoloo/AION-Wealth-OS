-- =============================================================================
-- AION Wealth OS — real-mode additions (v0.1)
-- =============================================================================
-- Adds the two pieces of per-user state that live outside the tables created in
-- 0001: whether the user acknowledged the starter-tools prompt, and their
-- per-partner status. Everything else already has a table in 0001.
-- =============================================================================

alter table public.profiles
  add column if not exists partners_acknowledged boolean not null default false;

create table if not exists public.partner_statuses (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  partner_id text not null,
  status     text not null default 'not_started'
               check (status in ('not_started','clicked','signed_up','already_use','skipped')),
  updated_at timestamptz not null default now(),
  unique (owner_id, partner_id)
);
create index if not exists idx_partner_statuses_owner on public.partner_statuses(owner_id);

alter table public.partner_statuses enable row level security;

create policy ps_select on public.partner_statuses for select using (auth.uid() = owner_id);
create policy ps_insert on public.partner_statuses for insert with check (auth.uid() = owner_id);
create policy ps_update on public.partner_statuses for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy ps_delete on public.partner_statuses for delete using (auth.uid() = owner_id);
