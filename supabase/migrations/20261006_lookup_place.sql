-- The place to ASK the provider about, when the real birth place is too small
-- for its gazetteer.
--
-- This existed only on scripts/client-roster.ts as lookupPlace, which was fine
-- while roster charts were built from that file. They are built from the
-- database now (DECISIONS.md, 2026-10-05), and on the first full republish
-- under that rule David Whiting failed: born in Salmon, Idaho, which the
-- provider has never heard of, with the override left behind in the file.
--
-- birth_place stays the truth about where somebody was born and is what their
-- chart prints. This is only ever used to resolve a timezone and cast. The
-- chart is identical either way, because only the instant matters; this exists
-- so a small town still appears on a client's own chart instead of being
-- quietly replaced by the nearest city the provider knows.

alter table public.charts
  add column if not exists lookup_place text;

comment on column public.charts.lookup_place is
  'The place to ask the chart provider about, when birth_place is a town its gazetteer does not carry. Null means ask about birth_place itself. Never shown to anybody: birth_place is what a chart prints.';

-- Row level security is already on public.charts and its policies are
-- per-row, so the owner-only policies from 20260909_charts.sql cover this
-- column without change.
