-- Somewhere to keep the answer, so a rough birth time is only scanned once.
--
-- A chart whose owner only knows the part of the day gets its window cast
-- across: about forty calls to bodygraph.com and four seconds, to work out
-- which of that person's own fields depend on the hour. The answer never
-- changes unless their birth details do, but it was being worked out again
-- every single time the chart was built.
--
-- Kaycee approved storing it on 2026-09-12, asking first whether it applied to
-- every chart: it does not. A birth certificate time and a remembered time are
-- both run as exact and are never scanned, so this column stays null on them.
-- Only "I know roughly" and "I don't know it" ever carry a value.
--
-- The dashboard's birth time reliability indicator reads this too, which is the
-- other reason it belongs in the database rather than inside a built file.

alter table public.charts
  add column if not exists time_scan     jsonb,
  add column if not exists time_scan_at  timestamptz;

comment on column public.charts.time_scan is
  'The birth time window scan: which of this chart''s fields change across the window and what they could be. Null when the birth time is exact. Rebuilt when birth_fingerprint stops matching.';
comment on column public.charts.time_scan_at is
  'When the scan was run. For spotting a stale one, never for expiry: the sky on a past date does not change.';

-- The scan is only valid for the birth details it was run against. Storing
-- what it was run against, rather than trusting that nothing moved, means an
-- edit to a birth time cannot leave a confident answer behind that belongs to
-- the old one. Kaycee corrects birth details often enough that this matters.
alter table public.charts
  add column if not exists time_scan_for text;

comment on column public.charts.time_scan_for is
  'The birth details the scan was run against. When this stops matching the row, the scan is thrown away and run again.';

-- The dashboard asks "which charts have a shaky birth time" across everybody.
-- Without this that is a full scan of the table every time the page loads.
create index if not exists charts_time_accuracy_idx
  on public.charts (time_accuracy)
  where time_accuracy in ('approximate', 'unknown');
