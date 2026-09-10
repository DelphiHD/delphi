-- Somewhere to count from, so the free chart cannot be run in a loop.
--
-- /api/chart accepts a POST from anyone: no rate limit, no captcha, no check
-- that the request came from her site. Every call creates an account, writes
-- rows, calls the chart provider, publishes a two megabyte file and sends an
-- email. A script could run that all night, at her expense, and every one of
-- those emails would leave from her sending domain.
--
-- Kaycee chose the quiet limit over a captcha on 2026-09-10, so the free chart
-- keeps working with no visible step in front of it. Counting needs something
-- to count, and a chart already records the address it was made for; this adds
-- the only other thing worth counting by, the caller, hashed rather than stored.
--
-- Hashed, not raw: an IP address is personal data, and this only ever needs to
-- answer "is this the same caller as a minute ago", which a hash answers just
-- as well.

alter table public.charts
  add column if not exists request_ip_hash text;

comment on column public.charts.request_ip_hash is
  'SHA-256 of the caller''s IP with a server-side salt. For rate limiting only: never displayed, never joined to a person.';

-- The rate limit asks one question, many times: how many charts has this caller
-- or this address made in the last hour. Without these it is a full scan of the
-- table on every request, which gets slower exactly as the site gets busier.
create index if not exists charts_ip_recent_idx
  on public.charts (request_ip_hash, created_at desc);

create index if not exists charts_email_recent_idx
  on public.charts (for_email, created_at desc);
