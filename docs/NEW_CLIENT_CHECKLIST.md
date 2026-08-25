# New Client Checklist — Transit Reporting

How to add a person so they are picked up correctly by the daily transit report and
the individual transit syntheses. Written for an operator/agent adding clients.

The live field format is in `scripts/client-roster.ts` — read the `ClientBrief`
interface and the existing `CLIENTS` entries there; this doc is the rules around it.

---

## The one and only file to edit

`scripts/client-roster.ts` — add ONE line to the `CLIENTS` object. Nothing else.
No Notion, no library sync, no manual chart step.

```ts
waylon:  { slug: "waylon", name: "Waylon Vandenberg", birthDate: "2009-12-29", birthTime: "07:35", birthPlace: "Ogden, Utah, United States" },
```

## The 5 required fields (all mandatory)

| Field | Format | Rules |
|---|---|---|
| `slug` | lowercase, no spaces | **Must be unique.** It is both the object key AND the natal-chart cache filename (`.cache/charts/<slug>.json`). A duplicate slug silently overwrites another client. |
| `name` | free text | Display name shown in the report ("Who Feels It Most"). |
| `birthDate` | `YYYY-MM-DD` | Exact. |
| `birthTime` | `HH:MM` (24-hour) | **Exact time matters.** It sets Profile, Definition, and gate lines, which drive the whole impact score. A wrong or estimated time produces a wrong chart. If the real time is unknown, flag it — do not guess silently. |
| `birthPlace` | `City, State/Region, Country` | Must resolve via mybodygraph's location lookup. Match the format of the existing entries. It sets **both** the location and the birth timezone, so it has to geocode cleanly. |

## Running a report after adding

- Nothing else is needed. On the **next report run** the client's natal chart is cast
  automatically (one API call) and cached. Hands-off after the roster edit.
- Today's report now: `npx tsx scripts/transit-report.ts`
- A specific day: `TRANSIT_DATE=2026-08-02 npx tsx scripts/transit-report.ts`
- Requires `MYBODYGRAPH_API_KEY` and `ANTHROPIC_API_KEY` in `.env.local` (the script
  self-loads it).

## Validating the new client came through

1. Console shows `Loading N natal charts…` with the count bumped by one.
2. The client appears in the **Who Feels It Most** section, either with a synthesis +
   their completion data, or a legitimate **"Quiet day"** line.
3. The run ends with `SELF-CHECK: PASSED`.

---

## Critical gotchas (where an agent will trip)

1. **The natal chart is cached, and the cache wins.** If a client is added with a
   wrong birth time/date/place and then corrected, the report keeps using the
   **stale cached chart**. After fixing any birth field, delete that client's cache
   file to force a re-cast:
   ```bash
   rm ".cache/charts/<slug>.json"
   ```
   This is the most common "my change didn't take" cause.

2. **Clients are not the sync.** Adding a client has nothing to do with the Notion
   library sync. The sync is the HD *content* (gates, channels, etc.). Clients live
   only in `client-roster.ts`. Do not run or wait on a sync to add a person.

3. **"Quiet day" is not a bug.** If a client has no transit channels completing on a
   given day, they correctly show "Quiet day, no transit channels or reinforcements."
   That is real, not a failure.

4. **A new client will not show in the standalone Individual Syntheses file until
   their chart is cached.** That tool reads cached charts only. Run the full report
   once after adding them (which casts + caches), and they appear everywhere after.

5. **A `birthPlace` that will not geocode = that client fails to cast.** If mybodygraph
   cannot resolve the place, that one client is skipped. Use a specific, real
   "City, State, Country" string.

## Extra tips

- Chiron and Lilith are excluded automatically, system-wide. Never a concern when
  adding a client.
- Impact ranking is deterministic: higher score = more transit channels completing on
  the person's chart, weighted up when a transit bridges a split or lights an open
  center. It is math, not a model guess.
- One roster entry powers everything for that person (transit scoring, synthesis,
  ranking data). There is no per-client setup beyond the line.
- The daily report already runs on a schedule; a roster edit means they are included
  from the next run on.
