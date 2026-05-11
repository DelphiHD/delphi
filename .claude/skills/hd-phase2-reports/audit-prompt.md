# Audit Prompt — HD Phase 2 Report Validation

You are auditing a client-facing Human Design report (either the Foundation Report or the Planetary Overview) that another agent built. Your job is mechanical fidelity verification, not editorial judgment on prose quality.

## Inputs you receive

1. **Notion reference page link** — the source of truth. Fetch its properties (Type, Profile, Authority, Definition, Cross, Variables tags) AND its body content (the full session reference). This is what the report must match.
2. **The generated report** — either the .docx file path or the report text.
3. **Which report** — Foundation Report or Planetary Overview (the structures differ).

## What to check

### A. Chart Fact Fidelity (strict)

Every chart fact in the report must exactly match the reference page. Strict matching:

- **Type** (Generator / Manifestor / Projector / Manifesting Generator) — matches Type property
- **Profile** (e.g., 4/6 Opportunist Role Model) — matches Profile property
- **Strategy** — matches the Strategy implied by Type (Wait to Respond, Inform, Wait for Invitation, etc.)
- **Authority** — matches Authority property
- **Definition** (Single / Split simple / Split Broad / Triple / Quadruple) — matches Definition property
- **Variables** — every Variable tag from the page property must be reflected somewhere in the report's Variables section
- **Incarnation Cross** — full name matches Incarnation Cross property
- **Every Gate.Line cited** — must appear in the reference's activation tables (Personality or Design). Verify each gate number and line number.
- **Detriments / Exaltations** — only annotated when the activation actually carries one in the reference. Annotated when one is present.
- **Every defined Channel** — must appear in the reference's Channels section. Channel name and gate pair must match.

A factual mismatch is a CRITICAL failure. Surface as a diff: `<Field> | <Reference value> | <Report value>`.

### B. Stylistic Fidelity (lenient)

Stylistic variation is fine. The report does NOT need to phrase things identically to the reference. The report is a re-presentation for a client audience, so prose flow takes precedence over strict wording match. Don't flag:
- Different sentence structure
- Newcomer-friendly rephrasing
- Variation in adjectives/adverbs
- Reordering within a section

### C. Forbidden Content (strict)

- **Kaycee's name** — search the report for "Kaycee" (case-insensitive). Any occurrence is a CRITICAL failure.
- **Client-personal-context** — the report must not mention the client's job, relationships, hobbies, life situations, or any other personal context. The report should remain useful at any life stage. Common tells: phrases like "as a [profession]," "in your work as," "your relationship with," "your hobby of," and any specific named entity tied to the client's life. If you find any, surface for review.
- **Em dashes** — search the report for `—` (em dash, U+2014). Any occurrence is a failure. (Hyphens `-` and en dashes `–` are fine.)
- **Technical shorthand** — search for "Road," "Tunnel," "Overpass," "Mixed" in the channel-consciousness sense. These should be translated to "conscious," "unconscious," "personality side," "design side," "carries activation on both sides." Flag occurrences.

### D. Format Compliance (strict)

**Gate / Line format depends on context:**

- **In casual body prose**: should appear as compact `47.4`. If the body uses the long form `Gate 47, Line 4` in casual prose, flag as a format inconsistency.
- **In Planetary Overview h3 headers**: should appear as full form `Gate 47, Line 4: Hexagram Name / Line Name`. If headers use the compact form, flag.
- **Detriment / Exalted** annotation: present only when the activation carries one. Should NOT appear for neutral activations.

### E. Structure Compliance

**Foundation Report** must include sections in this order: Title Page, How to Use This Report, Who You Are, Your Timeline, Variables (PHS), Centers, Definition, Channels, Patterns, Application, Closing.

**Planetary Overview** must include: Title Page, How to Use This Report, Introduction, Personality Activations (13 planets), Design Activations (13 planets), Incarnation Cross Deep Dive, Moon Placements, Nodal Analysis, Hanging Gates, Closing Synthesis.

**Each section must open with a newcomer-friendly introduction** (1-2 paragraphs) explaining the HD concept before chart-specific application. If a section dives directly into chart specifics without the intro, flag.

### F. Diction Tic Scan

Count occurrences of the overused phrases. Flag if any one phrase appears more than 3 times across the report:

- "quietly" / "quiet"
- "low-grade"
- "This is not a problem to solve" / "not a flaw to fix" (variants)
- "It's not just X, it's also Y" pattern
- "doesn't merely" pattern
- "designed to" (high baseline; flag if >10 in Foundation, >15 in Planetary Overview)
- "essentially" / "fundamentally" / "ultimately"
- "What this means in practice"
- "carries" + abstract noun

Also scan for **paragraph rhythm**: three consecutive paragraphs starting with the same word ("Your..." "This..." "The...") — flag.

## Output Format

Produce a structured report:

```
## Foundation Report Audit (or Planetary Overview Audit)

### Chart Fact Fidelity
| Field | Reference | Report | Match |
|-------|-----------|--------|-------|
| Type | Manifestor | Manifestor | ✓ |
| Profile | 4/6 | 4/6 | ✓ |
| ... | ... | ... | ... |

### Forbidden Content
- Kaycee's name occurrences: 0 ✓ / N ✗
- Client-personal-context flags: <list any>
- Em dashes: 0 ✓ / N ✗
- Technical shorthand: <list any>

### Format Compliance
- Body gate-line format: ✓ or ✗ <list violations>
- Header gate-line format: ✓ or ✗ <list violations>
- Detriment/Exalted accuracy: ✓ or ✗ <list violations>

### Structure Compliance
- All required sections present: ✓ or ✗
- Newcomer intro present in each section: ✓ or ✗ <list missing>

### Diction Tics
- "quietly": N occurrences
- "low-grade": N occurrences
- ... (only list any that exceeded threshold)
- Paragraph rhythm flags: <list any>

## Audit Summary
- Chart fact mismatches (CRITICAL): N
- Forbidden content violations (CRITICAL): N
- Format violations: N
- Structure issues: N
- Diction warnings: N
- Recommendation: APPROVE | SURFACE TO KAYCEE FOR REVIEW

Any CRITICAL failure → SURFACE TO KAYCEE FOR REVIEW. Other issues alone may → APPROVE WITH NOTES.
```

## What to ignore

- Editorial quality of prose (the build agent writes it; subjective improvements are not in scope)
- Word count
- Whether specific Ra quotes are included (the source is the reference, not the original Notion databases — don't re-verify quotes)
- Sentence-level grammar (focus on the structured checks above)
