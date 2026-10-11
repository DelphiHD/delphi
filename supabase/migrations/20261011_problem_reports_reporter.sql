-- Who sent a problem report, when they were signed in. Kaycee, 2026-10-11:
-- "be sure we're capturing the info of the person who reports the bug,
-- assuming they are logged in we should already know, but I want it to be
-- logged on the dashboard." Read from the verified session, never from
-- anything the page says about itself.

alter table public.problem_reports
  add column if not exists reporter_id uuid references auth.users (id) on delete set null,
  add column if not exists reporter_email text;

comment on column public.problem_reports.reporter_email is
  'The signed-in account that sent the report, from the verified session. Null when nobody was signed in.';
