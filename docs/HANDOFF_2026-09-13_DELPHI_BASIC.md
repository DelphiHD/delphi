# Handoff: Delphi Basic everywhere (2026-09-13)

A new chat picking up this work starts here.

## What Kaycee asked for

"I just want what's in the Delphi Basic field to show up everywhere and remove
the garbage data that's been pushed." On 09-13 she finished writing Delphi Basic
text in Notion for every database, including incarnation crosses and variables.
That text replaces Function, Keynote and DBHD Description as the prose in chart
hovers.

What stays:
- **The pills** (side and planet, circuit, quarter, center, channel type). "The
  pills in the mouseovers are correct though. I don't want to lose those." "I
  still want to know the channel type and the circuitry, gate center, etc."
- **The three center fields** (Delphi Defined / Undefined / Open Basic). "The
  centers need to be different though."

Her 09-13 upset was about not knowing which columns were being treated as Delphi
Basic, and fearing her work was being deleted. **Nothing of hers is deleted.
Always name the exact Notion field being read.** Do not edit her Notion workspace
without her go ahead ("Stop", "This was a bad idea" after a rename attempt).

## Which fields are read, exactly

`delphiText()` in `scripts/energy-flow-diagram.ts` reads, in this order, the
first one that has text:

1. `Delphi Basic`
2. `Delphi Basic Description`
3. `Delphi Free Chart`

The fallbacks exist because older synced copies used different field names.
Kaycee confirmed 09-13: the Planets database has one field, `Delphi Basic`, and
that is the planet description everywhere a planet is hovered (glyph or name in
the placement tables, the control panel, anywhere else). Settled; do not ask
again. Channels deliberately have both `Delphi Report` and `Delphi Free Chart`.

The Crosses database field was renamed from `Delphi Basic Description` to
`Delphi Basic` on 09-13, and the rename can be undone. A Planets rename was
attempted, collided with the existing field, and was reverted.

## Done (code, committed 09-13, not yet pushed or republished)

- Gate cards (placement hover and gate library hover): the `Keynote:` and
  `Function:` lines are removed. Delphi Basic text comes through `delphiText`.
  Pills are kept.
- Channel cards: the keynote line is removed, `delphiText` is wired through
  (`ChannelMeta.basic`, then `ChannelGeom.basic`, then the payload, then
  `chanHtml`). Circuit and type pills and the "Gate X in the ... feeds gate Y"
  line are kept. A client's own report text still wins over the library text
  when there is one.
- Verified on Sandbox Generator Single (token 62927e854e1debca6927a9d59de37923):
  no Keynote or Function lines anywhere, 36 of 36 channels carry text.

## Check to run after the sync

Kaycee gave the Sun's text on 09-13 as an example of the right column (Delphi
Basic). Use it to confirm the planet hovers read that column. The Sun hover should show:

> The Sun is the conscious carrier of purpose, embodying the Father archetype and the Life Force theme; it delivers about 70 percent of all programming, serving as the core yang energy that defines our primary self and actions, is universally applicable, belongs to the Fundamental layer, and has no return in life.

If it shows anything else, find out why. Do not ask her to retype it.

## Sync result (09-13, 11:05, finished cleanly)

The Sun's Delphi Basic matches her example. Rows with `Delphi Basic` text:
gates 64/64, channels 36/36, crosses 194/194, planets 14/14, profiles 12/12,
profile lines 6/6, variables 16/16, authorities 8/8, circuits 7/7, quarters 4/4,
definitions 6/7. Centers keep their three fields (9/9 each).

Not found in the synced copy: `Delphi Basic` on **Types (0/5)** and **Channel
Types (0/4)**, and one of the 7 definitions. Look at the synced metadata keys for
those rows first (the field may be named differently or be outside what the
sync reads) before mentioning it to Kaycee; she believes everything is filled
in, so treat this as our problem to find, not hers. Lines have no Delphi Basic
and were not in scope.

## Next steps, in order

1. The sync ran 09-13 with her go ahead (log: `.cache/logs/sync-2026-09-13.log`).
   Confirm it finished and that the new `Delphi Basic` fields are in
   `.cache/chunks.json`: count the rows per source_kind that have text.
2. Hovers that still need Delphi Basic wired (library text not used, or old
   fields used): crosses, planets, type, authority, definition, profile,
   variables, circuits, quarters and channel types (these currently read
   `Description`; ask her before removing), and lines.
3. Rebuild the sandbox charts (`scripts/make-sandbox-charts.ts`) and check every
   hover by eye before any client chart is touched.
4. Run the copy check, push, then `scripts/republish-all.ts` (roster rebuilds by
   slug, website charts by token). Verify on the live URLs, not the files.

## Progress, 09-13 afternoon (committed, not pushed or republished)

- Sync finished (11:05). Delphi Basic text per database: gates 64/64, channels
  36/36, crosses 194/194, planets 14/14, profiles 12/12, authorities 8/8,
  variables 16/16, circuits 7/7, quarters 4/4, profile lines 6/6, definitions
  6/7 (the old "Wide Split (Broad Split)" row is empty; "Wide Split" has text).
- Types 0/5: the column was named `Text 1`. Kaycee renamed it to `Delphi Basic`
  on 09-13 after the sync. The text is already correct (Manifestor checked word
  for word); it reaches the chart at the next sync, no code change needed.
- Sun check: the live Notion `Delphi Basic` ends at "...primary self and
  actions." and the sync matches it exactly. The rest of the sentence Kaycee
  quoted lives in the Layer, Profile Applicability and Has Return in Life
  columns, not in Delphi Basic.
- Wired: the gate hover on every view (Keynote gone, Keynote and Function no
  longer shipped in the page at all); header cards for Profile, Authority,
  Variables, Definition and Incarnation Cross (a chart's own report still wins);
  planets (glyph in placement tables, planet names in the panel, astrology
  wheel), replacing the provider's planet blurb. Crosses match on the four
  gates in the Crosses `Cross` field. Authority "Ego" is Ego Manifested or Ego
  Projected by Type. "Split Definition" gets no text until simple and wide
  split is wired (tabled).
- One shared gate hover with colour-coded pills (side and planet, circuit,
  quarter in the mandala's quarter colour, centre in its function colour).
- Circuit colours by family: Individual blues, Collective greens, Tribal orange
  and red, Integration purple. Circuitry panel shows family totals, and zero
  counts are no longer faded out.
- Still reading `Description`, untouched pending Kaycee: circuit and channel
  type pills. Lines have no Delphi Basic column.

## Standing rules to carry over

Never run the sync without asking. Never remove a rule without asking. No
operational text on client artifacts. Never show the provider's connection
theme. The Life Cycles Analysis PDF is a protected reference: never in the sync,
the repo, or client artifacts. Sandbox charts use real roster birth data and are
private.

## Tabled until after the BFKI event (Sept 14 to 18)

Cycle mode return charts (Solar Return and long cycles as two modes, current and
next), weather impact classification, a notification system, wiring the simple
and wide split, the teaching deck (needs her running order and slides).
