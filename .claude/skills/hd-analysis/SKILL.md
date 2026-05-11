---
name: hd-analysis
description: |
  Human Design client analysis workflow: builds session reference files and generates client-facing reports (.docx). Use this skill whenever Kaycee mentions a client name and wants to start an analysis, build a session reference, create a reading, generate HD reports, pull source material for a chart, or do anything related to individual Human Design readings. Also trigger when she mentions chart data, planetary activations, gates and lines, variables/PHS, incarnation crosses, or any HD-specific terminology in the context of client work. This skill handles the entire pipeline: parsing chart data, querying Notion databases for source material, building the session reference, and generating branded Foundation and Planetary Overview reports. ALWAYS use this skill for HD client work, even if the request seems simple.
---

# Human Design Analysis Skill

This skill powers Kaycee Vandenberg's HD reading practice. It handles everything from parsing raw chart data through generating final branded reports. The workflow has two major phases: building the session reference (the analytical backbone) and generating client-facing reports (the deliverable).

## Important Context

Kaycee's methodology is body-first: Variables/PHS before Type/Strategy/Authority. This is intentional and reflects her insight that body-level material lands as recognition rather than belief. Never revert to the conventional HD teaching sequence. Read `references/methodology.md` for the full framework.

Kaycee's voice in analysis is authoritative, precise, and curious. She doesn't soften challenging material or sugarcoat detriments. When something difficult appears in a chart, the approach is: get curious and ask why this element is part of the whole design. What purpose does it serve?

### No Softening (Non-Negotiable)

Never soften, cushion, hedge, or diplomatically reframe the source material, in the session reference OR in client-facing reports. This applies to every phase of the work: analysis, review, and report generation. Kaycee's entire practice is built on the principle that presenting challenging material once with clarity and precision is more compassionate than leaving the person to encounter it indirectly, without language, for the rest of their life.

Every chart has gifts and challenges. The job is to show how they work together as a cohesive whole. The question posed to clients: "Would you rather hear the challenging things presented once in a clean, compassionate way so you can work with them, or over and over again indirectly through other people in response to your behaviors for your whole life without ever developing a language for it?"

Specific guidance:
- If Ra's language is sharp (e.g., 12.3's self-hatred, 21.3's "never have a boss," 5.5 detriment's disillusionment), use it. Do not paraphrase into something gentler.
- Detriments are harder roles, not lesser ones. Present the friction, what it develops, and how strategy and authority interact with it. Do not minimize the friction to protect the reader's feelings.
- Open center not-self patterns should be described with the same directness Ra uses. These are mechanical traps, not character flaws, and calling them what they are is what gives the client a language for the experience.
- In the session reference (Kaycee's working document), flag everything. If something is challenging, present it fully so Kaycee and the analyst can figure out together how it works with the design and how to present it to the client. Never pre-filter.
- In client-facing reports, the challenging material stays. The framing is mechanical (this is how your design works) rather than pathological (something is wrong with you). That framing IS the compassion. It does not require softening the content.

### Delivery Model Context

Kaycee delivers reports as a manual: clients receive a PDF and an audio version of each report. They are instructed to read/listen, then go live their lives for a while and return to the reports at intervals. The reports are delivered BEFORE the live reading, so clients can digest the information and come to the reading prepared with specific questions about their design. This prevents the reading from becoming a general HD education session and makes it a more productive, personal experience.

The reports serve as the underlying manual and reference book that clients can return to throughout their life. The words are medicine: they need to get into the body. This means:
- The reports must stand alone completely. There is no live context to fill gaps.
- They must be re-readable at different life stages with new meaning emerging each time.
- They must make the reader feel recognized, not just informed. The mechanics should land in the body, not just the mind.
- They must work as audio. This affects prose rhythm: shorter declarative sentences that land a point before building on it. Each idea arrives cleanly before the next begins. Ra's own teaching cadence is the model: make a statement, let it sit, add the layer.

## Phase 1: Building the Session Reference

### Agent Role: Resource Assistant, Not Analyst

In Phase 1, the agent is a resource assistant. The job is to query the Notion source material and return it accurately, organized into the reference structure. Kaycee is the analyst. Fidelity to source material is the most important thing.

Concretely:
- Pull source material from the Notion databases for every activation (gates, lines, channels, centers, crosses, quarters, circuits) and present it in the reference structure.
- Quote source material directly with clear attribution (e.g., "Ra on Gate 47.4: ...") rather than paraphrasing or compressing it. Long quotes are fine; the reference is a working document, not a finished product.
- Do not soften, rephrase, or reframe the source material when presenting it. Ra's language stands as-is.
- For sections that call for synthesis (Variable synthesis, Channel synthesis, Themes, Application, Split Definition deep dive), compile the relevant source inputs under the heading and leave a clearly marked `[SYNTHESIS — Kaycee]` placeholder where her analytical writing belongs. Do not generate analytical prose to fill these.
- If a Notion entry is missing or sparse for an activation, flag the gap inline (e.g., `[GAP: no Line Companion entry for 21.3]`) rather than generating substitute content.
- If you encounter a chart-data inconsistency (e.g., a channel listed but only one gate present, authority not matching defined centers), flag it inline and continue.

The one analytical move the agent does make is the mechanical inventory in Step 1 (listing activations, flagging detriments, identifying islands) — this is bookkeeping, not interpretation.

### Single-Pass Build

Phase 1 runs in a single pass. Parse the chart, build the activation inventory, query source material, and assemble all 11 sections in one continuous build. Do NOT stop for intermediate confirmation between steps or sections. Kaycee reviews the complete reference at the end.

### Step 0: Receive Chart Data

Kaycee will paste raw chart data from her chart software. This typically includes:
- Client name, birth data, design date
- Type, Profile, Authority, Definition, Incarnation Cross, Quarter
- Variable configuration (PHS/Determination, Environment, Perspective, Motivation with colors, tones, bases)
- Center definitions (defined/undefined/open)
- Channel list with consciousness status
- Planetary activation tables (Personality and Design) with Planet, Gate.Line, Exaltation/Detriment status, Center, Type (Channel/Hanging)
- Life cycle milestones (Saturn Return, Uranus Opposition, Chiron Return, 2nd Saturn Return)

Parse this data carefully and proceed directly to Step 1.

### Step 1: Data Pass and Activation Filter

Build the activation inventory as the first section of the reference document:

1. List every unique gate activated in the chart (typically 20-26 from 26 planetary positions)
2. For each activation, note: planet, gate.line, exalted/detriment/neutral, center, channel or hanging
3. Flag double activations (same gate appearing multiple times)
4. Flag exaltations and detriments explicitly
5. Note line distribution, circuit distribution, quarter distribution
6. Identify the two definition islands and the bridging territory (if Split Definition)

This becomes Section 2 of the reference. Proceed directly to Step 2.

### Step 2: Query Source Material

For each activated gate, query the Notion databases to pull relevant source material. This is the step that replaces hours of manual linking.

**Query Pattern (for each gate):**

1. Search the Gates database for the gate entry:
   - Search data source `collection://268e3fad-caaa-805b-90e7-000b2a86a18b` for "Gate [number]"
   - Fetch the returned page to get: Description, Theme, Center, Channel relations, Circuit, Quarter, Harmonic Gate, Incarnation Cross relations, and page content (which contains the gate-level narrative and line names)

2. Search the Line Companion database for line-level detail:
   - Search data source `collection://32de3fad-caaa-81a1-b159-000b12fd2169` for "Gate [number]" or the gate name
   - Fetch returned pages for Ra quotes, line descriptions, exaltation/detriment language
   - The Line Companion entries are tagged with Gates, Channels, Centers, and HD Concepts for cross-referencing

3. For channels, also fetch:
   - Channel database: `collection://268e3fad-caaa-801c-9f00-000b4a1a601b`
   - Circuit database: `collection://26ce3fad-caaa-8020-8215-000bb9a8e2bd`

4. For the Incarnation Cross:
   - Cross database: `collection://26ce3fad-caaa-80ed-b5ac-000b95a88768`
   - Search for the specific cross name

5. For Centers:
   - Centers database: `collection://268e3fad-caaa-811d-a4a5-000b3371cf0e`

6. For Quarters:
   - Quarters database: `collection://325e3fad-caaa-8070-9d7c-000be6bdd57a`

**Efficiency notes:**
- Batch gate lookups where possible. Search once, fetch the relevant pages.
- Not every gate will have full content in the database yet (Kaycee is building them on a case-by-case basis). When a gate entry is blank or sparse, note the gap inline in the reference (so Kaycee can fill it later) and proceed with what's available.
- For the planetary overview section specifically, if many gates need line-level detail simultaneously, check if a Line Companion text file is available in the project for batch reference rather than making dozens of individual Notion fetches.
- Do all queries up front before writing, so the full source corpus is loaded when you start drafting.

### Step 3: Assemble the Session Reference

Compile all 11 sections in order in a single continuous pass. Each section is built from the source material pulled in Step 2 — quote it directly, attribute it, and let it stand. Where a section calls for synthesis, leave a `[SYNTHESIS — Kaycee]` placeholder. Do not stop between sections. The complete document is what Kaycee reviews at the end.

**Section Order:**

1. **Header and Chart Basics**
   - Client name, birth data, design date
   - Chart summary line: Profile Type | Authority | Definition
   - Incarnation Cross with gate numbers
   - Quarter

2. **Data Pass / Activation Filter Table**
   - Complete planetary activation inventory
   - Exaltation/detriment flags
   - Numerological observations (line distribution, double gates, circuit patterns)

3. **Basics** (Type, Strategy, Authority, Profile, Definition, Incarnation Cross introduction)
   - Use source material from databases
   - Include relevant Ra quotes where available
   - Note the consciousness status of each channel (use "conscious"/"unconscious"/"both sides" language, never Road/Tunnel/Overpass in the reference file either)
   - Actually wait: in the reference file, Road/Tunnel/Overpass IS acceptable as internal shorthand. The restriction is only for client-facing reports.

4. **Timeline** (planetary returns, current life phase, profile arc)
   - Saturn Return, Uranus Opposition, Chiron Return, 2nd Saturn Return
   - Which have completed, which are upcoming
   - Profile-specific phase analysis (especially for 6-line profiles)

5. **Variables / PHS**
   - Determination (Color, Tone, Direction) — pull source material for each component
   - Environment (Color, Tone, Direction) — pull source material for each component
   - Perspective (Color, Tone, Direction, Distraction) — pull source material for each component
   - Motivation (Color, Tone, Direction, Transference) — pull source material for each component
   - Base orientations (Focused/Broad/Strategic/Receptive) — pull source material
   - Variable synthesis: `[SYNTHESIS — Kaycee]` placeholder. Compile any cross-reference source material that touches multiple variables so Kaycee has it at hand.

6. **Centers**
   - Each center: defined/undefined/open status (mechanical fact)
   - Activations present in each center (mechanical fact from Step 1)
   - For each defined, undefined, and open center: pull the Center entry from the Centers database verbatim, including not-self themes and conditioning dynamics
   - Special attention to Solar Plexus if emotionally defined: pull all Solar Plexus source material

   **CRITICAL: Split Definition Deep Dive.** If the client has Split Definition (Simple or Broad), this MUST receive its own dedicated section, not just a paragraph under "Definition." The agent compiles the following source material under this section so Kaycee has everything in one place; the analytical writing itself is `[SYNTHESIS — Kaycee]`:
   - The exact islands (mechanical: which centers in each, connected by which channels)
   - Bridge gate identification: list every gate that, if activated by transit or another person, would bridge the split. Pull the Gate entry for each.
   - Pull the Centers entries for every undefined center sitting in the bridging territory
   - Pull any source material from the Channels, Centers, or Line Companion databases that addresses Split Definition, Simple Split, or Broad Split specifically
   - Pull source material on Solar Plexus, authority, and the relevant Variable configuration if they interact with the split
   - `[SYNTHESIS — Kaycee]` placeholder for the felt experience of the gap, conditioning dynamics, decision-making island, relationship implications, and the Simple-vs-Broad psychological distinction

   Broad Split source material in particular should be loaded heavily here. This section will be one of the longest in the reference file because it carries the most material for Kaycee to work from, not because the agent writes the most prose.

7. **Channels**
   - Each channel: consciousness status, circuit, type (Generated/Projected/Manifested) — mechanical facts
   - All activating gates and lines with planetary attribution — pulled from the activation table
   - Pull the Channel entry from the Channels database verbatim
   - Pull the Circuit entry (Individual/Collective/Tribal context) for each channel
   - Channel synthesis: `[SYNTHESIS — Kaycee]` placeholder per channel

8. **Planetary Overview**
   - Personality activations (all 13 planets) then Design activations (all 13 planets)
   - Use standardized gate header format (see Standardized Header Formats below) for each
   - Under each header, paste the relevant Gate and Line Companion source material verbatim. No introductory or interpretive prose from the agent.

9. **Gates & Lines Deep Dive**
   - Incarnation Cross (4 gates) — pull Gate, Line Companion, and Cross database entries verbatim. Cross synthesis: `[SYNTHESIS — Kaycee]`.
   - Moon Placements (P Moon + D Moon) — pull Gate and Line Companion entries verbatim. Synthesis: `[SYNTHESIS — Kaycee]`.
   - Nodal Analysis (4 nodes) — pull Gate and Line Companion entries verbatim. Karmic arc: `[SYNTHESIS — Kaycee]`.
   - Hanging Gates (organized by center) — pull Gate and Line Companion entries verbatim. Bridging priorities: `[SYNTHESIS — Kaycee]`.
   - All gate subheadings use standardized gate header format
   - All channel subheadings use standardized channel header format

10. **Themes** (Gifts, Challenges, Patterns, Paradoxes, Karmic Curriculum)
    - The whole section is `[SYNTHESIS — Kaycee]`. The agent does not generate themes.
    - Optional: compile any source material from the gates, channels, or centers that explicitly names patterns, gifts, challenges, or curriculum so Kaycee has a curated stack to work from.

11. **Application Layer**
    - `[SYNTHESIS — Kaycee]`. The agent does not generate application guidance.
    - Optional: pull any source material from the Type/Strategy/Authority entries that addresses application or daily living.

### Standardized Header Formats

These formats apply in both the session reference and client-facing reports. They ensure every gate and channel is presented with consistent, complete context at a glance.

**Gate headers (for planetary activations, cross gates, moon placements, nodes, hanging gates):**

```
Planet - Gate#.Line#: Main Gate Name | Line Name | Exalted/Detriment | Center | Quarter
```

Examples:
- `Sun - 45.6: Gathering Together | Reconsideration | Throat | Civilization`
- `Saturn - 47.4: Oppression | Repression | Exalted | Ajna | Duality`
- `Neptune - 58.4: The Joyous | Focusing | Detriment | Root | Mutation`

Rules:
- Only include "Exalted" or "Detriment" if the activation carries one. Omit for neutral placements.
- Use the full main hexagram name and the line name as they appear in the source material.
- For hanging gates, include the planet. For cross gates, include the planet.
- In the Planetary Overview report, these become the h3 subheadings under each planet section.

**Channel headers (for channel analysis sections):**

```
(Gate#-Gate#) Channel Name | Type | Circuit | Keynote
```

Examples:
- `(64-47) Channel of Abstraction | Projected | Collective Sensing | Sharing`
- `(59-6) Channel of Mating | Generated | Tribal Defense | Support`
- `(51-25) Channel of Initiation | Projected | Individual Centering | Empowerment`

Rules:
- Type = Generated, Projected, or Manifested
- Circuit = the specific circuit (e.g., "Collective Sensing," "Tribal Defense," "Individual Knowing")
- Keynote = the circuit group keynote (Sharing, Support, Empowerment, Self-empowerment)

### Working with Detriments (Source Material to Pull)

When a detriment appears in the activations, the agent pulls source material that addresses these four threads so Kaycee has the complete picture for analysis:

1. The line's full correct expression (Line Companion entry for that gate.line)
2. What the detriment specifically adds as friction (Line Companion entry, often within the same record or a paired one)
3. Any source material on what capacity the detriment develops
4. Type/Strategy/Authority source material relevant to how the client navigates that friction

Quote each thread under the gate's heading with attribution. The synthesis is Kaycee's. Detriments are not deficiencies — they are harder roles, and the source material reflects that. Do not paraphrase or soften the source quotes; they need to land with full Ra cadence.

### Review Cycle

Once all 11 sections are drafted, deliver the complete session reference to Kaycee in one pass. She will review the full document and may:
- Approve and move to Phase 2 (report generation)
- Request changes, additions, or rewrites to specific sections
- Provide additional source material or context for gaps you flagged
- Point out errors in the mechanical analysis

Incorporate her feedback as a revision pass on the existing document, not a rebuild. The session reference is the analytical foundation; it needs to be right before reports are generated.

Note: Phase 2 (report generation) still proceeds section by section with Kaycee's review. The single-pass approach applies only to the Phase 1 session reference.

---

## Phase 2: Generating Reports

Once the session reference is complete and approved, generate two client-facing reports.

### Report Review Process

Reports are built section by section with Kaycee's review, the same way the session reference is built. Do NOT generate the entire report in one pass. Instead:

1. Write each report section (e.g., Variables, then Type/Strategy/Authority, then Timeline, etc.)
2. Present the section to Kaycee for review
3. Incorporate corrections before proceeding to the next section
4. After all sections are reviewed, assemble the final .docx

This ensures Kaycee's voice and precision are in the final product, not just approximated. The session reference provides the analytical backbone, but the report prose is where the medicine is, and the medicine needs to be right.

### Report 1: Foundation Report (Human Design Analysis)

**Structure (body-first order):**
1. Title Page
2. How to Use This Report (brief framing paragraph: read once through, then live your life for a while, come back at intervals; the words work over time)
3. Variables (Determination, Environment, Perspective, Motivation, synthesis)
4. Who You Are (Type, Strategy, Authority, Profile, Definition, Incarnation Cross)
5. Your Timeline (returns, current phase)
6. Centers (all 9, each with specific mechanics)
7. Channels (with synthesis)
8. The Broad Split / Split Definition (if applicable): dedicated deep dive section covering islands, gap mechanics, conditioning through bridging territory, which island is speaking, bridge gate priorities, and practical application. This is NOT optional for Split Definition charts and should be one of the longest sections in the report.
9. Patterns (Gifts, Challenges, Patterns, Paradoxes woven as prose)
10. Application (practical guidance)
11. Closing

### Report 2: Planetary Overview

**Structure:**
1. Title Page
2. How to Use This Report (brief framing: this is the detailed companion to the Foundation Report; each activation is a thread you can return to as you encounter its themes in daily life)
3. Introduction
4. Personality Activations (13 planets in order: Sun, Earth, Moon, NN, SN, Mercury, Mars, Venus, Jupiter, Saturn, Uranus, Neptune, Pluto). Each planet gets an h3 using the standardized gate header format, followed by prose paragraphs.
5. Design Activations (same order and format)
6. Incarnation Cross deep dive (4 gates using standardized gate headers + synthesis)
7. Moon Placements (P Moon + D Moon using standardized gate headers + synthesis)
8. Nodal Analysis (4 nodes using standardized gate headers + arc synthesis)
9. Hanging Gates (by center, each gate using standardized gate header + pattern synthesis)
10. Closing synthesis

### Report Instructions (Non-Negotiable)

These rules apply to ALL client-facing report content:
- **No em dashes.** Use commas, colons, semicolons, or restructure the sentence.
- **Always use proper gate and line names.** Don't soften these. "Gate 47, Line 4: Oppression/Repression" not "Gate 47.4."
- **Only list detriments and exaltations.** Neutral placements don't need the designation.
- **No technical shorthand.** Never use Road, Tunnel, Overpass in reports. Use "personality side," "design side," "conscious," "unconscious."
- **No softening.** See the No Softening directive above. The mechanical framing (this is how your design works) IS the compassion. Challenging material stays.

### Writing Style

- Pure prose, paragraph-driven. No bullet points. No bold within body text.
- Confident, declarative, authoritative voice. Not chatty, not tentative.
- Second person address ("you") but professional, not casual.
- Concepts explained through mechanics with precision, not dumbed down.
- Chart-specific details woven naturally into explanations.
- Concrete examples of how mechanics play out in daily life.
- Clean section subheadings only.
- Medium-length, declarative sentences. No hedging. Not "you might find" or "this could mean." Instead: "Your design operates through..." and "This is how your system works."

**Audio-aware prose:** Reports are delivered as audio as well as PDF. Write for the ear:
- Shorter declarative sentences that land a point before building on it. Each idea arrives cleanly before the next begins.
- No long nested clauses that lose the listener. If a sentence requires re-reading to parse, it needs to be broken apart.
- Ra's teaching cadence is the model: make a statement, let it sit, add the layer.
- The rhythm should feel like someone speaking with authority, not reading from a textbook.

**Experiential depth:** Reports are medicine, not information. The reader needs to feel recognized, not just described:
- Challenging material should make the reader stop and think "that is exactly what happens to me." The 12.3 section should make someone feel the social self-analysis in their body. The 21.3 section should make them feel the visceral recoil from hierarchy.
- Each planet section in the Planetary Overview should connect to the larger themes so the reader understands why that activation matters in the context of the whole design. Not just "your Mars is here and this is what it does" but "this is where your drive lives, and this is why it creates the specific friction you notice every time you try to push through by force."
- Build in re-readability: embed forward references and experiential markers that become visible only with lived experience. A 23-year-old reads about the undefined Root and gets one thing. That same person at 35, post-Saturn Return, should find something new in the same paragraph.

### Document Format (docx-js)

Build reports as .docx files using the docx npm package (docx-js). Read the docx skill at `../docx/SKILL.md` for the creation pattern.

**Branding:**
- Font: Georgia throughout
- Body text: 11pt (size: 22 in docx-js)
- H1 headings: 16pt, bold, color #5B2E5E (purple)
- H2 headings: 13pt, bold, color #5B2E5E
- H3 headings (planet names in Planetary Overview): 11pt, bold, color #333333
- Page size: US Letter (12240 x 15840 twips)
- Margins: 1 inch all sides (1440 twips)
- Line spacing: 1.15 (276 in docx-js)
- Paragraph spacing: 200 after
- Header: right-aligned, italic, 9pt, gray (#999999): "[Client Name]  |  [Report Title]"
- Footer: centered page number, 9pt, gray

**Helper functions pattern:**
```javascript
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 200, line: 276 },
    ...opts,
    children: [new TextRun({ text, font: "Georgia", size: 22 })],
  });
}
function pRuns(runs, opts = {}) {
  return new Paragraph({
    spacing: { after: 200, line: 276 },
    ...opts,
    children: runs.map(r =>
      typeof r === "string"
        ? new TextRun({ text: r, font: "Georgia", size: 22 })
        : new TextRun({ font: "Georgia", size: 22, ...r })
    ),
  });
}
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 240 },
    children: [new TextRun({ text, font: "Georgia", size: 32, bold: true, color: "5B2E5E" })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 200 },
    children: [new TextRun({ text, font: "Georgia", size: 26, bold: true, color: "5B2E5E" })],
  });
}
function h3(text) {
  return new Paragraph({
    spacing: { before: 240, after: 160 },
    children: [new TextRun({ text, font: "Georgia", size: 22, bold: true, color: "333333" })],
  });
}
function pb() {
  return new Paragraph({ children: [new PageBreak()] });
}
```

**Target word counts:**
- Foundation Report: 8,000-12,000 words
- Planetary Overview: 8,000-10,000 words

**Output location:** Save to the outputs folder with naming: "[Client Name] - Human Design Analysis.docx" and "[Client Name] - Planetary Overview.docx"

**Validation:** After generating each .docx, validate with: `python3 mnt/.claude/skills/docx/scripts/office/validate.py "[filepath]"`

---

## Notion Database Quick Reference

These are the collection IDs for Kaycee's HD databases. Use these for search queries.

| Database | Collection ID |
|----------|--------------|
| Gates (main hexagrams) | `collection://268e3fad-caaa-805b-90e7-000b2a86a18b` |
| Line Companion | `collection://32de3fad-caaa-81a1-b159-000b12fd2169` |
| Channels | `collection://268e3fad-caaa-801c-9f00-000b4a1a601b` |
| Centers | `collection://268e3fad-caaa-811d-a4a5-000b3371cf0e` |
| Circuits | `collection://26ce3fad-caaa-8020-8215-000bb9a8e2bd` |
| Incarnation Crosses | `collection://26ce3fad-caaa-80ed-b5ac-000b95a88768` |
| Quarters | `collection://325e3fad-caaa-8070-9d7c-000be6bdd57a` |
| HD Database Directory | `collection://2f1e3fad-caaa-8031-9bd0-000b39e4e605` |
| Reference Files (client charts) | `collection://31ce3fad-caaa-80c7-88c8-000b46208863` |

**Report Instructions page:** `334e3fadcaaa802d880be296aa54f213`
**Methodology page:** `31ce3fadcaaa818585b0d9535805f8be`

**Query pattern:** Use `notion-search` with the data_source_url parameter set to the collection ID, then `notion-fetch` on the returned page IDs to get full content.

---

## Circuit Reference (for channel analysis)

**Integration** (standalone, not a circuit group): Channels 57/20, 57/10, 57/34, 34/20, 34/10, 10/20. Keynote: Self-empowerment.

**Individual Circuit Group** (Keynote: Empowerment)
- Knowing Circuit: 61/24, 43/23, 57/20, 22/12, 1/8, 14/2, 60/3, 38/28, 39/55
- Centering Circuit (minor): 34/10, 51/25

**Collective Circuit Group** (Keynote: Sharing)
- Logic/Understanding: 63/4, 17/62, 48/16, 58/18, 52/9, 5/15, 7/31
- Sensing/Abstract: 64/47, 11/56, 36/35, 41/30, 13/33, 29/46, 53/42

**Tribal Circuit Group** (Keynote: Support)
- Ego Circuit: 21/45, 44/26, 37/40, 19/49, 54/32
- Defense Circuit (minor): 59/6, 27/50

---

## Channel Consciousness Framework

For every defined channel, determine consciousness status:
- **Road**: Both gates Personality only. Fully conscious.
- **Tunnel**: Both gates Design only. Fully unconscious.
- **Mixed**: One gate P only, one gate D only.
- **Overpass**: At least one gate has BOTH P and D activations.

Use these terms in the session reference (internal document). In client-facing reports, translate to: "conscious," "unconscious," "personality side," "design side," "carries activation on both sides."
