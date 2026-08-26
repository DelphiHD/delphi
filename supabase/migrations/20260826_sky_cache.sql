-- The sky at one instant, cached.
--
-- A past or future moment in the sky is fixed, so an instant is asked of the
-- chart provider once and reused forever after. This is what lets a client step
-- to any date and time on their chart without a round trip to the provider each
-- time.
--
-- Keyed on the UTC instant, not the calendar date: clients can set the time as
-- well as the day, and 3:45am and noon on the same date are different skies.
--
-- Not client data: no names, no charts, nothing personal. Just where the
-- planets were. RLS is on with no policies, same as client_charts, so the only
-- reader is the server route holding the service role.

create table if not exists public.sky_cache (
  at          timestamptz primary key,
  positions   jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.sky_cache enable row level security;

comment on table public.sky_cache is
  'Planetary positions at a UTC instant, cached for the transit overlay. Written and read only by the /api/sky route via the service role.';
