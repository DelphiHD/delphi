-- Kaycee's daily transit read, per client per day.
--
-- The read used to be baked into each chart at publish time, which meant a new
-- morning's words only reached a client when all 28 charts were rebuilt and
-- republished. Filing them here decouples the two: her laptop pushes each
-- morning's reads as it generates them, and every chart is current from that
-- moment on without being touched.
--
-- Keyed by client_slug rather than name, because a rename must not orphan
-- anyone's reads. The slug is the roster's stable key.
--
-- This is client-facing prose about a named person, so it is treated the same
-- as the charts themselves: RLS on, no policies, reachable only by the server
-- routes holding the service role. The /api/read route additionally requires a
-- live chart token for that same client before it will return anything.

create table if not exists public.transit_reads (
  client_slug  text        not null,
  date         date        not null,
  written_at   timestamptz,
  paragraph    text        not null,
  completions  jsonb       not null default '[]'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (client_slug, date)
);

create index if not exists transit_reads_slug_date_idx
  on public.transit_reads (client_slug, date desc);

alter table public.transit_reads enable row level security;

comment on table public.transit_reads is
  'Daily transit read per client, pushed from the morning report. Read only by /api/read, which requires a live chart token for the same client.';
