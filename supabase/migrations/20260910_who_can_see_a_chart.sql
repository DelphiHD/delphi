-- Applied 2026-09-10, approved by Kaycee. Verified by signing two people in on
-- production: an admin saw all 37 charts, an ordinary chart account saw its own
-- one out of 38. Same page, same query, different answers.
--
-- Who can see a chart, when it is not their own.
--
-- Today public.charts has one column doing three jobs, which is why not one of
-- the 37 is attached to anybody: owner_id is being asked to mean "whose chart
-- this is", "Kaycee can see it because she runs Delphi", and "Kaycee can see it
-- because she works with this person". They are three different things and they
-- start at three different moments.
--
-- Kaycee, 2026-09-10, in her own words:
--
--   "as their human design analyst I want to also be able to view them in my
--    portal, for new subscribers, I want to be able to see the charts that are
--    created as a Delphi admin, but not necessarily as their analyst unless
--    they book a session"
--
--   "unless they book a session, at that point it really turns into an ongoing
--    coaching kind of situation and changes the relationship, but in general
--    most attendees will just be chart accounts"
--
-- So:
--
--   OWNER      whose chart it is. Mostly the person themselves. Families sit
--              under one adult: the Hollingsheads under Paul, the Goodins under
--              Erlene, which is just owner_id pointing at their account.
--
--   ADMIN      Kaycee, because she runs the business. Sees every chart the
--              business creates, including a stranger's free one. Operational,
--              not personal.
--
--   ANALYST    Kaycee, because she works with this person. Their charts sit in
--              her portal beside her other clients. Earned by a booking, never
--              by a signup.
--
-- An event fills the funnel and not the client list: an attendee's chart makes
-- her admin over it and nothing more, until they book.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Who runs Delphi
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.delphi_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  added_at   timestamptz not null default now(),
  note       text
);

alter table public.delphi_admins enable row level security;

-- Deliberately no policy for reading or writing this table from the outside.
-- Membership is changed in the dashboard by someone with the service key, never
-- by a request from a browser. A table anyone could add themselves to would be
-- a table that grants itself away.

-- Asked on every policy below, so it has to be cheap and it must not be subject
-- to the policies it is helping to decide. security definer runs it as the
-- table's owner, which is what stops it recursing into its own row level
-- security and deadlocking the check.
create or replace function public.is_delphi_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.delphi_admins a where a.user_id = auth.uid());
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Who she actually works with
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.analyst_clients (
  analyst_id   uuid not null references auth.users (id) on delete cascade,
  client_id    uuid not null references auth.users (id) on delete cascade,
  -- what began the relationship, so it can be explained later: 'booking',
  -- 'seed' for the 37 she already works with, 'manual' when she says so.
  began_with   text not null default 'booking'
                 check (began_with in ('booking', 'seed', 'manual')),
  began_at     timestamptz not null default now(),
  -- A relationship can end. Ending it should not delete the history of it.
  ended_at     timestamptz,
  note         text,
  primary key (analyst_id, client_id)
);

alter table public.analyst_clients enable row level security;

-- A person may see who their analyst is. Nobody may see an analyst's client
-- list except that analyst, because the list is itself private information.
create policy "an analyst sees their own client list"
  on public.analyst_clients for select
  using (auth.uid() = analyst_id or auth.uid() = client_id);

create or replace function public.is_analyst_for(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select owner is not null and exists (
    select 1 from public.analyst_clients ac
    where ac.analyst_id = auth.uid()
      and ac.client_id = owner
      and ac.ended_at is null
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. What that means for a chart
-- ─────────────────────────────────────────────────────────────────────────────

-- The existing policy stays exactly as it is: your own charts are yours. These
-- are added beside it. Postgres ORs policies together, so each one can be read
-- on its own and none of them can accidentally narrow another.

create policy "delphi admins can read every chart"
  on public.charts for select
  using (public.is_delphi_admin());

create policy "an analyst can read their client's charts"
  on public.charts for select
  using (public.is_analyst_for(owner_id));

-- Reading only. Neither role may change somebody's birth details from a
-- browser: a correction goes through the chart's own edit path, which records
-- what changed and what it cost, and that is worth keeping as the only door.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Turning the 37 into something
-- ─────────────────────────────────────────────────────────────────────────────
--
-- NOT DONE HERE, on purpose. Attaching a chart to a person means creating an
-- account for them, and creating an account for somebody is a thing they should
-- hear about from Kaycee before it happens rather than discover afterwards.
--
-- Once she is in delphi_admins, all 37 appear in her portal immediately through
-- the admin policy above, with no account created for anyone. Inviting them is
-- then a separate, deliberate act, one person at a time or in one go, and the
-- family groupings (Hollingsheads under Paul, Goodins under Erlene) are decided
-- at that moment rather than baked in now.
