-- Charts as data, not as a roster written into a file.
--
-- Until now a chart existed because someone added a person to scripts/client-roster.ts
-- and ran a build on Kaycee's Mac. The portal needs a stranger to be able to make
-- one, so a chart becomes a row: who owns it, what it was cast from, and how
-- much the birth time can be trusted.
--
-- This does not replace client_charts. That table maps a token to a published
-- file and keeps working exactly as it does; this one is the record of the chart
-- itself. The two are joined by token. Kaycee's existing 37 are migrated in at
-- the foot of this file as seed rows owned by her, so nothing about them changes.

create table public.charts (
  id             uuid primary key default gen_random_uuid(),

  -- The account that owns this chart. Null while a chart exists before its
  -- owner does (a gift bought for someone who has not signed up yet).
  owner_id       uuid references auth.users (id) on delete cascade,

  -- Whose chart it is. Not necessarily the owner: a chart bought for a friend
  -- carries the friend's name and the buyer's owner_id.
  person_name    text not null,

  -- Where to send it, when the chart is for somebody other than the buyer.
  -- The owner's own address lives on their profile, never duplicated here.
  for_email      text,

  -- ── what the chart is cast from ──────────────────────────────────────────
  -- The person is asked for a place, once. The provider's own location lookup
  -- returns the canonical string and the timezone that belongs to it, and both
  -- are stored as returned. Nothing here is ever typed by hand: a timezone
  -- guessed from a place name is where wrong charts come from, and the provider
  -- resolves daylight saving, wartime shifts and zones that have moved, from
  -- the date and the location together.
  birth_date     date not null,
  birth_time     time,                    -- null when the time is unknown
  birth_place    text not null,           -- provider's canonical place string
  birth_timezone text not null,           -- provider's timezone for that place

  -- How much the birth time can be trusted. Kaycee's scale, 2026-09-09: a
  -- document is a different level of confidence from a good memory, and this
  -- decides how much weight the Ascendant, the houses and the four variables
  -- can carry. Asked once, never again.
  --   document    — birth certificate or hospital record
  --   told        — family memory, no document
  --   approximate — "sometime in the morning", rounded to the hour
  --   unknown     — no time at all
  time_accuracy  text not null default 'told'
                   check (time_accuracy in ('document', 'told', 'approximate', 'unknown')),

  -- ── what it is ───────────────────────────────────────────────────────────
  --   seed      — Kaycee's own roster, here before the portal existed
  --   free      — the one chart every account gets
  --   purchased — bought for themselves
  --   gift      — bought for someone else
  tier           text not null default 'free'
                   check (tier in ('seed', 'free', 'purchased', 'gift')),

  -- Who can see it. Private today, because that is the only honest default for
  -- somebody's birth data. The social version will add sharing as a new policy
  -- and a table of who shared what with whom; this column exists now so those
  -- charts already have a state to be in rather than needing a backfill.
  visibility     text not null default 'private'
                   check (visibility in ('private', 'shared', 'public')),

  -- Somebody will pick am instead of pm. Correcting it re-casts the chart from
  -- scratch and republishes to the same token, so a link already sent shows the
  -- corrected chart. Never patched: an hour's difference moves the Ascendant,
  -- the houses and all four variables, so a spot-fix would leave a chart that
  -- disagrees with itself.
  --
  -- If they have bought the synthesis, that report is now written about a chart
  -- that no longer exists. Kaycee's rule, 2026-09-09: they reverify their birth
  -- details and then contact her, rather than the rewrite being automatic. An
  -- automatic free rewrite is too easy to play with, and a real correction is
  -- worth a conversation. What she decides is recorded on chart_edits.

  -- The link. Same 32 hex characters as client_charts, and the same row.
  token          text not null unique
                   references public.client_charts (token) on delete cascade,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.charts is
  'One row per chart: who owns it, what it was cast from, how far the birth time can be trusted. Joined to client_charts by token.';
comment on column public.charts.birth_timezone is
  'As returned by the provider''s location lookup for birth_place. Never typed, never inferred from the place name.';
comment on column public.charts.time_accuracy is
  'document | told | approximate | unknown. Unknown or approximate means the Ascendant, houses and variables are not reliable and the chart should say so.';

alter table public.charts enable row level security;

-- Someone reads and writes their own charts, and nobody else's. The server
-- routes that build and publish use the service role and bypass this entirely;
-- these policies exist for the portal, where the browser talks to the database
-- as the signed-in person.
create policy "own charts are readable"
  on public.charts for select
  using (auth.uid() = owner_id);

create policy "own charts are insertable"
  on public.charts for insert
  with check (auth.uid() = owner_id);

create policy "own charts are updatable"
  on public.charts for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Deliberately no delete policy: a chart is revoked on client_charts, never
-- deleted, so a link that was sent to somebody keeps behaving predictably.

-- What changed, when, and who changed it. Without this, a report that reads
-- oddly is a mystery: you cannot tell whether the writing is wrong or whether
-- the birth data moved underneath it after the report was written.
create table public.chart_edits (
  id             uuid primary key default gen_random_uuid(),
  chart_id       uuid not null references public.charts (id) on delete cascade,
  edited_at      timestamptz not null default now(),
  edited_by      uuid references auth.users (id) on delete set null,

  -- birth_date | birth_time | birth_place | birth_timezone | time_accuracy | person_name
  field          text not null,
  old_value      text,
  new_value      text,

  -- Whether this edit caused the chart to be cast again, and whether it spent
  -- the one free report rewrite.
  recast         boolean not null default true,
  rewrote_report boolean not null default false
);

comment on table public.chart_edits is
  'Every correction to a chart''s birth details, so a report can always be traced to the chart it was written from.';

alter table public.chart_edits enable row level security;

create policy "own chart history is readable"
  on public.chart_edits for select
  using (exists (
    select 1 from public.charts c
    where c.id = chart_edits.chart_id and c.owner_id = auth.uid()
  ));

-- Written by the server when it re-casts, never by the browser: a history the
-- subject can edit is not a history.

create index chart_edits_chart_idx on public.chart_edits (chart_id, edited_at desc);

create index charts_owner_idx on public.charts (owner_id);
create index charts_token_idx on public.charts (token);
create index charts_tier_idx  on public.charts (tier);

-- Nothing in this project had one of these yet: client_charts carries an
-- updated_at that only ever changes because the writer remembers to set it.
-- One trigger, so the column cannot quietly go stale.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger charts_updated_at
  before update on public.charts
  for each row execute function public.set_updated_at();

-- Kaycee's existing 37 are brought in by scripts/seed-charts.ts rather than
-- here, because their real birth details live in the roster and this file has
-- no access to them. Inserting placeholders would put invented birth data in
-- the table that casts charts, which is worse than an empty table.
