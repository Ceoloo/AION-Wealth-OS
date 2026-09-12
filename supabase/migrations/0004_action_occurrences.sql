-- =============================================================================
-- Action occurrences: separate "what the user did" from "is the issue resolved"
-- =============================================================================
-- A completion previously suppressed its rule forever, so a recurring problem
-- (a newly past-due account, a relapse into negative surplus) stayed hidden
-- behind stale history. Events now record WHICH occurrence of the rule they
-- refer to; the engine only lets a completion suppress that occurrence.
--
-- Existing rows are left NULL and are interpreted as the "default" occurrence,
-- so previously completed one-off tasks stay completed.
-- =============================================================================
alter table public.action_events
  add column if not exists occurrence_key text;

comment on column public.action_events.occurrence_key is
  'Fingerprint of the facts that triggered this occurrence of the rule. NULL = legacy row, treated as the "default" occurrence.';

create index if not exists idx_action_events_occurrence
  on public.action_events (owner_id, action_id, occurrence_key);
