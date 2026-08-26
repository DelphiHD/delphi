# Interactive Teaching Chart

A self-contained, offline `.html` viewer of a client's real Human Design chart,
for live teaching in sessions. Built per-client from mybodygraph data.

- Generator: `scripts/build-interactive-chart.ts`
- Build one: `npx tsx scripts/build-interactive-chart.ts <slug>`
- Output: `<client output dir>/<Name> - Interactive Chart.html`

## How it works (the foundation)

The branded `design=delphi` SVG returned by mybodygraph is fully element-tagged:
every center, gate, and channel is a named piece. Two things make highlights
land exactly right and stay reusable:

1. **Gate anchors come from the chart's own labels.** The SVG draws all 64
   gate-number `<text>` elements at precise positions. We parse those at build
   time into a gate to (x,y) map and draw every highlight as an SVG-space circle
   at the gate's own label coordinate. No screen-pixel math, no drift on resize.
2. **Validation is built in.** The "Validate positions" toggle overlays a marker
   on all 64 anchors so the operator can eyeball that every one sits on its gate.
   This is how we prove accuracy instead of guessing.

Defined centers, channels, and activations all come straight from the API
response (`DefinedCenters`, `Channels`, `Personality`/`Design`), not inferred.

### Content sources (no new LLM calls)
All teaching copy is reused from material that already exists, so building a
viewer costs nothing beyond the one chart API call:
- **Gate/line names** + **center synthesis** — `.cache/chunks.json` (Notion library).
- **Per-placement gate/line/planet synthesis** — the client's already-generated
  Planetary Overview, `.cache/reports/<slug>-planetary.md` (the `> TLDR:` line is the
  brief; the paragraphs after it are the "read more").
- **Center, channel + variable synthesis** — the Foundation report,
  `.cache/reports/<slug>-foundation.md` (per-center, per-channel, and per-variable
  sections). The center brief is assembled from the report: mechanics + not-self
  theme + gift/correct expression, not biology.
  If a report hasn't been generated, boxes still show names/hexagram/structure, just
  no synthesis (library text is the center fallback).
- **Hexagram images** — `~/Desktop/Delphi Brand Assets/sections/hexagrams/<gate>.<line>.png`,
  embedded as data URLs so the file stays offline.

## Build approach (how we iterate)

1. **Capture ideas in the backlog below** so nothing is lost and we prioritize.
2. **Lock the foundation before features.** Highlights must land exactly right;
   everything else builds on that. Done: label-derived anchors + calibration.
3. **Engine vs. ideas stay separate.** Reusable geometry/anchors + per-client
   data + UI. New ideas are UI features on top of the validated engine.
4. **Tight visual loop.** Every change is verified in the browser (preview +
   screenshot) before it ships.
5. **Interactive over automated.** Clickable lists the operator drives, not
   auto-playing movies. She controls pace and order while teaching.

## Views

A view switcher in the panel toggles between:
- **Bodygraph** (default) — the layout below.
- **Mandala** — the zodiac wheel from `renderFullMandala` (`lib/render/mandala.ts`),
  embedded with base64 hexagrams so it stays offline. Both views **share the same
  panel** (property cards + Centers/Gates/Channels/Variables tabs); there is no
  separate planetary walk. Highlighting is **view-aware**: `activeBg()`/`activeHl()`
  route the bodygraph-style highlights to whichever chart is active — in mandala
  view that's the hub bodygraph composited at the wheel's center (same element ids
  + viewBox, so `ANCHORS` still apply) — and in mandala view the wheel pieces pulse
  on top (so a center/channel/gate lights up on **both** the wheel and the hub).
  Centers and channels are clickable from the tabs and directly on the hub bodygraph
  (`wireCenters` runs on both `svgEl` and the hub). The wheel is also interactive via
  transparent hotspots
  (`#mhot`) at each planet position:
  - **hover** (over the glyph hotspot, anywhere on the spoke hit-line, or the
    hexagram) pulses the whole chain for that activation — spoke, planet glyph,
    gate-number cell, hexagram, and the connected center in the nested bodygraph
    (`mHighlight` / `mHighlightGate`, `.mhi-*`). Relies on `data-side/data-planet/
    data-gate` (spokes + glyphs), `data-gatecell`, and `data-hex` added in
    `lib/render/mandala.ts` (inert data attributes / a `<g>` wrapper, safe for the
    docx rasterizer).
  - **click** opens that gate's full detail box (`openGateBox` + `posBoxAtMandala`).
  - **filters** — a right-side overlay (`#mfilterbox`, shown only in mandala view)
    with Personality/Design plus a checkbox for **every planet** grouped under
    Cross / Nodes / Inner / Outer, each group having an "All" master that toggles its
    members (and goes indeterminate on partial). `applyMandalaFilter` shows/hides the
    glyphs + spokes + hotspots. The Personality/Design toggle ALSO shows/hides the
    activation visuals inside the bodygraph image itself (hub + main), via `bgSides`:
    the mybodygraph id prefixes are unreliable for side, so we classify by fill color
    (design = red #e06666, personality = black #000000 on activation-id'd elements).
  - **bigger glyphs** — the renderer takes a `glyphScale` (default 1, docx unchanged);
    the interactive embed passes 1.8 so glyphs read clearly when the wheel is small.
  In Mandala view the flanking tables collapse to 0-width grid columns and are
  `visibility:hidden` (not `display:none` — that breaks grid auto-placement and the
  stage lands in the wrong column); the legend hides.
- **Timeline** — planned next (life transits from `# Your Timeline`).

## Layout & modes (Bodygraph view)

Traditional Rave layout: Design planet table (red) left of the chart, Personality
table (black) right, the bodygraph in the middle with the four Variable arrows
above the head. Right panel carries the property cards and the interactive modes.

- **Client name** — clicking the name opens a box with the birth date/time, place,
  birth UTC, and the design date (all from the API `Properties.*Date*` fields).
- **Property cards** — Type, Strategy, Authority, Profile, Definition, Signature,
  Not-self, Incarnation Cross, shown as prominent clickable cards at the top of the
  panel. Clicking one opens a box with its value and a synthesis (brief + read more)
  from the Foundation report (`loadPropertiesFromReport`): Type/Strategy/Authority/
  Cross from their `#` sections, Profile from the Combined-Rhythm subsection,
  Signature/Not-self focused on the satisfaction/frustration sentences.
- **Personality/Design toggle** — a small `.bgtoggle` in the bodygraph view's top-right
  (just the two side checkboxes) and the same toggle inside the mandala filter overlay.
  Both drive a shared `sideState` via `setSide` (which syncs the two UIs) and call
  `applyMandalaFilter`, which shows/hides the activation visuals in the bodygraph
  image(s) by fill color (`bgSides`) — so it works in both views.
- **Fixation key** sits in its own row below the chart (`.chartlegend`, one line). Chart
  SVGs are viewport-bounded by explicit `height/max-height: calc(100vh - Npx)` (NOT
  flex:1 percentage heights — those depend on an indefinite grid-row height and blow the
  chart up). The bodygraph svg has no intrinsic size so it needs an explicit height; the
  mandala is square with an intrinsic 1000² size so it uses max-height + auto (contain).

- **Planet tables (flanking)** — glyph, gate.line, and fixation mark (exalted ▲ /
  detriment ▼ / juxtaposed ✦, all Delphi purple) per planet. Hover shows the planet
  name beside the glyph and previews the gate highlight; click pins the highlight and
  opens a box with the planet header, the per-line hexagram image, the gate name, the
  line name, a brief synthesis, and a "read more" toggle that expands to the full
  placement passage from the report. These double as the activation list.
- **Variable arrows** — drawn from API data (not in the source SVG), flanking the
  head center. Top-Left: Digestion (Determination), Top-Right: Motivation,
  Bottom-Left: Environment, Bottom-Right: Perspective. Direction per client data.
- **Gates** — a tab listing all 26 activations with gate + line names, Personality
  first then Design; each row opens that gate's box.
- **Centers** — hover a center (chart or list) to highlight; click it to open a
  box with the center name, a brief synthesis, a "read more" with the full center
  section, and its activated gates. The brief is assembled from the Foundation
  report (`loadCentersFromReport`): the center's mechanics (what it does in the
  design) + the not-self theme + the gift/correct expression — not biology. Each
  activated-gate tag is clickable and jumps to that gate's box. (Library text /
  `CTHEME` are fallbacks if no report exists.)
- **Channels** — clicking a channel lights it up and opens a box with the channel
  name, the centers it connects, a brief synthesis, and a "read more" with the full
  channel section from the Foundation report (`loadChannelsFromReport`).
- **Variables** — the four PHS variables with theme + arrow, plus Sense / Design
  Sense; hover a row to find its arrow on the chart. Clicking a variable arrow (on
  the chart) or a Variables row opens a box with the full placement string (e.g.
  "Color 5: Valleys, Left Arrow | Observed: Narrow, Tone 3: Outer Vision"), a brief
  description, and a "read more" with the full section from the Foundation report
  (`loadVariablesFromReport`).

Highlight is a gold inner ring (`#ffcc00`) with a Delphi-purple halo (`#845095`),
so it reads on any center including the yellow Throat. Fixation marks are purple.
Gate anchors use a small right/up nudge (DX/DY) off the label baseline; tune via
the "Validate positions" calibration overlay.

Note: the layout has fixed side columns (~100px tables + 340px panel), so the
chart wants a reasonably wide window (roughly 900px+). Below that the chart column
gets squeezed. Narrow-screen/iPad stacking is still a backlog item.

## Idea backlog

Seeded from Kaycee. Add freely; we triage before building.

- [x] Gold highlight color
- [x] Validate + correct gate/channel positions (label-anchored + calibration toggle)
- [x] Interactive lists instead of auto-play movie
- [x] Variable arrows on the chart (arrangement pending Kaycee confirm)
- [x] Flanking Design/Personality planet tables w/ glyphs + fixations (clickable)
- [x] Gate / center / channel / variable detail boxes with brief + "read more",
      hexagram images, clickable cross-links (all sourced from client reports)
- [x] View switcher + **Mandala view** (wheel from `renderFullMandala`). Shares the
      bodygraph panel; view-aware "both" highlighting (wheel + hub bodygraph);
      clickable centers/channels/gates; bigger glyphs; right-side per-planet filters;
      hover-anywhere-on-spoke/hexagram. (Planetary walk removed in favor of the shared
      panel.)
- [ ] **Timeline view** — life transits from the Foundation report `# Your Timeline`
      (Saturn Return, Uranus Opposition, Chiron Return, 2nd Saturn Return — dates,
      passed/upcoming, prose). Horizontal life timeline, each marker clickable. (next)
- [ ] Incarnation cross view (the four cross gates highlighted together)
- [ ] Open-centers "where you get conditioned" walk
- [ ] **Chatbot for questions — deferred (Kaycee, 2026-06-23).** Needs an LLM, which
      per cost/security rules must go through `invoke-llm` server-side; cannot live
      in the offline .html file (no client-side secrets). Revisit once the portal
      vs. networked-file direction is decided. The viewer already embeds the full
      client report content, so grounding is ready; a cost note in DECISIONS.md is
      required before building the Claude-calling path.
- [ ] (Kaycee's remaining ideas here)

## Notes / open questions

- **People are identified by their display name in three places at once** (the roster, the
  transit report headings, and the charts that read those headings back), so renaming
  anyone breaks the link to everything written before the rename. Hit twice on 2026-08-26:
  Paul Hollingshead and Sarah Gallardo. `headingByRename` patches it; a real identifier
  would fix it. Options put to Kaycee, awaiting her call: put the slug in the report
  headings (cheap, only helps reports written from now on), give everyone a stable id
  across roster/reports/Notion (clean, wide blast radius), or leave it. Structural, so it
  is her decision, not the agent's.
- Built for laptop/desktop landscape. iPad/narrow-screen stacking is a future task.
- Channel highlight currently rings both endpoint gates and thickens the channel
  group stroke. If a stronger channel glow is wanted, that's a refinement.

## Panel layout (2026-08-25)

On a client chart the view controls (Bodygraph / Circuits / Mandala, Reset / Save image,
Defined channels / Hanging gates, Personality / Design) are docked into the empty lower-left
corner of the stage rather than sitting in the side panel. Kaycee's idea, and it is what
finally made the panel fit a laptop: the panel carries only the reading itself, and its
content dropped from 719px to 521px. The controls sit in four tidy rows in a 240px card,
which is why panel button padding is 5px 8px: at 10px the rows wrap.

The panel also scrolls internally (`overflow-y:auto`, `min-height:0`) instead of growing the
page, so a short window can never push the bodygraph out of view to reach what is below.

Known trade-off: in mandala view the dock overlaps the lower-left arc of the wheel, covering
part of the Initiation quarter label and a few outer cells. The card is opaque enough to stay
legible. Fix if it starts to bother her: shrink the mandala slightly or shift it right of the
dock in that view only.

The teaching diagram keeps its controls in the panel; it has the room.

## Date picker on the Transit view (2026-08-26)

Above the TODAY section the transit view carries a date row: back and forward arrows, a
date field, a Today link that appears only when you have moved off today, and a row of
pills for that person's own life cycles (Saturn Return, Uranus Opposition, Chiron Return,
Second Saturn Return), read straight off their Foundation report's timeline chapter.
Clicking a pill jumps the chart to that date. Kaycee's requirement was that clients be
able to look ahead, not only back.

The chart is a baked HTML file, so it cannot be re-rendered on the server for a new date.
Instead the page fetches `/api/sky?date=YYYY-MM-DD` (12:00 UTC anchor, matching the daily
report) and repaints the transit canvas in place: transit legs and discs, the gate numbers
that sit on them, any centre that a transit defines or stops defining, and every row of the
transit column. Every gate the client does not carry is tagged as a paintable transit disc
at build time so any day's sky can be drawn, not just the day the file was built.

The words are baked, not fetched: `loadAllReads` pulls every archived
`~/Desktop/HD Reports/Transits/<date> - Daily Transit Report.md` for that person into the
payload. Roughly 20 days each, a few kilobytes, and no dependency on a laptop being awake.
A day with no report shows the sky plus a note saying so, and the survey hides itself
because there is nothing to say landed.

### Two traps worth remembering

**Names are not identifiers.** Reports on disk carry whatever the roster called someone
that morning, so renaming a client orphans every read they have. `headingByRename` resolves
this against the report itself: headings that match a roster name exactly are spoken for,
and a leftover heading matches only someone whose first name it is who has no heading of
their own in that same report, and only when exactly one person fits. "Sarah" in a report
that already names Sarah Marie is the other Sarah; "Sarah" in a report naming neither is
left unmatched rather than guessed at. This is a patch, not a fix: see the open question
below about giving people real identifiers.

**Storage caches uploads for an hour by default.** `publishChart` sets `cacheControl: "0"`,
without which a republished chart keeps serving the previous file to the client holding the
link, which would also silently break any nightly refresh.

### Highlight styling

One gold ring, everywhere. Hovering a gate anywhere (client column, transit column, read,
channel list) draws a 3px `#f1c232` / `#ffcc00` stroke around the gate disc and nothing
else: no fill, no pill, no drop-shadow. A filled pill was tried for the client column and
rejected on sight, correctly, because it made that one highlight behave unlike every other
highlight on the chart. Solid colour, never a glow.
