# ARCHITECTURE.md

System map for HD Reports. This is the file to read to understand how the pieces connect and, critically, **which products a given change can break**. Fixing one product and silently breaking another is the failure mode this document exists to prevent.

Updated 2026-07-26. When a new product or shared module lands, update the two maps below (Products, and Shared spine / blast radius).

---

## The one idea to hold in your head

Everything rests on **two shared foundations**, and every product is downstream of them:

1. **Chart data** — the customer's/client's Human Design chart, fetched from the mybodygraph API and normalized into one internal `Chart` type.
2. **Source material** — Kaycee's Notion databases, mirrored nightly into a local library the products read for grounding.

A change to either foundation, or to a shared module between it and a product, ripples into *multiple* products at once. That ripple is the "fix one, break another" problem. The blast-radius map below is how you see the ripple before it happens.

```
  Notion databases (Kaycee's source of truth)
        |  scripts/sync-notion.ts   (nightly; full body + ALL metadata)
        v
  .cache/chunks.json  -> lib/hd/library.ts, lib/hd/library-names.ts   (the library)
        |
        |                         mybodygraph API
        |                              |  lib/mybodygraph.ts  getChart()
        |                              v
        |                         lib/chart/types.ts  (the Chart type)
        |                              |
        |                    lib/transit/sky.ts (transit casts, per-moment bodygraphs)
        v                              v
  ---------------------- the seven products ----------------------
  Foundation report · Planetary Overview · Quickstart ·
  Daily Transit · Evening Echoes · Interactive Chart · Mandala Motion
```

---

## The products (consumers)

| Product | Entry point | What it produces | Reads from |
|---|---|---|---|
| **Foundation Report** | `scripts/generate-report.ts` -> `lib/report/foundation.ts` | Client `.docx` reading | mybodygraph chart, synced library (via `lib/retrieval/chartChunks.ts`), LLM |
| **Planetary Overview** | `scripts/generate-report.ts` + `scripts/render-planetary-docx.ts` -> `lib/report/planetary.ts` | Client `.docx` | mybodygraph chart, library, LLM, `lib/render/mandala.ts` |
| **Quickstart** | `scripts/generate-report.ts` -> `lib/report/quickstart.ts` | Client report | mybodygraph chart, library, LLM |
| **Daily Transit Report** | `scripts/transit-report.ts` -> `lib/report/transit.ts`, `scripts/render-transit-html.ts` | Branded `.html` + `.md` | `lib/transit/sky.ts` (chart casts), library, LLM, `lib/report/verify.ts` (self-check) |
| **Evening Echoes** | `scripts/evening-echoes.ts` | Branded `.html` + `.md` | the morning transit report's themes, `lib/transit/news.ts` (GDELT), LLM |
| **Interactive Personal Chart** | `scripts/build-interactive-chart.ts` | Interactive `.html` | mybodygraph branded SVG, `lib/render/mandala.ts`, `lib/hd/gate-longitude.ts`, library |
| **Mandala Motion** | `scripts/mandala-motion.ts` | Animated `.html` (also embedded in the Daily Transit report) | `lib/transit/sky.ts`, `lib/render/mandala.ts`, `lib/hd/gate-longitude.ts` |

All seven read from the same two foundations. That is the whole point, and the whole risk.

---

## The shared spine and its blast radius

These are the modules used by more than one product. **Before changing any of them, re-verify every product in its "breaks" column.** This table is the answer to "how do we stop fixing one thing and breaking another."

| Shared module | What it is | Products that break if it changes | Real incident |
|---|---|---|---|
| `lib/mybodygraph.ts` | Fetches + normalizes the chart (`getChart`), including the branded `design=delphi` SVG | Foundation, Planetary, Quickstart, Daily Transit, Interactive Chart, Mandala Motion | A property rename (`brandedSvg` -> `chartImageSvg`) silently killed all chart images + baby charts (2026-07-25) |
| `lib/transit/sky.ts` | Casts the transit sky + per-moment bodygraphs; `personalityPositions` is the single choke point for the 13-body rule | Daily Transit, Mandala Motion (+ health check) | Chiron/Lilith leaked in and fabricated channels/centers (2026-07-21) |
| `lib/render/mandala.ts` | Draws the branded wheel + bodygraph geometry | Planetary Overview, Foundation, Interactive Chart, Mandala Motion, PNG export | Wheel geometry / CSS class hooks are shared by the docx reports AND the animation |
| `lib/llm/core.ts` | The one path to the model (`invokeLLM`): streaming, cost ceiling, error surfacing | Every LLM-grounded report (Foundation, Planetary, Quickstart, Transit, Evening Echoes) | Out-of-credit errors were surfaced as a vague "empty stream" (2026-07-25) |
| `lib/chart/types.ts` | The internal `Chart` contract every product consumes | Effectively all chart-based products | Adding/renaming a `Chart` field touches every consumer |
| `.cache/chunks.json` (via `lib/hd/library.ts`, `lib/hd/library-names.ts`) | The synced source library: grounding + gate/line names | Daily Transit, Foundation, Planetary, Interactive Chart | A 5-property allowlist silently dropped most metadata (found 2026-07-26) |
| `scripts/sync-notion.ts` | Produces `chunks.json` from Notion | Everything grounded (upstream of the library) | Non-deterministic synced-block resolution changed content run-to-run |

**How to read a change:** touching `lib/render/mandala.ts` is not a "mandala change." It is a change to the Planetary Overview, the Foundation report, the Interactive Chart, and the animation, all at once. Verify all four.

---

## System invariants (must hold in every product, enforced not trusted)

These are cross-cutting rules. A change anywhere must not violate them, and the checks named here are how we know:

- **13 traditional bodies only. Never Chiron or Lilith.** Enforced by `personalityPositions` filtering + `assertTraditionalBodies()` (a loud tripwire) in `lib/transit/sky.ts`, called by the transit report and the mandala.
- **No source, no sentence.** Every interpretive sentence comes from the library, never model training. This is the product's defensibility (see INTENT.md).
- **No em dashes anywhere** in user-facing output. Linted at the end of the transit report; `lib/report/verify.ts` checks the published HTML.
- **Complete by default, loud on failure.** The sync captures every page (full body AND all metadata) or fails loudly and keeps the last good copy. Reports self-verify for completeness before shipping (`lib/report/verify.ts`). Silent partial failure is the enemy.
- **Chart vocabulary is Kaycee's, not the API's.** `lib/mybodygraph.ts` translates API field names at the boundary; nothing downstream sees raw API shapes (see CONTEXT.md).

---

## The regression-prevention protocol (the actual answer to the question)

Three layers, in order of cheapness:

1. **Read the blast-radius map before changing a shared module.** If the change is in the spine table above, the "breaks" column is your re-verify list. This doc is layer one.
2. **Run each affected product end-to-end and confirm it still works** (not just types/tests, actual output). Per-product self-checks already exist for the transit report (`lib/report/verify.ts`) and are being extended. A change to a shared module is not done until every product in its blast radius has been exercised and verified.
3. **The nightly guarantees.** The 5 AM health check pre-flights the shared APIs (mybodygraph branded SVG + Anthropic) before the 6 AM reports run, and checks yesterday's report was complete. The sync (once hardened) refuses to ship a thinner library than it had. These catch a regression the morning after, loudly, instead of a customer finding it.

**Planned enforcement (not yet built): a single cross-product smoke test.** One command that generates a minimal version of all seven products against one fixed chart/date and runs each product's completeness check. Run it after any shared-spine change and before any deploy. This turns the manual "re-verify the blast radius" discipline into one green/red signal. This is the highest-leverage next step for making the system safe to change.

---

## Operational surface (schedules, where things live)

- **Scheduled jobs (macOS LaunchAgents):** `com.delphihd.sync` (3:30 AM, local-only Notion -> library rebuild with the completeness guard), `com.delphihd.health-check` (5 AM pre-flight + digest), `com.delphihd.transit-report` (6 AM + 7:30 backup), `com.delphihd.evening-echoes` (6 PM + 6:30 backup), `com.delphihd.delphi-pull` (nightly `git pull --ff-only`). The sync runs first so the day's reports read a fresh library.
- **Failure visibility:** every product and the sync append to `~/Desktop/HD Reports/System Health/Flags.md` (via `lib/flags.ts`) — the reliable, local record of what went wrong and what the system did. Critical flags also fire a macOS notification. The proposed STOP-vs-flag tiers live in `docs/CRITICAL_ERRORS.md` (draft).
- **Deliverables** land in `~/Desktop/HD Reports/` (Finder-visible), Transits under `~/Desktop/HD Reports/Transits/`.
- **Secrets** in `.env.local` (each standalone script must self-load it; the LaunchAgent wrappers do not inject env).
- **The library cache** is `.cache/chunks.json`; other caches (`.cache/charts`, `.cache/transits`, sun-cross map) are derived and safe to delete.

---

## Where this is going (the target architecture, Phase 4+)

Today's system is the operator toolchain (standalone scripts Kaycee runs, or that run on a schedule). The eventual product is the web app in the master plan: Next.js on Vercel, Supabase Postgres + pgvector for retrieval, a single server-side `invoke-llm` function with prompt caching and a hard cost ceiling, Stripe for subscription state, ElevenLabs for cloned-voice audio. The same two foundations carry over: the synced library becomes the pgvector store, and mybodygraph stays the chart source. The shared-spine discipline in this doc is what has to survive that transition intact, because the web product multiplies the number of consumers.

*Ground-truth companions: INTENT.md (direction), CONTEXT.md (facts), DECISIONS.md (why-we-chose-X), IDENTITY.md / VOICE.md (brand voice).*
