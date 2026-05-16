# DECISIONS.md

Append-only log of why-we-chose-X. New entries go at the top. Each entry: date, decision, why, alternatives considered, and any open questions.

---

## 2026-05-16 — Phase 3 V2: GitHub Actions cron instead of Vercel Cron + Edge Function

**Decision.** The nightly Notion → Supabase sync runs as a GitHub Actions workflow (`.github/workflows/sync-notion.yml`), not as a Vercel Cron route or Supabase Edge Function as the master plan envisioned. Triggered nightly at 5:30 UTC plus manual `workflow_dispatch`.

**Why.** A full sync takes about 10 minutes wall-clock (Notion's 3-req/sec rate limit times the four-level traversal for HD The Line Companion). Vercel's Hobby plan caps serverless functions at 60 seconds; Pro is 300 seconds (still under our walltime); Enterprise gets to 800 seconds. Supabase Edge Functions have similar bounds (50 seconds on free, 400 seconds on paid). GitHub Actions has a 6-hour limit and no incremental cost for a job that runs once a night, in an org we already own. The simplest correct tool wins.

**Architecture.** The same `scripts/sync-notion.ts` Kaycee can run locally also runs in the GH Actions runner. Secrets (`NOTION_TOKEN`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) live as GitHub repo secrets, injected via the workflow's `env:` block. The Supabase Edge Function `ingest-markdown` from the master plan is not built. The Vercel cron route `/api/cron/notion-sync` from the master plan is not built. `/api/admin/library-health` is built as a Next.js route on Vercel because it's a quick HTTP read, not a long job.

**Alternatives considered.** (a) Vercel Pro plan ($20/month) to unlock the 300s timeout, then split sync into multiple per-database invocations chained through a queue — too much plumbing for a nightly job we already own a runner for. (b) Self-hosted cron (Tennyson's machine via LaunchAgent) — works but creates a single-point-of-failure tied to one laptop. (c) Vercel Cron triggering a long-running Vercel function on Enterprise — the cost is wrong for our scale. GitHub Actions for the cron + Vercel for the observability endpoint is the right split.

**How to apply.** When new env vars are needed in the sync, add them to both `.env.local` (local dev) and `gh secret set NAME` (GH Actions). When the sync logic changes, edit `scripts/sync-notion.ts`; both the local manual run and the workflow run pick up the change. The cron schedule lives in `.github/workflows/sync-notion.yml`.

**Open.** Whether to mirror the markdown to git as part of the sync (master plan's "Notion → markdown → git → ingest" pattern) — deferred. With the current pipeline, the chunks table in Supabase is the canonical content store. If we later want a git-versioned record of the content, the GH Actions job is the natural place to add the commit step.

---

## 2026-05-16 — Phase ordering: Phase 3 (content pipeline) before Phase 2 (Stripe)

**Decision.** Kaycee asked to push Stripe back. Phase 3 (Notion to pgvector content pipeline) runs next; Phase 2 (Stripe Checkout, orders, entitlements) is deferred until after Phase 4 (the report engine). The "pricing model: Option A" decision still stands; the Stripe-shaped code just lands later.

**Why.** The Phase 3.5 quality gate (master plan lines 507 onward) is the single most important checkpoint in the entire build. The report has to be as good as Kaycee's manual reports. There is no value in shipping Stripe before we know whether the product is good enough to charge for. Reordering doesn't change the launch surface, just sequences the work so we hit the quality decision before the commercial decision.

**Risk and mitigation.** By Phase 4 we have a working report engine and no way to charge for it. Acceptable, because nothing customer-facing ships in Phase 4 — the engine produces reports for internal review against Kaycee's manual baseline, not for paying customers. Stripe lands before public launch.

**How to apply.** Phase 3 prereqs marked "Phase 2 complete" in the master plan are overridden: the content pipeline depends on Notion + OpenAI + Supabase + GitHub, not on Stripe. The `chunks` table has no per-customer aspect (everything lives in the `archive` namespace per STACK_PORTED.md), so no entitlements gating is needed yet.

**Open.** Whether `nearest_chunks` should grow an entitlements check before public launch (probably yes, as a defense-in-depth measure) or only at the `invoke-llm` call site.

---

## 2026-05-16 — Phase 3 V1: single local script (Notion → embed → upsert)

**Decision.** Phase 3 ships in two iterations. **V1 (this commit)** is a single TypeScript script at `scripts/sync-notion.ts` run manually via `npx tsx`. It walks Notion, extracts 826 chunks across 16 source databases (including a four-level traversal for HD The Line Companion's `synced_block → callout → 7 toggles` structure), embeds with OpenAI `text-embedding-3-small`, and upserts into Supabase via delete-then-insert per `source_kind`. A checkpoint at `.cache/chunks.json` lets a failed embed/persist resume without re-walking Notion.

**V2** (separate work, before public launch) adds: the GitHub commit step (markdown lands in git, versioned), a Supabase Edge Function `ingest-markdown` that takes over the embedding work so it runs server-side, a Vercel cron route `/api/cron/notion-sync` that triggers nightly, and `/api/admin/library-health` for spot-checks.

**Why.** V1 lets us verify the pipeline end-to-end (the actual content lands, retrieval works) without committing to the full cron + edge function plumbing. The master plan's Phase 3 spec assumed both pieces from day one; experience says iterate on the data pipeline first, then automate. V2 is straightforward once V1 is verified — most of the work is moving code from a local script into an Edge Function.

**Alternatives considered.** (a) Build V1 + V2 in a single PR — ruled out because debug cycles on a cron + edge function are slower than on a local script, and we hit several Notion API quirks during V1 that would have been harder to diagnose inside an Edge Function. (b) Build V2 first — ruled out for the same reason in reverse.

**How to apply.** Run `npx tsx scripts/sync-notion.ts` to refresh the chunks table after Kaycee edits Notion. Until V2 lands, this is a manual step. The script is idempotent (delete-then-insert per kind), so safe to re-run.

**Open.** V2 timing — probably right before Phase 4 lands so the Phase 4 invoke-llm has a freshly-synced library to query against.

---

## 2026-05-16 — Phase 3 cost note: OpenAI embeddings

**Decision.** Phase 3 uses OpenAI `text-embedding-3-small` (1536 dimensions). Total cost per full sync, with the current 826-chunk library, is roughly $0.02. The chunks table has the embedding column sized for 1536 dimensions; switching models means re-embedding everything.

**Why.** `text-embedding-3-small` is OpenAI's cheapest current embedding model ($0.02 per 1M input tokens) and matches the master plan's choice. Its 1536-dim output is enough quality for HD content retrieval (verified empirically on the 4 test queries in `scripts/test-retrieval.ts`).

**Per-sync cost math.** 826 chunks × roughly 1000 tokens each = ~800,000 tokens × $0.02/1M = **~$0.02 per full sync**. Nightly syncs over a year = ~$7. Negligible. The cost ceiling worry the master plan documents is for `invoke-llm` (Phase 4), not for this pipeline.

**How to apply.** No per-call cost guard needed in V1 because the upper bound is trivial. If we ever sync a much larger library (e.g., absorb Ra's full lecture archive in Phase 4), add a token-count check before calling the embeddings API and cap with a HARD_COST_CEILING_CENTS-style abort.

**Open.** Whether to switch to `text-embedding-3-large` (3072 dims, ~6x more expensive) if retrieval quality on full-report generation turns out to be the limiting factor in Phase 3.5. Default answer is no — the small model is good enough at this scale and the cost discipline rule applies.

---

## 2026-05-10 — Pricing model: Option A (three fixed-length reports)

**Decision.** HD Reports launches with Option A from master plan lines 144 to 157: three fixed report tiers. Single Reading $49 (3,500 words), Deep Reading $79 (5,500 words), Full Reading $129 (8,000 words). The depth-dial / subscription pattern of Option B is parked for a possible later layer on top.

**Why.** The master plan recommends launching simple and adding the depth dial later as a layer on top. Option A is faster to ship, simpler to explain, and lets us measure cost-per-report against a stable target before introducing variable-length output. Predictable revenue per customer makes the first 60 days of post-launch numbers legible. The depth dial can be bolted onto Option A pricing without rebuilding the report engine — Phase 4 already produces fixed-length output, and Phase 5+ can add "go deeper" generation as additional invoke-llm calls against the same chunk cache.

**Alternatives considered.** Option B (base $49 + $7 per "go deeper" section + $19/month subscription) — ruled out for v1 on complexity grounds, kept as a planned post-launch overlay.

**How to apply.** Stripe price IDs in `.env.example` are scoped to Option A (`STRIPE_PRICE_SINGLE`, `STRIPE_PRICE_DEEP`, `STRIPE_PRICE_FULL`). Phase 2 builds three Stripe Checkout flows. Phase 4 prompts produce 3,500 / 5,500 / 8,000-word outputs against the same retrieval set. When Phase 5 considers adding the depth dial, revisit this entry.

**Open.** Daily-letter upsell ($1/day, master plan Phase 6) sits orthogonal to the report-tier choice. Continue to plan for it regardless.

---

## 2026-05-10 — Branching policy: short-lived branches with Vercel previews

**Decision.** Override the master plan's "work on main, push directly" guidance from Phase 0. Use short-lived branches (`claude/<slug>`, `feature/<slug>`, etc.) for any change that touches `invoke-llm`, webhooks, Supabase migrations, or production env vars. Phase 1 scaffolding lands on the `claude/vigilant-curie-e71e20` branch and merges to `main` once verified. Solo work that is contained to copy, docs, or non-production code can still go directly to main.

**Why.** The master plan's Phase 0 said "work on main, push directly." The pre-launch review flagged that as risky for prod-affecting changes. Branch + Vercel preview gives us a deployable build to verify against the real Supabase project before flipping production. Cost: one extra merge step per change. Benefit: every migration and every `invoke-llm` change gets a preview URL to verify before it touches production.

**How to apply.** When scaffolding, migrating, or wiring webhooks: branch first, deploy preview, verify, then merge. CLAUDE.md and AGENTS.md reflect this in the "Git and deploy" section.

**Open.** Whether to enforce via GitHub branch protection on `main` (require PR + 1 review) is not yet configured on the `DelphiHD` org. Decide before Phase 2.

---

## 2026-05-10 — Security headers in `vercel.json`

**Decision.** Phase 1 ships with `vercel.json` setting HSTS (2 years, includeSubDomains, preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a locked-down `Permissions-Policy` (camera, geolocation, microphone, etc. all denied; `payment=(self)` for Stripe Elements later), and a CSP that allows self, Supabase (https + wss for realtime), PostHog (us.i.posthog.com + us-assets.i.posthog.com), Stripe (api.stripe.com + js.stripe.com + hooks.stripe.com), Vercel preview (vercel.live), and Google Fonts.

**Why.** Master plan Appendix A was not yet fleshed out at the time of Phase 1 scaffolding. The header set above is the standard hardened Next.js baseline plus exact host allow-lists for the services this app uses. `frame-ancestors 'none'` prevents clickjacking; `object-src 'none'` blocks legacy plugin attacks; CSP `'unsafe-inline'` is retained on `script-src` because Next.js inlines hydration scripts and PostHog requires it on `style-src`. This is the standard tradeoff for Next.js apps.

**Alternatives considered.** (a) Stricter CSP with nonces — viable but requires custom middleware to inject nonces into every Next.js inline script tag; deferred until the surface area stabilizes. (b) Set headers in `next.config.ts` instead of `vercel.json` — equivalent in effect, but `vercel.json` is the surface Vercel reads first and keeps platform-level config in one place.

**How to apply.** Add new host allow-list entries to `connect-src` / `script-src` / `frame-src` whenever a new external service is wired up. Verify after every deploy with `curl -I <deploy-url>`.

**Open.** Nonce-based CSP. Revisit when the app surface stabilizes.

---

## 2026-05-10 — PostHog wiring revised to fit Phase 1 scaffold

**Decision.** The earlier PostHog entry (further down this log) put the server-side client at `app/posthog.ts` and named the public env var `NEXT_PUBLIC_POSTHOG_TOKEN`. Phase 1 scaffolding revises both: the server-side client moves to `lib/analytics/posthog.ts`, and the env var is renamed to `NEXT_PUBLIC_POSTHOG_KEY`. `.env.local.example` is replaced by a comprehensive `.env.example` that covers every phase. The real PostHog project key is preserved as a commented reference inside `.env.example`.

**Why.** `app/<file>.ts` collides with Next.js App Router conventions; `app/` is for routes and route-adjacent files (`layout.tsx`, `page.tsx`, `route.ts`), not arbitrary utility modules. `lib/analytics/posthog.ts` is the correct home for a server util. The env var rename matches the standard PostHog naming used in their official Next.js docs and in the rest of our `.env.example`. `.env.example` (singular) is the Vercel-recognized convention; the earlier `.env.local.example` was non-standard.

**Alternatives considered.** Keeping `app/posthog.ts` and adding a manifest of "files in app/ that are not routes" — ruled out as fragile. Keeping `NEXT_PUBLIC_POSTHOG_TOKEN` — ruled out for inconsistency with our other env vars.

**How to apply.** When seeding real env values: `cp .env.example .env.local` and fill in `NEXT_PUBLIC_POSTHOG_KEY` from the value preserved as a comment.

**Open.** PostHog reverse-proxy via Next.js rewrites (to reduce ad-blocker interference) is still TODO. Deferred to Phase 7.

---

## 2026-05-10 — Next.js 16 / React 19 / Tailwind v4 baseline

**Decision.** Phase 1 scaffolds Next.js 16.2.6 (App Router, TypeScript), React 19.2.4, Tailwind v4 with `@tailwindcss/postcss`, ESLint 9 via `eslint-config-next`. No `src/` directory. Path alias `@/*` pointing at the repo root. Turbopack as the dev bundler. No shadcn/ui yet — the auth forms are hand-rolled with Tailwind utility classes only.

**Why.** Latest stable Next.js at scaffold time. App Router is mandatory per the master plan. Tailwind v4 ships with `@theme inline` CSS-variable token system which slots cleanly into `lib/design/tokens.ts`. Skipping shadcn/ui at this stage avoids committing to a component lineage before `IDENTITY.md` is filled in; the auth pages are simple enough that vanilla Tailwind is less rework than installing shadcn now and re-styling later.

**Alternatives considered.** Next 15 (older); `src/`-nested layout (rejected per handoff); shadcn/ui at scaffold time (deferred until brand identity is locked).

**How to apply.** When Phase 1 design pass runs (after IDENTITY.md is filled in), initialize shadcn/ui then. The `lib/design/tokens.ts` placeholder values map cleanly to shadcn's `--background` / `--foreground` / etc. CSS variables.

**Open.** Whether to add the `@tailwindcss/typography` plugin for long-form report rendering in the customer portal (Phase 5+).

---

## 2026-05-10 — PostHog analytics wired up (SUPERSEDED by "PostHog wiring revised")

**Decision.** Use PostHog (US Cloud, project 417782) for client-side and server-side analytics. SDK: `posthog-js` (client) and `posthog-node` (server). Initialized via `instrumentation-client.ts` at the Next.js app root using the new `instrumentation-client` file convention (Next.js 15+).

**Why.** PostHog was already chosen in the master plan for analytics. The `instrumentation-client.ts` approach is the current recommended pattern per PostHog docs (avoids the deprecated `_app.tsx` provider pattern). Token and host are stored as `NEXT_PUBLIC_POSTHOG_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` per Next.js public env var conventions.

**Files added.** `instrumentation-client.ts` (client init), `app/posthog.ts` (server-side PostHogClient function), `.env.local.example` (env var template with real token and host).

**Superseded by** the "PostHog wiring revised" entry above. Server-side client moved to `lib/analytics/posthog.ts`; env var renamed to `NEXT_PUBLIC_POSTHOG_KEY`; `.env.local.example` folded into `.env.example`.

---

## 2026-05-10 — Supabase project: `biufjcapnuzbdowoksnb`

**Decision.** HD Reports' Supabase project is `biufjcapnuzbdowoksnb` ("DelphiHD's Project"), West US (Oregon), Free plan. Dashboard URL `https://supabase.com/dashboard/project/biufjcapnuzbdowoksnb`. API URL `https://biufjcapnuzbdowoksnb.supabase.co`.

**Why.** First Supabase project in the DelphiHD org. West US for low latency to Tennyson and Kaycee. Free plan covers Phase 1–3; upgrade to Pro before customer data lands (Phase 5+).

**How to apply.** Phase 1 runs `supabase link --project-ref biufjcapnuzbdowoksnb` to associate the local repo with this project. Migrations land in `supabase/migrations/` and apply via `supabase db push`. Anon key + service-role key come from the dashboard; service-role key never goes in a `NEXT_PUBLIC_*` env.

**Open.** Database password is stored in Tennyson's 1Password vault — share it with Kaycee before she needs to run a migration herself. Upgrade to Pro plan before Phase 5 (customer data + 7-day backup retention). Configure auth redirect URLs in the dashboard once Vercel domain is known.

---

## 2026-05-10 — Pricing model decision is deferred (SUPERSEDED by "Pricing model: Option A")

**Decision.** No pricing tier (Option A vs Option B from master plan lines 144–177) is being chosen at this time. Phase 1 ships without any pricing-shaped code: no `prices` table, no Stripe products, no tier-gating in the UI. The `/portal/welcome` page is a flat landing for any signed-in user.

**Why.** Pricing decisions land best when the product is real enough to price against. Forcing a choice now would either lock in Option A by default (the master plan's recommendation) or scaffold dead code we'll rip out. Deferring also unblocks Phase 1 — the original handoff treated pricing as a prereq, which it isn't for foundation work.

**How to apply.** Phase 1 + Phase 2's payment scaffolding may need a placeholder. If the new session reaches a point where it would write a `prices` or `tiers` table, it should pause and surface the decision instead of guessing. Master plan Phase 2 ("Payments") cannot start until this gap is filled — that's the natural forcing function.

**Superseded by** the "Pricing model: Option A" entry above (Tennyson chose Option A explicitly later in the Phase 1 session). The point this entry made about Phase 1 not needing pricing code is still true — Phase 1 ships without any pricing-shaped code regardless of which tier was picked. The reversal is just that Option A is now on the record so Phase 2 can begin without re-opening the question.

---

## 2026-05-10 — lean-geck (lean-ctx) is dev-time tooling, not a Phase 4 cost lever

**Decision.** lean-ctx (Tennyson's fork: `lean-geck`) is installed on Tennyson's local machine to compress the context that AI coding tools (Claude Code, Cursor, Copilot, Windsurf, Gemini CLI) send to their LLMs during build sessions. It is **not** integrated into `invoke-llm`, **not** ported to TypeScript for the Edge Function, **not** run as a sidecar. Installed via `curl -fsSL https://leanctx.com/install.sh | sh` on 2026-05-10 (binary at `~/.local/bin/lean-ctx`, version 3.5.13).

**Why.** First-pass STACK_PORTED.md called lean-geck "the Phase 4 cost lever" and proposed porting its compression rules into `invoke-llm`. On a closer read of the upstream README, the 99% / 88% reduction figures apply to specifically *coding-agent input streams* — file reads, `git status`, `ls`, test runner output. None of that is what a customer report-generation call to Claude looks like. A report call sends a system prompt (IDENTITY + VOICE + template), retrieved chunks, and a user message — there's no shell-output bloat to compress. lean-ctx solves a different problem.

The Phase 4 cost target (under 30¢/report) is met by what the master plan already prescribes: Anthropic prompt caching, capped retrieval (top 12 chunks), Sonnet/Haiku model routing per output length. lean-ctx adds nothing on top of those for the customer flow.

**Alternatives considered.** (a) Port lean-ctx's compression rules to TypeScript and inline in `invoke-llm` — ruled out: the rules don't apply to report-shaped prompts. (b) Run lean-ctx as a sidecar HTTP service called by `invoke-llm` — ruled out: same. (c) Use lean-ctx only on the dev side — adopted.

**How to apply.** When STACK_PORTED.md, master plan Phase 4, or any prompt template references "lean-geck for Phase 4 cost reduction" treat it as stale and read the current `STACK_PORTED.md` `lean-geck` entry. The dev-side install is real value: it compounds savings every Claude Code session, every code review with Codex, every Cursor edit. Run `lean-ctx setup` once to auto-configure detected editors.

**Open.** None for HD Reports runtime. Optional: enable lean-ctx's MCP server in Tennyson's Claude Code config to also reduce file-read token costs across this project specifically.

---

## 2026-05-10 — OpenBrain (FSL-1.1-MIT) is safe to use in HD Reports

**Decision.** OpenBrain is approved for use as the canonical memory infrastructure in HD Reports. License is FSL-1.1-MIT (Functional Source License v1.1, MIT Future License).

**Why.** The FSL "Permitted Purpose" clause restricts use to anything except a "Competing Use", which it defines as a commercial product or service that (1) substitutes for OpenBrain itself, (2) substitutes for any other product/service the licensor offers using OpenBrain, or (3) offers the same or substantially similar functionality. The clause then explicitly enumerates Permitted Purposes: "for your internal use and access" (and non-commercial education, non-commercial research, etc.).

HD Reports uses OpenBrain as **internal memory infrastructure inside a paid Human Design product**. We are not offering memory-as-a-service; we are not selling OpenBrain or anything that substitutes for it. We are a downstream consumer using it for our own access, exactly the case the Permitted Purpose clause describes. Two years after each release, the FSL converts to plain MIT and even this constraint disappears.

This is an opinion based on a close read of OpenBrain's LICENSE.md, not legal advice. If HD Reports later raises money, ships at scale, or pivots toward a memory-product offering, get a real lawyer to confirm.

**Alternatives considered.** mnemo-cortex (MIT, fully local SQLite — kept as reference, not deployed because it duplicates the Supabase store), memory-palace (MIT, ChromaDB — same reason). OpenBrain wins on Supabase + pgvector alignment with our existing stack.

**How to apply.** Phase 3 ingestion writes to OpenBrain-shaped tables in the same Supabase project as the rest of HD Reports. No second database. Phase 4's `invoke-llm` queries those tables for retrieval.

**Open.** safe-chain-aikido-security has no license file at all. Separate problem, tracked in STACK_PORTED.md open questions.

---

## 2026-05-10 — Repo named `delphi`, not `hd-reports`

**Decision.** The GitHub repo is `github.com/DelphiHD/delphi`. The local clone lives at `~/delphi`. The product is still called HD Reports.

**Why.** "hd-reports" was a placeholder used in early drafts of the master plan. "Delphi" is the project codename Kaycee and Tennyson chose for the build. Master plan Phase 0 still says `hd-reports` in the Start Here block; treat that as a stale string, not a directive. The CLAUDE.md and this DECISIONS.md are the source of truth for naming.

**How to apply.** Any prompt or doc that says `~/code/hd-reports` or `gh repo create hd-reports` should be read as "the delphi repo at `~/delphi`". Don't rename the repo to match the master plan; update the master plan instead when there's a natural moment.

**Open.** None. Naming is stable.

---

## 2026-05-10 — Ported stack lives at `DelphiHD/*`, not `tennysonmilesperhour/*`

**Decision.** The 19 forks listed in `STACK_PORTED.md` have been re-forked into the `DelphiHD` GitHub org. That org is the canonical home for HD Reports work.

**Why.** Keeps everything HD-Reports-related under one org for access control, billing, and visibility. Tennyson's personal `tennysonmilesperhour` copies still exist as an upstream layer for many of these forks; we don't depend on them, but they're not deleted.

**How to apply.** When code, docs, or prompts reference a ported repo, point at `DelphiHD/<name>`. If you find a stale `tennysonmilesperhour/*` reference, update it.

**Open.** Branch protection, default-branch policy, and team permissions on the DelphiHD org are not yet configured. Decide before Phase 1 ships.

---
