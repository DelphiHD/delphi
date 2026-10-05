-- The chart a person considers their own.
--
-- Kaycee, 2026-10-05: an account holds several charts and the viewer moves
-- between them, "a parent might want to be able to easily toggle back and
-- forth between their kids charts without re-entering their birth info".
-- Something has to be first in that list, and that something is theirs.
--
-- It lives on the person, not on the chart, because "primary" is a fact about
-- whose list it is. A flag on each chart would need enforcing that exactly one
-- is set per owner, which is a constraint that goes wrong the first time a
-- chart is deleted or reassigned.
--
-- Who sets it: the person, in their own portal. Kaycee, 2026-10-05: "The
-- person's portal, I don't see why I would ever choose that for them."

alter table public.profiles
  add column if not exists primary_chart_id uuid
    references public.charts (id) on delete set null;

comment on column public.profiles.primary_chart_id is
  'The chart this person says is their own, shown first wherever their charts are listed. Set by them in their own portal, never on their behalf.';

-- The existing "users can update own profile" policy decides WHICH row a
-- person may write. It cannot police the VALUE, so without this a profile
-- could point at a chart belonging to somebody else. Reading it would still be
-- refused by the charts policies, but a list that silently names a stranger's
-- chart as yours is not a thing to leave possible.
create or replace function public.primary_chart_must_be_yours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.primary_chart_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.charts c
    where c.id = new.primary_chart_id and c.owner_id = new.id
  ) then
    raise exception 'a primary chart must belong to the person whose profile it is';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_primary_chart_is_theirs on public.profiles;
create trigger profiles_primary_chart_is_theirs
  before insert or update of primary_chart_id on public.profiles
  for each row execute function public.primary_chart_must_be_yours();
