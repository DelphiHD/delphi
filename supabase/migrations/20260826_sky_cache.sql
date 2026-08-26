-- The sky at 12:00 UTC on a given date, cached.
--
-- A past or future moment in the sky is fixed, so a date is asked of the chart
-- provider once and reused forever after. This is what lets a client step to
-- any date on their chart without a round trip to the provider each time.
--
-- Not client data: no names, no charts, nothing personal. Just where the
-- planets were. RLS is on with no policies, same as client_charts, so the only
-- reader is the server route holding the service role.

create table if not exists public.sky_cache (
  date        date primary key,
  positions   jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.sky_cache enable row level security;

comment on table public.sky_cache is
  'Planetary positions at 12:00 UTC per date, cached for the transit overlay. Written and read only by the /api/sky route via the service role.';
