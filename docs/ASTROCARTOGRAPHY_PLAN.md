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
- The Angles menu filters parans too: a paran shows when either of its two
  angles is selected. Earth's lines start switched off, and so do both Nodes' (Kaycee, 10 October).
- A paran shows when one of its bodies is picked in the Parans menu and BOTH
  bodies have their lines on. So Earth's parans follow Earth's lines, off by
  default, and a paran hover never lights a line that is hidden (Kaycee, 10
  October). The first version checked only the partner, and Parans set to All
  still showed Earth's; she caught it.
- A body's ASC and DSC curves now meet. They join at 90 - |dec|, where
  longitude races; half-degree sampling stopped short and left a visible gap
  (Kaycee, 10 October). The sampler closes in on each limit and ends exactly
  on it. That also found 42 parans the gap had hidden, all checked.
- Tooltips hold their size under a pinch-zoom: the page's visual viewport
  scale is undone on the tooltip alone, and it is kept inside what is on
  screen. Browser zoom (Cmd +) is not countered; it is meant to enlarge text.
- **The map zooms inside its frame**, never the page (Kaycee, 10 October:
  tooltips were unreadable under a page zoom). Pinch (ctrl-wheel in Chrome,
  gesture events in Safari), two-finger scroll or drag to pan, and + / - /
  Reset in the control bar. Lines, parans, the birthplace and the edge glyphs
  are drawn in the page from longitude and latitude for the current view, so
  the glyphs travel with the zoom and name whatever lines are in view. Land
  and graticule are one transformed group with non-scaling strokes.
- The page is a stage: controls fixed at the top, the map fitted to the rest
  of the window, so nothing scrolls away.

### Places (10 October)

Kaycee: "how can we make this super useful?" Click options proposed, in her
order: (1) click a place for what is there, (2) city search, then later (3)
saved places compared side by side, (4) click a line to pin it with her own
words for that planet on that angle (her copy, never authored by us), (5) the
relocated chart. All five are wanted eventually; 1 and 2 are built.

- **Country borders**, faint: world-atlas countries-50m, only arcs two
  countries share, so the coast is not drawn twice.
- **Cities**: Natural Earth ne_50m_populated_places_simple (1,251 places,
  public domain). Each appears at its own `min_zoom`, most important first,
  and a name that would overlap another is skipped.
- **What's here**: click anywhere (a press that does not move; a drag pans).
  A gold pin with 300 and 700 mile rings, and a panel listing lines within
  700 miles, nearest first, and parans within the 1 degree orb. It follows the
  menus, so what it lists is what the map shows. Hovering a row lights it.
- **Grades** (Kaycee: "use those metrics and maybe come up with some kind of
  grading system"). Proposed, hers to adjust: lines within 300 miles Strong,
  to 500 Moderate, to 700 Mild. Parans on the 1 degree orb: within a third
  Strong, two thirds Moderate, the whole degree Mild.
- Distances are great-circle miles: to a meridian by the cross-track formula,
  to a horizon curve by sampling its segments every 0.2 degrees. Checked: a
  point on a line reads 0.01 mi; Lisbon to Personality Mars MC reads 110 mi
  against 111 by hand.
- **Search**: names from the same 1,251 places, accent-insensitive, biggest
  first. Choosing one zooms there and opens its panel. Smaller towns are not
  in this set; a fuller list or a geocoder is the next step if she needs them.
- **Search uses the chart provider's place list** (Kaycee, 10 October: "use
  the location picker that comes with our API"; no third-party credit on the
  map). It returns names and time zones, not coordinates, so a chosen place is
  located the way a birthplace is, `locate()` in lib/astro.ts, cached. The
  key cannot sit in a page, so `scripts/astrocartography-serve.ts` serves the
  preview on localhost:8782 with /api/places and /api/place behind it, as the
  site does. Opened as a plain file, search falls back to the built-in
  Natural Earth cities. Those cities still draw the dots and name a click
  ("Near Salt Lake City"); the provider cannot reverse-geocode.
- When this moves into the chart, /api/places already exists on the site; it
  needs a sibling that returns coordinates for a chosen place.
- Grades confirmed by Kaycee as proposed (Strong, Moderate, Mild).
- **Pinned lines**: clicking a line or its edge glyph pins it gold; the panel
  shows a card per pinned line with the angle by name and her Delphi Basic
  for the planet, read from the synced library the same way the chart's
  planet hovers are. Angle text is just the name for now (her call); her own
  words per angle can go in when she writes them. Each line has a 12 px
  invisible twin carrying the same identity, so it can be hovered and clicked.
- **Saved places**: Save Place in the panel; saved places show as gold rings
  on the map and Compare Places opens a table, one column per place: counts
  of Strong, Moderate and Mild, then every line and paran that reaches any of
  them, best first. Kept in the browser for now; in the live chart they
  belong to the account.
