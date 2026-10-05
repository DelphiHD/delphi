-- Nobody can make themselves an admin from a browser.
--
-- Kaycee, 2026-10-05: "how do we prevent someone from being created as an
-- admin?" The honest answer on that day was "row level security, and nothing
-- else", which is one switch away from being no answer at all.
--
-- What was already true: public.delphi_admins has row level security on and
-- not one policy, and a table with security on and no policy denies every
-- read and every write to anyone who is not the service role. Nothing in the
-- codebase inserts into it either, so there is no endpoint to trick.
--
-- What was not true: the table still carried the default grants Supabase hands
-- the public schema, so anon and authenticated held INSERT, UPDATE, DELETE and
-- TRUNCATE on it. Only the policy check stood in the way. Turn row level
-- security off for a moment during some future migration, or restore a backup
-- with it off, and the anon key, which ships inside every browser that loads
-- the site, could add its holder to this table.
--
-- Two locks are better than one, and the second costs nothing: the roles a
-- browser can ever speak as have no business touching this table at all.

revoke all on public.delphi_admins from anon, authenticated;

-- Same reasoning for the table that says who an analyst works with. Writing
-- yourself a row there would hand you every one of that analyst's clients.
revoke all on public.analyst_clients from anon, authenticated;

-- The read side of analyst_clients is a real feature, so it is given back
-- narrowly: the existing policy already limits a person to their own rows and
-- an analyst to their own list. Without SELECT the policy has nothing to
-- permit.
grant select on public.analyst_clients to authenticated;

comment on table public.delphi_admins is
  'Who runs Delphi. No policies and no grants to anon or authenticated: membership is only ever changed by something holding the service key. Checked by is_delphi_admin().';
