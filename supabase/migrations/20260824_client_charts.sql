-- Client chart links. One row per published chart: an unguessable token that
-- maps to a file in the private `charts` storage bucket. The link is served by
-- /c/<token>, which reads this table with the service role and streams the
-- file. Nothing here is readable by the anon key, and the bucket is private,
-- so the token in the URL is the only way in.
--
-- Links stay live until pulled (revoked_at set). Republishing a chart replaces
-- the stored file and keeps the same token, so a link already sent keeps
-- working and shows the newest build.

create table public.client_charts (
  id           uuid primary key default gen_random_uuid(),

  -- The URL segment. 32 hex chars = 128 bits of randomness.
  token        text not null unique,

  -- Who it belongs to, in the roster's terms.
  client_slug  text not null unique,
  client_name  text not null,

  -- Where the file lives in the `charts` bucket.
  storage_path text not null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Set to pull a link. The route treats a revoked row as not found.
  revoked_at   timestamptz
);

comment on table public.client_charts is
  'Published client chart links. Served by /c/<token> via the service role; no anon access.';

alter table public.client_charts enable row level security;

-- No policies on purpose: RLS with no policy denies every anon and authed
-- request. The only reader is the server route, which uses the service role
-- and bypasses RLS. When the portal proper arrives and a signed-in client
-- should see their own chart, add a policy in that migration.

create index client_charts_token_idx on public.client_charts (token);

-- Private bucket for the generated HTML.
insert into storage.buckets (id, name, public)
values ('charts', 'charts', false)
on conflict (id) do nothing;
