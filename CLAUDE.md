# HD Reports — Claude Code Instructions

This file is the agent rulebook for the `delphi` repo (project name: HD Reports). Read it at the start of any session before doing work.

## Automation is the default

If a thing can be automated, automate it. If a thing currently requires human steps, the right response is "how do we get this off Tennyson's plate?", not "here's the manual procedure." Whenever possible, do not just tell the operator how to set something up — set it up for them.

This applies to:
- CLI installation, configuration, and login flows.
- Repository housekeeping (commits, branch hygiene, dependency updates).
- Account wiring (env vars, webhook URLs, callback URLs).
- Cron jobs, scheduled tasks, and recurring chores.
- Verification (tests, lints, audits).

When something *cannot* be done without a human in the loop (e.g., creating an account in a vendor portal, copying a one-time secret out of a UI, signing up for a paid plan), do as much around it as possible and hand back a single-step instruction with the link, the exact button to click, and the exact value to paste back.

Don't suggest breaks or pauses. Keep forward motion on the problem.

## Change governance: no unilateral structural changes

Structural changes are Kaycee's decision, not the agent's. Before making any structural change, present: (1) what the change is, (2) why, (3) its implications and blast radius — which products and consumers it affects, per `docs/ARCHITECTURE.md` — and (4) the options. Then WAIT for Kaycee's explicit decision. Do not implement first and explain after.

**"Structural"** means anything that changes how the system is wired or how data is shaped or flows: the sync (what it captures, dedup, checkpoint/overwrite behavior), the data model / schema / chunk shape / `Chart` type / migrations, any shared "spine" module in the ARCHITECTURE.md blast-radius table (`lib/mybodygraph.ts`, `lib/transit/sky.ts`, `lib/render/mandala.ts`, `lib/llm/core.ts`, `lib/chart/types.ts`, the synced library, `scripts/sync-notion.ts`), how products connect, dependencies, file/folder organization, scheduled jobs, or a system invariant.

She has the whole picture of the methodology and the business; the agent does not. A change that looks like a harmless efficiency win can break another product downstream or silently drop source material. Surface the implications; let her decide. **This overrides "Automation is the default" for structural work: automate the doing, never the deciding.** Non-structural work (fixing an isolated bug inside one product's own logic, copy tweaks, a typo) proceeds normally.

## Read first

These docs are the project's ground truth. Read whichever exist:

- `AGENTS.md` — mirror of this rulebook for non-Claude agents (Codex, etc.). Keep in sync.
- `docs/CONTEXT.md` — factual ground truth.
- `docs/INTENT.md` — strategic ground truth.
- `docs/IDENTITY.md` — brand and lineage voice. Inject into every report-generation prompt.
- `docs/VOICE.md` — how Kaycee writes. Inject alongside IDENTITY.
- `docs/ARCHITECTURE.md` — system map.
- `docs/DECISIONS.md` — append-only log of why-we-chose-X.
- `docs/NEW_CLIENT_CHECKLIST.md` — how to add a person, and the traps in doing it.
- `docs/CRITICAL_ERRORS.md` — what counts as a stop-the-line failure, per product.
- `docs/STACK_PORTED.md` — inventory of Tennyson's prior-work repos being ported in.
- `docs/PHASE_1_HANDOFF.md` — the Phase 1 scaffolding spec.
- `docs/PHASE_4_HANDOFF.md` — current state of the Planetary Overview build (v3). READ THIS when continuing PO work.
- `HD-Reports-Master-Plan.md` — the full phase-by-phase build plan.

## Continuity between sessions

Kaycee works across many chats. A decision reached in one is worthless if the next
one cannot see it, and making her explain the same thing twice is the failure mode
this section exists to prevent.

**Before starting work on anything that sounds like it has history, look for that
history.** In order:

1. The docs above. `docs/NEW_CLIENT_CHECKLIST.md` in particular is easy to miss and
   contains the traps; on 2026-08-26 an agent rebuilt the client-adding process for
   an evening without ever opening it, and repeated a gotcha written down in it.
2. Prior sessions. They are readable: list them, search their transcripts, and read
   the relevant one. If Kaycee says "we worked this out in another chat," that is not
   background colour, it is an instruction to go and read it before touching anything.
3. `git log` on the files involved. Today's work is usually today's commits.

**Before a context window fills, write the decisions down.** A session that ends
without committing what it decided has cost her the work. Non-obvious conclusions go
in the doc they belong to (`DECISIONS.md` for why-we-chose-X, the product's own doc
for how-it-works), in the same commit as the change.

**Never rebuild something that already exists.** If a process, script or checklist
covers the task, use it. Adding a wrapper on top of working machinery is where the
failures come from, and the wrapper is what gets blamed on the machinery.

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

- Branching policy: short-lived branches for anything that touches `invoke-llm`, webhooks, or migrations. Per-branch Vercel previews are the review surface. See the Phase 1 branching DECISION entry.
- Migrations are date-prefixed: `supabase/migrations/YYYYMMDD_description.sql`.
- No em dashes anywhere in user-facing copy or AI-generated prose. A linter must catch this; prompt-only enforcement leaks.

## Workflow

- Plain-English explanations preferred over heavy ceremony.
- Tests are minimal by design. The three things that DO get real tests: Stripe webhook handling, the cost-ceiling enforcement in `invoke-llm`, RLS policy correctness. Everything else relies on observation in the browser and Codex Cloud's review.
- Don't add features beyond the task. No premature abstraction. Three similar lines beat a bad helper.
- Markdown is the canonical content format. Notion sync is one-way (Notion → markdown).

## Skills (load when relevant)

`cost-aware-llm-pipeline`, `claude-api`, `iterative-retrieval`, `postgres-patterns`, `database-migrations`, `nextjs-turbopack`, `knowledge-ops`, `brand-voice`, `eval-harness`.

## Ported tooling

The forks under `DelphiHD/*` are listed in `docs/STACK_PORTED.md`. Phase 4 integrates the memory-architecture and cost-reduction repos at the `invoke-llm` layer. Don't reinvent what already exists in those repos — read STACK_PORTED.md first.

## Naming

The repo is `DelphiHD/delphi`, cloned to `~/delphi`. The product is HD Reports. The master plan's Phase 0 block uses the placeholder name `hd-reports` — treat that as stale text, not a directive. See `docs/DECISIONS.md` for the rename log.

## Drift prevention

A pre-push hook at `.githooks/pre-push` refuses to push if any file listed in "Read first" above is missing locally or exists but is untracked. This catches the failure mode where canonical docs are edited locally and never committed.

On a fresh clone, run once:

    git config core.hooksPath .githooks

If you intentionally retire a canonical doc, update both `.githooks/pre-push` and the "Read first" list in this file in the same commit.

## Phase 1 state (current)

Phase 1 scaffolding has landed: Next.js 16 App Router on Vercel, Supabase Auth wired up via `@supabase/ssr`, middleware-gated `/portal/*`, the `profiles` migration with RLS, security headers in `vercel.json`, PostHog instrumentation at `instrumentation-client.ts` and `lib/analytics/posthog.ts`, design tokens stub at `lib/design/tokens.ts`, all canonical docs seeded under `docs/`. The 18 ported forks all live under `DelphiHD/*` per `docs/STACK_PORTED.md`.

A LaunchAgent at `~/Library/LaunchAgents/com.delphihd.delphi-pull.plist` keeps `~/delphi` synced with the remote daily and on every login.
