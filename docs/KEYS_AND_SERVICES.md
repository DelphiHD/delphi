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
| `SUPABASE_PROJECT_REF` | yes | | | which project a migration goes to | the same |

## Known gaps, 2026-09-28

- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` exist by name on the site but hold
  nothing, and are absent on her Mac. The website therefore cannot send any
  email: not a chart, not a sign-in link, not a password reset. A key from
  resend.com fixes it in one step; the from address is the one already verified
  for chart mail on send.delphihd.com.
- `SUPABASE_ACCESS_TOKEN` is not set anywhere, so a migration has to be pasted
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
