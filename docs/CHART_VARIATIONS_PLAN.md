# Chart Variations and Working Time

Decided with Kaycee, 2026-09-14/15. Build after the BFKI workshop, on a branch,
checked on sandbox charts before any live chart is republished.

## Variations view (every chart)

- Every chart gets a Variations view: the person's birth day, one card per stretch
  where the reading changes (Type, Profile, Authority, Definition, channels), side by
  side, like the workshop Stage's Sanduleak and Blavatsky pop-ups. Clicking a card
  opens that version as a full chart.
- Kaycee: "everyone should be able to see it... it helps to start understanding the
  pattern." An exact-time chart marks the card holding its real time ("Your chart")
  and stays verified; nothing about it changes.
- Placement: under the Relationship tab, or as its own option beside it (her first
  instinct: under Relationship).
- Cast when the view is first opened, then kept (she approved this flow), so the
  website form and republishing stay as fast as now. Method: lib/hd/time-window.ts
  scanWindow across 00:00 to 23:59, cuts on property, channel and center changes,
  stretches under ten minutes folded, one cast per stretch (see
  scripts/workshop-deck.ts variationsOf).

## Working time (unknown or approximate birth times only)

- Each card offers "Set as working time" only when time_accuracy is unknown or
  approximate. Exact-time charts never show it.
- The person sets it themselves from their link. Their link then opens on that
  version, labelled Working Chart with the time range; they can switch or clear it.
- Logged on the chart AND on the funnel (dashboard) so Kaycee sees at a glance who is
  on a working time.
- Needs: a field on the chart record (working time and when it was set), a small save
  endpoint, a rebuild of that chart on save.

## Reports

- Anyone with an unknown or working time who requests a report gets a notice that it
  needs review, and the request is routed to Kaycee BEFORE they pay. She decides
  whether it is viable with what we have, or whether they need their birth
  certificate or a rectification (Birth Time Rectification session).

## Built so far (2026-09-17, branch chart-variations)

- The Variations view: a Chart Type button between Individual and Transit (Kaycee:
  "put it right between individual and transit"). Cards per stretch, changed values
  in purple, the exact chart's own stretch marked Your chart, a card opens large
  with its cross and centers.
- lib/hd/variations.ts casts the day; app/api/variations casts on first open (about
  ten seconds) and keeps the result in storage at variations/<token>.json, recast
  only when the birth date, place or exact time behind the chart changes.
- Tried on Sandbox MG Single. Kaycee: "that looks great". Words approved 2026-09-17.
- Not yet: live code, client charts (republish waits on her), Working Time, the
  report review routing.
