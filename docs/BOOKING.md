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

Every client chart at `charts.delphihd.com` carries a purple **Book a session** button at the
bottom of its control panel, linking to `cal.com/DelphiHumanDesign`. Anyone holding a chart
can rebook without going back through Kaycee. Republishing a chart picks it up; charts
already sent keep their token, so the link a client has is the one that gains the button.

Still to place: a booking link on the Wix home page. That needs the Wix editor, which needs
either Kaycee's hands or browser access to the profile she is logged into. Her header already
has a "Contact Us" button, so the smallest version is repointing that or adding one beside it.

The Drop-In link stays out of all public placements.

## Live as of 2026-08-25

Booking page: **cal.com/DelphiHumanDesign**. Drop-In is hidden and reachable only at
`cal.com/DelphiHumanDesign/drop-in`.

Stripe is connected and payment is taken **on booking** for all three sessions ($200 / $300
/ $50). Google Calendar (`hello@delphihd.com`) connected itself when Kaycee signed up with
Google, so bookings write into her business calendar and existing events block slots.
Verified from the public booking page as a client would see it: correct price, duration,
Google Meet location, and every intake question rendering.

Setup note for next time: the Stripe OAuth links minted from the API carry a short-lived
state token, so handing one to Kaycee and then talking for an hour guarantees a blank page
or an error. Send her to `app.cal.com/apps/stripe` and have her click Install instead; that
mints the link at click time. Cal.com calling the button "Install" reads as "install
software on my computer" and needs saying out loud that nothing downloads.

## Open

Cal.com's free plan shows a small Cal.com mark on the booking page, removable for $12/month,
deferred until money is actually moving through it. Stripe takes roughly 2.9% plus 30 cents
per transaction. Refund policy on all three event types is Cal.com's default of "never";
worth revisiting with Kaycee rather than leaving as an unexamined default. Booking links
still need placing on the Wix home page and on the client chart pages.
