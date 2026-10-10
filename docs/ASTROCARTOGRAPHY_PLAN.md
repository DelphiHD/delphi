# Astro-cartography: how it would be built (2026-10-10)

Not scheduled. Written down so the approach is not re-derived, the way the
requirements were on 5 October.

## What Kaycee asked for (5 October, unchanged)

It exists to compare the **personality and design maps**, each viewable on its
own and both together. Offered **only for known birth times**: an angular line
moves about 15 degrees of longitude per hour of birth time, so a rough or
unknown time would be fiction drawn confidently.

## Why the maths is ours

Lines mark where a planet was angular at the moment of birth.

- **MC and IC lines are meridians.** Vertical, at the longitude where the
  planet's right ascension equals local sidereal time.
- **Ascendant and Descendant lines are curves**, from right ascension and
  declination against latitude. For a high-declination body they genuinely do
  not exist above certain latitudes, and the drawing has to say so rather than
  close the curve.

The provider cannot help: its astrology endpoint returns ecliptic longitude
only. `astronomy-engine` gives right ascension and declination and is already
a dependency. Birth coordinates are geocoded and cached for every chart.

## Five pieces, in order

1. **A pure compute layer.** A UTC instant in, each body's four lines out as
   point arrays. No network, no rendering, testable against published values.
   The small part: around half a day.
2. **The map.** Equirectangular SVG with bundled coastline GeoJSON. No tiles
   and no map service, the same way nothing else here phones out. The real
   decision is coastline detail against file size, and that is worth showing
   Kaycee two options rather than choosing.
3. **Drawing.** The chart's own inks: personality solid, design in the lighter
   tone, each line tagged with its planet and angle. The existing planet
   toggles switch lines on and off for free.
4. **Interaction, built the way 8 October taught us.** Every line carries
   person, side, planet and angle ON THE ELEMENT, and one resolver answers
   "what is this?". `scripts/tooltip-sweep.js` is extended to cover the map
   BEFORE the module is called done. This discipline goes in first, not after:
   six separate faults in one day came from surfaces that knew which side a
   mark was and not whose.
5. **A fifth view** beside Bodygraph, Circuits, The Wheel and Astrology,
   available only when the birth time is exact.

## Honest sizing

Two to three days to something she would put in front of a client. The compute
is easy; the map, the projection and the interaction are the bulk.

## Four things that need Kaycee's call first

- Which bodies: the thirteen, or the traditional ten plus nodes and Chiron.
- Whether parans are in the first version.
- Whether local space lines belong here or are their own module.
- Whether clicking a location shows what the chart becomes there.
