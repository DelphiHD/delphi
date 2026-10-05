-- The handful of facts a list of charts needs to be readable.
--
-- Kaycee, 2026-10-05, on the portal: "Can we put all of the charts in a table
-- like they are in the Dashboard funnel? Let's make the column headers
-- profile, type, authority, definition, personality Sun."
--
-- None of those are stored. They come out of casting the chart, which is a
-- call to the provider, and a list of twenty charts is not a place to make
-- twenty calls. They are written here whenever a chart is published, so the
-- list is free to read and can never disagree with the chart it points at:
-- the same publish that draws the page writes the row.
--
-- Deliberately one jsonb rather than five columns. These are a summary for
-- display, not facts the system reasons with; the chart itself is always the
-- authority. A new field to show later should not be a migration.

alter table public.charts
  add column if not exists summary jsonb;

comment on column public.charts.summary is
  'Display summary written at publish time: profile, type, authority, definition, personality sun, cross. For listing charts without casting them. The chart is always the authority; this is a copy.';
