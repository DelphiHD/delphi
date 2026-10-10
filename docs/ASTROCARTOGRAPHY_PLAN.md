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

## First look (2026-10-10)

Kaycee's calls, 10 October: all thirteen bodies with toggles for the first
look, and **parans are in**. Local space and relocation stay out for now.

- Step 1 is built: `lib/astrocartography.ts`, lines and parans. Checked on her
  chart against astronomy-engine's own horizon maths: every line point within
  0.0001 degrees, every paran crossing within 0.05 degrees with both bodies
  angular there.
- A standalone preview, `scripts/astrocartography-preview.ts`, writes one page
  to `~/Desktop/HD Reports/Astrocartography/`. Not wired into the chart.
- Coastlines: world-atlas@2.0.2 (Natural Earth, public domain), `land-110m`
  (55 KB) and `land-50m` (545 KB), both in the preview for her to choose.
  Kept locally in `.cache/world-atlas/`; not in the repo until she picks one.
- Parans are about 360 per map. The preview shows a focused planet's parans by
  default, all on request. Land crossing the 180 meridian (Fiji, Chukotka) is
  unwrapped and drawn on both edges, or it streaks across the map.

### Second pass, same day

Kaycee chose the **detailed coastline** (land-50m). Her changes:

- Four line styles: ASC solid, DSC dashed, IC dotted, MC dash-dot.
- Glyphs outside the frame where each line leaves it, as astro-seek does:
  MC and IC along the top, horizon curves on the side or bottom they exit by,
  spread so none overlap, with a short leader to the line. The map runs 80N to
  70S so most curves turn inside the frame instead of crowding the bottom.
- Lines and parans are switched by **separate rows**. Before, one chip did
  both, and turning a planet's parans off took its lines off the map too.
  Her words: she is "not sure yet how I want it to be different", so this is a
  first answer, not a settled one.
- Parans are solid translucent bands, 1 degree of latitude either side,
  personality in the brand purple and design in the bodygraph red. The 1
  degree orb is a placeholder for her to set.
- Cross-checked against astro-seek's map for her chart: Sun, Moon and Venus
  meridians agree to within a few tenths of a degree.

### Third pass, same day

- Paran orb: **1 degree confirmed** by Kaycee.
- Land is grey, so the purple paran bands read against it.
- Highlights are the chart's gold (`#c79a2e`, the mandala's lit-gate gold).
  Hovering a paran lights its crossing and both lines that make it.
- Hovers carry no name. A line reads "Personality Venus in Leo 11°07'" with an
  angle pill (ASC, DSC, MC, IC); positions come from the provider's astrology
  chart, the same numbers as the Astrology view. A paran names both bodies
  with their angle pills and the latitude. Never "rising" or "setting".
- Lines and parans each live in their own dropdown with round toggles. They
  are multi-select; true one-at-a-time radios are a small change if she wants
  them.
- The round toggles are multi-select, as on the charts' planet lists; Kaycee
  confirmed that is what she expects.
- An **Angles** menu (Ascendant, Descendant, Midheaven, IC), each shown in its
  own line style. It narrows lines and their edge glyphs; parans keep their
  own menu.
