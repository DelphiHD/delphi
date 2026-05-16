# CONTEXT.md

Factual ground truth for HD Reports. Read this before doing any project work that touches Kaycee's source material, the Notion library, the report engine, or her analysis methodology. Strategic *intent* lives in `INTENT.md`; brand voice in `IDENTITY.md` and `VOICE.md`; why-we-chose-X in `DECISIONS.md`.

This file is canonical. If a Claude Code skill file, a comment in code, or a master-plan paragraph contradicts something here, **CONTEXT.md wins** and the other surface gets updated to match in the same commit.

## Who and what

**HD Reports** is a paid web product (Next.js on Vercel, Supabase backend) that delivers personalized Human Design readings to paying customers. The product is being built on top of the analysis workflow Kaycee already runs manually via Claude Code skills.

**Kaycee Vandenberg** is the operator. She is a practicing Human Design analyst running a paid reading practice. She built the hd-analysis Claude Code skill that powers her current per-client workflow. Tennyson set up the delphi codebase's engineering backbone (Next.js, Supabase, Vercel) during Phase 1; Kaycee is the principal going forward.

**Two consumers of the Notion source material** (this is the architectural fork that matters most):

1. **The hd-analysis Claude Code skill (Kaycee's manual workflow).** Runs in Kaycee's local Claude Code app. Queries Notion via the `notion-search` and `notion-fetch` MCP tools. Generates per-client session reference + branded .docx reports. Already works. **Phase 3 changes nothing about this path.**
2. **The delphi web product (Phase 3 sync + Phase 4 report engine).** Customers visit the deployed site, sign up, eventually pay, and receive a report. For this path to scale, the Notion content is mirrored nightly into Supabase Postgres + pgvector so the report engine can retrieve at production speed without hitting Notion's API rate limits per customer request.

Both paths read the same source material from Notion. Phase 3 plumbing does not affect the manual workflow.

## The Notion library architecture

### The directory pattern

`HD Database Directory` (Notion database id `2f1e3fadcaaa80a1a496fb4f22abbb8d`) is a **registry**, not content. Each row is a pointer to one source database. Properties:

- `Name` (title) — display name like "HD Gates"
- `Status` (select) — `Usable` or `Working on It`
- `Sync to Delphi` (checkbox) — Kaycee's canonical signal for which databases the Phase 3 sync ingests

The directory is the source of truth. Add a database here with `Sync to Delphi` checked and the sync picks it up on the next run; uncheck it and the sync stops pulling.

### Source databases (Sync to Delphi = checked)

As of 2026-05-16:

| Database name | What's in it | Approx rows |
|---|---|---|
| HD Gates | 64 gate-level entries with main hexagram name, theme, center, channels, circuit, quarter, page-body narrative | 64 |
| HD The Line Companion | 64 rows (one per gate). Each page contains a `synced_block → callout → 7 toggles` structure. Toggles are: "HEXAGRAM N name" (gate-level intro), then "N.1 name" through "N.6 name" (per-line Ra material). See "Line Companion toggle structure" below. | 64 rows / 448 toggles |
| HD Channels | 36 channels with type, circuit, keynote | 36 |
| HD Centers | 9 centers with defined/undefined dynamics and not-self themes | 9 |
| HD Types | The 5 HD types | 5 |
| HD Authorities | The HD authorities | 8 |
| HD Profiles | The 12 profiles | 12 |
| HD Variables | Variables / PHS (Determination, Environment, Perspective, Motivation, colors, tones, bases) | 16 |
| HD Channel Types | Channel-type framing | 4 |
| HD Definition | Definition types (Single, Split, Triple Split, Quadruple Split, No Definition, etc.) | 6 |
| HD Circuits | Circuit groups | 7 |
| HD Planets | Planetary archetypes (13: Sun, Earth, Moon, NN, SN, Mercury, Mars, Venus, Jupiter, Saturn, Uranus, Neptune, Pluto) | 13 |
| HD Incarnation Crosses | Cross-specific material | 192 (paginate) |
| HD Profile Lines | Standalone per-line profile content | TBD |
| HD Geometry | Geometry framing | TBD |
| HD Quarters | The 4 quarters | 4 |

When she adds, retitles, or restructures any of these, the sync script will adapt because it reads the directory; no code change should be required.

### The firewall — never ingest

- **`Reference Files`** (id `31ce3fadcaaa80c788c8000b46208863`) — Kaycee's per-client charts. Private data. Hard line.
- **`HD Readings`** — assumed to contain client reading records until Kaycee confirms otherwise. Until then, do not ingest.

Phase 3 sync is whitelist-driven (directory + `Sync to Delphi`), not blacklist-driven, so these don't get ingested unless someone explicitly checks the box. Don't.

### The linked-view gotcha (Notion API limitation)

Kaycee's UX optimization: each HD Gates page has **linked blocks** that mirror the relevant HD The Line Companion content for that gate. In Notion's UI, opening Gate 1 shows the gate-level callout *and* the six-line companion material in one place.

The **Notion public API does not render linked-block content**. It returns block type `unsupported` with `has_children: true` and no readable content. This is a well-known limitation, not a bug in our code.

Consequence for Phase 3 sync: we **read each underlying database directly** (HD Gates AND HD The Line Companion as separate sources). The linked views are invisible to the API and irrelevant to the sync.

Consequence for the hd-analysis skill: the same limitation likely applies to the Notion MCP tools that the skill uses. The skill should query HD The Line Companion as its own data source rather than depending on the linked content inside Gates pages. If the skill instructs querying via the linked views, that instruction is stale.

### Line Companion toggle structure

Each row in HD The Line Companion is one gate. Inside the page, the content is wrapped as `synced_block → callout → 7 toggles`. The 7 toggles per gate are:

1. **"HEXAGRAM N name"** (e.g., "HEXAGRAM 62  PREPONDERANCE OF THE SMALL") — gate-level Ra intro. This is the Main Hexagram toggle.
2. **"N.1 name"** through **"N.6 name"** — one toggle per line, holding Ra's per-line material with all its rambling and cross-references kept intact.

The rambling is intentional. Kaycee chose to keep each gate on one page rather than split lines across rows because Ra's per-line material has heavy cross-referencing within a gate; splitting would lose context.

**Sync implication.** Phase 3 chunks by toggle, not by page. Each toggle becomes one chunk in pgvector with:
- `kind = 'line'`
- `gate_number = <N>` (parsed from the toggle title)
- `line_number = 0` for the Main Hexagram toggle, `1..6` for the per-line toggles

Yielding 7 chunks per gate, 448 chunks total from this database alone. At retrieval time, a gate-line activation like 21.3 pulls three chunks: HD Gates' gate-level intro (kind=gate, gate_number=21), the Main Hexagram toggle (kind=line, gate_number=21, line_number=0), and the 21.3 toggle (kind=line, gate_number=21, line_number=3).

**Traversal pattern (for any code that needs to read this content).** The Notion API exposes this as four nested calls: `GET /blocks/{page_id}/children` returns one `synced_block` (with `synced_from: null` because this page IS the origin). Then `GET /blocks/{synced_block_id}/children` returns one `callout`. Then `GET /blocks/{callout_id}/children` returns the 7 toggles. Then `GET /blocks/{toggle_id}/children` returns the actual text content for that toggle. Cache aggressively; Notion's API rate limit is 3 requests per second.

### The other Notion API quirk: directory rows as linked views

A few directory rows (HD Quarters, HD Profile Lines, HD Geometry as of 2026-05-16) do not contain an inline database when probed via the API. The actual database lives elsewhere in the workspace, and what the directory row shows is a linked *view*. Phase 3 sync resolves these by searching Notion for the database name when the inline lookup fails. No action needed from Kaycee.

## Kind taxonomy

One `kind` value per source database, mapped from database name (strip "HD" prefix, lowercase, singular). Example:

| Source database | `kind` |
|---|---|
| HD Gates | `gate` |
| HD The Line Companion | `line` |
| HD Channels | `channel` |
| HD Centers | `center` |
| HD Types | `type` |
| HD Authorities | `authority` |
| HD Profiles | `profile` |
| HD Variables | `variable` |
| HD Channel Types | `channel_type` |
| HD Definition | `definition` |
| HD Circuits | `circuit` |
| HD Planets | `planet` |
| HD Incarnation Crosses | `cross` |
| HD Profile Lines | `profile_line` |
| HD Geometry | `geometry` |
| HD Quarters | `quarter` |

This taxonomy supersedes the master plan's draft (`gate, channel, center, type, transit`), which was a placeholder and didn't reflect the actual library.

## Methodology rules that ship in every report

These are non-negotiables from Kaycee. They constrain both the manual hd-analysis workflow and the eventual delphi web-product report engine.

- **Body-first ordering.** Variables / PHS sections come before Type / Strategy / Authority. The reason: body-level material lands as recognition rather than belief.
- **No softening.** Detriments, challenging gates, open-center not-self patterns: present mechanically with Ra's full directness. The mechanical framing (this is how your design works) is the compassion. Softening is its opposite.
- **Reports are medicine, not information.** Re-readable at different life stages. Built for audio as well as PDF (each idea lands before the next begins). Make the reader feel recognized, not just described.
- **No em dashes anywhere.** Use commas, colons, semicolons, or restructure. The pre-push lint will catch violations once it exists.
- **Channel consciousness internal terms** (Road / Tunnel / Mixed / Overpass) are fine in the session reference and internal docs. In client-facing reports, translate to "conscious," "unconscious," "personality side," "design side."

Fuller methodology lives in `.claude/skills/hd-analysis/SKILL.md` until `IDENTITY.md` and `VOICE.md` are filled in.

## Outstanding stubs

This file will keep growing. Sections that still need content as of 2026-05-16:

- Customer profile (who is buying readings, why).
- Pricing tiers in operational detail (the decision is recorded in DECISIONS.md as Option A; the operational details — payment flow, refund policy, tier-gating in retrieval — are Phase 2 work).
- Eval rubric for Phase 3.5 quality gate.
- Glossary of HD terms used consistently across the product.

When you fill any of these in, also update the relevant memory entry under `~/.claude/projects/-Users-dorothygale-delphi/memory/`.
