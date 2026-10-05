# Who owns which chart

One account holds several charts. That has always been the plan and it is in
the launch plan as Phase 1, "Sign in and come back to your charts". This file
is the record of who owns what, so it stops living in Kaycee's head and in
chat transcripts.

## The rule

A chart belongs to the person it is of. The exception is a family, where one
adult holds the charts of people who do not have their own account.

## The families, from Kaycee, 2026-10-05

| Holder | Also owns |
|---|---|
| Paul Hollingshead | Jack, Annie and Izzie Hollingshead |
| Erlene Goodin | Joe, Parker and Russell Goodin |

Matt Hollingshead also has a chart. Kaycee did not name him in either family
group, so his is left alone rather than assumed into one.

## What is true in the database today, 2026-10-05

- 81 charts. 19 accounts own 21 of them; 60 have no owner.
- Everything owned came from the website form, which creates an account from
  the email somebody types and attaches that one chart to it.
- Every roster chart, including all of the Hollingshead and Goodin charts, has
  no owner, because none of those people has an account yet. The launch plan
  calls inviting them a deliberate act and it has not been taken.
- Kaycee's own chart was attached to her account on 2026-10-05 and set as her
  primary.

## What has to exist for the families to be true in the system

An owner is an `auth.users` row, so a chart cannot be attached to Paul until
Paul has an account. The sequence that makes this work without anybody
retyping birth details:

1. Each chart carries the email of the person who should hold it, in
   `charts.for_email`. For a family that is the adult's address, not the
   child's.
2. When an account is created or first signs in, any chart whose `for_email`
   matches that address and has no owner is attached to it.

Both steps exist as of 2026-10-05. The addresses are on the eight family
charts, and `lib/claim-charts.ts` attaches any ownerless chart carrying your
address the first time you open the portal. Only ownerless charts are ever
claimed: an address is a label, ownership is not.

| Holder | Address |
|---|---|
| Paul Hollingshead | jpholli@gmail.com |
| Erlene Goodin | allgoodinwh@gmail.com |

So the moment either of them signs in, their four charts are waiting.

## A chart stays with its owner

Kaycee, 2026-10-05: "charts always stay with their owners, but I would like
them to be able to share them with other people at some point."

So nothing ever moves a chart between accounts. When Izzie grows up and wants
her own, her chart does not leave Paul; she is given access to it. The
`visibility` column on `charts` already has a `shared` state waiting for
exactly this, put there in the September migration so these charts would not
need a backfill. What is still missing is the table of who shared what with
whom, and that is the next piece rather than a question.


## Who can make an admin

Asked by Kaycee, 2026-10-05: "how do we prevent someone from being created as
an admin?"

Membership is one row in `public.delphi_admins`, and today only
kayceejv@gmail.com is in it. Four things stand between a stranger and a second
row:

1. **No code writes to it.** Nothing in the app inserts, updates or deletes a
   row in that table, so there is no endpoint to trick into doing it.
2. **Row level security is on and there is not one policy.** A table with
   security on and no policy refuses every read and every write to anybody who
   is not the service role.
3. **No grants.** As of 2026-10-05 `anon` and `authenticated`, the only two
   roles a browser can ever speak as, have no privileges on that table at all.
   Before that they held INSERT, UPDATE, DELETE and TRUNCATE, left over from
   Supabase's defaults for the public schema, and only the policy check stood
   in the way. One migration with security briefly off, or a restore of a
   backup taken with it off, and the key that ships inside every browser could
   have added its holder. `analyst_clients` was in the same state and is now
   SELECT only, which is what its policy needs.
4. **The service key is the only way in**, and it lives in three places:
   Vercel's environment, the GitHub repository secrets, and `.env.local` on
   her Mac. Anybody holding it can make an admin, and that is unavoidable: it
   is the key that bypasses every rule by design. Guard it the way the keys
   doc says.

What is deliberately not solved: there is no audit trail of admin changes. For
a table with one row in it and no way to write to it from the outside, a log
would be ceremony. Worth revisiting the day a second person is added.
