-- Supabase grants table privileges to `authenticated`; RLS then narrows rows.
-- Applied after migrations so the local harness matches that baseline.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
