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

Step 2 does not exist yet. Without it, an email on a chart is only a label.

## The question this leaves

A child grows up. When Izzie wants her own account, does her chart move to her,
copy to her, or stay with Paul and become visible to both? That is Kaycee's
call and nothing here assumes an answer.
