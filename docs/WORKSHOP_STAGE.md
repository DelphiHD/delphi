# The Workshop Stage

How the BFKI teaching tool was built, so the next event is a rebuild and not a
reinvention. Written 2026-09-28, from the tool that ran at The Big Fucking Kick
It, Lava Hot Springs, Idaho, 14 to 18 September 2026.

Kaycee, 2026-09-13: "I want the tool to be interactive, meaning anyone who signs
up for the event using the BFKI link will show up in the tool for the counts for
the defined/undefined/open centers, types and strategies... I would love the
living mandala we worked on to be one of the views."

## Running it for a new event

    npx tsx scripts/workshop-deck.ts --event <slug>     # everyone tagged <slug>
    npx tsx scripts/workshop-deck.ts --demo             # the sandbox charts, to try it
    npx tsx scripts/workshop-worksheet.ts --event <slug>   # the printable worksheet

It writes a folder to Desktop → Mandala Renderer Output → Educational →
`<SLUG> Workshop`, containing `Stage.html` (the tool), `Workshop.html` (the
deck), `Worksheet.html`, a `charts/` folder with one chart per person, and the
Living Mandala. The folder opens from the laptop with no network, which is how
it ran at the event: laptop to TV, offline.

Flags worth knowing:

- `--no-charts` reuses the chart files already in the folder, for a quick
  rebuild of the Stage alone.
- `--no-motion` skips rebuilding the Living Mandala, which does not depend on
  who is in the room.
- `--sky-date`, `--sky-time`, `--sky-tz` set the sky the Stage opens on. For
  BFKI: noon Mountain, because the event ran over several days and noon is
  honest about that.
- `--with "First Last"` adds somebody who is not signed up. Left empty for BFKI:
  "only people marked bfki should count".

## One-to-one sessions (2026-11-04)

    npx tsx scripts/workshop-deck.ts --session "Joel"              one client
    npx tsx scripts/workshop-deck.ts --session "Joel,Ann Smith"    a client and a partner

Kaycee asked for "a stage like we did for the BFKI event for individual
sessions", shared on Google Meet; "Slides are not the answer." Session mode
picks people by name from `charts`, whatever made their chart (an event, the
roster, the New chart tab), writes `<Name> Session` beside the workshop
folders, and makes the Stage only, no deck. On the Stage, no room counts or
percentages: Build a Chart opens straight on the person, the Centers panel says
Defined, Undefined or Open for them, and where a page counted people it shows
their name on what is theirs. Add `--sky-date`, `--sky-time`, `--sky-tz` for the
day of the session. To share it on a call, open `Stage.html` in the browser and
share that window; it needs no network.

For a demo, add Kaycee and sandbox charts after the client (2026-11-11, Joel):
`--session "Joel,Kaycee Vandenberg,Sandbox Manifestor Simple Split,Sandbox Projector Triple Split,Sandbox Reflector No Definition"`.
The client stays first, sandbox charts get short stand-in names (Cora, Dane,
Eli) instead of "Sandbox", the browser tab leaves them out, and with more than
one person the pages count like a room again. The folder is named for the
first person, the client.

The Six Lines card on Origins opens the house (`assets/brand/Six Lines - House.svg`,
2026-11-11), drawn from her line pages: line 1 the ground floor and foundation,
3 where the floors meet, 4 the foundation of the second floor, 5 at the
second-story window, 6 on the roof; the lower trigram personal, the upper
transpersonal.

## Who is in the room

Everyone whose chart carries the event's source tag, which happens when they
sign up through the event link (`/e/<slug>`). Someone who signs up more than
once is one person, matched on first name and birth date, counted by their
newest sign-up: Patrick signed up three times, correcting his birth time as he
went, and the room shows the last one. The same rule runs on the event stats
page at `/events/<slug>`.

Rebuild the folder whenever somebody new signs up. It takes a few minutes and
the Stage is only as current as its last build.

## The pages

In the order they were taught:

1. **The Room** — everyone's chart at a glance, counts by Type, Authority,
   Definition and Profile.
2. **Origins** — Ra's story as a timeline, with clickable figure names, the 64
   gates and the eight trigrams in a pop-up, and Ra's own chart from the Public
   Figure roster. Nicholas Sanduleak and Helena Blavatsky ride along as chart
   variation studies: their birth times are unknown, so the day is cast in
   stretches and shown as cards, which is where the Variations view on the live
   charts came from.
3. **Living Mandala** — the wheel with the planets moving over a day, week,
   month or year, with the placement table and pace.
4. **Build a Chart** — the wheel view, placement tables, design first, the
   animation built step by step, with pills at the top of each column and the
   headings DESIGN DATE and BIRTH DATE.
5. **Centers** — the nine, defined, undefined and open, with her Function text
   per gate and the not-self themes.
6. **Authority**, **Definition**, **Profile**, **Auras** — one page each, from
   her library, with the room's own numbers on them.
7. **Conditioning** — two people side by side, the pair's chart, what each
   defines in the other, and a score.

## The conditioning score

Her model, settled 2026-09-15. The bigger number sits on top, and the panel
reads "Conditions X via ...".

| B's definition | Undefined centre | Open centre | Bridge |
|---|---|---|---|
| Single | 6 | 4 | none |
| Triple Split | 6 | 4 | 2 |
| Simple, Wide, Quadruple Split | 2 | 1 | 6 |

Plus: anything connecting the Throat to that person's authority centre adds 5,
for every definition, including Single. No Definition is scored differently: 3
for each centre defined together that they do not define alone, 5 more if that
centre is the Throat, and open centres at 1.

Undefined weighs more than open throughout: a hanging gate in an undefined
centre is reaching for the gate that completes it.

## How the Stage drives a chart

The Stage opens a real chart in a frame rather than drawing its own. The chart
builder carries small switches that only wake when the page is opened from the
laptop, a `file:` page or localhost, so a published client chart never runs
them:

- `#stage-build` — the Wheel view, placement tables, the build animation with
  design first, side toggles, and the column pills.
- `#stage-cond` — listens for the Stage's `delphi-stage-pair` message and
  repaints the pair, adds the side panel and shows new centres in gold.
- `#stage-view` and `#origin-view` — first names only, birth details hidden, and
  Origins highlights driven by `delphi-stage-hl`.

These were committed on 2026-09-28. Before that they lived only on her Mac,
which is why the nightly repo pull failed for nine days.

## Files

- `scripts/workshop-deck.ts` — builds the folder, reads the room, writes the
  Stage and the deck.
- `scripts/workshop-stage.client.js` and `scripts/workshop-stage.css` — the
  Stage itself, read as plain files so nothing has to be escaped.
- `scripts/workshop-worksheet.ts` — the printable worksheet, using the chart
  builder's own bodygraph, blanked.
- `scripts/mandala-motion.ts` — the Living Mandala.
- `scripts/energy-flow-diagram.ts` — the chart builder, including the switches
  above.
- `scripts/event-qr.ts` — the sign-up QR card; `--light` for print on white.

## What the event taught us

- Build the folder the night before, then rebuild each morning. Stragglers sign
  up during the event; Arza signed up on day three.
- The Stage is only as current as its last build, and there is no way to tell
  from looking at it. Check the roster count against the funnel before starting.
- Unknown birth times are normal in a room. The variation cards were the most
  useful teaching object of the day, and they became the Variations view on the
  live charts.
- Keep the demo folder. `--demo` builds the same tool from the sandbox charts,
  which is how to try a change without touching a real room.
