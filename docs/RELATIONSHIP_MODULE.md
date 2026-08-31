# The relationship module

What the chart provider gives us for a pair, confirmed against the live API on
2026-08-30 with Tennyson Taggart and Tiff Polamateer. Written down so the build
does not start by rediscovering it.

## The call

Same endpoint as a single chart, `/v221006/hd-data`, with the two people passed
as repeated parameters and `relationship=1`:

    date[]=<A date> <A time>   timezone[]=<A tz>
    date[]=<B date> <B time>   timezone[]=<B tz>
    relationship=1

## What comes back

Three blocks: `0` and `1` are each person's full chart, identical in shape to a
single-person response, and `Combined` is the connection itself.

`Combined` carries the joint centers directly, which is the composite bodygraph:
for Tennyson and Tiff, seven centers defined together against four and five
apart, with only Head and G left open.

`Combined.Properties` carries three things:

- **`Definition`** — the joint definition, computed across both charts. This pair
  reads Single Definition together.
- **`ConnectionTheme`** — named by the defined/undefined split, e.g. "7 - 2, Work
  To Do", and the only part of the response that arrives with prose already
  written.
- **`RelationshipChannels`** — every channel between the two, sorted into the four
  connection types, each with its name and its gate pair:

  | Type | Tennyson + Tiff |
  |---|---|
  | Companionship | none |
  | Dominance | Money 45-21, Struggle 28-38, Emoting 39-55 |
  | Compromise | Curiosity 56-11, Power 34-57, The Wavelength 48-16 |
  | Electromagnetic | Judgment 18-58, Transformation 54-32 |

## What it does not give us

**The channel `description` fields come back empty.** The provider tells us which
channels are electromagnetic, dominant, compromised or companionship, and nothing
about what any of that means. Kaycee's synced library has no relationship corpus
either: 853 chunks across 20 topic areas on 2026-08-30, none of them connection
theory, and the 22 hits for "electromagnetic" are all inside the variable pages.

So the split is clean, and it decides the build order:

- **The charts need nothing from Kaycee.** Pulling the pair, the composite
  bodygraph, the synastry wheel and the four channel lists are all derivable from
  the response above.
- **The report needs her source material first.** Writing what a dominance channel
  means to a couple without it would be the model inventing Human Design, which is
  the one thing that is never acceptable here. See `docs/MODEL_EDUCATION.md`.

Kaycee, 2026-08-30, on building the charts ahead of the writing: "I will
eventually build out a report for the relationship chart, but that shouldn't
prevent us from building out the module now so we can pull the charts."

## Decided, not yet built

Chart type and view are separate axes: the subject is natal, transit or
connection, and each carries the same views (bodygraph, mandala, circuits,
astrology). Circuitry is greyed out for transits, which have no circuitry of
their own. Kaycee's design, 2026-08-30.

Two ways in from the portal, with different consent models: a client authorising
another client to see their chart, and a client entering someone's birth details
to pull a connection chart. The second is view-only and stores nothing, pending a
pricing model for saving.
