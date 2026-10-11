-- Archiving a chart: out of the owner's list, link and everything else intact,
-- and undoable. Kaycee, 2026-10-11: "we need to add delete and archive options
-- to the client portal."
--
-- Deleting is not a column: a deleted chart is erased, row, link, file, its
-- earlier versions, its visit counts and its daily reads (app/api/portal/
-- delete). Her decision the same day: "really erased, if the chart owner wants
-- to delete it we have to give them that option, but there needs to be a
-- message letting them know it can't be reversed."

alter table public.charts
  add column if not exists archived_at timestamptz;

comment on column public.charts.archived_at is
  'When the owner archived this chart: hidden from their list, link still works. Null means in the list. Set and cleared by the owner in their portal.';

-- Row level security on public.charts is per row and already limits writes to
-- the owner, so the owner-only update policy from 20260909_charts.sql covers
-- this column without change.
