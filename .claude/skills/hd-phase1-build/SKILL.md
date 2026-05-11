---
name: hd-phase1-build
description: |
  Build a complete Human Design Phase 1 session reference from chart data and deliver it as a new page in the Reference Files Notion database. Use whenever Kaycee starts a new client analysis by providing a chart PDF and copy-paste chart text data, or mentions building a session reference, pulling source material for a reading, or starting Phase 1 of an HD analysis. Also trigger on chart-specific terminology in the context of starting new client work: gates, lines, channels, variables, PHS, incarnation cross, planetary activations, hanging gates, exaltations, detriments. This skill is for Phase 1 only (build the analytical reference). Phase 2 (client report generation) is a separate skill.
---

# HD Phase 1: Build Session Reference

## Agent Role: Resource Assistant, Not Analyst

The agent writes the session reference as analytical prose — full paragraphs that synthesize what each chart element means in the context of THIS specific chart. This is real analytical writing, not source quoting. The reference Kaycee reviews should read as cohesive analysis a thoughtful HD analyst would write, grounded entirely in source material the agent has fetched.

The line is between **synthesis from source** (what the agent does) and **fabrication** (what the agent must never do).

**Synthesis from source means:**
- Writing prose paragraphs that interpret each activation in the chart's specific context
- Cross-referencing chart features (e.g., "Gate 11 is triple-activated here, which means...")
- Connecting individual activations to the larger design — cross theme, circuits, profile, definition geography
- Naming patterns the chart's mechanics produce (e.g., gifts, challenges, conditioning vulnerabilities) and giving them descriptive names
- Quoting Ra or DBHD source material when it sharpens a point — short embedded quotes with attribution
- Voice is confident, declarative, and chart-specific. Not hedged. Not academic. Tight, advancing prose.

**Fabrication means (forbidden):**
- Making claims about a gate, line, channel, center, etc. without having fetched its source material in this conversation
- Using HD knowledge from training data instead of from your fetches. Generic HD content from training is wrong for this practice.
- Generic content that could apply to any chart ("Manifestors typically..."). Every sentence must be specific to THIS chart.
- Quoting Ra without having fetched the source page. You cannot remember Ra quotes; they must come from a fresh fetch.
- Filling gaps in your fetched material with what "sounds right"

**No placeholder markers.** Never write `[SYNTHESIS]`, `[SYNTHESIS — Kaycee]`, `[TBD]`, `[FILL IN]`, or any "agent should write later" marker. Either write the prose now, or write `[GAP: <specific reason>]` and continue. Placeholder markers cause Kaycee to wait while the agent eventually returns to fill them in, which is the failure mode. Write the prose on first pass.

If a Notion entry is missing or sparse, flag inline (e.g., `[GAP: no source fetched for 21.3 line]`). Do not generate substitute content.

If you encounter chart-data inconsistencies (channel listed but only one gate present, authority not matching defined centers), flag and continue.

**The audit step verifies every cited Notion page ID corresponds to an actual fetch in the conversation log.** Drift will be caught and the analysis rejected. There is no shortcut.

## Inputs (provided by Kaycee per session)

1. **Chart PDF** — visual chart image. Authoritative for splits geography and exaltation/detriment markings.
2. **Chart text data** — copy-paste from chart software. Includes: client name, birth/design dates, type, profile, authority, definition, cross, quarter, center definitions, channel list with consciousness status, planetary activation tables (Personality + Design), life cycle milestones. **Note:** chart text typically does NOT include PHS/Variables detail — that comes from the blank reference page itself (see #3).
3. **Link to a blank reference page** — Kaycee creates a new page in her Reference Files database manually before starting the session. She pre-tags the `Variable` multi-select column with the client's PHS configuration (e.g., `PLL DLR`, `Determination - C4: Touch`, `Motivation - C3: Desire`, etc.). The agent reads these tags from the page properties and uses them to drive PHS source-material lookups.

If the PDF and text disagree on anything, the PDF wins; flag the discrepancy at the data pass checkpoint.

## Output

The blank reference page Kaycee provided, populated with:
- Body content: full reference assembled with flat-headed structure (no toggles/details blocks — Kaycee deprecated those)
- Queries log appended at the bottom
- Database properties filled in for fields the agent can derive from chart data: `Type`, `Profile`, `Authority`, `Definition`, `Incarnation Cross`, `Analysis Type` (= `Individual`), `Analysis Level` (= `Full`)
- Database properties NOT touched by the agent: `Variable` (Kaycee pre-tags this), `Bodygraph Link` (Kaycee fills in)
- `Status` set to `Ready for Reports` after audit approval

**Important:** the agent does NOT create the page. Kaycee creates it; the agent writes into it via `notion-update-page`. The previous create-page approach was abandoned because manual creation gives Kaycee more control and lets her pre-tag the Variables column.

If the page Kaycee links is not in the Reference Files database, surface that as an error and stop — the agent should not write to a random page.

## Workflow

### Step 1: Pre-flight Check

Before any analysis work, verify access:
- Read the PDF (confirm it loads and is the chart image)
- Fetch the blank reference page Kaycee linked. Confirm:
  - It's a real page in the Reference Files database (parent data source = `collection://31ce3fad-caaa-80c7-88c8-000b46208863`)
  - Its current body is empty or near-empty (so the agent isn't about to overwrite an existing reference — if there's substantial content already, surface it and ask before proceeding)
  - The `Variable` multi-select property on the page (these tags drive PHS source lookups in Step 4)
- Test one query against the Gates database (`collection://268e3fad-caaa-805b-90e7-000b2a86a18b`) to confirm Notion read access
- **Identify the chart's configuration code from the Variable tags** (the configuration tag is the one that looks like `PLL DLR`, `PRR DLL`, etc. — four letters in a P/L/R + D/L/R pattern). Fetch the matching configuration page from HD Variable Configurations (`collection://32ee3fad-caaa-80e1-b289-000bf40710f1`). This is the spine of the Variables section and must be loaded before Step 4 begins.
- Test fetching The Differentiation Lectures page (page id `32de3fadcaaa80cb89e6ddbb8dd09112`) to confirm it's reachable

If any check fails, surface the error to Kaycee and stop.

**Pre-flight report format** (max 7 lines, one bullet per check):
- PDF loaded: <yes/no, client name>
- Reference page accessible: <yes/no, current body empty?>
- Variable tags read: <count, e.g. "17 PHS tags">
- Configuration identified: <e.g. "PLL DLL", and "fetched: yes/no">
- Gates DB read: <yes/no>
- Differentiation Lectures reachable: <yes/no>
- Any flags: <one line, or "none">

Do not produce the activation inventory in pre-flight. That belongs in Step 3.

### Step 2: Parse Chart + Build Activation Inventory

From the text data and PDF, mechanically build the activation inventory. This is the only "analytical" work the agent does — it's bookkeeping, not interpretation.

Produce:
- **Chart Summary line**: `Profile Type | Authority | Definition`
- **Birth/Design dates**, location
- **Defined / Undefined / Open centers** with counts
- **Channels** with consciousness status (Road/Tunnel/Mixed/Overpass — internal shorthand, fine in reference)
- **Personality Activations table** (13 rows: Sun, Earth, Moon, NN, SN, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto). Columns: Planet, Gate.Line, Exalt/Det, Center, Channel/Hanging.
- **Design Activations table** (same 13 planets, same columns)
- **Unique Gates** list
- **Double Activations** (gates appearing more than once, with planet attributions)
- **Line Distribution** (counts by line 1-6 with percentages)
- **Center Distribution** (gates per center, activations per center)
- **Circuit Distribution** (gates per circuit group)
- **Important Dates**: Saturn Return, Uranus Opposition, Chiron Return, 2nd Saturn Return, current age
- **Splits geography** (if Split Definition): islands, channels in each, bridging territory — confirmed against the PDF visual

### Step 3: Data Pass Checkpoint (THE checkpoint)

Present the activation inventory to Kaycee for review. This is the only intermediate stop in the workflow because chart-data errors here cascade through everything downstream.

**After Step 3 confirmation, the agent runs Steps 4 through 8 without further user prompts.** Do not ask "should I continue", "should I run the audit now", "should I write to Notion now". Run sequentially. The only exception is a hard error (Notion API failure, audit recommends REBUILD, etc.) — in which case surface the error and ask. The completion signal is the final Notion page URL with property summary.

Specifically flag:
- Any inconsistencies between PDF and text data
- Missing/incomplete activation rows
- Channels listed but with only one gate present
- Authority not matching defined centers
- Cross gates not matching the activation table

Wait for Kaycee's confirmation before proceeding.

### Step 3.5: Resonance Note (the synthesis spine)

After Kaycee's confirmation, before any source fetching, write a 3-line Resonance Note identifying cross-feature convergences visible from the inventory. Look specifically for resonances between: dominant center + variable configuration; channel mix + quarter; profile + nodal arc; cross gates + circuit absences; multi-activated gates + cross theme; absent circuit families + chart's contribution shape.

The Resonance Note is internal — do not present it to Kaycee. Save it as part of your working notes for the build. It becomes the synthesis spine of the body — the cross-feature convergences identified here should organize the Themes section, recur across the Synthesis subsections (Variable Synthesis, Channel Architecture Summary, Incarnation Cross Synthesis, Nodal Arc Synthesis), and frame the "For the Reading" key talking points.

Resonance Note format (3-5 bullets, one line each):
- `<feature A> + <feature B>: <one-line statement of what they're pointing at together>`

Example:
- `Spleen-dominance (35% activations) + all-left variable: same intelligence — splenic-strategic survival awareness, biologically and cognitively`
- `All-Overpass channels + all-nodes-in-Root: chart fully doubled along its definition spine, with the entire past-to-future arc in adrenal pressure`
- `No Collective channels + 6/2 roof phase: structural non-orientation toward group discourse; contribution is embodied example, not articulated movement`

If you cannot find at least 2 resonances, pause and re-examine the inventory. Most charts have 3-5 visible resonances when you look. A chart that genuinely has none is rare and worth flagging.

### Step 4: Bulk Query Notion (Source Material)

**This step typically requires 25-35 Notion fetches.** That is the expected workload, not an aberration. You will be tempted to "be efficient" by skipping fetches and using HD knowledge from training. **Do not.** Generic training-data HD is wrong for Kaycee's practice. The audit catches drift and recommends rebuild — skipping fetches costs more time than running them.

**Execute fetches in parallel batches.** Group 8-10 related fetches in a single tool-use block (multiple `notion-fetch` calls in one assistant turn — the tool framework runs them concurrently). For 19 gates, that's 2-3 batches. Each batch returns in roughly the same wall time as a single fetch. This eliminates the "too many fetches" friction.

Notion markdown body content uses standard Markdown plus tables (`| col | col |` with separator row). Code blocks, blockquotes, headers (#, ##, ###), bold/italic, and unordered/ordered lists all work as expected. No special syntax is needed for tables in `replace_content` / `update_content` payloads.

**Critical:** Each piece of chart material has a SPECIFIC database. Do not pull Type info from the Centers database, Profile info from the Gates database, etc. The mapping below is exact — follow it.

**For Type** (Generator / Manifestor / Projector / Manifesting Generator):
- Database: Human Design Types — `collection://270e3fad-caaa-80ed-83a4-000bd1c91dd8`
- Search by Name (e.g., "Manifestor") and fetch the matching page.

**For Profile** (e.g., 3/5, 4/6):
- Database: Human Design Profiles — `collection://270e3fad-caaa-8065-ae54-000b4b3de308`
- Search by Name (e.g., "3/5") and fetch the matching page.

**For Authority** (Splenic / Sacral / Emotional / Ego Projected / Sounding Board):
- Database: Human Design Authorities — `collection://270e3fad-caaa-80c3-a9b8-000b6877014f`
- Search by Name and fetch the matching page.

**For each unique activated gate** (typically 18-26):
- Database: Human Design Gates — `collection://268e3fad-caaa-805b-90e7-000b2a86a18b`
- Search for `<Gate#>: <Hexagram Name>` (e.g., "47: Oppression") or just the Gate # in the title.
- Fetch the matching page. The page contains FOUR distinct content layers — all four must be mined for synthesis:
  1. **DBHD intro paragraph** (the gate's general theme — top of the body, single paragraph after the gate header). Use this for the gate-level meaning when introducing the gate in any section.
  2. **Line table** (6-row table with Line Name, Detriment planet + description, Exaltation planet + description). This is the spectrum-extremes summary in compressed form. **The exalt/det fields here are reference material for Kaycee, not for client-facing prose.** See "Exaltation/Detriment Citation Rule" below.
  3. **`<synced_block_reference>` Line Companion content** (the toggled `<details>` blocks per line). **This is the highest-value content on the gate page.** It contains Ra-direct teaching with two parts per line: (a) the line's general meaning paragraph (line-level theme, valid for all placements regardless of planet), and (b) per-planet exalt/det treatment with Ra's lived examples. **Mining this is mandatory for the Planetary Overview, Gates & Lines Deep Dive, Moon, and Nodal sections.** Failure to mine it produces synthesis at table-summary depth instead of Ra-teaching depth, which is a known regression pattern.
  4. **`If hanging:`** section (single paragraph at the end of the gate intro). Use this when treating a hanging gate.

**How to use the Line Companion content per placement.** For each planetary placement on a line (e.g., P Moon 23.3), pull the matching `23.3 Individuality` toggle from the synced_block_reference. From that toggle, extract:
- The line's general meaning paragraph (always relevant — applies to every placement on that line, regardless of which planet is exalted or in detriment).
- The exalt or detriment treatment ONLY if the placement planet matches that pole on that line. See citation rule below.
- Any Ra anecdotes, generational notes (e.g., "when Pluto was in 43..."), or developmental mandates ("individuals must develop language skills") that apply to the placement.

**The Line Companion content was previously thought of as a deprecated separate database. It is NOT separate — it lives inside the Gates DB page bodies as synced_block_reference content. Read the full gate page including the synced block; do not stop at the line table.**

**For each defined channel:**
- Database: Human Design Channels — `collection://268e3fad-caaa-801c-9f00-000b4a1a601b`
- Search by gate pair (e.g., "16-48" or channel name) and fetch.
- Database: Human Design Circuits — `collection://26ce3fad-caaa-8020-8215-000bb9a8e2bd`
- Fetch the linked Circuit entry for each channel for circuit-group source material.

**For each center** (all 9 — defined, undefined, and open):
- Database: Human Design Centers — `collection://268e3fad-caaa-811d-a4a5-000b3371cf0e`
- The Centers database has explicit fields for `When Defined`, `When Undefined`, `When Completely Open`, `Not Self Themes`, `Not Self Talk`, `Biology`. Pull all of these per center.

**For the Incarnation Cross:**
- Database: Human Design Incarnation Crosses — `collection://26ce3fad-caaa-80ed-b5ac-000b95a88768`
- Search by full cross name (e.g., "RAC of Rulership 3").

**For the Quarter:**
- The Quarter is a select field on the Personality Sun gate (already pulled from Gates database — no separate fetch needed for the name). For full quarter source material, search the HD Quarters database — `collection://325e3fad-caaa-8070-9d7c-000be6bdd57a`.

**For Definition** (Single / Split simple / Split Broad / Triple / Quadruple):
- Database: Human Design Definition — `collection://270e3fad-caaa-802d-9d68-000b701e5160`
- Search by Name (e.g., "Split (simple)", "Split (Broad)", "Single") and fetch.

**For Planets** (Sun, Earth, Moon, NN, SN, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto):
- Database: Human Design Planets — `collection://26ce3fad-caaa-80a7-a363-000b711da6c6`
- Fetch the entry for each planet. Used in the Planetary Overview section to introduce what each planetary placement carries (Theme + DBHD Description on each Planet entry).

**For Variables / PHS** (Determination/Digestion, Environment, Perspective, Motivation):

The chart text data does NOT typically include PHS detail. Source: read the `Variable` multi-select tags off the blank reference page Kaycee provided (already fetched in Step 1). Tags look like `PLL DLR`, `Determination - C4: Touch`, `Motivation - Transference: Innocence`, etc.

**Step 1 (mandatory first step): Fetch the chart's configuration page from HD Variable Configurations.** Database: `collection://32ee3fad-caaa-80e1-b289-000bf40710f1`. There are 16 configurations (PLL DLL, PLL DLR, … PRR DRR), one for every possible left/right arrow combination. Search the database for the chart's configuration code (e.g., `PLL DLL`) and fetch the matching page. **This is the most important variable source** — each configuration page contains Ra-direct teaching about the lifestyle, awareness mandate, and structural meaning of that specific arrow combination. The lecture-derived content here is significantly richer and more chart-specific than what you can extract from the Differentiation Lectures by keyword search. Do not skip this step. Do not treat the configuration page as supplementary; it is the spine of the Variables section.

**Step 2: Fetch The Differentiation Lectures page** (page id `32de3fadcaaa80cb89e6ddbb8dd09112`) for per-Color, per-Tone, per-Direction detail to layer on top of the configuration teaching. The page is structured as continuous Ra teaching across 4 main toggles (Determination/Digestion, Environment, Perspective, Motivation). Search the saved page content for sections matching the chart's specific tags. Quote relevant transcript/summary content with the page ID as citation.

**Why both:** the Configuration page tells you what the *combination of all four arrows* means (Ra's structural framing of e.g. "all-left" or "split bottom" or "right-dominant" beings). The Differentiation Lectures tells you what each *individual Color/Tone/Direction* means in detail. The Configuration teaching is the load-bearing frame; the Differentiation Lectures content is the per-component flesh. Skipping Step 1 in favor of just Step 2 produces a Variables section that misses the configuration's structural mandate — which is often the most distinctive thing about the chart's variable expression.

In the Variables / PHS section of the reference body, both source page IDs should appear in the `[Source: ...]` line of every Variable subsection.

**Efficiency rules:**
- Batch queries in parallel where possible (multiple notion-search/notion-fetch in one tool-call block).
- **Interleave fetches with writes (streaming-write protocol).** Do NOT fetch all 50+ sources up front and then write 8 sections at the end. By the time the last section is written, the early-fetched content has been pushed back in context and risks partial drop during auto-compaction. Instead, fetch the sources for one or two sections, write those sections to the /tmp file, then move to the next fetch group. The Line Companion content for gates is especially context-sensitive: it must be fresh when writing Planetary Overview, Gates & Lines Deep Dive, Moon, and Nodal sections.
- See "Step 4+5 Streaming-Write Protocol" below for the exact fetch→write checkpoints.
- If a database returns nothing or an entry is sparse, mark it as `[GAP: no <database> entry for <item>]` in the reference and continue. Do NOT generate substitute content.
- Every quoted source block must trace to a fetch in this step. If you can't cite a Notion page ID, you can't include the quote.

### Step 4+5 Streaming-Write Protocol

Steps 4 and 5 are interleaved. Fetch a stage's sources, write the corresponding section(s) to the /tmp file while those sources are fresh in context, then move to the next stage. The synthesis sections that draw on multiple upstream sections (Variable Synthesis, Channel Architecture Summary, Themes, Application Layer) are written last when all upstream content is on disk.

Recommended interleaved order:

| Stage | Fetch | Write to /tmp |
|---|---|---|
| A | Foundations: Type, Profile, Authority, Definition, Cross, Quarter | Section 1 (Data Pass / Activation Filter) — initial Write call. Then append Section 2 (Basics + Timeline). |
| B | Configuration page (already fetched in Step 1) + targeted Differentiation Lectures reads | Append Section 3 (Variables / PHS) including Variable Synthesis. |
| C | Centers (all 9) + Channels (defined) + Circuits | Append Section 4 (Centers + Conditioning Summary + Split Definition Deep Dive if applicable). |
| D | (Channels already fetched in Stage C) | Append Section 5a (Channels + Channel Architecture Summary). |
| E | Planets (all 13) | Append Section 5b (Planetary Overview — Personality + Design tables). |
| F | Gates (all unique gates, with the synced_block_reference Line Companion content) | Append Section 6 (Gates & Lines Deep Dive — Cross gates, Cross Synthesis, Moon Placements + Synthesis, Nodal Analysis + Synthesis, Hanging Gates by Center, Bridging Priority Summary). **The Line Companion content is freshest at this stage — mine it heavily.** |
| G | (synthesis from all above stages) | Append Section 7 (Themes + Application Layer). Themes draws from the Resonance Note + every prior section. Application Layer draws from everything. |
| H | (recap from build log) | Append Section 8 (Queries Log + Flags & Gaps). |

**Per-stage rules:**
- After each fetch group, immediately write the section(s) the fetch supports. Do not batch multiple fetch groups before any writes.
- After each write, verify file size with `wc -c /tmp/hd-reference-...md`. If a section is creeping past target, tighten before continuing — do not let bloat compound.
- Synthesis subsections (Variable Synthesis, Channel Architecture Summary, Conditioning Summary, Cross Synthesis, Moon Synthesis, Nodal Arc Synthesis) require their upstream subsections done first. Write them at the end of the section they belong to.
- Themes and Application Layer (Stage G) require Sections 1-6 on disk. Do not write them earlier even if context feels generous.

**Why this matters:**
- **Context freshness** for Line Companion mining (the highest-leverage source content).
- **Size budget enforcement** happens section-by-section instead of after 8 sections of accumulated bloat.
- **Auto-compaction resilience** — if the conversation compacts mid-build, sections already on disk are recoverable.

### Step 5: Assemble Reference Body

Structure follows Kaycee's standard (matches the Vandenberg, Waylon reference). Flat headers, no toggles. Two top-level h1 sections: `Data Pass / Activation Filter` and `Session Reference`.

#### Section Structure

```
# Data Pass / Activation Filter
## Chart Summary
## Personality Activations            (the 13-row table built in Step 2)
## Design Activations                 (the 13-row table built in Step 2)
## Unique Gates (N from 26 positions)
## Double Activations (N gates)
## Line Distribution (26 activations)
## Center Distribution
## Circuit Distribution
## Important Dates

# Session Reference
## Basics
   For each of the 6 elements below: write a paragraph or two of analytical prose grounded in the relevant database fetch. Weave in short Ra/DBHD quotes when they sharpen a point. Connect to other chart specifics where relevant.
### Type: <Type>                      — source: Human Design Types DB (NOT Centers, NOT Gates). Discuss aura mechanics, what this means for THIS chart (e.g., MG vs Generator distinction).
### Strategy: <Strategy>              — Strategy field on the Type entry; expand into prose tied to the chart's authority and circuits.
### Authority: <Authority>            — source: Human Design Authorities DB. How decisions land in THIS body.
### Profile: <N/N Name (Angle)>       — source: Human Design Profiles DB; pull both line entries via Personality Line and Design Line relations. How the two lines interact in THIS chart.
### Definition: <Definition>          — source: Human Design Definition DB. What this geometry means; if Split, this section becomes substantial.
### Incarnation Cross: <Full Name>    — source: Human Design Incarnation Crosses DB. The four-gate cross theme woven into the rest of the chart.

## Timeline
### Profile Arc                       — analytical prose on profile-specific life phases (especially 6-line)
### Key Returns                       — Saturn Return, Uranus Opposition, Chiron, 2nd Saturn (dates + age + which have completed/are upcoming + which Profile life phase she's currently in)

## Variables / PHS
### Configuration: <PXX DXX (Arrows)>  — analytical prose on what the arrow configuration means (Focused/Strategic/Receptive/Broad combinations) for THIS chart
### Determination: <Color> — <Tone> — <Direction>  — synthesis grounded in the matching Differentiation Lectures section, applied to this client's body
### Environment: <Color> — <Tone> — <Direction>    — same approach
### Perspective: <Color> — <Tone> — <Direction> — <Distraction>   — same approach
### Motivation: <Color> — <Tone> — <Direction> — <Transference>  — same approach
### Variable Synthesis                — full prose synthesizing all four variables together AND their interaction with the rest of the chart (type, definition, profile, dominant circuits). This is one of the most important synthesis sections — write it carefully.

## Centers
### Defined Centers (N)               — for each defined center: prose covering biology, gates active, channels routing through, what this defined center contributes to the design's broader pattern. Include short DBHD/Ra quotes from Centers DB.
### Undefined Centers (N)             — for each: not-self theme prose grounded in the Centers DB entry, plus chart-specific conditioning vulnerabilities given which gates the chart does have in this center.
### Open Center(s) (N)                — for each: how complete openness operates here, conditioning dynamic in this specific design.
### Conditioning Summary              — synthesis: where this person is most open to conditioning from others, given the open/undefined center pattern.

## Split Definition Deep Dive         — only if Split (Simple or Broad)
   The longest single section if applicable. See "Split Definition" subsection below for the full anatomy.

## Channels
### (G1-G2) Channel Name | Type | Circuit | Keynote
   For each defined channel:
   - Consciousness status (Road / Tunnel / Mixed / Overpass) with planetary attribution per gate
   - Per-gate analytical paragraph: what the planet contributes at that gate.line in this circuit
   - Channel-level synthesis: the channel's full analytical interpretation in the context of the whole chart, including consciousness implications and what this channel produces in lived experience
   - Circuit context: how this channel's circuit (Individual/Collective/Tribal/Integration) shapes its expression for this person
(repeat per defined channel)
### Channel Architecture Summary      — analytical prose tying all channels together. Where energy flows in this design, which channels carry the conscious vs. unconscious load, how the channel mix shapes this person's experience.

## Planetary Overview
### Personality Activations
   For each of the 13 planets, h3 heading using gate-header format:
   `<Planet> - <Gate>.<Line>: <Hexagram Name> | <Line Name> | [Exalted/Detriment] | <Center> | <Quarter>`
   Then **1-2 tight paragraphs** on **what this planet specifically contributes at this gate.line in this chart.** This is the focused contribution — not a re-treatment of the gate or line. The Centers, Channels, Cross, and Gates Deep Dive sections handle the gate-and-line content; Planetary Overview handles the *planetary signature on top of that.*

   What to include per planet:
   - The planet's general theme in one phrase (Sun = life force expression; Saturn = consequence/discipline; Mars = immature energy; etc.)
   - The line's general meaning (from the Line Companion intro paragraph for that line — applies to every placement on that line, regardless of exalt/det status).
   - **Placement × line synthesis**: how this specific planet at this specific line interacts with the line's energy. This is the focused contribution — what does Moon-as-driving-force do at 23.3-Individuality? What does Mercury-as-communication do at 37.2-Responsibility?
   - The chart-specific resonance: how this activation interacts with the rest of the chart (cross gate? multi-activated? in a major channel? part of a doubled-line pair?). Cross-reference the deeper section rather than re-treating it.
   - **Only when the placement is exalted or in detriment**: cite the matching pole's treatment. Apply the Exaltation/Detriment Citation Rule (see "Reference Data" section below).

   What to AVOID per planet:
   - Re-explaining what the gate/line means at length (covered in Gates Deep Dive — keep the line meaning to one sentence here, the synthesis is the focus)
   - Re-explaining what the channel does (covered in Channels)
   - Re-explaining the cross theme (covered in Cross synthesis)
   - Long Ra quotes on the gate (already quoted in Gates Deep Dive)
   - **Quoting exalt/det readings when the placement is neutral on that line.** This is the most common error — see the citation rule. The exalt/det fields in the line table describe the spectrum extremes, not the placement.

   3-4 paragraphs per planet means the section bloats to ~50K chars and re-covers ground. 1-2 tight paragraphs keeps it ~25K chars and complementary to the deeper sections. The exception is the Personality Sun and Personality Earth, which can earn 2-3 paragraphs given their primacy.
### Design Activations                 (same format, 13 planets, same length discipline)

## Gates & Lines Deep Dive
### Incarnation Cross: <Full Name>
   For each of the 4 cross gates: gate-header subheading + 2-4 paragraphs of analytical prose.
   ### Incarnation Cross Synthesis    — full prose synthesizing the four-gate theme as it operates through this chart (cross's quarter mystical theme + how the four gates structure the life)
### Moon Placements
   P Moon and D Moon, each as gate-header subheading + analytical prose on the daily emotional rhythm.
   ### Moon Synthesis                 — synthesis of conscious vs. unconscious emotional life
### Nodal Analysis
   4 nodes (P NN, P SN, D NN, D SN), each as gate-header subheading + analytical prose on direction and inheritance.
   ### Nodal Arc Synthesis            — the karmic past-to-future arc threading through this chart
### Hanging Gates by Center
   Group hanging gates by their center. For each: gate-header subheading + analytical prose on what this hanging gate contributes alone, what it would bridge if its partner were activated by transit/another person.
   ### Bridging Priority Summary      — which hanging gates carry the most leverage for this chart, given its definition geometry

## Themes
   The agent writes Themes as full analytical prose, organized into named patterns. For each subsection, identify 3-5 named patterns that emerge from the chart's specific mechanics. Each pattern gets a bolded name and 1-2 paragraphs of prose explaining how the chart's mechanics produce this pattern. Every claim must trace to fetched source + chart specifics.

**Pattern naming rule.** Names are 2-4 words, punchy, sticky. Like a noun phrase you could say out loud and have it land. Good: "The Splenic Sentinel," "The Sharp Knife," "The Quiet Role Model," "The Non-Collective," "The Prophetic Confessor." Bad: "The Self-Sufficient Hub Who Needs Partners" (sentence, not name), "The Pattern of Recurring Misalignment Through Mental Decision-Making" (descriptive paragraph). If a name needs more than 4 words, the name isn't found yet — keep distilling. The pattern's *mechanical explanation* belongs in the prose; the *name* is the handle.

**Absent circuit families are Themes, not Flags.** When a chart has no Collective channels, no Individual channels, or no Tribal channels (any one of the three families absent), this is a structural fact about the person — not a build-process gap. Surface it as a Pattern with a name like "The Non-Collective" or "The Non-Tribal" and explain what the absence means for the chart's contribution shape (e.g., not built for collective discourse / not built for tribal organization / not built for individual mutation, depending on which family is missing). Two-of-three-families absent is rarer and even more structurally significant — name it accordingly.

### Gifts                              — patterns the design is built to express well, named and explained
### Challenges                         — friction points the design produces, with the mechanical reason for each
### Patterns                           — recurring dynamics across the chart (e.g., circuits cooperating, definition geometry effects, absent circuit families)
### Paradoxes                          — places where the chart contains tensions that resolve only with strategy/authority
### Karmic Curriculum                  — what this design is here to learn/embody, grounded in cross + nodal arc + open centers
### Conditioning Vulnerabilities       — where the chart is most porous to outside influence (open/undefined centers, broad split bridging territory)

## Application Layer
   Practical synthesis of how this person should live the design. All three subsections are full analytical prose grounded in everything compiled above.
### For the Reading (Key Talking Points)   — what Kaycee should anchor the live reading on, given what the chart shows
### For the Client (Practical Guidance)    — daily-living guidance specific to this chart's mechanics
### Composite Preview (for Partnership)    — what this design carries into relationships, useful for any future partnership/composite analysis

# Queries Log
A complete enumeration of every Notion query executed during the build, in this format:
- `<database name>` — search query → fetched page IDs: <list>

# Flags & Gaps
Assemble fresh at the end of Step 5 by reviewing the *current* reference body. Do NOT carry forward flags from earlier turns or from notes accumulated during the build. A flag belongs in this section only if it describes a real, currently-unresolved issue at write time. Resolved issues, fixed typos, and corrected schema entries do not get flagged.
```

#### Standardized Header Formats

**Gate headers** (Planetary Overview, Cross, Moon, Nodes, Hanging Gates):
```
<Planet> - <Gate>.<Line>: <Hexagram Name> | <Line Name> | [Exalted | Detriment] | <Center>
```
Examples:
- `Sun - 58.5: The Joyous | Defense | Detriment | Root`
- `Saturn - 47.4: Oppression | Repression | Exalted | Ajna`
- `Mars - 4.1: Youthful Folly | Pleasure | Ajna`

Only include "Exalted" or "Detriment" when the activation carries one. Omit for neutral. Use full hexagram and line names from source material.

**Channel headers**:
```
(<Gate1>-<Gate2>) <Channel Name> | <Type> | <Circuit> | <Keynote>
```
Examples:
- `(16-48) Channel of the Wavelength | Projected | Collective Logic | Sharing`
- `(59-6) Channel of Mating | Generated | Tribal Defense | Support`

Type = Generated / Projected / Manifested.
Keynote = Sharing / Support / Empowerment / Self-empowerment.

#### Source Material Citation Format

Each H3 subsection that draws on source material gets ONE citation at the end of the subsection, on its own line:
```
[Source: <notion-page-id>]
```
For sections drawing on multiple pages (e.g., a Variable Synthesis section that pulls from Differentiation Lectures + multiple Centers), use a single line listing all page IDs:
```
[Source: <id1> | <id2> | <id3>]
```
Inline `[Source: ...]` after every paragraph creates visual noise without adding fidelity. The audit verifies fetches happened; per-paragraph citation isn't required.

If the agent quotes source material from a page that wasn't fetched in Step 4, that's a bug. The fetch-to-citation traceability is non-negotiable.

#### Save the Assembled Reference

The /tmp file is built incrementally per the Step 4+5 Streaming-Write Protocol above. Each fetch stage is followed immediately by Write/Edit calls that add the corresponding section(s). Never write the full body in a single Write call — large files (>40KB) silently truncate.

**File path**: `/tmp/hd-reference-<lastname>-<YYYYMMDD>.md`

**Mechanics:**
- Stage A produces the initial Write call (Section 1: Data Pass / Activation Filter, then Section 2 appended).
- All subsequent stages produce Edit appends. For each Edit append, use `old_str` matching the last line of the current file and `new_str` containing that last line + the new section content.
- After each write, verify file size with `wc -c /tmp/hd-reference-...md` to track size budget.

This file is the recovery artifact and the input the audit sub-agent will read. Final size should be 60–100KB. If the chart is unusually rich (multi-doubled gates, all-cross-gates-in-one-center, populated undefined centers, etc.), the file may legitimately exceed 100KB — but compress where you can; cross-section synthesis is intentional reinforcement, not bloat to repeat at length.

### Step 6: Audit (Sub-Agent)

Spawn an Agent with `subagent_type: general-purpose`, fresh context. The audit prompt is at `~/.claude/skills/hd-phase1-build/audit-prompt.md` — read it and pass it to the sub-agent along with:
- Path to the chart PDF
- The original chart text data (verbatim)
- Path to the saved reference file at `/tmp/hd-reference-...md`

The sub-agent's job is purely chart-data-to-reference matching: every fact in the source data must appear correctly in the reference. It does NOT re-query Notion source material. It returns a structured diff table.

### Step 7: Audit Review Checkpoint

Show Kaycee the audit report. If clean, proceed to Step 8. If mismatches, fix them in the reference file, re-run the audit, then proceed.

### Step 8: Write Body Into the Blank Reference Page

The page already exists (Kaycee created it and linked it as input). Use `notion-update-page` to fill it in. **Do not create a new page.**

**Body must be written in 5 chunks.** A single `replace_content` with the full reference will silently truncate. Use the sentinel pattern below.

**Chunk boundaries** (use these exact splits):
1. Data Pass + Basics + Timeline (through end of `## Timeline`)
2. Variables / PHS (the entire `## Variables / PHS` section)
3. Centers + Split Definition Deep Dive + Channels (through end of `## Channels`)
4. Planetary Overview + Gates & Lines Deep Dive (through end of `## Gates & Lines Deep Dive`)
5. Themes + Application Layer + Queries Log + Flags & Gaps

**Sentinel pattern:**

**Call 1** — `replace_content` with chunk 1 content, ending with the literal line `<!-- CHUNK_END_1 -->` on its own line.

**Calls 2–5** — `update_content` with one operation per call:
- `old_str`: `<!-- CHUNK_END_<N-1> -->`
- `new_str`: chunk N content + `<!-- CHUNK_END_<N> -->` (final chunk omits the trailing sentinel)

Final call must remove or omit the last sentinel so the page has no leftover `<!--` markers.

Do not ask for confirmation between chunks. Run all 5 sequentially. Verify after the last chunk by fetching the page and grep'ing for `CHUNK_END` (should be 0 matches).

If the page already has substantive content (caught at Step 1), do NOT proceed without Kaycee's confirmation.

**Properties update.** After all 5 body chunks are written, use `command: "update_properties"` with:
- `Type`: one of [Generator, Projector, Manifestor, Manifesting Generator]
- `Profile`: matching profile string from schema
- `Authority`: one of [Splenic, Sacral, Emotional, Ego Projected, Sounding Board]
- `Definition`: one of [Single, Split (simple), Split (Broad), Triple, Quadruple]
- `Incarnation Cross`: JSON array with the matching cross name
- `Analysis Type`: `Individual` (composite is a separate skill)
- `Analysis Level`: `Full` (always; do not ask)
- `Status`: `Ready for Reports`

**Properties the agent must NOT touch:**
- `Name` — Kaycee sets the title when she creates the page; don't overwrite
- `Variable` — Kaycee pre-tagged this; the agent reads it but never writes it
- `Bodygraph Link` — Kaycee fills this in herself

After both updates complete, return the page URL to Kaycee with a note confirming what was set vs. left alone.

## Reference Data

### Notion Database Collection IDs

These are data source IDs (not page IDs). Verified 2026-05-07.

| Database | Used For | Collection ID |
|----------|----------|--------------|
| Reference Files | Output (new page goes here) | `collection://31ce3fad-caaa-80c7-88c8-000b46208863` |
| Human Design Types | Type / Strategy source (Generator, Manifestor, Projector, MG) | `collection://270e3fad-caaa-80ed-83a4-000bd1c91dd8` |
| Human Design Profiles | Profile source (3/5, 4/6, etc., with relations to per-line entries) | `collection://270e3fad-caaa-8065-ae54-000b4b3de308` |
| Human Design Authorities | Authority source (Splenic, Sacral, Emotional, Ego Projected, Sounding Board) | `collection://270e3fad-caaa-80c3-a9b8-000b6877014f` |
| Human Design Definition | Definition source (Single, Split simple, Split Broad, Triple, Quadruple) | `collection://270e3fad-caaa-802d-9d68-000b701e5160` |
| Human Design Gates | Gate AND line content (line content is in the page body) | `collection://268e3fad-caaa-805b-90e7-000b2a86a18b` |
| Human Design Channels | Channel source | `collection://268e3fad-caaa-801c-9f00-000b4a1a601b` |
| Human Design Centers | Center source (defined / undefined / open language) | `collection://268e3fad-caaa-811d-a4a5-000b3371cf0e` |
| Human Design Circuits | Circuit groups (Individual / Collective / Tribal / Integration) | `collection://26ce3fad-caaa-8020-8215-000bb9a8e2bd` |
| Human Design Incarnation Crosses | Cross source | `collection://26ce3fad-caaa-80ed-b5ac-000b95a88768` |
| Human Design Planets | Planet source for the 13 planetary activations (used in Planetary Overview) | `collection://26ce3fad-caaa-80a7-a363-000b711da6c6` |
| HD Quarters | Quarter source (Initiation / Civilization / Duality / Mutation) | `collection://325e3fad-caaa-8070-9d7c-000be6bdd57a` |
| HD Variable Configurations | **Primary Variables source.** 16 configuration pages (PLL DLL, PLL DLR, … PRR DRR), one per possible arrow combination. Each contains Ra-direct lecture content on the structural meaning of that configuration. Always fetch the chart's configuration page first; it is the spine of the Variables section. | `collection://32ee3fad-caaa-80e1-b289-000bf40710f1` |
| The Differentiation Lectures (page, not database) | Secondary Variables source for per-Color, per-Tone, per-Direction detail layered on top of the configuration teaching. Continuous Ra transcript across 4 main toggles. | page id `32de3fadcaaa80cb89e6ddbb8dd09112` |

**Where Line Companion content lives:**
- It is INSIDE the Gates DB page body as a `<synced_block_reference>` block containing per-line `<details>` toggles. Do NOT query a separate Line Companion database — the standalone DB is deprecated. The synced block inside the gate page IS the Line Companion content and must be mined per placement (see Step 4 gate-fetch instructions).

**Wrong-database failure mode (the "Manifestor from Throat page" bug):**
If you can't find Type, Profile, or Authority info in their dedicated databases above, do NOT fall back to extracting it from a Centers page or a Gates page. The Centers page for the Throat does not contain Manifestor source material — it contains Throat-as-center source material. Mark `[GAP]` and continue. The dedicated database is the only valid source.

### Circuit Reference

**Integration** (standalone): 57/20, 57/10, 57/34, 34/20, 34/10, 10/20. Keynote: Self-empowerment.

**Individual Group** (Empowerment):
- Knowing: 61/24, 43/23, 57/20, 22/12, 1/8, 14/2, 60/3, 38/28, 39/55
- Centering (minor): 34/10, 51/25

**Collective Group** (Sharing):
- Logic/Understanding: 63/4, 17/62, 48/16, 58/18, 52/9, 5/15, 7/31
- Sensing/Abstract: 64/47, 11/56, 36/35, 41/30, 13/33, 29/46, 53/42

**Tribal Group** (Support):
- Ego: 21/45, 44/26, 37/40, 19/49, 54/32
- Defense (minor): 59/6, 27/50

### Channel Consciousness Framework

For every defined channel, derive consciousness status:
- **Road**: both gates Personality only (fully conscious)
- **Tunnel**: both gates Design only (fully unconscious)
- **Mixed**: one gate P only, one gate D only
- **Overpass**: at least one gate has BOTH P and D activations

Internal shorthand only — fine in the reference, not used in Phase 2 reports.

### Split Definition: What to Compile

If the chart has Simple or Broad Split, add a `## Split Definition Deep Dive` section after Centers with:

- The exact islands (which centers in each, connected by which channels)
- Bridge gate identification: every gate that, if activated by transit or another person, would bridge the split. Pull the Gates entry for each.
- Centers entries for every undefined center sitting in the bridging territory
- Any source material from Channels, Centers, or the Definition database that explicitly addresses Split Definition, Simple Split, or Broad Split (note: line-companion content lives inside Gates DB page bodies as synced_block_reference, not a separate database)
- Source material on Solar Plexus, authority, and the relevant Variable configuration if they interact with the split
- Full analytical prose (the agent writes it, grounded in fetched source) covering: the felt experience of the gap, conditioning dynamics through the bridging territory, which island generates decisions, relationship implications, and the Simple-vs-Broad psychological distinction (Simple Split → internalization "something is wrong with me"; Broad Split → externalization "something is wrong with them" / cycling through partial bridges). This dynamic must be named explicitly.

This section will be the longest in the reference because it carries the most source material, not because the agent writes the most prose.

### Exaltation / Detriment Citation Rule

Two distinct things share the words "exalt/det" — keep them straight:

1. **The chart's Exalt/Det marking on a placement.** Calculated by the chart software from the planet's astrological position at birth. Tells you whether THIS placement reads at the exalted pole, detriment pole, or neither (blank/neutral). Independent of the placement planet's identity — any planet can land on a gate.line and read as exalted, detriment, or blank in a given chart.
2. **The Line Companion's exalted-planet / detriment-planet fields on a line.** These are the *keying planets* — they identify which planet's energy *characterizes* each pole when expressed. They are the shape of each pole, not a gate that decides whether to cite it.

**The trigger for citing a pole is the chart's marking, not planet-identity matching.**

**The rule:**

- **Marked Exalted in the chart → cite the exalted pole's Line Companion treatment**, applied to the placement planet's expression.
- **Marked Detriment in the chart → cite the detriment pole's Line Companion treatment**, applied to the placement planet.
- **Blank/neutral in the chart → neutral synthesis**: line's general-meaning paragraph from the Line Companion + placement planet's general theme + chart-specific resonance (cross gate? in a defined channel? doubled-line? part of nodal arc?). Do not cite either pole.
- **Never name the keying planet in client-facing prose.** Clients see "Mars at 10.1 expresses the detriment pole's [pole-character]" — never "Mars reads the Moon-detriment pattern on 10.1." The keying planet is internal reference for understanding the pole's character; the client encounters their own placement planet expressing that character.
- **Never cite the opposite pole for contrast.** If the placement is marked Detriment, do not also cite the exalted pole "for balance."
- **Optional brief framing for neutral placements**: a single sentence noting the line's spectrum extremes can sharpen a neutral synthesis. Don't elaborate the poles. Most of the time, omit the framing entirely.

**Examples (the chart marking is the trigger):**

- P Mars 10.1 marked Detriment → cite the detriment pole's treatment, apply to Mars-at-10.1. Keying planet not named.
- P Earth 46.4 marked Exalted → cite the exalted pole's treatment, apply to Earth-at-46.4. Keying planet not named.
- P Sun 25.4 marked blank → neutral synthesis. No pole citation.

**Same-planet-doubled placements.** When the same planet is doubled on the same gate.line in both Personality and Design (e.g., P Pluto 44.5 + D Pluto 44.5), the doubling marks that gate as the chart's most fixed signature. If both placements are marked Exalted (or both Detriment), the pole becomes the chart's most-fixed-truth-signature on that gate — treat accordingly. Doubled-but-blank still carries structural significance without a pole citation; flag the doubling without naming a keying planet.

### When the Placement IS Exalted or in Detriment — Source Threads to Pull

When the chart marks the placement as Exalted or Detriment, pull these threads from the gate page synced_block_reference:

1. The line's general meaning paragraph (from the Line Companion intro at the top of the line's `<details>` toggle).
2. The treatment of the pole the chart marks (exalt OR det — only the one the chart specifies; not the opposite pole, not both).
3. Any Ra anecdotes or developmental mandates in the line's toggle that contextualize the placement.
4. Type/Strategy/Authority source material relevant to navigating the placement (from Type / Authority pages already fetched).

Apply the pole's character to the placement planet's expression. Do NOT name the keying planet (the planet the Line Companion identifies as exalter or detrimenter on the line) in client-facing prose. Synthesis is Kaycee's. Do not paraphrase or soften the source quotes.

## Anti-Drift Reminder

You will be tempted to fill in gate, line, channel, center, or cross descriptions from training data, especially after the first 5-10 successful queries when the pattern feels obvious. **Do not.** Every quoted source block must trace to a fresh Notion fetch in this conversation. The Notion databases are the only source of truth. Generic HD content from training is wrong for this practice.

If you find yourself about to write source material without having fetched it in Step 4, stop and fetch it.

## Common Regression Patterns (catch these in self-review)

These are the failure modes that have been observed in past builds. Watch for them; if you catch yourself doing one of these, the section is wrong and needs revision before continuing.

1. **Citing pole readings on chart-blank placements, or omitting them on chart-marked placements, or naming the keying planet in client-facing prose.** The chart's Exalt/Det marking on the placement is the trigger — not planet-identity matching against the Line Companion's keying planet. Marked Exalted/Detriment → cite the matching pole and apply it to the placement planet. Blank → neutral synthesis. Never name the keying planet (the planet the Line Companion identifies as exalter or detrimenter) in client-facing prose. See the Exaltation/Detriment Citation Rule.
2. **Working from the line table summary instead of the Line Companion synced block.** The line table is a 2-3 word compressed summary. The synced_block_reference toggles contain Ra-direct teaching with line meaning, developmental mandates, generational notes, and lived examples. Mining only the table produces synthesis at table-summary depth.
3. **Fetching all sources up front and writing all 8 sections at the end.** By section 6+, early-fetched content has been pushed back in context and risks partial drop during auto-compaction. Use the Streaming-Write Protocol — fetch, write, fetch, write.
4. **Fabricating from training data.** Generic HD content from training is wrong for this practice. Every claim about a gate/line/channel/center/cross/planet must trace to a Notion fetch in this conversation.
5. **Filling gaps with what "sounds right."** When a fetch returns sparse content, mark `[GAP: <reason>]` and continue. Do not generate substitute content.
6. **Skipping the audit step or treating its diff table as advisory.** The audit catches chart-data drift; mismatches are non-negotiable to fix before Notion write.
