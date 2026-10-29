-- The operations log, in the cloud instead of only on Kaycee's Mac.
--
-- Kaycee, 2026-10-29: "If I told one of the companies that I do contract PM
-- work for in the year 2026 that their data was only available to be accessed
-- on my specific, local computer they would fire me." Phase 1 of
-- docs/DASHBOARD_SPEC.md: every log the Mac dashboard reads is also written
-- here, so the online dashboard can show it from anywhere.
--
-- One row per log line, exactly as the scripts already write it (data is the
-- whole line, nothing chosen out of it). kind says which log:
--   report_attempt  every report attempt, finished or not, with its cost
--   report_run      every finished report (cost, words, checks)
--   report_failure  every issue the report checks found
--   delivery        pickup to published chart, per client
--   chart_publish   every chart published, from the Mac or the website
--   job_run         a scheduled job's result
-- line_hash is the sha1 of the line, so writing the same line twice (the
-- script and the backfill both) keeps one row. The files on the Mac are kept.
--
-- Read and written only by the server with the service key (the dashboard
-- checks admin first): row level security on, no policies, no grants to the
-- roles a browser speaks as. Same as problem_reports.

create table if not exists public.ops_log (
  id           bigint generated always as identity primary key,
  kind         text not null
                 check (kind in ('report_attempt', 'report_run', 'report_failure',
                                 'delivery', 'chart_publish', 'job_run')),
  at           timestamptz not null,
  client_slug  text,
  line_hash    text not null unique,
  data         jsonb not null,
  recorded_at  timestamptz not null default now()
);

create index if not exists ops_log_kind_at on public.ops_log (kind, at desc);
create index if not exists ops_log_client on public.ops_log (client_slug, at desc);

alter table public.ops_log enable row level security;
revoke all on public.ops_log from anon, authenticated;
