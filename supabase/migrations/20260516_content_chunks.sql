-- Phase 3 content pipeline. Enables pgvector and creates the chunks table
-- that holds the HD source library mirrored from Notion. See docs/CONTEXT.md
-- for the full library architecture and kind taxonomy.

create extension if not exists vector with schema extensions;

create table public.chunks (
  id                  uuid primary key default gen_random_uuid(),

  -- Provenance: where this chunk came from.
  source_path         text not null,             -- e.g., content/gate/1.md
  source_kind         text not null,             -- gate | line | channel | center | type | authority | profile | variable | channel_type | definition | circuit | planet | cross | profile_line | geometry | quarter
  source_origin       text,                      -- "Ra" | "Kaycee synthesis" | "Kaycee original" (filled in over time, not always known)

  -- Notion identifiers so we can re-sync without duplicating.
  notion_database_id  text,
  notion_page_id      text,
  notion_block_id     text,                      -- for toggle-level chunks (Line Companion: one chunk per toggle)

  -- Display metadata.
  slug                text,
  title               text,
  body                text not null,
  tokens              int,

  -- HD-specific targeting metadata. Populated for kind in (gate, line) and any
  -- other kinds where gate/line filtering helps retrieval.
  gate_number         int,                       -- 1..64
  line_number         int,                       -- 0 for Main Hexagram toggle, 1..6 for the per-line toggles

  embedding           extensions.vector(1536),

  metadata            jsonb not null default '{}',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Idempotent upsert key. For row-based chunks (most databases) the
-- notion_block_id is null and source_path uniquely identifies the chunk.
-- For toggle-based chunks (Line Companion) source_path + notion_block_id
-- is the unique pair.
create unique index chunks_upsert_idx
  on public.chunks (source_path, coalesce(notion_block_id, ''));

create index chunks_kind_idx on public.chunks (source_kind);
create index chunks_gate_idx on public.chunks (gate_number) where gate_number is not null;
create index chunks_line_idx on public.chunks (line_number) where line_number is not null;

-- HNSW for cosine similarity. Master plan settings.
create index chunks_embedding_idx on public.chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- RLS: deny everything; service role bypasses RLS automatically. The Phase 4
-- invoke-llm Edge Function reads with the service role, so no authenticated-
-- user policy is needed. If/when we want client-side retrieval we'll add a
-- policy explicitly with an entitlements check.
alter table public.chunks enable row level security;

-- Auto-touch updated_at on update. Same pattern as profiles.
create trigger chunks_touch_updated_at
  before update on public.chunks
  for each row execute function public.touch_updated_at();

-- Retrieval RPC. Called by Phase 4's invoke-llm with the query embedding,
-- optional kind/gate/line filters, and a match_count capped at 12 by the
-- caller (per the master plan's retrieval discipline).
create or replace function public.nearest_chunks(
  query_embedding extensions.vector(1536),
  match_count     int default 8,
  kind_filter     text default null,
  gate_filter     int default null,
  line_filter     int default null
)
returns table (
  id            uuid,
  source_path   text,
  source_kind   text,
  source_origin text,
  slug          text,
  title         text,
  body          text,
  gate_number   int,
  line_number   int,
  similarity    float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.id,
    c.source_path,
    c.source_kind,
    c.source_origin,
    c.slug,
    c.title,
    c.body,
    c.gate_number,
    c.line_number,
    1 - (c.embedding <=> query_embedding)::float as similarity
  from public.chunks c
  where (kind_filter is null or c.source_kind = kind_filter)
    and (gate_filter is null or c.gate_number = gate_filter)
    and (line_filter is null or c.line_number = line_filter)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
