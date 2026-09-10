-- A chart outlives the account that made it.
--
-- public.charts.owner_id was created with `on delete cascade`, which meant that
-- removing an account silently deleted every chart attached to it: the rows, and
-- with them any way of serving the link. The same migration that created the
-- column says the opposite in its own comment, that a chart is revoked on
-- client_charts and never deleted, so that a link somebody was sent keeps
-- behaving predictably. The cascade quietly won that argument.
--
-- Seen for real on 2026-09-10: deleting one throwaway account took two charts
-- with it and left their client_charts rows orphaned, pointing at storage that
-- no longer had a chart behind it.
--
-- `set null` instead. Losing an account loses the ownership, not the chart. The
-- column is already nullable by design, because a chart can exist before its
-- owner does (a gift bought for somebody who has not signed up yet), so a chart
-- whose owner is gone lands in a state the schema already understands, and can
-- be attached to somebody later.

alter table public.charts
  drop constraint if exists charts_owner_id_fkey;

alter table public.charts
  add constraint charts_owner_id_fkey
  foreign key (owner_id) references auth.users (id)
  on delete set null;

-- chart_edits keeps its cascade on chart_id on purpose: the history of a chart
-- is meaningless without the chart, and charts are no longer deleted anyway.
