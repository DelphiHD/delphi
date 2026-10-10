# Handoff: the chart's views (2026-10-10)

A new chat picking up this work starts here. Two days, 8 and 10 October, on
the Relationship, Variations and Transit views and on the astrology wheel.

## Where things stand

All 83 charts were republished on 10 October and carry everything below.
Production is deployed and current.

### The wheel is one allocator

A wheel carries one set, two or three. **The chart whose HOUSES are drawn is
innermost; everything read against it goes outward**, with a divider between
bands. One set per band, three rings to a band where there is room.

| | inner | middle | outer |
|---|---|---|---|
| Individual | personality | | design |
| Transit over one side | that side | | transit |
| Relationship | person 1 | | person 2 |
| Transit over the whole chart | personality | design | transit |

A crowded glyph takes the next free ring **in its own band**, measured in
glyph widths at that radius rather than in degrees, because the same gap is
wide out by the signs and narrow near the middle. **Angle is never nudged**:
radius is free, angle is the one thing the wheel asserts.

Every body's radius is worked out ONCE into a map that the glyphs and the
aspect chords both read. Chords reaching radii of their own is what left
stubs hanging beside their bodies ("ghost aspects", 10 October).

Aspect chords are drawn and held at nothing on every wheel. Clicking a body
shows the lines it makes and lights the bodies at the far ends. That freed
the middle, so the house numbers and chord circle moved inward and the bands
took the room. Each set is named in a corner in its own colour with its ring,
date, time and place.

### Identity, never position

**The single most important thing in this handoff.** Six faults on 8 October
were one fault: a surface that knew which SIDE a mark was and not which
PERSON, so it answered out of the wrong chart.

- Tag by person and side, never by the ring something sits in. Swapping
  perspective moves a person to a different ring.
- `planetTip` takes the person. Every call must pass it on. The original leak
  was inside planetTip itself, which dropped it one line later when asking for
  the gate, so every Gate pill was wrong at once and fixing callers never
  finished it.
- `scripts/tooltip-sweep.js` hovers every glyph, summary row, placement row
  and grid header, in both views and both perspectives, and compares each
  against the data it came from. **Run it after touching anything that
  describes a placement.** It found the real bug in one run. A clean sweep in
  one view is not a clean sweep: the design grid was wrong while the sweep
  passed, because the sweep only ran the personality view.

### Relationship

The individual pattern with another person in it. Personality is the
personality chart on its own horizon with both people on it; Design is the
design chart **on its own horizon**, because a design chart is a whole chart
with its own ascendant and houses; Synastry is both sides; the perspective
switch says whose horizon. Four wheels cover it, returned by /api/connection.

A connection can be cast against a chart the reader already has. **A saved
chart belongs to the viewer, never to the page**: a chart link is a public
address, so `other=` requires a session and ownership, an analyst link, or
admin. Same rule /api/my-charts answers by.

### Variations

Bodygraph only; the other views grey out. Selecting one puts it on the stage
and the header block switches to that variation's own Profile, Type,
Authority, Definition and Cross. Save this Variation opens its own window,
name prefilled `<Person> HH:MM` and editable, and the new chart opens there.

## How to work on this

- **Find the element before changing anything visual.** Three rounds were lost
  to changing things adjacent to a fault instead of identifying what drew the
  pixels. When she points at something, inspect it first.
- **Read the existing design constant.** The lit spoke's length was already
  defined in `spokeGrid` as `boundaryMarkOuter`; inventing a length twice cost
  an evening.
- **Measure, then look.** Overlap counts and radius comparisons catch what the
  eye misses; the eye catches what the numbers do not. Both.
- **Verify the deploy, not just the push.** A production build failed on a
  flaky font fetch on 8 October and the site served the old API for an hour
  while the chart page was new. Check by fetching the live site for a marker
  from the commit. **Do not use the Vercel CLI**: it is logged out on her
  machine and every invocation opens a browser login window.
- Publishing can serve the old file for a minute. Check the stored object
  before deciding a publish failed.

## What is outstanding

1. The relationship **hub** crowds: four sets of 13 glyphs on 13 rings. Either
   smaller glyphs there, or the hub follows the Personality/Design/Synastry
   choice the way the astrology view now does. The latter is better.
2. Deferred since 5 October: under Transit Only, The Wheel's gate ring shades
   the chart's own gates rather than the sky's. About an hour.
3. `scripts/astro-wheel.ts` is outside `scripts/copy-check.ts`, so words added
   to the wheel reach a client unreviewed. Adding it surfaces a backlog.
4. Whether wheel positions become dropdowns (see launch-plan `open`). If they
   do: position stays a rendering detail, the code keeps tagging by identity,
   and position 1 must be stated as the one that defines the houses.
5. **Working time**, specced 14 September in CHART_VARIATIONS_PLAN.md, never
   built.
6. Progressions, then astro-cartography (ASTROCARTOGRAPHY_PLAN.md).
