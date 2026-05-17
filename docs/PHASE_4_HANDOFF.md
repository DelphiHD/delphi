# Phase 4 Session B handoff

What landed in this session and what Kaycee needs to do to put the rest into production.

## What's in the branch

### Report engine
- `lib/llm/core.ts` — pure `invokeLLM` wrapper around Anthropic's messages API with prompt-cache control, multi-block caching, cost accounting per model, retry on transient `ECONNRESET` / 5xx / 429, and a hard cost-ceiling exception (`CostCeilingExceeded`). Imports only `fetch`, so it runs in Deno and Node.
- `lib/retrieval/chartChunks.ts` — per-chart retrieval. Given a `Chart`, fetches every relevant library chunk (type, authority, profile, definition, cross, quarter, all 9 centers, every defined channel, every unique gate, every per-line activation) via exact-match on `kind` / `gate_number` / `line_number`. Returns a `RetrievalResult` with `missing` items the caller can log.
- `lib/chart/serialize.ts` — converts a `Chart` into the text representation the prompt consumes, including a computed Right/Left brain-mind cognitive frame so the model never has to derive it from the four arrow lines.
- `lib/report/foundation.ts` — Foundation Report generator. Three lengths (`short` / `standard` / `long`). The default `standard` makes three Claude calls with one shared cache block per call. Strips em dashes as a post-process safety net.
- `scripts/generate-report.ts` — local iteration runner. `npx tsx scripts/generate-report.ts <chris|sean|meelad>` produces `.cache/reports/<slug>-foundation.md` and prints per-section token + cost telemetry.

### Cross extraction
- `scripts/import-crosses.ts` — rewritten with Claude Haiku 4.5 instead of regex. Extracts cross sections, validates against HD profile geometry, slices verbatim source by start-anchor with whitespace-tolerant matching, writes / fills the 192 cross pages in Kaycee's `HD Incarnation Crosses` Notion database. Q1 cost: $0.27. All four PDFs: ~$1.10.

### Infrastructure
- `supabase/migrations/20260517_phase4_reports.sql` — adds `reports`, `usage_events`, `chunk_retrievals` tables with RLS, the per-report cost-tracking columns, and the `touch_report_completed` trigger.
- `supabase/functions/invoke-llm/index.ts` — the production Edge Function the master plan describes. Wraps `lib/llm/core.ts`, parses the caller's user id from the JWT, logs a `usage_events` row on every call (success, ceiling-exceeded, or error). Cost ceiling configurable via `HARD_COST_CEILING_CENTS` (default 80 ¢).
- `docs/IDENTITY.md` — filled in from `.claude/skills/hd-analysis/SKILL.md` plus a close reading of the benchmark report on Kaycee's Desktop. Lineage, methodology non-negotiables, vocabulary in and out.
- `docs/VOICE.md` — same source. Cadence, rhythm, sentence length, opening / closing patterns, the audio test.

## What needs a human touch to ship

Three steps. All small.

### 1. Apply the new migration

The Supabase project ref is `biufjcapnuzbdowoksnb`. The migration file is `supabase/migrations/20260517_phase4_reports.sql`.

Pick one:

**Option A (fastest, one paste).** Open the dashboard SQL editor at https://supabase.com/dashboard/project/biufjcapnuzbdowoksnb/sql/new , paste the file's contents, click "Run". This runs the SQL against the live database. The 0510 and 0516 migrations are already in place; the 0517 file only adds new tables and a trigger, no destructive operations.

**Option B (CLI).** `supabase login` then `supabase link --project-ref=biufjcapnuzbdowoksnb` then `supabase db push`. The CLI will ask for the database password (it's in 1Password under the Supabase project) before pushing.

### 2. Deploy the Edge Function

After step 1:

```
supabase functions deploy invoke-llm --project-ref=biufjcapnuzbdowoksnb
supabase secrets set ANTHROPIC_API_KEY=<rotated key> --project-ref=biufjcapnuzbdowoksnb
supabase secrets set HARD_COST_CEILING_CENTS=80 --project-ref=biufjcapnuzbdowoksnb
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into Edge Functions by the platform; no need to set them.

### 3. Rotate the API keys

Per the brief, every key pasted into this conversation should be rotated:

- Anthropic console: https://console.anthropic.com/settings/keys . Generate new, set in Vercel env vars + GH Actions secrets + Supabase function secrets. Revoke the old one.
- OpenAI: https://platform.openai.com/api-keys . Same pattern.
- Notion integration secret: https://www.notion.so/profile/integrations . Rotate the integration's internal secret.
- Supabase service role: only rotate if needed; service role key revocation requires regenerating both anon and service-role keys together, which means redeploying Vercel and GH Actions in lockstep. The key has not left this conversation, so the practical risk is low.

## Quality checkpoint

`.cache/reports/chris-foundation.md` is the first end-to-end Foundation Report. Compare against the benchmark at `~/Desktop/Benchmark Reports/Chris Kulish - Human Design Analysis.docx`.

Things to evaluate side by side:

- **Lineage fidelity.** Does each section sound like it's organizing Ra's material against Chris's chart, or does it sound like the model generating HD content?
- **No softening.** Detriments and challenging open-center patterns should be named with full directness. Search for hedges ("might," "could," "perhaps," "growth opportunity") and flag any that slipped in.
- **Body-first sequencing.** Variables / PHS appears before Type / Strategy / Authority.
- **Audio cadence.** Read a few paragraphs aloud. Does it stumble?
- **Specificity.** Does every section thread Chris's specific chart details, or does it generalize to "Manifestors typically..."?

When the report falls short:

- Edit the system prompt in `lib/report/foundation.ts` (the `MASTER_SYSTEM` constant).
- Edit `docs/IDENTITY.md` or `docs/VOICE.md` directly if the failure is voice-shaped rather than structure-shaped.
- Rerun `npx tsx scripts/generate-report.ts chris`. The script prints per-section cost, lint results, and word count.

The retrieval surface is also adjustable in `lib/retrieval/chartChunks.ts`. If the model is missing material, the `missing` list at the top of the script's output is the first place to look.

## Known gaps

- **The 192-cross bulk import has a ~16 % rejection rate.** Q1 had 8 of 49 sections rejected because Claude's anchor strings didn't match the source text after normalization. Rejected sections land in `.cache/cross-rejects.json` for manual review. The rejection rate is acceptable for a one-time bulk import (the alternative is weeks of manual entry).
- **Variable retrieval is sparse.** The library encodes variables by 6-letter cognitive code ("PRR DRR") rather than by individual theme name ("Cold," "Kitchens"). The current report engine writes the Variables section from the chart's theme labels + the IDENTITY / VOICE specs rather than from retrieved chunks. When per-theme library entries land, wire them in at `lib/retrieval/chartChunks.ts`.
- **The migration is not yet applied.** Until step 1 above happens, the Edge Function can't log usage events. The local iteration loop (`scripts/generate-report.ts`) doesn't need the migration — it prints cost to stdout instead.
- **The cron cache warmer from the master plan is not built.** Defer until reports are being generated regularly enough to make cache warming worth the complexity.
