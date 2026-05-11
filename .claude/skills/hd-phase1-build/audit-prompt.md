# Audit Prompt — HD Phase 1 Reference Fidelity Check

You are auditing a Human Design Phase 1 session reference file that another agent built. Your job is narrow and mechanical: verify that every chart fact in the source data appears correctly in the reference.

You are NOT verifying source material from Notion. You are NOT evaluating analytical quality. You are not interpreting anything. The Notion source material is out of scope for this audit. Only the chart-data-to-reference mapping matters.

## Inputs you receive

1. **Chart PDF path** — the visual chart image. Authoritative for splits geography and exaltation/detriment markings.
2. **Chart text data** — the original copy-paste from chart software. Authoritative for activation rows, type/profile/authority, variables, dates.
3. **Reference file path** — the assembled reference at `/tmp/hd-reference-...md`. The thing you're auditing.

If the PDF and text disagree, the PDF wins (and the discrepancy should already be flagged in the reference's data pass section — verify it is).

## What to check

For every one of these facts, verify it appears correctly in the reference:

### Chart Basics
- Client name, birth date, birth time, birth location, design date
- Type (Generator / Projector / Manifestor / Manifesting Generator)
- Profile (e.g., 5/1 Heretic Investigator)
- Authority
- Definition (Single / Split simple / Split Broad / Triple / Quadruple)
- Incarnation Cross (full name with gate numbers)
- Quarter (Initiation / Civilization / Duality / Mutation)

### Centers
- Defined centers list (names, count)
- Undefined centers list (names, count)
- Open centers list (names, count)
- Total = 9

### Channels
- Every channel listed in the source data appears in the reference
- Each channel's gate pair is correct
- Each channel's consciousness status (Road/Tunnel/Mixed/Overpass) is derivable from the activations

### Personality Activations Table (13 rows)
- Sun, Earth, Moon, North Node, South Node, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto
- For each: Gate.Line matches source
- For each: Exaltation/Detriment matches PDF markings
- For each: Center attribution matches source
- For each: Channel/Hanging designation matches source

### Design Activations Table (13 rows)
- Same 13 planets, same checks

### Variables / PHS
- Determination (Color, Tone, Direction)
- Environment (Color, Tone, Direction)
- Perspective (Color, Tone, Direction, Distraction)
- Motivation (Color, Tone, Direction, Transference)
- Base orientations (Personality and Design)
- Overall arrow configuration (e.g., PLL DLL)

### Important Dates
- Saturn Return year/age
- Uranus Opposition year/age
- Chiron Return year/age
- 2nd Saturn Return year/age

### Splits (if applicable)
- Number of islands and which centers in each
- Channels making each island
- Bridging territory (undefined centers between islands)
- Verify against the PDF visually

### Derived Inventories
- Unique gates list count and content
- Double activations list (gates appearing more than once with their planet attributions)
- Line distribution counts

### Database Properties (if you can see them)
The reference page in Notion should have these properties set. If you have access to the Notion page metadata, verify:
- Name follows `Lastname, Firstname — YYYY-MM-DD`
- Type, Profile, Authority, Definition match the body
- Incarnation Cross multi-select matches body
- Variable multi-select includes all PHS components
- Status is `Ready for Reports`
- Analysis Type is `Individual`
- Analysis Level is `Full`

## Output format

Produce a structured diff table. One row per fact checked. Use this exact format:

```
| Field | Source (PDF/text) | Reference | Match |
|-------|-------------------|-----------|-------|
| Type | Manifestor (text) | Manifestor | ✓ |
| Sun (P) | 58.5 Detriment Root (text + PDF) | 58.5 Detriment Root | ✓ |
| Mercury (D) | 6.1 Detriment SP (text) | 6.2 SP | ✗ — line and exalt/det mismatch |
| Saturn Return | Oct 11, 2039 (text) | Oct 11, 2039 | ✓ |
...
```

After the table, add a summary block:
```
## Audit Summary
- Total fields checked: N
- Matches: N
- Mismatches: N (listed above)
- Critical (chart parsing errors): N
- Minor (formatting/wording inconsistencies): N
- Recommendation: [APPROVE | FIX BEFORE WRITING TO NOTION]
```

A single mismatch on a chart fact (gate, line, planet, center, exalt/det) is a `FIX BEFORE WRITING TO NOTION`. A formatting inconsistency is `APPROVE` with note.

## Additional check: verify fetches actually happened

For each cited Notion page ID in the reference (anywhere a `[Source: <page-id>]` or similar citation appears), verify the build agent actually fetched that page in this conversation. The conversation transcript has the build agent's tool-use history — check that for each cited page ID, there is a corresponding `notion-fetch` call.

If the reference cites a page the build agent never fetched, that's a CRITICAL drift indicator (the agent fabricated source material from training memory). Mark this as `CRITICAL: fetch verification failed for <page-id>` and recommend `REBUILD`.

This is the strongest signal of training-memory drift. Do not skip this check.

## What to ignore

- Source material content quality (that's not the audit)
- The analytical prose quality or word choice (the build agent writes synthesis prose; that's expected, not a problem)
- Whether `[GAP: ...]` markers exist (those are fine, intentional)
- The structure or organization of the reference (assume it's correct unless headings are missing)

## Working method

1. Read the chart PDF first (visual confirmation of splits and exalt/det markings)
2. Read the chart text data (the structured source)
3. Read the reference file
4. Walk through the checklist above. For each fact, compare and record.
5. Produce the diff table and summary.

Do not speculate. If a field is missing from the reference, mark it as a mismatch with note "missing from reference."
