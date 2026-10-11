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

### Relocated chart (10 October)

- `getAstro` takes an optional `coords`: the same instant cast for another
  place. Additive; every existing caller is unchanged. The provider computes
  the angles and houses; nothing is derived here except Earth's house, which
  is the Sun's opposite point placed in the provider's own cusps, as on the
  natal chart.
- The panel's Relocated Chart section, for each side in view: the Ascendant
  and Midheaven there against the natal ones, and every planet whose house
  changes, natal to relocated, flagged Angular when it lands in the 1st, 4th,
  7th or 10th. View Wheel opens the relocated wheel drawn by renderWheel, the
  Astrology view's own drawing: personality houses, design outer.
- Cross-checked against the map at Lisbon: Personality Sun MC 112 mi and Sun
  12th to 10th; Personality Neptune IC 239 mi and Neptune to the 4th; Design
  Moon DSC 154 mi and Design Moon to the 7th. The provider and our lines agree.
- Served by /api/relocate on the local server; when this goes live it becomes
  a route beside /api/transit-wheel, which already casts wheels the same way.
- Not yet: hovers inside the relocated wheel, and a wheel on the design
  chart's own relocated horizon (the Relationship view's pattern).
- Kaycee's changes, same day: the Relocated Chart section is a toggle that
  starts closed (cast only when opened), with View Chart at its top. The
  chart window has three wheels: Personality and Design, each on its OWN
  relocated horizon, and Both on the personality's, as the Astrology view
  draws a natal chart. renderWheel draws no corner legend for a one-sided
  wheel and is shared with the live charts, so it is left alone and the
  window names the side, the UTC instant and the place above the wheel.
- Compare Places carries the relocated chart: each side's Ascendant and
  Midheaven per place against natal, then every planet's house per place,
  changed houses bold, angular flagged. Check: Ogden's column equals the
  natal chart exactly, ascendant and all 26 houses.
- **Hovers on the relocated wheels**, read from each glyph's own tags (body
  and side), never its ring: side, body, sign and degree, the Astrology
  view's modality and element pills, the house it lands in there, its gate,
  Angular when it is, and her Delphi Basic. Angles read the wheel's own side.
  Checked at Lisbon: Personality Sun 10th, Gate 12.4; Design Moon 7th, Gate 2.5.
- **Save Chart Image** in the chart window and **Save Map Image** in the map
  controls, by the live chart's method: the drawing as it stands, computed
  styles baked in, Montserrat carried inside, twice the size, a footer naming
  the person, what is shown and the brand marks, handed over as a file.

### Find My Places (10 October)

Kaycee's framing: the person chooses which planets they want close. "I'm
trying to resist telling them that certain planets are always good or always
bad and want them to be able to explore on their own intuitively." So no
planet is marked good or bad anywhere; the person picks.

- Each chosen planet scores its grade at a place (Strong 3, Moderate 2, Mild 1)
  for each side in view, through the angles the Angles menu allows. Shaded as
  a gold wash on a 2 degree grid under the lines, and the cities ranked
  exactly (great-circle distance to each line), ties broken by total distance.
- Natural Earth's 40 research stations are left out of the ranking: places on
  the map, not places to live.
- Known bias: near the poles every line converges, so high latitudes score
  well for any choice. Real geometry, not a bug; worth her view on whether
  the ranking should temper it.
- Next features move to the live charts (her decision, 10 October): transits
  on the map, relationship map, place report, local space. They have to work
  within the existing chart code.
- The HD twist was shown to her as an example, not built: the gates on a
  place's relocated angles (Lisbon: Personality ASC Gate 6.3, MC Gate 12.2;
  Design ASC Gate 1.1, MC Gate 4.4; natal Ogden ASC Gate 15.5), from
  lib/hd/gate-longitude. Whether it means anything is her call.
- **The far north, measured.** Find My Places run headless over 12 charts
  with documented birth times, every pair of the ten planets, both sides:
  56% of top-ten matches lay beyond 60 degrees latitude against 5% of
  cities (per chart 40% to 76%). Systematic, not her chart. So the person
  sets a Latitude Limit (45, 60, Polar Circles, No Limit), starting at 60;
  the shading and the ranking both stop at it.
- **Gates on the relocated angles** (Kaycee: "yes, I really like this").
  All four angles per side, each with its gate and line from
  lib/hd/gate-longitude, the natal angle and its gate beneath, and "Your
  gate" naming any of this chart's own activations in that gate. In the
  panel, in Compare Places, and on the relocated wheel's angle hovers.
  Lisbon: Personality MC Gate 12.2, the gate of her Personality Sun 12.4.
- Kaycee found the gate pills messy (10 October). The relocated section is now
  two plain tables: angles (Here, Gate, Natal, Gate) per side, and planets
  changing house (Natal, Here). A gate the chart carries is gold with a dot,
  explained once in an "In Your Chart" box (gate, angle, whose); an angular
  house is gold with a dot. No pills. Compare Places follows the same rule.
- **Chiron and Lilith** have their own switches at the foot of the Lines menu,
  off to start, as the live charts open without them. They have no map lines
  (our ephemeris has no right ascension for them); they control the relocated
  wheels, the house table and the gate matches.
- **Chiron and Lilith lines** (Kaycee, 10 October). Chiron from NASA JPL
  Horizons, Lilith from the provider's longitude on the mean lunar orbit; see
  DECISIONS.md for why and the checks. Their switches now draw lines, glyphs
  and parans too, and add them to Find My Places.

## Going live: the plan for Kaycee's decision (10 October)

Mapped from the live builder (`scripts/energy-flow-diagram.ts`), the serving
route (`app/c/[token]/route.ts`) and `republish-all.ts`. Nothing below is built
yet; each structural item waits for her call.

**What changes, and where**

1. **A fifth view in the chart's view dock**, beside Bodygraph, Circuits, The
   Wheel and Astrology. Touches the dock markup, `applyView`, the view CSS
   opt-outs, Save Image and Copy Chart Data in the builder. Offered only when
   the birth time is exact (`DATA.client.time.exact`, which today counts
   "document" and "told").
2. **Map geometry as one shared file, not baked into each chart.** Charts are
   already 3.0 to 3.2 MB and are streamed through a Vercel function, whose
   response limit is about 4.5 MB. Coastline, borders and cities (~1.3 MB raw,
   far less compressed) would go in `public/` and be fetched once, cached, when
   the view first opens. The chart's own lines and parans (~150 KB) are baked
   at build time like everything else on the page.
3. **Chiron from NASA Horizons at build time.** Serverless functions cannot keep
   a disk cache, so the chart build asks Horizons once per publish (two calls:
   birth and design). Optionally stored on the chart row so a republish does
   not ask again.
4. **Two new API routes**, token-authenticated like `/api/transit-wheel`:
   `/api/place` (coordinates for a place chosen from `/api/places`) and
   `/api/relocate` (the relocated chart and its wheels).
5. **Saved places**: per browser first (as in the preview), per account later
   with the client portal. Per account needs a table and RLS migration.
6. **Client copy**: every new sentence goes through `copy-check` and her
   approval; the new module is added to its sources.
7. **Checks before done**: `tooltip-sweep.js` extended to the map, run in both
   sides; Save Image of the map; a test publish of her chart and the sandbox
   charts on the branch preview.
8. **Rollout**: existing links get the view only on a republish of all charts,
   which needs her explicit say-so.

**Known conflicts to settle**

- `docs/ARCHITECTURE.md` says "13 traditional bodies only, never
  Chiron/Lilith"; the live charts already offer Chiron and Lilith, off by
  default, and she asked for the same here. The doc is out of date (it
  predates energy-flow-diagram.ts) and needs refreshing.
- Whether a "told" birth time counts as exact enough for the map.

**Kaycee's decisions, 10 October:** the plan is approved, including the shared
world-map file and NASA Horizons in the chart build. A "told" birth time is
exact enough for the map. The view is called **The World**. The Chiron/Lilith
line in ARCHITECTURE.md belonged to the deprecated reports; the whole doc needs
a total revision and is not a constraint on this work.

## Live (11 October)

The World is merged to main and deployed (main at 7f3fd20 or later). Live:
`public/world/world-v1.json`, `/api/place`, `/api/relocate`, and the builder
draws The World into every exact-time chart it publishes. Kaycee approved
the client wording (docs/CLIENT_COPY.json).

Tested end to end on the live site with the sandbox chart "Sandbox Projector
Triple Split" (Bogota), published twice with her OK: map, lines, parans,
click, search (provider list), relocated chart and its three wheels. Every
mark resolves to the right side, body and angle.

Layout she settled, 11 October: the chart's left panel owns Personality,
Design, Save Image and Reset; The World keeps its own Lines and Angles (so
Earth and the Nodes start off here without turning off in other views), and
Parans. Toolbar: first row search, Find My Places (and Compare Places), zoom on
the right; second row Lines, Angles, Parans. Find My Places opens on the right.

**Not yet done**

- **Republished 11 October with Kaycee's say-so: all 83 charts.** 81 on the
  first pass; Joe Goodin and Sandbox Generator Single stopped (correctly, by
  the no-missing-sections rule) on a Horizons request bug at :59, fixed and
  published. Exact-time charts carry The World; charts without an exact time
  (e.g. Christa Pike) carry no button.
- **Publish from code that has The World.** Any chart published from a checkout
  older than this (for instance ~/delphi-fix on chart-variations at 29e97ea)
  goes out without it. Bring that checkout up to main first.
- The Vercel preview environment has no MYBODYGRAPH_API_KEY, so search and the
  relocated chart cannot be tested on preview builds; Kaycee is adding it.
- tooltip-sweep.js does not cover The World yet; the checks so far were run by
  hand in the console (every mark resolves via root.world.describe).
- Safari's pinch path is untested.
- The person's name sits over The World as over every other view (25 px,
  600, the chart's ink, centred on the stage), so several open charts can be
  told apart. Kaycee, 11 October.
- **Transit and Relationship are not wired into The World yet.** Until they
  are, The World is greyed out under those chart types (switching to one from
  The World lands on Bodygraph), so no reader takes the natal map for a transit
  or a pair. Recommended to Kaycee: republish all charts with The World now,
  wire Transit and Relationship next, then republish again.
- **Reports** (Kaycee, 11 October, before the republish): Save As PDF in Find
  My Places and in Compare Places opens a branded page (logo, name, birth and
  design dates, the settings, the map as it stands, the results table) and the
  browser's print, where Save as PDF is built in. No PDF library is shipped in
  the charts.

## Transit in The World: decided 11 October, not built yet

Kaycee's answers, to start after the 11 October republish finishes:

1. **Transits to the chart (Cyclo*Carto*Graphy) first**, then a **place
   timeline**. CCG: for a chosen date, where on Earth each transiting body sits
   on the person's natal angles, i.e. lines drawn from the transiting bodies'
   right ascension and declination against the natal moment's sidereal time.
   They move only as fast as the transiting body. Drawn in the transit teal,
   using the Transit chart type's existing date picker. The timeline: for a
   saved or clicked place, upcoming transits to that place's relocated angles
   over the next year, with dates (crossingsIn in lib/hd/ephemeris finds the
   moments).
2. **Personality and design** each measured against their own chart, following
   the panel's Personality and Design switches, as elsewhere.
3. **Bodies:** all transiting bodies, Moon off by default.
4. **Timeline orbs:** her transit orbs, 1 degree, Sun and Moon 3.

Left out on purpose: lines for the sky of a single moment, which sweep the
whole world daily and only mean something for event charts.
- **Built (11 October), not yet live:** under the Transit chart type The World
  draws teal transit lines (personality-based teal, design-based lighter teal)
  following the date picker and Transit Only / Over the whole chart /
  personality / design; Transit Only hides the natal lines and parans. The
  transit Moon has its own switch, off. Hovers name the transiting body, its
  sign and degree from the provider, and the natal angle. The place panel has
  Upcoming Transits: a year from the picker's moment, her orbs, both sides, with
  within-orb dates and exact dates. Routes: /api/world-sky, /api/world-timeline
  (lib/world-transit.ts). Checked: transit Jupiter's MC line, relocated there,
  gives an MC 13' from Jupiter (its latitude, in mundo as intended); Jupiter on
  her Lisbon design MC exact 18 Oct 2026, matching an independent ephemeris
  read; all 1,541 marks resolve.
- **Transits live for everyone:** all 83 charts republished 11 October with
  transits in The World (15.6 minutes, no failures).

## Relationship in The World (11 October), live on Kaycee's chart

Kaycee's design calls: both people's lines on one map in the Relationship
view's person colours (first purple, second teal), design a lighter shade of
each; sides follow the panel; the place panel lists both people's lines and a
relocated chart per person with their own gates ("In [Name]'s Chart"); Find
My Places offers **Each Person** (a place counts only when each has a chosen
planet close) and **Combined** (scores added), Each Person by default; no
cross-person parans (two births are two moments); a second person whose time
is not exact enough leaves the first person alone on the map, with a note.

How: /api/connection also returns `world` for the second person when their
time is documented, told or typed in with a time (lib/world buildWorldData;
lib/hd/relationship now carries their birthUtc). /api/relocate casts the
second person (who=b) from the birth the page has, still behind a chart link.
The page tags every mark of the second person with data-who="b" as well as
side, so hovers, pins and labels never cross people. The chart announces the
pair with a delphi:connection event.

Copy approved; deployed; published to Kaycee's own chart only. Tested live with
Bob Dylan's birth (from the roster) through /api/connection, no form submitted:
80 lines each, all 2,396 marks resolve to the right person, side and body; his
Sun MC line at 147.9E matches the hand reckoning (apparent noon at 02:05 UT);
place panel, both relocated charts and Find My Places (both modes) work.
Client charts get it at the next republish, on Kaycee's say-so.

## Compare Places for two people (2026-10-11)

Kaycee: "It's a lot of info for two people and it's only showing one person's houses."
- Grade counts per person, each name in their own colour. These always show.
- Relocated Chart, Lines and Parans fold. Lines starts open, the other two start folded.
- Within each section, each person's rows sit under their own name. The people buttons decide who appears.
- The second person's relocated charts are cached under their birth, so changing the second person never reuses the old casts.
- In The World the panel reads, top to bottom: the date picker (Transit) or the picker and people buttons (Relationship), then Find My Places.
- Hidden in The World: Between You, Side by Side, Placements, Centers and Swap Perspective.

## Saved places and Compare Places are two things (open, 2026-10-11)

Kaycee: people will want to keep favourite places without having them in Compare Places, for example while weighing up a holiday somewhere else in the world. "In my mind they are two different things, but we can flesh that out."

The direction, to be worked out with her when the journal page is built:
- **Saved places** are keepers: they live in the journal (`journal_entries`, kind `place`) and stay there.
- **Compare Places** is a working list for one decision. You fill it from saved places or from the map, and clearing it never removes a saved place.

Today the two are the same list. Separating them needs one marker per entry (in the comparison or not) in `journal_entries`, not a new table.
