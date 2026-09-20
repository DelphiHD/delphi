-- A birth time validated against the astrology databases.
--
-- Kaycee, 2026-09-20: "Add Astrology Databases as a birth time validation
-- option, but only on the backend for public figures, not on the client
-- widget." Public figures' times come from the Rodden-style databases rather
-- than from the person, and that is a real source, not a guess: charts carrying
-- it read as settled, the same as a birth certificate.
--
-- The public form's endpoint does not accept this value, so nobody can choose
-- it for themselves; it is set from the scripts Kaycee runs.

alter table public.charts
  drop constraint if exists charts_time_accuracy_check;

alter table public.charts
  add constraint charts_time_accuracy_check
  check (time_accuracy in ('document', 'told', 'astrodb', 'approximate', 'unknown'));
