# BOOKING.md

How clients book and pay for sessions. Decided with Kaycee on 2026-08-25.

Scheduling runs on **Cal.com** (free plan: unlimited event types, unlimited calendar
connections, Stripe payments, single user). Payments run on **Stripe**, so session income
lands in the same account the rest of HD Reports will use rather than splitting across
processors. Before this, clients were paying by Venmo after the fact.

Cal.com is a booking front door onto Kaycee's existing **business Google Calendar**, not a
second calendar. Existing events block their slots automatically; every booking is written
back into that calendar with the client's intake answers on the event.

## Sessions

| Session | Length | Price | Visibility |
|---|---|---|---|
| Foundation Session | 2 hours | $200 | Public |
| Relationship Session | 2 hours | $300 | Public |
| Drop-In | 30 minutes | $50 | Private link, existing clients only |

Payment is taken at booking, not after. Location is **Google Meet**, created automatically
and included in both calendar events and the confirmation email. Kaycee is looking for a
downtown cowork space; an in-person option gets added per session type once she has one.

## Intake questions

The point of these is that chart data arrives *with* the booking, so there is no chase
afterward. Name and email are collected by Cal.com itself.

**Foundation Session**

1. Date of birth
2. Time of birth
3. Place of birth (city, state or province, country)
4. How exact is your birth time? (dropdown, below)
5. Anything you'd like me to know before we meet (optional, long text)

**Relationship Session**

Questions 1 to 4 twice, under the headings **You** and **The other person**, then:

- What kind of relationship is this? Partner or spouse / Parent and child / Siblings /
  Friends / Business partners / Other / Prefer not to say
- Anything you'd like me to know before we meet (optional, long text)

**Drop-In**

1. What would you like to look at? (optional, long text)

No birth data: these are existing clients whose charts Kaycee already has.

### The birth time question

Birth time exactness is not a nicety. A one or two minute correction can move the variables
and PHS layer, which threads through the whole report, so a guessed time is worse than a
known-approximate one. Asked as a single dropdown rather than "is it exact?" plus a
follow-up, because that captures the same information in one answer and avoids a question
that only sometimes appears.

> **How exact is your birth time?**
> - Exact, from a birth certificate or hospital record
> - Exact, from a parent or family member
> - Within about 5 minutes
> - Within about 15 minutes
> - Within about an hour
> - Only the general time of day
> - I don't know it

Helper text under it: *"If you are not sure, choose the closest option and book anyway. I
will reach out before we meet."* Kaycee's instinct was for the client to contact her when
they don't know; putting the outreach on her side means nobody guesses at a time and nobody
stalls before booking.

## Where the links go

Booking links belong on the Wix home page, at the bottom of every client chart page at
`charts.delphihd.com`, and anywhere Kaycee wants to paste them. The Drop-In link stays out
of all public placements.

## Open

Kaycee creates the Cal.com and Stripe accounts (account creation and bank details are hers
alone); everything after that is configured for her. Cal.com's free plan shows a small
Cal.com mark on the booking page, removable for $12/month, deferred until money is actually
moving through it. Stripe takes roughly 2.9% plus 30 cents per transaction.
