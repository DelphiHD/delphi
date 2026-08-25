# HD Reports — Agent Instructions

This file is the rulebook for AI coding agents working in the `delphi` repo (project name: HD Reports). Read it at the start of any session before doing work.

It mirrors `CLAUDE.md`. When the rules diverge, `CLAUDE.md` is canonical and this file should be updated to match in the same commit.

## Automation is the default

If a thing can be automated, automate it. If a thing currently requires human steps, the right response is "how do we get this off Tennyson's plate?", not "here's the manual procedure." Whenever possible, do not just tell the operator how to set something up. Set it up for them.

This applies to:
- CLI installation, configuration, and login flows.
- Repository housekeeping (commits, branch hygiene, dependency updates).
- Account wiring (env vars, webhook URLs, callback URLs).
- Cron jobs, scheduled tasks, and recurring chores.
- Verification (tests, lints, audits).

When something cannot be done without a human in the loop (e.g., creating an account in a vendor portal, copying a one-time secret out of a UI, signing up for a paid plan), do as much around it as possible and hand back a single-step instruction with the link, the exact button to click, and the exact value to paste back.

Don't suggest breaks or pauses. Keep forward motion on the problem.

## Change governance: no unilateral structural changes

Structural changes are Kaycee's decision, not the agent's. Before making any structural change, present: (1) what the change is, (2) why, (3) its implications and blast radius (which products and consumers it affects, per docs/ARCHITECTURE.md), and (4) the options. Then WAIT for Kaycee's explicit decision. Do not implement first and explain after.

"Structural" means anything that changes how the system is wired or how data is shaped or flows: the sync (what it captures, dedup, checkpoint/overwrite behavior), the data model / schema / chunk shape / Chart type / migrations, any shared "spine" module in the ARCHITECTURE.md blast-radius table (lib/mybodygraph.ts, lib/transit/sky.ts, lib/render/mandala.ts, lib/llm/core.ts, lib/chart/types.ts, the synced library, scripts/sync-notion.ts), how products connect, dependencies, file/folder organization, scheduled jobs, or a system invariant.

She has the whole picture of the methodology and the business; the agent does not. Surface the implications; let her decide. This overrides "Automation is the default" for structural work: automate the doing, never the deciding. Non-structural work (an isolated bug in one product's own logic, copy tweaks, a typo) proceeds normally.

## Read first

These docs are the project's ground truth. Read whichever exist:

- `docs/CONTEXT.md` — factual ground truth.
- `docs/INTENT.md` — strategic ground truth.
- `docs/IDENTITY.md` — brand and lineage voice. Inject into every report-generation prompt.
- `docs/VOICE.md` — how Kaycee writes. Inject alongside IDENTITY.
- `docs/ARCHITECTURE.md` — system map.
- `docs/DECISIONS.md` — append-only log of why-we-chose-X.
- `docs/STACK_PORTED.md` — inventory of Tennyson's prior-work repos being ported in.
- `docs/PHASE_1_HANDOFF.md` — the Phase 1 scaffolding spec.
- `HD-Reports-Master-Plan.md` — the full phase-by-phase build plan.

## Cost discipline (the whole point)

- All Claude API calls go through the `invoke-llm` Supabase Edge Function. No exceptions, no client-side calls.
- Anthropic prompt caching is mandatory on report generation. Cache the static system prompt and the relevant Human Design library chunks.
- Default to Haiku 4.5 for short outputs (transit summaries, classifications). Use Sonnet 4.6 for full reports. Do not use Opus in production.
- Before adding any new path that calls Claude, write a one-paragraph cost note in `docs/DECISIONS.md` (input tokens, expected cache hit rate, output budget, per-call cost estimate).

## Stack rules

- Frontend: Next.js 16 App Router. No client-side secrets. No `NEXT_PUBLIC_*` for anything sensitive.
- Database: Supabase Postgres + pgvector. RLS on by default. Every new table gets a policy in the same migration that creates it.
- Payments: Stripe. The webhook is the source of truth for subscription state. Webhook signature verification before any DB writes.
- Audio: ElevenLabs cloned voice. Generated MP3 in Supabase Storage with signed URLs.
- Transits: Vercel Cron triggers `/api/cron/transits`, which calls the daily-transit edge function.

## Git and deploy

- Branching policy: short-lived branches for anything that touches `invoke-llm`, webhooks, or migrations. Per-branch Vercel previews are the review surface.
- Migrations are date-prefixed: `supabase/migrations/YYYYMMDD_description.sql`.
- No em dashes anywhere in user-facing copy or AI-generated prose. A linter must catch this; prompt-only enforcement leaks.

## Workflow

- Plain-English explanations preferred over heavy ceremony.
- Tests are minimal by design. The three things that DO get real tests: Stripe webhook handling, the cost-ceiling enforcement in `invoke-llm`, RLS policy correctness. Everything else relies on observation in the browser and review.
- Don't add features beyond the task. No premature abstraction. Three similar lines beat a bad helper.
- Markdown is the canonical content format. Notion sync is one-way (Notion → markdown).

## Naming

The repo is `DelphiHD/delphi`, cloned to `~/delphi`. The product is HD Reports. The master plan's Phase 0 block uses the placeholder name `hd-reports`. Treat that as stale text, not a directive. See `docs/DECISIONS.md` for the rename log.

## Drift prevention

A pre-push hook at `.githooks/pre-push` refuses to push if any canonical doc is missing or untracked. This catches the failure mode where docs are edited locally and never committed.

On a fresh clone, run once:

    git config core.hooksPath .githooks

If you intentionally retire a canonical doc, update `.githooks/pre-push`, `CLAUDE.md`, and this file in the same commit.
