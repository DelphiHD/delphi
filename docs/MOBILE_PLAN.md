# Mobile overhaul: view-by-view review (2026-10-11)

Kaycee, 2026-10-11: "go view by view within each chart type and give me your recommendations for mobile before we get started. I think we may uncover some redundancies and inefficiencies that way." Mobile comes before new features.

Reviewed on her live chart at iPhone size (375 × 812). The World was redone for phones the same day and is the template: controls in slim rows, the drawing filling the screen, and everything that opens coming up from the bottom.

## Across every view

1. **The top card costs a third of the screen.** The logo, Chart Type, View, Show and Reset / Save Image / Copy Chart Data take about 280px before any chart appears. The fix is The World's: Chart Type and View as two slim rows, with Show and the three actions behind one button that opens a sheet from the bottom.
2. **The panel is a long page under the chart.** Home, Dates and Stats run 1,100 to 2,300px below the drawing. They can stay as a scroll, but whatever changes the chart (the date picker, the people) belongs near the top.
3. **Show opens to 350px of switches** inside the card. It should be a bottom sheet.

## Individual

- **Bodygraph and Circuits:** the bodygraph fits, but the Design and Personality planet columns beside it shrink to about 6px text, unreadable. On a phone the bodygraph should take the full width, with the planets on a tap or in a strip under it.
- **Redundancy:** on a phone, Bodygraph and Circuits are the same drawing recoloured. Circuits could become a switch on Bodygraph, which leaves four views in the row and stops it overflowing. This is her call; desktop can keep both buttons.
- **The Wheel:** it fits, but gate numbers and the hub are too small to read. It needs pinch zoom inside the wheel, as The World has, and the person's name over it like the other views.
- **Astrology:** a bug. The wheel sits in a fixed-height frame, which leaves about 140px blank above and below it. It needs to fit the wheel.

## Variations

- **Broken on a phone.** The variations panel is pinned to the top of the stage and slides under the Chart Type card, so the top of the chart and its controls are hidden. Its grid of variations is about 2,100px tall, scrolling inside a 600px box.
- It needs its own phone design: one variation at a time, stepped with arrows or a time slider, with the type, profile and authority beside it.

## Transit

- The date picker is in the panel below the chart, about 740px down. On a phone it should sit directly under the Chart Type row, as The World places it.
- Transit Only / Over The Whole Chart is down in the panel too. It belongs beside the date.
- The transit planet column beside the bodygraph has the same unreadable text as above.

## Relationship

- The person picker form stays at the top of the panel even after someone is chosen. Once chosen, it should shrink to one line ("With Bob Dylan · Change").
- The people buttons should sit near the chart, not down the panel.
- Between You (about 390px) and Side by Side (about 470px) are long. They could start folded on a phone.

## The World

Done 11 October; see `docs/ASTROCARTOGRAPHY_PLAN.md`. The Transit date picker is the one gap, and the shared header above fixes it.

## Suggested order

1. The shared header and bottom sheets. This touches every view at once and gives the biggest gain.
2. The Astrology gap (small bug) and the Wheel's pinch zoom.
3. Bodygraph full width, planets on tap. Circuits as a switch if she agrees.
4. Transit and Relationship controls near the top.
5. Variations, which needs its own design.

The Visits tab, recording since 11 October, will show which views phones actually use. It can reorder this list once there is enough data.
