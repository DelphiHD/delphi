# Keys and services

Every credential this system needs, where it has to live, and what stops working
without it. Values never appear here. `npx tsx scripts/check-env.ts` prints the
same table from the live state and exits non-zero if anything is missing.

Kaycee, 2026-09-28: "Why are we not logging all of these keys and
functionality?" Because nobody had. Two gaps found the same day: the site's own
address was a vercel.app from 141 days earlier, so every sign-in link failed,
and the mail key the website needs held nothing, so no sign-in or reset email
could ever arrive.

## The three places

- **mac** — `~/delphi/.env.local`. What her scripts use: the chart builder, the
  dashboard, the sync, the report when run by hand.
- **site** — Vercel project environment variables. What the website uses:
  charts, the portal, the login, `/t/<date>`.
- **runner** — GitHub repository secrets. What the scheduled jobs use: the
  Notion sync and the daily transit report.

| Key | mac | site | runner | What it is | What breaks without it |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | yes | the database and storage | everything |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | yes | yes | server-side reads and writes | publishing, the funnel, the report |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | | yes | | signing in from a browser | the portal and the login page |
| `NEXT_PUBLIC_SITE_URL` | | yes | | where sign-in links come back to | links land on the wrong host and fail |
| `MYBODYGRAPH_API_KEY` | yes | yes | yes | the chart provider | every chart, the sky, the report |
| `ANTHROPIC_API_KEY` | yes | | yes | the writing | reports and the transit narrative |
| `NOTION_TOKEN` | yes | | yes | the library sync | her words stop reaching the database |
| `RESEND_API_KEY` | yes | yes | | sending mail | chart emails, sign-in and reset emails |
| `RESEND_FROM_EMAIL` | yes | yes | | who mail comes from | the same |
| `TRANSIT_LINK_KEY` | yes | yes | | the daily report's private link | `/t/<date>` answers 404 to everyone |
| `SUPABASE_ACCESS_TOKEN` | yes | | | applying migrations without the dashboard | a migration needs SQL pasted by hand |

`SUPABASE_ACCESS_TOKEN` is set in `~/delphi/.env.local` as of 2026-10-05. Scopes
granted: read and write on the database group, nothing else, which is all
`scripts/apply-migration.ts` needs (it posts to the management API's
`/v1/projects/<ref>/database/query`). Revoke or replace it at
supabase.com/dashboard/account/tokens.

It has gone missing once already: Kaycee made one on 2026-09-13 and it was not
there on 10-05, so she was sent back through the same permissions form to
unblock one migration. The 5 AM health check now names it among the required
keys, so its absence is reported the morning it happens rather than the next
time somebody needs a migration.
| `SUPABASE_PROJECT_REF` | yes | | | which project a migration goes to | the same |

## Known gaps, 2026-09-28

- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` exist by name on the site but hold
  nothing, and are absent on her Mac. The website therefore cannot send any
  email: not a chart, not a sign-in link, not a password reset. A key from
  resend.com fixes it in one step; the from address is the one already verified
  for chart mail on send.delphihd.com.
- ~~`SUPABASE_ACCESS_TOKEN` is not set anywhere, so a migration has to be pasted~~ Set 2026-10-05; see above. Old note:
  into the SQL editor by hand rather than applied by `scripts/apply-migration.ts`.
- `NEXT_PUBLIC_SUPABASE_URL` is absent from the runner; the workflows pass
  `SUPABASE_URL` instead and map it, which works but means the same value is
  stored under two names.

## Services behind the keys

- **Supabase** (`biufjcapnuzbdowoksnb`) — Postgres with row level security,
  storage for charts and the daily reports, and Auth. Auth's own email sender is
  rate limited to a handful an hour, which is why sign-in mail should move to
  Resend.
- **Vercel** — hosts charts.delphihd.com. `delphi-delphihd.vercel.app` is the
  old address and should not appear in any setting.
- **GitHub Actions** — the Notion sync (Mondays) and the daily transit report
  (6 AM Mountain, both UTC hours, the wrong one stops at the first step).
- **mybodygraph / bodygraphchart.com** — the chart provider, Business plan,
  unlimited charts.
- **Anthropic** — Haiku for transit narrative and syntheses, Sonnet for reports.
- **Resend** — mail from send.delphihd.com, replies to hello@delphihd.com.
- **Notion** — the source library, synced one way into `chunks`.
- **Cal.com** — booking, with Stripe attached.

## Her own accounts

- `kayceejv@gmail.com` is the only row in `public.delphi_admins`, which is what
  `/portal/admin` and the chart policies check.
- `hello@delphihd.com` is marked admin on its profile but is not in that table,
  by her decision on 2026-09-28: it stays the business inbox, not a login.

## Who can see what

Three levels, and the dashboard's Accounts tab is where they are read and
changed. Kaycee, 2026-10-05: "people will be making their own accounts from
the website so I likely wont be involved most of the time."

| Level | Sees | Granted by |
|---|---|---|
| An account | Only charts it owns | Made automatically when somebody gives an email on the website form |
| A client of an analyst | Nothing extra; the analyst sees their charts | Kaycee, on the Accounts tab |
| Admin | Everything, and can change permissions | Kaycee, on the Accounts tab |

Admin is one row in `public.delphi_admins`. The table has row level security
on, no policies, and no grants to `anon` or `authenticated`, so it can only be
written by something holding the service key. The dashboard does that on her
behalf after checking she is an admin herself.

**The last admin cannot be removed.** There is no other way back in: an empty
admin table would have to be repaired with a database client and the service
key. The endpoint counts first and refuses.

**A client link is always between the signed-in admin and one person.** The
endpoint never lets an admin hand one analyst another analyst's client, which
matters the day there is a second analyst.

What is deliberately absent: a log of permission changes. With one admin and
no way to write the table from outside, a log would be ceremony. Add one the
day a second admin exists.
