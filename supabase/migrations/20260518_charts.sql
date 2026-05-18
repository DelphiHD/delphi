-- Phase 4 charts cache.
--
-- One row per chart we've computed. Keyed on a fingerprint of the birth
-- tuple so re-running a report for the same person reuses cached chart data
-- and Data Pass instead of re-hitting mybodygraph + recomputing.
--
-- The Data Pass JSON is the canonical structural truth for the chart:
-- activations, centers (with strict defined/undefined/open status), channels
-- with type/circuit/centers, hanging gates by center, split islands and
-- bridging gates, exact return dates. Built once from chart + structured
-- chunk metadata in lib/chart/datapass.ts; consumed by every report tier.

create table public.charts (
  id              uuid primary key default gen_random_uuid(),

  -- Optional client tag for the chart. Reports can reference this directly
  -- when generating; it's also the human-readable handle in the admin UI.
  client_name     text,

  -- Birth tuple. These uniquely identify the chart.
  birth_date      date not null,            -- YYYY-MM-DD
  birth_time      text not null,            -- HH:MM, local-time of birth
  birth_timezone  text not null,            -- IANA, e.g. "America/Denver"
  birth_place     text,                     -- free-text city Kaycee typed in
  latitude        double precision,
  longitude       double precision,

  -- sha256 of (birth_date|birth_time|birth_timezone|lat|long). Lets us look
  -- up an existing chart without parsing the tuple every time.
  fingerprint     text not null,

  -- Raw mybodygraph response, cached so re-runs avoid the API call. JSON.
  mybodygraph_raw jsonb,

  -- The Data Pass document built from the chart + structured chunk metadata.
  -- Shape lives in lib/chart/datapass.ts (DataPass type). Reports consume
  -- this directly via renderDataPassMarkdown().
  data_pass       jsonb,

  -- If we've mirrored this chart's Data Pass into Kaycee's Notion Reference
  -- Files database, the page id is recorded here.
  notion_reference_page_id text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index charts_fingerprint_idx on public.charts (fingerprint);
create index        charts_client_idx      on public.charts (client_name) where client_name is not null;
create index        charts_birth_date_idx  on public.charts (birth_date);

alter table public.charts enable row level security;
-- Service-role only. Phase 4 doesn't need customer-facing access; the
-- invoke-llm Edge Function (which runs as service-role) reads + writes here.
-- Customer-facing access via auth.uid()-scoped policy lands in Phase 5 when
-- the portal needs it.

create trigger charts_touch_updated_at
  before update on public.charts
  for each row execute function public.touch_updated_at();
