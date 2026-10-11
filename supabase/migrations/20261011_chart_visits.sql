-- Who opens a chart link on what, and which views they use.
--
-- Kaycee, 2026-10-11: "I think the majority of them do [use a phone] to be
-- honest... Everyone is on their phone now." Nothing had ever recorded a chart
-- being opened, so the mobile work had nothing to steer by. She approved
-- recording opens and views, with her own opens left out of the counts.
--
-- One row per chart link opened (kind 'open', written by the server that
-- serves the link) and one per view chosen on the page (kind 'view', sent by
-- the page itself, what = "Transit · The World"). Device is phone, tablet or
-- computer, never the user agent itself. No cookies, no IP address, nothing
-- about the person beyond which chart link was opened.
--
-- own: an admin was signed in on that browser. Kept rather than dropped, so the
-- dashboard can leave them out and still say how many it left out.

create table if not exists public.chart_visits (
  id bigint generated always as identity primary key,
  token text not null,
  at timestamptz not null default now(),
  kind text not null check (kind in ('open', 'view')),
  what text,
  device text not null check (device in ('phone', 'tablet', 'computer')),
  own boolean not null default false
);

create index if not exists chart_visits_at on public.chart_visits (at desc);
create index if not exists chart_visits_token on public.chart_visits (token, at desc);

-- Written and read only by the server with the service key: row level
-- security on with no policies, and no grants to the roles a browser speaks
-- as (the same two locks as 20261005_admins_locked.sql).
alter table public.chart_visits enable row level security;
revoke all on public.chart_visits from anon, authenticated;

comment on table public.chart_visits is
  'Chart link opens and views chosen, with device class only. Service role only. Read by the admin dashboard''s Visits tab.';
