-- Problem reports from the chart pages: the bug hunt, semi-automated.
--
-- Kaycee, 2026-10-11: "would it be possible to semi-automate the bug hunt?
-- ... a contact form that gives the option of reporting a bug ... it
-- automatically captures an image of what's on the stage, but also gives a
-- text box". Her decisions: reports go to the dashboard plus an email to her,
-- with columns for notes and resolution; the link is for everyone.
--
-- One row per report. context carries what the page knew at the moment:
-- chart type and view, transit date, device and screen, browser, site
-- version, and the page's own recent errors. The picture is a file in the
-- private charts bucket (reports/<id>.jpg), shown on the dashboard through a
-- short-lived signed link.
--
-- Read and written only by the server with the service key (the dashboard
-- checks admin first): row level security on, no policies, no grants to the
-- roles a browser speaks as.

create table if not exists public.problem_reports (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  token        text not null,
  person       text,
  what         text not null,
  context      jsonb not null default '{}'::jsonb,
  image_path   text,
  status       text not null default 'new'
                 check (status in ('new', 'looking', 'fixed', 'not-a-bug', 'duplicate')),
  notes        text,
  resolution   text,
  resolved_at  timestamptz,
  updated_at   timestamptz not null default now()
);

create index if not exists problem_reports_created on public.problem_reports (created_at desc);
create index if not exists problem_reports_status on public.problem_reports (status, created_at desc);

alter table public.problem_reports enable row level security;
revoke all on public.problem_reports from anon, authenticated;

comment on table public.problem_reports is
  'Problem reports from chart pages, with a picture and what the page knew. Service role only; shown on the dashboard''s Reports tab, where status, notes and resolution are kept.';
