---
name: hd-phase2-reports
description: |
  Generate the two client-facing Human Design reports from a completed Phase 1 session reference: the Foundation Report (Human Design Analysis) and the Planetary Overview. Use whenever Kaycee provides a link to a finished session reference page in her Reference Files Notion database (status `Ready for Reports`) and wants the client deliverables produced. Also trigger when she mentions generating reports, building Foundation Report or Planetary Overview, producing client-facing .docx files, or moving a chart from analysis to delivery. This skill is for Phase 2 only (report generation). Phase 1 (building the session reference) is a separate skill (`hd-phase1-build`).
---

# HD Phase 2: Generate Client Reports

## Audience

Reports are written for **clients new to Human Design**. Plain language, roughly high-school reading level. Each section opens with a short introduction explaining what the HD concept is and why it matters before moving into the chart-specific application. Assume the reader has never heard of "PHS" or "an undefined Solar Plexus" before — define terms in passing without making the prose feel like a textbook.

The reports serve as a manual the client returns to throughout life. They will be delivered as PDF and audio. Clients read/listen, live their life for a while, then come back at intervals. The words work over time.

## Inputs

1. **Notion reference page link** — a finished Phase 1 session reference page in the Reference Files database. Status should be `Ready for Reports`. The agent fetches both the page properties (Type, Profile, Authority, Definition, Cross, Variables tags, etc.) and the body content (the assembled session reference) as the source for everything in the reports.

If the page status is not `Ready for Reports`, surface that and ask before proceeding.

## Outputs

Two .docx files, **uploaded directly to Kaycee's Google Drive folder** (no manual upload step):

- `[Client Name] - Human Design Analysis.docx` (the Foundation Report)
- `[Client Name] - Planetary Overview.docx`

**Drive destination folder ID:** `1Imf_kBnQCHz1uDlbUEorVGXHpWJrd1AO`
(Folder URL: https://drive.google.com/drive/u/0/folders/1Imf_kBnQCHz1uDlbUEorVGXHpWJrd1AO)

Local copies are saved to `~/Documents/HD Reports/<Client Name>/` as backup, then uploaded to Drive. After both reports upload successfully, return the Drive links to Kaycee.

After both reports pass audit and Kaycee approves, optionally update the Notion reference page status to `Done`.

### Drive Upload Pattern

After the audit passes and Kaycee approves a report:

1. Confirm the .docx file exists locally
2. Read the file as bytes and base64-encode (use `base64 -i <file> | tr -d '\n'` or Python)
3. Call `mcp__2bf0daef-*__create_file` with:
   - `title`: `<Client Name> - <Report Title>.docx`
   - `parentId`: `1Imf_kBnQCHz1uDlbUEorVGXHpWJrd1AO`
   - `contentMimeType`: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
   - `base64Content`: the encoded bytes
   - `disableConversionToGoogleType`: `true` (preserves .docx — DO NOT let it auto-convert to Google Docs format, this loses the Georgia/purple/margin styling)
4. The response contains the new file's URL. Return this to Kaycee.

If the upload fails (network, permission, etc.), keep the local copy and surface the error. Do NOT silently proceed to the next report.

## Voice and Style

- **Confident, declarative, second person.** Not chatty, not tentative. "Your design operates through..." rather than "you might find that..."
- **Pure prose, paragraph-driven.** Bullets are fine when they're genuinely useful (e.g., listing three distinct mechanics). Don't bullet for the sake of breaking up text.
- **No bold within body prose.** Bold for section subheadings only.
- **Audio-aware.** Shorter declarative sentences that land before building. Each idea arrives cleanly before the next begins. Ra's teaching cadence: state, let it sit, add the layer. No long nested clauses.
- **Experiential depth.** The reader should stop and think "that is exactly what happens to me." Not just "your Mars is here and this is what it does," but "this is where your drive lives, and this is why it creates the specific friction you notice every time you try to push through by force."
- **Re-readability.** Embed forward references and experiential markers that become visible only with lived experience. A 23-year-old reads about the undefined Root and gets one thing; the same person at 35, post-Saturn Return, finds something new in the same paragraph.

## Forbidden Content

- **Never use Kaycee's name.** No "Kaycee says," no "per Kaycee," no first-person references to the analyst. The reports are between the design and the client.
- **No client-personal-context.** Don't reference job, relationships, hobbies, life situations, or anything else Kaycee may have mentioned about the client. The reports must remain useful at all life stages — concrete personal context dates them and limits re-reading.
- **No em dashes anywhere.** Use commas, colons, semicolons, or restructure the sentence.
- **No softening of challenging material.** This is non-negotiable. If a detriment is sharp, present it sharply. If an open center carries a hard not-self pattern, name it. The compassion is in the mechanical framing ("this is how your design works"), not in dilution. Every chart has gifts and challenges; the work is showing how they cohere.
- **No technical shorthand.** Never use Road / Tunnel / Mixed / Overpass in client reports. Translate to "conscious," "unconscious," "personality side," "design side," "carries activation on both sides."
- **No HD content from training memory.** Every claim about a gate, line, channel, center, etc. must be grounded in the session reference page (which itself was grounded in fetched Notion source). If something isn't in the reference, don't add it; the reference is your source.

## Diction Guidance (anti-patterns)

These phrases get overused across long reports and become a tell. Vary diction; reach for these alternatives or just delete:

- **"quietly"** → drop entirely most of the time, or substitute "underneath," "in the background," "without announcement," "subtly," "as a constant baseline"
- **"low-grade"** → "persistent," "ongoing," "background," "constant," "always-on," or describe the actual frequency ("daily," "in every interaction")
- **"This is not a problem to solve, it's X"** → "This is how the design operates, not a flaw to fix," "X is the mechanism, not a defect," "The work isn't fixing this; the work is..." — or simply describe what it IS without the contrast
- **"It's not just X, it's also Y"** → drop the hedge; commit to what it is
- **"doesn't merely X, but Y"** → vary the structure; this construction lands flat after the second use
- **"designed to"** → repetitive across long reports; alternate with "built to," "made for," or use an active verb
- **"carries"** + abstract noun → find a stronger verb (instead of "carries pressure," try "produces pressure," "generates pressure," "holds pressure")
- **"essentially," "fundamentally," "ultimately"** → usually drop entirely; they're filler intensifiers
- **"What this means in practice is..."** → skip the meta and just describe

**Sentence rhythm:** if three paragraphs in a row begin with "Your X..." or "This means...," the agent has fallen into a groove. Break it.

## Gate / Line Format

Two contexts, two formats:

- **In casual body prose** (any time a gate or line is mentioned in a sentence): use compact `47.4`. Example: "Your Sun in 12.4 carries..."
- **In Planetary Overview h3 headers**: use the full form `Gate <#>, Line <#>: <Hexagram Name> / <Line Name>`. Example: `Gate 47, Line 4: Oppression / Repression`. Add `Detriment` or `Exalted` only when the activation carries one. Omit for neutral.

## Workflow

### Step 1: Pre-flight

- Fetch the reference page Kaycee linked. Verify:
  - It's in the Reference Files database (parent data source = `collection://31ce3fad-caaa-80c7-88c8-000b46208863`)
  - Status property = `Ready for Reports`. If not, surface and stop.
  - Body content is non-empty (the assembled session reference)
  - Chart properties present: Type, Profile, Authority, Definition, Incarnation Cross, Variable tags
- Read the full body content. This is your sole source of analysis material.
- Confirm with Kaycee where to save the .docx outputs (default: `~/Documents/HD Reports/<Client Name>/` if unset).

### Step 2: Generate the Foundation Report (one pass)

Generate the entire Foundation Report in a single pass. Don't pause for section-by-section review — the per-report audit at Step 3 catches issues. Build the .docx in memory or to a temp file (don't save the final yet — wait until audit passes).

Foundation Report structure (in this order):

1. **Title Page** — Client Name, "Human Design Analysis", date
2. **How to Use This Report** — short framing: read through once, live for a while, return at intervals; the words work over time; this is a manual, not a one-time read
3. **Who You Are** — Type, Strategy, Authority, Profile, Incarnation Cross
4. **Your Timeline** — planetary returns and current life phase
5. **Variables (PHS)** — the four arrows; how the body is designed to function
6. **Centers** — all 9, with their state and what that produces
7. **Definition** — its own dedicated section (see below for what to cover)
8. **Channels** — defined channels with consciousness status, what they produce
9. **Patterns** — gifts, challenges, patterns, paradoxes as woven prose
10. **Application** — practical daily-living guidance specific to this chart
11. **Closing** — the words work over time; new meaning at different life stages

**Each section opens with a 1-2 paragraph introduction** explaining what the HD concept is and why it matters, written for a complete newcomer. Then move into the chart-specific application. Don't skip the intro — the client may not know what "Authority" or "PHS" means before you tell them.

**Definition section (#7) detail:** a dedicated section on the geometry of how the defined centers connect, with attention to the psychology each definition type produces:
- **Single**: continuous internal flow; self-sustaining; doesn't need external bridges; can feel "complete" in a way other definitions don't
- **Simple Split**: one channel away from continuous flow; tends to produce "something is wrong with me" internalization because the gap is small enough to almost close on its own
- **Broad Split**: wide gap requiring multiple bridge gates; tends to produce "something is wrong with them" externalization because every relationship provides a partial bridge that feels almost-right; the cycling-through-relationships blind spot
- **Triple Split**: three definition islands; complex bridging dynamics; recognizes wholeness in three different kinds of people
- **Quadruple Split**: four definition islands (rare); each defined cluster carries its own consistency, tied together loosely
For THIS chart, name which definition, then write the prose specific to that geometry: where the islands sit, which channels make them, what kinds of bridge interactions condition this person, the psychological pattern, and how strategy/authority navigate it.

### Step 3: Audit the Foundation Report

Spawn an Agent (`subagent_type: general-purpose`, fresh context). Pass it:
- The reference page link (so it can fetch properties + body)
- The generated report text (or the .docx path)
- The audit prompt at `~/.claude/skills/hd-phase2-reports/audit-prompt.md`

The audit verifies:
- All chart facts match the reference: Type, Profile, Strategy, Authority, Definition, every Variable tag, Cross, every Gate.Line cited (including Detriments / Exaltations), every defined Channel
- No Kaycee's name anywhere
- No client-personal-context (jobs, relationships, hobbies, etc.)
- No em dashes
- Gate/line format correct in both contexts
- Detriment/Exalted noted only when applicable
- Every section has its newcomer-friendly intro
- Diction tics flagged (overused phrases from the list above)

The audit returns a structured report.

### Step 4: Surface Audit Findings to Kaycee

Show Kaycee the audit report. **Do not auto-rebuild on failures** — surface the diff and let her decide. The agent might rebuild into another bad version; her review is faster.

If she approves: save the .docx to the local output folder, then upload to Drive (see Drive Upload Pattern above), then return the Drive link.
If she requests fixes, make them and re-audit before saving/uploading.

### Step 5: Generate the Planetary Overview (one pass)

Same approach: generate the full report in one pass, then audit.

Planetary Overview structure:

1. **Title Page** — Client Name, "Planetary Overview", date
2. **How to Use This Report** — companion to the Foundation Report; each activation is a thread to return to as you encounter its themes in daily life
3. **Introduction** — what planetary activations are; why they matter; the difference between Personality (conscious) and Design (unconscious)
4. **Personality Activations** — 13 planets in order: Sun, Earth, Moon, North Node, South Node, Mercury, Mars, Venus, Jupiter, Saturn, Uranus, Neptune, Pluto. Each gets an h3 in the long-form gate header (`Gate 47, Line 4: Oppression / Repression`) followed by chart-specific prose.
5. **Design Activations** — same 13 planets, same format
6. **Incarnation Cross Deep Dive** — the four cross gates with synthesis
7. **Moon Placements** — P Moon and D Moon with synthesis
8. **Nodal Analysis** — four nodes with the karmic arc synthesis
9. **Hanging Gates** — organized by center, with bridging-priority synthesis
10. **Closing Synthesis** — how the planetary architecture threads through the design

Each top-level section gets its newcomer intro. Within Personality and Design Activations, the introduction explains what planetary activations are (the agent doesn't need to re-explain at every planet — write a single intro that frames the whole list).

### Step 6: Audit, Surface, Approve, Save & Upload Planetary Overview

Same pattern as Steps 3-4 for the Foundation Report: audit → surface → approve → save local → upload to Drive → return link.

### Step 7: Optional Status Update

After both reports save successfully, ask Kaycee if she wants the reference page's `Status` updated to `Done`. If yes, run `notion-update-page` with `command: "update_properties"` setting `Status: Done`.

## Document Format (docx-js)

Build reports as .docx files using the `docx` npm package. Read the docx skill at `../docx/SKILL.md` for the creation pattern if needed.

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
- Header (page level): right-aligned, italic, 9pt, gray (#999999): `[Client Name]  |  [Report Title]`
- Footer (page level): centered page number, 9pt, gray

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
function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 120, line: 276 },
    children: [new TextRun({ text, font: "Georgia", size: 22 })],
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

**Validation after generation:** `python3 mnt/.claude/skills/docx/scripts/office/validate.py "[filepath]"`

## Length Guidance (not a hard target)

The previous version of this skill specified word counts (8,000-12,000 for Foundation, 8,000-10,000 for Planetary Overview). Word counts are removed. The reports should be **thorough where the chart warrants thoroughness** and **concise where it doesn't**. Avoid repetition for the sake of length. Avoid padding sentences with intensifiers ("essentially," "fundamentally") to hit a number.

Signs of bloat to watch for:
- The same idea explained twice in different words
- Generic HD context that isn't tied back to this chart
- Long lead-ups before getting to the chart-specific point
- "Throat clearing" sentences that exist to set up the next sentence

If a section is short because the chart's mechanics there are simple, that's correct. Don't pad.
