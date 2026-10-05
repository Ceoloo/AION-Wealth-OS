-- ---------------------------------------------------------------------------
-- 0005 — self-reported starting situation on profiles
--
-- A nullable, constrained enum-as-text column. Nullable on purpose: existing
-- profiles predate the question and must not be assigned a situation they never
-- gave. `null` means "not asked / not answered", never a default of "stable".
--
-- This value is a SELF-REPORT. Nothing in the plan engine treats it as evidence
-- of a financial fact; it only supplies a provisional stage while the user's
-- own figures are still missing (see src/lib/domain/journey.ts).
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists situation text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_situation_check'
  ) then
    alter table public.profiles
      add constraint profiles_situation_check
      check (
        situation is null
        or situation in (
          'behind_on_bills',
          'just_covering',
          'small_cushion',
          'stable_building',
          'unsure'
        )
      );
  end if;
end $$;
