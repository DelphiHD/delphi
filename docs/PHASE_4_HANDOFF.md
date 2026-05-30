# Phase 4 Handoff — Planetary Overview v3 (2026-05-29)

This doc captures the end-state of the v3 Planetary Overview build so a fresh session can pick up tone-dialing work without re-asking what's been done.

## Where v3 landed

**Current artifact:** `~/Desktop/Benchmark Reports/Phase 4 Output/Matt Hollingshead - Planetary Overview - Phase 4 v3.docx`

The v3 docx opens cleanly in Microsoft Word with full visual structure: cover-page mandala, per-H2 hexagram images, two placement tables (Planet / Gate / Name / Description) each on its own page, cross mandala inside the Full Incarnation Cross Synthesis section, Montserrat throughout, justified body, purple `#845095` headings.

Companion markdown: `~/Desktop/Benchmark Reports/Phase 4 Output/Matt Hollingshead - Planetary Overview - Phase 4 v3.md` (13,664 words, $0.95 generation cost on Sonnet 4.6 with prompt cache).

## What v3 fixed vs v1/v2

### Bug fixes (Word would not open v2)

1. **docx-js@9.7.1 drawing-ID bug.** Every `DocProperties` instance instantiates its own ID counter starting at 1, so all 28 drawings ended up with `<wp:docPr id="1">`. Word rejects documents with duplicate drawing IDs. **Fix:** module-level counter `nextDrawingId()` in `scripts/render-planetary-docx.ts`; every `ImageRun` gets `altText: { id: nextDrawingId() }`.

2. **Nested-paragraph bug in table cells.** The `tableCell` helper auto-detected `TextRun[]` vs `Paragraph[]` via a fragile `.options !== undefined` check that returned false for actual Paragraph instances, then wrapped them in another Paragraph — producing `<w:p><w:p>...</w:p></w:p>` which is invalid OOXML. **Fix:** `tableCell` now takes `Paragraph[]` only; a new `cellPara(runs)` helper wraps `TextRun[]` at the call site.

3. **Table widths in malformed percentage strings.** docx-js serialized `WidthType.PERCENTAGE` as literal `"100%"` strings and column widths as `100` twips each (0.07"). Word couldn't lay them out. **Fix:** switched to `WidthType.DXA` with absolute twip widths `[1500, 940, 2620, 4300]` summing to 9360 (= 6.5" usable on US Letter with 1" margins).

### Voice + structure changes

4. **Voice guardrails added.** Prompt now bans Mars-as-immature/teenage/juvenile/adolescent framing and Moses-with-tablets / religious-figure costuming. Killed self-inflicted "immature truth" phrasing in `detectConjunctions()` notes.

5. **TLDR synthesis architecture.** Every placement H2 must be followed by `> TLDR: <1-2 sentences synthesising what THIS planet does through THIS gate and line>` BEFORE the body prose. The renderer extracts this line as the Description column of the placement tables and strips it from the body so it doesn't double-print. Falls back to first-body-sentence with a warning if the LLM skips the TLDR for a placement.

6. **Placement tables reshape (Planet / Gate / Name / Description).** Column 2 now shows `gate.line` + fixation glyph (▲/▽). Column 3 shows the actual gate name + line name (e.g. "The Arousing / Symmetry"). Column 4 shows the TLDR synthesis. Each table starts on its own page.

7. **Hexagram images inline, not floating.** v2 used floating-wrap (`<wp:anchor>` with `wrapSquare`) for hexagrams below placement H2s. Reverted to inline (`<wp:inline>`) — Word handles inline more reliably and the visual is fine.

## Known issues (not blocking)

- **D-Neptune and D-Pluto missed their TLDR lines in the v3 run.** The renderer printed a warning and fell back to the first body sentence for those two. Not a bug; the LLM just skipped the instruction for two placements out of 26. Either accept the fallback or re-run.
- **Validator still flags 5 old section names.** `lib/report/validate.ts` is pinned to the pre-v2 section list (`# How to Use This Report`, `# Personality Activations`, etc.). Doesn't block generation — emits HARD failures that are safe to ignore until validator is updated (Task #14).
- **10 incarnation-cross pages were partially extracted in the earlier Sonnet pass.** Investigation deferred (Task #12).

## Files in lock-step (update together when anything changes)

- `lib/report/planetary.ts` — generator (MASTER_SYSTEM prompt + buildSections)
- `lib/retrieval/chartChunks.ts` — retrieval (planet, planetary_frames, lifecycle_phases, planetary_conjunctions, geometry kinds)
- `scripts/render-planetary-docx.ts` — docx renderer (tables, mandalas, hexagrams, voice-stripping)
- `scripts/generate-report.ts` — orchestrator (chart fetch → retrieval → generation → markdown publish)
- `~/.claude/projects/-Users-dorothygale-delphi/memory/brand_delphi.md` — canonical voice + structure spec (auto-loaded every session)

## Next session focus — tone dialing

What this session was NOT able to do:
- Iterate on the prose-level voice. v3 reads close to Sagan but is still uneven across placements.
- Compare v3 TLDR syntheses against Kaycee's ideal voice; some TLDRs are dense/abstract where they could be more grounded.

Open questions for the next chat:
- Which placements in v3 read closest to the ideal voice? Which read worst? Use those as the calibration set.
- Should the TLDR voice differ from the body voice (e.g. more compressed-Sagan in TLDR, more flowing-Sagan in body)?
- Are there other forbidden framings beyond Mars-teen and Moses that should be added to the guardrail list?
- D-Neptune / D-Pluto TLDR misses — patch the prompt to make TLDR more robust, or accept fallback?

## Reproduce v3 from scratch

    npx tsx scripts/generate-report.ts matt planetary   # ~$0.95 on Sonnet 4.6
    npx tsx scripts/render-planetary-docx.ts matt       # produces v3 docx

Both scripts write to `~/Desktop/Benchmark Reports/Phase 4 Output/` with auto-bumped version suffix (`Phase 4 v<N>.md` / `.docx`).

## Git state at handoff

Local `main` is 14 commits behind `origin/main`. `lib/` and `scripts/` are untracked locally because they exist on the remote ahead. NONE of the v3 work has been committed yet — it lives on disk only. Resolve the git sync deliberately in the next session (probably `git fetch && git pull` then commit the planetary-related changes), don't barrel through.
