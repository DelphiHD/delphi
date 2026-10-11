-- The journal: what a signed-in person keeps from their charts.
--
-- Kaycee, 2026-10-11. Saved places and the journal are one thing underneath,
-- something a person kept, tied to a chart, so they share this table; saved
-- places are its first use (kind 'place'), snapshots and notes come next.
--   - One journal per account, tagged by person, place, date and the
--     person's own tags, so they can slice it however they like.
--   - "Completely private": only the owner can read or write an entry. No
--     admin policy, nothing on the dashboard.
--   - Exportable to the journaling and editing tools people use (Day One,
--     Obsidian, Notion, Apple Notes): text is Markdown, tags are plain lists,
--     a picture is an ordinary image file in storage, and every entry carries
--     its date, people and place as plain fields, so an export is a format
--     conversion rather than a rebuild.
--
-- An entry outlives the chart it was made on (chart_token is not a foreign
-- key, and the person's name is kept on the entry), because it is the
-- person's own record. It goes with their account.

create table if not exists public.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('place', 'snapshot', 'note')),

  -- the chart it was made on, and whose chart that is, as named then
  chart_token text,
  person      text,
  -- more people it concerns, by name, as the person tags it
  people      text[] not null default '{}',

  -- {name, country, lat, lon} when the entry is about a place
  place       jsonb,
  -- everything needed to reopen the chart exactly as it was on screen
  view        jsonb,

  title       text,
  body        text,                       -- Markdown
  tags        text[] not null default '{}',
  -- the chart's own moment when that is not now (a transit date, say)
  chart_date  timestamptz,
  image_path  text,                       -- storage path of a picture, if any

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists journal_owner_created on public.journal_entries (owner_id, created_at desc);
create index if not exists journal_owner_token on public.journal_entries (owner_id, chart_token);

alter table public.journal_entries enable row level security;

create policy "a person reads their own journal"
  on public.journal_entries for select to authenticated using (auth.uid() = owner_id);
create policy "a person writes their own journal"
  on public.journal_entries for insert to authenticated with check (auth.uid() = owner_id);
create policy "a person edits their own journal"
  on public.journal_entries for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "a person removes from their own journal"
  on public.journal_entries for delete to authenticated using (auth.uid() = owner_id);

-- Nothing for a browser that is not signed in.
revoke all on public.journal_entries from anon;
grant select, insert, update, delete on public.journal_entries to authenticated;

comment on table public.journal_entries is
  'A signed-in person''s journal: saved places now, snapshots and notes next. Owner only, by policy; no admin policy on purpose (Kaycee, 2026-10-11: "completely private"). Markdown text and plain fields so it exports to journaling tools.';
