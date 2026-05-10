# HD Reports

## A Master Plan for Building Kaycee's Human Design Practice into a Paid Product

Prepared by Tennyson, with Claude as a thinking partner. Phase-based build, AI-operated, designed to be executed by two people.

---

## A Letter to Kaycee

Hey Kaycee,

I've been thinking a lot about what you've built, and I want to start by saying something straightforward: the thing you've already done is the hard part. You spent years finding original Ra Uru Hu material that almost nobody else has bothered to assemble. You built a private archive. You learned how to synthesize it into readings that genuinely help people. The fact that your manual reports are accurate and getting better is the moat. Everything in this document is just plumbing built around that.

What we're going to do together is take your archive and your interpretive instincts, and turn them into a product that delivers itself. You stay in charge of the voice, the source material, the quality, and the relationship with the customer. The system handles the assembly. The phrase I keep coming back to is **AI-organized, not AI-generated.** Every word in a customer's report comes from the library you've built. The AI's only job is to find the right pieces for that person's chart and lay them out in your voice. That distinction is the heart of the whole thing, and it's what makes this defensible in a category that is otherwise getting flooded with thin AI content.

Here is what I'm asking from you, in plain terms. I'll handle the technical build. I need your voice, your source material, your judgment on quality, and your willingness to record a few hours of audio so we can clone your voice for the audio reports. I need you to review the first stretch of automated reports against your manual ones and tell me when they're good enough to ship. And I need you to tell me when something feels off, even if you can't articulate why, because your instinct on this is more reliable than any test I can write.

What you can expect from me is that I'll keep the cost-per-report low (this is the whole reason we're doing this; your manual process burns 20% of usage per report and that's the bottleneck), I'll keep the architecture clean enough that we can change directions later without rebuilding from scratch, and I'll keep the moving pieces small enough that two people can actually run this. We're not building Spotify. We're building something more like a private studio that produces beautiful work for a specific audience.

A few things could go wrong, and I want to name them so we both watch for them. The reports could regress in quality compared to your manual process, in which case we stop and tune until they don't. The cost could blow up if we don't cache aggressively, in which case we pause and fix. Customers might want something different from what we're guessing they want, in which case we listen and adjust. None of these are existential. All of them are why we're starting with a small group and growing carefully rather than launching to the world on day one.

The shape of this document is: a big-picture map at the front, then eight phases of work, then templates for the files and prompts you'll use along the way. You don't need to read it cover to cover. You need to know roughly where we're going, and then we'll go phase by phase. I'll be in the cockpit with you for all of it.

Let's build something good.

— Tennyson

---

## Executive Summary

**What we are building.** A paid web app that delivers personalized Human Design readings as written reports, narrated audio in Kaycee's cloned voice, and PDFs. Customers receive a weekly synthesis tied to current transits and can opt into deeper daily readings. The library of source material, drawn from Kaycee's private archive of Ra Uru Hu's original work, lives as markdown in a version-controlled repository, organized into a searchable knowledge base, and queried by the AI system for every report.

**Why now.** Kaycee's manual process produces excellent reports but takes two hours each and consumes roughly 20% of her AI usage allowance per report. That ceiling caps the practice at a few reports per day before it stops being economically viable. The fix is architectural: aggressive caching, selective retrieval, and a properly-built pipeline reduce per-report cost by a factor of 5-10. That unlocks scale without sacrificing quality.

**The positioning.** AI-organized, not AI-generated. The product is built on a private archive of original source material that Kaycee has spent years assembling. The AI's role is to organize that archive against an individual chart, in Kaycee's voice. This is the defensible position in a category that is otherwise getting commoditized.

**Who runs it.** Two people. Tennyson handles infrastructure, integrations, and AI orchestration. Kaycee handles voice, source material, brand, customer relationship, and quality review. Neither writes production code by hand. Both work primarily by directing AI tools (Claude Code, Codex, Claude Chat) through copy-paste prompts that this document provides.

**The shape of the build.** Eight phases, in roughly this order: foundation and authentication; payments and billing; content pipeline from Notion to RAG; report generation engine; audio and PDF rendering; weekly and daily transit systems; marketing site and quality evaluation; launch and observation. The phases are flexible in time. Some compress to days. Others stretch to weeks. The order matters more than the calendar.

**The bet on cost.** Every Claude API call goes through a single server-side function with prompt caching, model routing, and a hard cost ceiling. Each new feature that touches the AI must justify its cost in writing before being merged. This discipline is what separates a hobby that hits a usage wall from a business that scales.

**Success at launch.** Ten paying customers receiving weekly readings, with capacity to onboard more. Per-report cost under thirty cents. Quality parity or better with Kaycee's manual reports, validated by her review. Audio in her cloned voice. PDFs that look professional. A customer portal that works.

**Success at six months.** A self-sustaining practice with a meaningful subscriber base, a growing library, automated weekly delivery, and a clear path to either deepening the product (more sophisticated personalization, the chart conversation feature, compatibility readings) or widening it (selling to other Human Design practitioners as a platform).

---

## The One-Page Plan

| Phase | Goal | Primary owner | Ship state |
| :---- | :---- | :---- | :---- |
| **1\. Foundation** | Deployable web app with auth, database, security headers, project scaffolding. | Tennyson | Fresh user can sign up, log in, see an empty portal. |
| **2\. Payments** | Stripe end-to-end with three pricing tiers, webhooks idempotent, billing portal. | Tennyson | Test purchase produces an active subscription. |
| **3\. Content pipeline** | Notion library syncs to markdown, markdown ingests to vector database, retrieval works. | Tennyson, with Kaycee tagging library | Test query returns the right source chunks. |
| **3.5. Quality parity gate** | Three test reports generated against three real charts Kaycee has done manually. Blind-scored against the originals. | Kaycee scores, Tennyson tunes | Average quality score meets or beats manual. Do not pass this gate until it does. |
| **4\. Report engine** | Reports generate end-to-end through a cost-controlled pipeline with prompt caching. | Tennyson | Real report produced for under thirty cents. |
| **5\. Delivery** | Audio in Kaycee's cloned voice, beautiful PDF, email delivery, customer portal showing past reports. | Tennyson, Kaycee records voice | Customer receives audio plus PDF in inbox. |
| **6\. Transits** | Weekly synthesis generated for each subscriber. Optional metered daily reports. | Tennyson, Kaycee writes templates | Weekly letter arrives Sunday morning. |
| **7\. Marketing and evaluation** | Landing page, founder story, testimonials, eval harness, support flow. | Tennyson builds, Kaycee writes copy | Site is live, evals run nightly. |
| **8\. Launch** | Public availability, ten paying customers, daily monitoring rhythm. | Both | Ten people have paid and received their first report. |

---

## The Visual Web

A standalone SVG accompanies this document (`hd-reports-system-map.svg`). It shows every piece of the system grouped into five zones: Content, Generation, Delivery, Customer, Operations. As each piece ships, color it in. By Phase 8, the whole map should be filled.

A printable companion checklist mirrors the same nodes and lives at the end of this document.

---

## How to Use This Manual

This document is built to be paste-and-go, not read-and-interpret. Here is the working pattern.

**Each phase has the same shape.** A "Start Here" block at the top with a copy-paste prompt for whichever AI tool drives that phase. Prerequisites you can check off. The work itself, with embedded prompts. A swimlane showing who does what. Files that get created or changed. Watch-outs to scan before you begin. Phase exit criteria so you know when to move on.

**The four-corner workflow.** For any meaningful piece of work:

1. **Plan** with Claude Chat. Get a clear spec on paper.  
2. **Build** with Claude Code. It writes the code on the main branch.  
3. **Verify** with Codex Cloud. Run a parallel review for security, correctness, and rule compliance.  
4. **Validate** in the browser. Click through it like a customer.

Most phases include all four. A few skip Codex Cloud when the work is too small to justify it. The doc tells you which is which.

**When something fails.** Read the error to Claude Code first; it can almost always self-correct. If it can't, ask Claude Chat to mediate by reading the failing output. If you and the AI disagree, trust your instinct and tell it why; it will adjust. Don't push through something that feels wrong.

**The "Start Here" blocks are sacred.** They contain everything the AI needs to begin work, including the relevant context from this doc. Paste them whole. Don't summarize. Don't pre-explain. The point is to remove operator overhead.

**Skipping ahead.** Each Start Here prompt verifies its own prerequisites before doing work. If you jump into Phase 5 without finishing Phase 4, the prompt will notice and stop. So the doc is resilient to non-linear execution.

**Where this doc lives.** Keep a copy in the project repo at `docs/MASTER_PLAN.md`. When something changes meaningfully (a vendor switch, a structural decision), update the relevant section and add a note in `docs/DECISIONS.md`. The doc is version-controlled along with the code.

---

## The Tools and Their Roles

Different AI tools, different jobs. Don't pick one. Use each for what it's best at.

**Claude Code** is the primary builder. It owns the repo. All scaffolding, schema, production code, and anything that touches the live system goes through Claude Code. It runs locally on Tennyson's machine and reads `CLAUDE.md` as its rulebook.

**Codex Cloud** (inside the ChatGPT app) is the verifier and parallel worker. It reviews Claude Code's diffs for security and correctness, runs long-parallel jobs in cloud sandboxes, and contributes a different reasoning style as a second opinion. It reads `AGENTS.md`, which mirrors `CLAUDE.md`.

**Codex CLI** is an auxiliary builder that can work in a separate worktree on the same repo, useful when you want two parallel agents on independent features.

**ChatGPT Operator** (or Codex's browser mode) is the scout. Use it for vendor portal checks, Notion exploration the API can't easily do, and any web flow that lacks a clean API. Read-only by default.

**Claude Chat** is the planner and writer. Use it for thinking-out-loud sessions, copy drafting, brand voice exploration, customer support responses, and mediating disagreements between Claude Code and Codex. It does not drive the repo directly.

**The pairing pattern.** Default flow for any meaningful feature: Claude Chat plans → Claude Code builds → Codex Cloud verifies → Operator (the human) validates in the browser. Memorize the four corners. They show up in every phase.

---

## The Decisions, Already Made

These eight binary choices shape the build. Each is decided. Pros and cons are documented in `docs/DECISIONS.md`.

**Web framework.** Next.js 16 with the App Router. Native Vercel Cron, server actions for webhooks, App Router conventions for portal routes.

**Auth provider.** Supabase Auth. Same vendor as the database. Magic link plus email/password. Row-Level Security ready.

**Chart calculation.** HumanDesignHub API for v1, with a chartProvider adapter so we can swap to a self-hosted MCP chart service later. Free tier is 100 calls per month; we cache aggressively.

**Audio narration.** ElevenLabs voice clone of Kaycee. Five-minute recording produces a voice she can use for every audio report. This is a brand differentiator; the cloned voice is what makes the audio feel like hers.

**Cron and scheduling.** Vercel Cron triggering Next.js routes that call Supabase Edge Functions. Simplest path, fewest moving parts.

**Notion sync.** One-way, Notion to GitHub markdown, nightly. Kaycee keeps editing in Notion. The repo is the source of truth at sync time.

**Transactional email.** Resend. Best developer experience. Templates as React components.

**PDF rendering.** Playwright on a Vercel function. Real fonts, real CSS, beautiful output. Fall back to PDFShift only if cold-start times exceed ten seconds.

---

## The Pricing Model: Two Options

This is the one product decision I'm leaving open for Kaycee to pick. Both are good. They optimize for different things.

### Option A: Three Fixed Report Lengths

Three tiers at fixed lengths. Customer picks which depth they want.

- **Single Reading $49.** Standard 3,500-word report.  
- **Deep Reading $79.** Extended 5,500-word report with additional sections.  
- **Full Reading $129.** Maximum 8,000-word report covering every aspect.

**Pros.** Simple to explain. Simple to price. Easier to test quality at fixed boundaries. Matches existing market expectations for spiritual readings. Revenue per customer is predictable.

**Cons.** Customers don't always know which depth to pick. No engagement signal once delivered. No upsell path inside the product. Can't capture data on what people want more of.

**When to choose this.** If Kaycee wants a clean, traditional product with predictable economics and minimal complexity in the customer experience.

### Option B: One Report \+ Depth Dial

One base report, then in-portal "go deeper" buttons that generate additional sections on specific topics for a small per-section price.

- **Base Reading $49.** Comprehensive 3,000-word foundational report.  
- **Go Deeper sections $7 each.** Customer can click "go deeper on your inner authority," "go deeper on your purpose," "go deeper on your relationships," etc. Each click generates a new 800-word section against their chart.  
- **Subscriber tier $19/month.** Unlimited go-deeper sections, plus weekly synthesis.

**Pros.** Lower entry price (more conversions). Captures real engagement data on what people care about. Organic upsell path. Customers shape their own experience and feel agency. Pricing feels fair (you pay for what you're curious about).

**Cons.** More complex to build. Harder to forecast monthly revenue. Can feel transactional if not designed carefully. Requires a polished in-portal experience.

**When to choose this.** If Kaycee wants long-term engagement data, a stickier product, and is comfortable with a slightly more complex build.

### Recommendation

Both work. If Kaycee leans toward simplicity, Option A. If she leans toward learning what her customers want and building over time, Option B. A reasonable middle path is to launch with Option A, run it for two months, then add the depth dial as a layer on top. This document defaults to Option A in the build instructions, with notes in Phase 4 and Phase 5 on how to swap to Option B if she chooses it before then.

**Decision required by end of Phase 1\.** Document the choice in `docs/DECISIONS.md`.

---

## Phase 0: Setup (Before the Phases Begin)

**What ships.** Both operators have accounts, keys, tools installed. Voice clone recording captured. First markdown library slice ready.

**Who does what.**

Tennyson:

- Create accounts: Vercel, Supabase, Stripe, ElevenLabs, Resend, HumanDesignHub, PostHog, GitHub.  
- Set Stripe to test mode.  
- Create the GitHub repo `hd-reports`.  
- Install Claude Code locally and verify with `claude --version`.  
- Install Codex CLI: `npm i -g @openai/codex` (or current).  
- Subscribe to ChatGPT Plus for Codex Cloud access.  
- Install Vercel CLI: `npm i -g vercel`.  
- Set up shared 1Password vault and add Kaycee.

Kaycee:

- Record a 5-minute voice sample reading three of her existing report intros (used for ElevenLabs voice clone in Phase 5).  
- Identify the top 50 chunks of content from her Notion library (gates, channels, types) for the initial sync.  
- Draft a 200-word founder story.  
- Pick three sample charts from existing customers (with permission) we'll use as test cases in the quality parity gate.  
- Walk Tennyson through one full report generation in her current system, recording every prompt and reference, so the workflow can be ported.

### Start Here: Phase 0 Terminal Setup

\# COPY → TERMINAL (run from anywhere on Tennyson's machine)

mkdir \-p \~/code/hd-reports && cd \~/code/hd-reports

git init

gh repo create hd-reports \--private \--source=. \--remote=origin

echo \-e "node\_modules/\\n.env\*\\n.next/\\n.vercel/\\n.DS\_Store" \> .gitignore

git add .gitignore && git commit \-m "init: gitignore"

git push \-u origin main

### Start Here: Kickoff Call Agenda

A 90-minute call between Tennyson and Kaycee at the start of Phase 1, before any building begins.

COPY → CALL AGENDA

1\. Walk through the executive summary together (10 min).

2\. Walk through the visual web. Identify any pieces Kaycee wants to add or question (15 min).

3\. Demo the four-corner pattern with one trivial example: Claude Chat plans, Claude Code builds, Codex verifies, browser validates (15 min).

4\. Set up shared access: 1Password vault, Notion workspace, GitHub for visibility (10 min).

5\. Agree on daily standup time (10 min).

6\. Choose pricing model: Option A or Option B. Document in DECISIONS.md (10 min).

7\. Walk through one of Kaycee's existing reports together. Tennyson records the workflow (15 min).

8\. Confirm voice clone recording slot for this week (5 min).

---

## Phase 1: Foundation

**What ships.** A deployable Next.js 16 app with Supabase Auth working end to end, deployed to Vercel under a real domain. The first three migrations applied. Project documentation files seeded.

**Prerequisites.**

- [ ] Phase 0 complete.  
- [ ] Pricing model chosen.  
- [ ] Repo exists at `~/code/hd-reports`.  
- [ ] Vercel project linked.  
- [ ] Supabase project created.

### Start Here: Claude Code Prompt for Phase 1

Open Claude Code in `~/code/hd-reports` and paste this as the first message.

COPY → CLAUDE CODE

You are working on hd-reports, a paid web app that delivers personalized Human Design readings. Read this prompt fully before doing anything.

Project: Next.js 16 App Router, Supabase (Auth \+ Postgres \+ pgvector \+ Edge Functions), Stripe, ElevenLabs, HumanDesignHub API, Resend, PostHog, deploy on Vercel.

Conventions:

\- Always work on main. Commit and push directly to main.

\- Migrations are date-prefixed in supabase/migrations/.

\- Never call Anthropic from the client. All Claude API calls go through a Supabase Edge Function called invoke-llm.

\- RLS is on by default. Every new table needs a policy in the same migration that creates it.

\- No em dashes anywhere in user-facing copy.

Task for this session:

1\. Scaffold a Next.js 16 App Router project with TypeScript, Tailwind, shadcn/ui.

2\. Add @supabase/ssr and create lib/supabase/{client,server,admin}.ts.

3\. Create the auth flow: login, signup, magic link, callback. Routes: /login, /signup, /auth/callback, /portal/\*.

4\. Add a middleware that protects /portal/\*.

5\. Write supabase/migrations/0001\_init\_profiles.sql with a profiles table linked to auth.users, RLS on, "users can read/update own profile" policy.

6\. Add a vercel.json with the security headers I will paste next.

7\. Add CLAUDE.md and AGENTS.md files at the repo root with the content I will paste next.

8\. Add docs/ with stubbed CONTEXT.md, INTENT.md, IDENTITY.md, VOICE.md, ARCHITECTURE.md, DECISIONS.md, STACK\_PORTED.md.

9\. Add design tokens at lib/design/tokens.ts with placeholder values clearly marked as TBD.

Do not implement Stripe, the report engine, or the audio pipeline yet. Stop after Vercel can deploy this and a fresh user can sign up, log in, and see /portal/welcome.

Verify yourself before saying you're done:

\- Sign up flow works end-to-end.

\- /portal/welcome is gated by auth.

\- Migrations run cleanly on a fresh Supabase project.

\- vercel.json security headers are present.

\- All 7 docs files exist with their seeded content.

### Start Here: Codex Cloud Verification

Run this in parallel after Claude Code finishes.

COPY → CODEX CLOUD

Review the latest commit on the main branch of the hd-reports repo. Check:

1\. Are there any client-side leaks of service-role keys, Stripe secrets, or Anthropic keys?

2\. Is RLS enabled on the profiles table with sane policies?

3\. Does the auth flow handle email verification, magic-link expiry, and the callback redirect cleanly?

4\. Are the security headers in vercel.json correct?

5\. Anything else that would block a paid v1?

Output: a list of blockers, a list of warnings, and a list of nits. Do not edit any files.

### Files to Create (Tennyson pastes these into Claude Code as it goes)

The CLAUDE.md, AGENTS.md, vercel.json, profiles migration, and seeded docs files are in **Appendix A: File Templates** below. Paste them when Claude Code asks for them.

### Watch Out For

- The Vercel domain takes a few minutes to propagate. Don't panic if the first deploy URL doesn't resolve immediately.  
- Supabase magic links can hit spam filters in early testing. Use a personal email you can monitor.  
- The auth callback URL in Supabase must exactly match what Next.js sends. Mismatch is the most common Phase 1 bug.

### Phase 1 Exit Criteria

- [ ] Vercel deploys main on push.  
- [ ] Fresh user signup works end-to-end.  
- [ ] /portal/welcome is gated.  
- [ ] All 7 doc files exist in /docs.  
- [ ] CLAUDE.md, AGENTS.md, vercel.json present at repo root.  
- [ ] Codex Cloud review returns no blockers.

---

## Phase 2: Payments

**What ships.** A fresh signup can pick a tier, check out via Stripe, and land on a real `/portal/dashboard` showing their plan. Webhooks are idempotent. Billing portal works.

**Prerequisites.**

- [ ] Phase 1 complete.  
- [ ] Pricing model chosen and documented.  
- [ ] Stripe products and prices created in test mode (manually in the Stripe dashboard).  
- [ ] STRIPE\_SECRET\_KEY, STRIPE\_WEBHOOK\_SECRET, and price ID env vars set in Vercel.

### Start Here: Claude Code Prompt for Phase 2

COPY → CLAUDE CODE

Phase 2: Stripe end-to-end. Reference: https://github.com/KolbySisk/next-supabase-stripe-starter

Verify Phase 1 is complete first. If profiles table doesn't exist or auth doesn't work, stop and notify operator.

Implementation:

1\. Install: stripe, @stripe/stripe-js.

2\. Create lib/stripe/{client,server}.ts. Server uses STRIPE\_SECRET\_KEY from env. Client uses NEXT\_PUBLIC\_STRIPE\_PUBLISHABLE\_KEY.

3\. Read pricing model from docs/DECISIONS.md. Implement either Option A (three fixed tiers) or Option B (base \+ go-deeper). Default to Option A if not specified.

4\. For Option A: tiers are Single $49, Deep $79, Full $129. For Option B: base $49 plus go-deeper sections at $7 plus optional $19/month subscription.

5\. Build /api/stripe/checkout (POST). Creates a Checkout Session, success\_url=/portal/welcome?session\_id={CHECKOUT\_SESSION\_ID}, cancel\_url=/pricing.

6\. Build /api/stripe/webhook (POST). CRITICAL: read request body as text() not json() for signature verification. Handle: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.payment\_failed. Idempotent via stripe\_events table.

7\. Build /api/stripe/portal (POST). Returns a Stripe Billing Portal session URL.

8\. Update profiles on every webhook: stripe\_customer\_id, stripe\_subscription\_id, membership\_tier.

9\. Add migration 0002\_stripe\_events.sql with stripe\_events(id text primary key, type text, processed\_at timestamptz default now()).

10\. Add a /pricing page with cards matching the chosen model.

11\. Add a /portal/billing page with a "Manage subscription" button that hits /api/stripe/portal.

12\. Write tests for the webhook idempotency and the cost ceiling. These are the only tests we keep in this project. Place them at \_\_tests\_\_/stripe-webhook.test.ts.

After implementing, write a one-paragraph cost note in docs/DECISIONS.md describing the pricing model and any trade-offs noticed during implementation.

### Start Here: Codex Cloud Audit

COPY → CODEX CLOUD

Audit the Stripe integration on the main branch:

1\. Is the webhook signature verified before any DB writes?

2\. Is event handling idempotent? Show me where duplicate events would be detected.

3\. Is the Billing Portal session created with the correct customer id?

4\. Are any secrets accidentally exposed to the client (search for NEXT\_PUBLIC and any stripe key usage)?

5\. Is the success\_url validated against the session?

6\. Are the webhook tests actually verifying what they claim to?

Return a checklist with blockers, warnings, and nits.

### Watch Out For

- The Stripe webhook must use the raw request body for signature verification. In Next.js App Router, that means `request.text()` not `request.json()`. If Claude Code uses json(), the signature will silently fail.  
- For local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`. Copy the printed signing secret into your local `.env.local`.  
- Webhooks fire multiple times. The `stripe_events` table is the only thing keeping you from double-processing.

### Phase 2 Exit Criteria

- [ ] Test purchase creates an active subscription in Stripe.  
- [ ] Webhook updates profiles correctly.  
- [ ] Duplicate webhook events are handled idempotently.  
- [ ] Billing portal works.  
- [ ] Webhook tests pass.

---

## Phase 3: Content Pipeline (Notion → Markdown → RAG)

**What ships.** Kaycee's Notion library lands in `content/` as markdown nightly, and changes are embedded into pgvector automatically. Retrieval queries return the right source chunks.

**Prerequisites.**

- [ ] Phase 2 complete.  
- [ ] Notion API token created and added to env.  
- [ ] First slice of Kaycee's library tagged with `kind` (gate, channel, center, type, transit) in Notion.  
- [ ] OPENAI\_API\_KEY set in env (used only for embeddings).  
- [ ] GitHub Personal Access Token with repo scope, set as GITHUB\_PAT.

### Start Here: Claude Code Prompt for Phase 3

COPY → CLAUDE CODE

Phase 3: Content pipeline. Verify Phases 1 and 2 are complete before starting.

Implementation:

1\. Add migration 0003\_content\_chunks.sql:

   \- Enable extension vector with schema extensions.

   \- chunks(id uuid pk, source\_path text, source\_kind text, source\_origin text, slug text, title text, body text, tokens int, embedding extensions.vector(1536), created\_at timestamptz default now())

   \- source\_origin distinguishes "Source: Ra", "Source: Kaycee synthesis", "Source: Kaycee original" for report fingerprinting.

   \- HNSW index on embedding using vector\_cosine\_ops with m=16, ef\_construction=64.

   \- RPC: nearest\_chunks(query\_embedding extensions.vector(1536), match\_count int default 8, kind\_filter text default null) returns the top matches.

2\. Add scripts/notion-to-markdown.ts. Uses @notionhq/client. Reads NOTION\_TOKEN and NOTION\_DATABASE\_ID from env. For each page, writes content/{kind}/{slug}.md with frontmatter (kind, slug, title, source\_origin, last\_synced).

3\. Add /api/cron/notion-sync. Runs scripts/notion-to-markdown.ts inside the function. Then triggers ingestion via the GitHub API to commit changed files, then calls ingest-markdown.

4\. Add a Supabase edge function ingest-markdown. Receives a list of changed file paths, reads them from GitHub raw URL, chunks by markdown heading, embeds with OpenAI text-embedding-3-small, upserts into chunks table.

5\. Add a "library health" endpoint at /api/admin/library-health that reports: total chunks, chunks by source\_origin, recently synced count, never-retrieved chunks (after Phase 4 lands and queries start being logged).

6\. Connect: the cron route /api/cron/notion-sync writes markdown to disk, commits to git via the GitHub API, then calls ingest-markdown for the changed files.

Reference skill: knowledge-ops if available.

Verify locally: drop a test markdown file in content/gates/test.md, hit /api/cron/notion-sync manually, confirm a row appears in chunks with a populated embedding. Also verify nearest\_chunks RPC returns sensible matches.

### Start Here: Codex Cloud Builds the Eval Harness in Parallel

COPY → CODEX CLOUD

Build a small evaluator at scripts/eval-retrieval.ts. Inputs: a directory of seed prompts at test/retrieval-seeds.json with the structure { query: string, expected\_kind: string, expected\_slug\_substring: string }\[\]. Run each query through the nearest\_chunks RPC (the project uses Supabase pgvector with an HNSW index), score top-1 hit accuracy. Output a markdown table.

This is the regression suite for any future prompt or chunking change. Place results at test/results/retrieval-{timestamp}.md.

### Watch Out For

- Chunk by heading, not arbitrary token windows. Human Design content has natural semantic boundaries; bad chunking shows up as bad reports.  
- Notion API rate limits at 3 requests per second. If the library is large, throttle.  
- The first sync may take 20-40 minutes if the library is big. Run it manually before scheduling the cron.

### Phase 3 Exit Criteria

- [ ] Test markdown ingests correctly.  
- [ ] nearest\_chunks returns relevant results.  
- [ ] Notion sync runs end-to-end without errors.  
- [ ] Library health endpoint returns sensible numbers.  
- [ ] Codex's retrieval eval shows \>70% top-1 accuracy on seed queries.

---

## Phase 3.5: The Quality Parity Gate

**This is the most important checkpoint in the entire build. Do not skip it.**

**What ships.** Three reports generated by the new system, scored by Kaycee against three reports she has produced manually for the same charts. Average quality matches or exceeds her manual work, on a structured rubric.

**Why this matters.** Everything downstream (audio, PDF, marketing, launch) is wasted effort if the reports are worse than what Kaycee already produces by hand. This gate forces the question early, when it's still cheap to iterate.

**Prerequisites.**

- [ ] Phase 3 complete.  
- [ ] At least one full report-generation prompt drafted (rough is fine; this is what we're testing).  
- [ ] Three real charts from Kaycee's customers, with manual reports she's already produced.  
- [ ] IDENTITY.md and VOICE.md filled in (see templates).

### The Workflow

1. **Tennyson** runs the new system on the three charts, producing three new reports.  
2. **Kaycee** reviews each pair (her original vs. the new system's output) blind to which is which when possible.  
3. **Kaycee** scores each report on the rubric below, giving each a 1-5 on five dimensions.  
4. If average score on new reports \>= average on manual reports, proceed.  
5. If not, identify which dimensions are weakest, tune (prompts, retrieval, IDENTITY, VOICE), regenerate, rescore.  
6. Repeat until the gate passes.

### Start Here: Claude Chat Prompt for the Quality Review Session

Open a Claude Chat session with Kaycee for the review. Paste this:

COPY → CLAUDE CHAT

I am reviewing six Human Design reports. Three were written by me manually over years of practice. Three were generated by a new AI-organized system that is supposed to match my work using my own source archive.

I will paste each report. For each, score 1-5 on these five dimensions:

1\. Accuracy. Does the report correctly reflect what's in the chart? No factual errors about gates, channels, types?

2\. Voice fit. Does it sound like me? Would I have written this? Or does it sound generic, AI-flavored, New Age?

3\. Depth. Does it go beyond surface-level interpretation? Does it synthesize across multiple aspects of the chart?

4\. Warmth. Does it feel like a real reading meant for a real person? Does it address the customer with care?

5\. Lineage. Does it honor Ra's voice and the original source material? Or does it drift into generic spirituality?

After scoring, identify the single weakest dimension across the three new reports. Suggest specific changes to IDENTITY.md, VOICE.md, or the system prompt that would address that weakness. Be concrete; give me phrases to add or remove.

Here is report 1: \[paste\]

Here is report 2: \[paste\]

\[etc.\]

### The Rubric (also include in `test/quality-rubric.md`)

| Dimension | 1 (poor) | 3 (acceptable) | 5 (excellent) |
| :---- | :---- | :---- | :---- |
| Accuracy | Factual errors | Mostly correct, minor slips | Precisely accurate throughout |
| Voice fit | Generic AI prose | Some Kaycee phrases | Indistinguishable from her |
| Depth | Surface only | Some synthesis | Deep cross-chart integration |
| Warmth | Cold, mechanical | Acceptable | Genuinely caring |
| Lineage | Generic spiritual | Some Ra | Carries the lineage clearly |

### Phase 3.5 Exit Criteria

- [ ] Three reports generated.  
- [ ] Kaycee has scored all six (three new, three manual).  
- [ ] Average score on new reports is greater than or equal to average on manual reports.  
- [ ] Tuning changes are documented in DECISIONS.md.  
- [ ] Kaycee has explicitly approved moving forward.

**If this gate doesn't pass on the first attempt, that's expected. Most projects clear it on attempt 2 or 3\. Iterate.**

---

## Phase 4: Report Engine

**What ships.** Given a customer's chart, generate a report end-to-end through a cost-controlled pipeline with prompt caching. Per-report cost under thirty cents. Memory and prompt-efficiency tooling from Tennyson's prior work integrated.

**Prerequisites.**

- [ ] Phase 3.5 passed.  
- [ ] ANTHROPIC\_API\_KEY set in env.  
- [ ] HD\_HUB\_API\_KEY set in env.  
- [ ] Tennyson's existing memory and prompt-compression tooling identified and ready to port (documented in STACK\_PORTED.md).

### Start Here: Claude Code Prompt for Phase 4

COPY → CLAUDE CODE

Phase 4: Report engine. This is the cost-critical phase. Verify Phase 3.5 passed before starting.

Read docs/STACK\_PORTED.md to understand what memory and prompt-efficiency tooling Tennyson is bringing in from prior projects. Integrate those at the invoke-llm layer.

Implementation:

1\. Add migration 0004\_reports.sql: reports(id uuid pk, user\_id uuid references auth.users(id), chart\_id uuid, status text default 'pending', length text default 'standard', body\_md text, audio\_url text, pdf\_url text, cost\_cents int, fingerprint jsonb, created\_at timestamptz default now(), completed\_at timestamptz). The fingerprint field stores: model used, prompt version, list of source chunks referenced, and timestamp.

2\. Add migration 0005\_usage\_events.sql: usage\_events(id bigint pk generated, user\_id uuid, kind text, model text, input\_tokens int, output\_tokens int, cache\_read\_tokens int, cache\_create\_tokens int, cost\_cents int, created\_at timestamptz default now()).

3\. Add migration 0006\_chunk\_retrievals.sql: chunk\_retrievals(id bigint pk generated, chunk\_id uuid references chunks(id), report\_id uuid, retrieved\_at timestamptz default now()). For library health metrics.

4\. Build the invoke-llm edge function (supabase/functions/invoke-llm). Accepts {messages, system, model, max\_tokens, cache\_blocks, user\_id}. Sets cache\_control on system prompt and cache\_blocks. Logs usage. Returns {text, usage, cost\_cents}. Hard cost ceiling: if a single call exceeds 80 cents, abort and write an alert row.

5\. Build /api/report/generate. Steps:

   a. Load the user's chart from the chart provider adapter.

   b. Retrieve the top 12 relevant chunks via nearest\_chunks.

   c. Log retrievals to chunk\_retrievals.

   d. Build the prompt: system \= report template \+ IDENTITY.md \+ VOICE.md; cache\_blocks \= retrieved chunks; user message \= "Generate a {length} report for {chart}".

   e. Call invoke-llm with model claude-sonnet-4-6.

   f. Save result to reports.body\_md and write the fingerprint.

   g. Enqueue audio \+ pdf generation (placeholder for now; real impl in Phase 5).

6\. Build the chart provider adapter at lib/chart/index.ts. Default impl: HumanDesignHub API. Interface: getChart({birth\_date, birth\_time, birth\_place\_lat, birth\_place\_lon}) returns a normalized chart object.

7\. Add a daily cache warmer cron job that runs at 5:50am UTC, before the 6am transit cron, to ensure prompt cache is hot when reports start generating.

8\. After: write a paragraph in DECISIONS.md with measured per-report cost on a real test chart, broken down by input tokens, cache reads, output tokens, output costs.

Skill references: claude-api, cost-aware-llm-pipeline, iterative-retrieval if available.

### Start Here: Claude Chat Prompt for the Report Template

Use this in a separate Claude Chat session with Kaycee to develop the master report prompt.

COPY → CLAUDE CHAT

You are helping us build the master prompt for a Human Design report.

Audience: paying customers who want a deep, warm, specific reading rooted in Ra Uru Hu's original work.

Voice (paste IDENTITY.md content here): \[paste\]

Voice (paste VOICE.md content here): \[paste\]

Format (paste structure Kaycee drafted): \[paste\]

Your task is to draft three versions of the system prompt: short (1500 words target), standard (3500 words target), long (6000 words target). Each must:

1\. Tell the model the structure to follow.

2\. Tell the model when to cite the library and when to interpret freely.

3\. Tell the model never to use em dashes.

4\. Tell the model to address the customer by name.

5\. Cap the length explicitly.

6\. Include the lineage statement: "This report is organized from a private archive of Ra Uru Hu's original lectures, interviews, and writings, assembled by Kaycee. The AI does not generate Human Design teachings. It organizes them against your specific chart."

7\. Forbid: "love and light" language, future predictions, prescriptive action, certainty about outcomes.

After drafting, run a self-critique pass. Then run a second-person review (as if you were Kaycee reading it for voice fit) and propose three edits.

### Start Here: Codex Cloud Cost Audit

COPY → CODEX CLOUD

Audit the report engine on main:

1\. Verify all Anthropic calls go through invoke-llm. Search the codebase for any direct Anthropic API calls.

2\. Verify cache\_control is set on system prompt and cache\_blocks.

3\. Verify usage\_events writes happen even on error paths.

4\. Verify the cost ceiling actually aborts (write a test if needed).

5\. Generate a mock report and report measured cost. Flag if over 30 cents.

6\. Check that fingerprint writes correctly and contains everything needed for traceability.

Output a checklist with blockers, warnings, nits.

### Watch Out For

- Anthropic prompt-cache TTL is 5 minutes. Sporadic generation \= no cache benefit. Solution: warm the cache before batches, or generate in waves.  
- The 80-cent hard ceiling is a safety net, not a target. Real reports should land at 10-30 cents.  
- Caching big system prompts saves money on input tokens but creates a cache. Cache writes cost more than reads. Don't churn the cache unnecessarily.

### Phase 4 Exit Criteria

- [ ] Real report generates end-to-end.  
- [ ] Cost per report under 30 cents (verified in usage\_events).  
- [ ] Cost ceiling enforced.  
- [ ] Fingerprint populated correctly.  
- [ ] Codex cost audit passes.  
- [ ] Three more test reports generated and reviewed by Kaycee for ongoing quality monitoring.

---

## Phase 5: Delivery (Audio \+ PDF \+ Email)

**What ships.** Each generated report produces an audio file in Kaycee's cloned voice and a beautifully designed PDF. Both arrive in the customer's inbox via Resend, and both appear in the portal.

**Prerequisites.**

- [ ] Phase 4 complete and reports generating reliably.  
- [ ] Kaycee's ElevenLabs voice clone created (see Operator prompt below).  
- [ ] ELEVENLABS\_API\_KEY and ELEVENLABS\_VOICE\_ID set in env.  
- [ ] RESEND\_API\_KEY and RESEND\_FROM\_EMAIL set in env, sending domain verified.  
- [ ] PDF design approved by Kaycee (one Figma frame is enough).

### Start Here: ElevenLabs Voice Clone Operator Prompt

Run this in ChatGPT Operator after Kaycee's recording is uploaded.

COPY → CHATGPT OPERATOR

Visit elevenlabs.io. Sign in with the credentials in 1Password (item: "ElevenLabs HD Reports"). 

1\. Navigate to Voices \> Create Voice Clone.

2\. Upload the file at \~/Downloads/kaycee-voice-sample.mp3 (5+ minutes of clean audio).

3\. Name it "Kaycee Voice 1.0".

4\. Wait for processing. Confirm voice is enabled.

5\. Copy the voice ID and report it back.

6\. Generate a 30-second test sample reading: "Hello. This is a test of the report narration voice. The way your design is structured, your purpose is not what you do. It's how you do it." Save the resulting MP3 path.

Do not change account settings. Read-only beyond the voice creation.

### Start Here: Claude Code Prompt for Phase 5

COPY → CLAUDE CODE

Phase 5: Delivery pipeline. Verify Phase 4 is generating reports reliably before starting.

Implementation:

1\. Audio: build /api/audio/render. Takes a report id. Reads body\_md, splits into \~1000-char chunks (ElevenLabs character limit per request), calls ElevenLabs API with VOICE\_ID from env, concatenates audio chunks, uploads to Supabase Storage at audio/{user\_id}/{report\_id}.mp3, signs a URL valid for 7 days, writes back to reports.audio\_url.

2\. PDF: build /api/pdf/render. Uses playwright-core \+ @sparticuz/chromium pattern (Vercel-friendly). Loads /portal/reports/{id}/print, a server-rendered HTML view styled for print using design tokens from lib/design/tokens.ts. Uses Playwright's pdf() function. Uploads to Supabase Storage, signs URL, writes back to reports.pdf\_url.

3\. Build /portal/reports/{id}/print as a print-stylesheet-only view. No portal navigation. Header has Kaycee's logo placeholder (read from design tokens), customer name, date, lineage statement. Footer has page numbers and a small fingerprint summary.

4\. Hook these into /api/report/generate so a finished report kicks off both renderers in parallel via Promise.all.

5\. Add an email step: when both audio\_url and pdf\_url are populated, send a Resend email "Your reading is ready" with both links and a portal CTA. Email template at lib/email/report-ready.tsx as a React Email component.

6\. Add a "regenerate" button to the customer portal report page that re-runs generation. Add a "flag this report" button that opens a support ticket for Kaycee to review. Both flows update reports.status.

7\. Add a "Kaycee reviewed" toggle on the admin dashboard so for the first 30 days, every report is human-approved before send. The email step waits for this flag during the manual review window.

Watch out: PDF cold starts on Vercel are real. Background-render PDFs and email when ready, do not block the user on the page. Budget 10-15 seconds for the first render.

### Start Here: Codex Cloud Voice Verification

COPY → CHATGPT OPERATOR

Verify the ElevenLabs voice clone for "Kaycee Voice 1.0" exists and is enabled. Check:

1\. Voice ID matches the value in 1Password item "ElevenLabs HD Reports \- Voice ID".

2\. Character count remaining on plan.

3\. Note the plan tier we'd hit at 100 reports per month (estimate 80 minutes audio per report).

Read-only.

### Watch Out For

- ElevenLabs character costs add up fast at high quality settings. Test with the cheapest model first, only upgrade if Kaycee notices quality issues.  
- PDF rendering on Vercel can be flaky on cold starts. Have PDFShift account ready as fallback.  
- The "Kaycee reviewed" gate is friction during launch but it is mandatory. Reports going out unreviewed in the first 30 days is reckless.

### Phase 5 Exit Criteria

- [ ] Audio renders correctly in Kaycee's cloned voice.  
- [ ] PDF renders correctly with proper formatting.  
- [ ] Email arrives with both links working.  
- [ ] Customer portal shows past reports.  
- [ ] Regenerate and flag buttons work.  
- [ ] Kaycee-reviewed gate is enforced during launch window.

---

## Phase 6: Transits (Weekly Letter \+ Optional Daily)

**What ships.** Every paying customer receives a weekly synthesis letter. Daily reports are available as a metered upsell at $1 per day. Long-cycle transit windows show in the portal.

**Prerequisites.**

- [ ] Phase 5 complete and reports being delivered.  
- [ ] Transit chart calculation verified working.  
- [ ] Weekly letter template approved by Kaycee.

### The Pricing Logic for Daily Letters

Daily letters cost more to generate than weekly synthesis (live API calls per customer per day). Charging $1 per day:

- Communicates that depth has cost (builds trust).  
- Self-selects engaged users.  
- Subsidizes the API cost so daily access doesn't blow up unit economics.

The frame on the page: "The weekly letter is included in your subscription. Daily letters draw on live transit data for your specific chart, so we charge a small daily fee to cover the cost of generating fresh insight every morning."

### Start Here: Claude Code Prompt for Phase 6

COPY → CLAUDE CODE

Phase 6: Transit pipeline. Verify Phase 5 is delivering reports before starting.

Implementation:

1\. Add migration 0007\_transits.sql:

   \- weekly\_letters(id uuid pk, user\_id uuid, week\_start date, summary\_md text, audio\_url text, raw\_chart jsonb, created\_at timestamptz default now(), unique(user\_id, week\_start))

   \- daily\_letters(id uuid pk, user\_id uuid, date date, summary\_md text, raw\_chart jsonb, paid boolean default false, cost\_cents int, created\_at timestamptz default now(), unique(user\_id, date))

   \- long\_cycles(id uuid pk, user\_id uuid, kind text, start\_date date, end\_date date, summary\_md text)

2\. Build supabase/functions/weekly-letter. Runs every Sunday at 7am UTC. For each active subscriber:

   a. Fetch the week's transit chart.

   b. Pull user's natal chart.

   c. Build a Sonnet prompt that synthesizes a 1200-word weekly letter in Kaycee's voice, citing 2-3 relevant chunks from RAG.

   d. Save to weekly\_letters.

   e. Render audio in cloned voice.

   f. Send via Resend.

3\. Build supabase/functions/daily-letter. Triggered by /api/daily/purchase, which creates a one-time Stripe charge for $1.

   a. After successful charge, fetch today's transit chart.

   b. Pull user's natal chart.

   c. Build a Haiku prompt (cheaper, smaller output) that produces a 400-word daily synthesis.

   d. Save to daily\_letters with paid=true, cost\_cents tracked.

   e. Display in portal at /portal/today.

4\. Wire /api/cron/weekly-letters to Vercel Cron, schedule "0 7 \* \* 0".

5\. Build /portal/transits with three sections: This Week (the weekly letter), Today (daily letter, with purchase CTA if not bought), Cycles (the next 90 days of major windows for this user).

6\. Add a "voice note from Kaycee" feature: Kaycee can record a 90-second weekly note that gets sent to all subscribers alongside the AI-generated weekly letter. Store at audio/kaycee-notes/{week\_start}.mp3. UI at /portal/admin/voice-note for upload.

Watch out for:

\- Don't regenerate transits on every page load. Cache via the unique constraints.

\- Daily charge must verify via webhook before generation, not before. No free generation.

\- HumanDesignHub free tier limit (100 calls/mo). Cache the daily transit chart globally (it's the same for all users on a given day) and personalize against natal locally.

### Start Here: Claude Chat Prompt for the Weekly Letter Template

COPY → CLAUDE CHAT

Help me build the weekly letter template for HD Reports.

Voice (paste IDENTITY.md): \[paste\]

Voice (paste VOICE.md): \[paste\]

Constraints:

\- 1200 words.

\- Addresses the customer by name.

\- Opens with the energetic theme of the week (drawn from current transits).

\- Three sections in the body: what's amplified for you, what's challenging for you, what to watch for.

\- Closes with one specific invitation, never a prescription.

\- No em dashes.

\- No "love and light," no future predictions.

\- Includes the lineage statement at the end.

Draft it. Self-critique. Then propose two alternative openings (one warmer, one more direct) and let Kaycee pick.

### Watch Out For

- Weekly letters going out to 100 subscribers at once will warm the cache nicely. Schedule for after the cache warmer.  
- The $1 daily charge has Stripe fees built in (about 30 cents). Net is 70 cents. Make sure that's still covering API cost.  
- Kaycee's voice notes are the trust differentiator. Don't let this feature slip; it's what separates this from a fully automated product.

### Phase 6 Exit Criteria

- [ ] Weekly letter generates and sends Sunday morning.  
- [ ] Daily letter purchase \+ generation flow works.  
- [ ] Voice notes upload and play in portal.  
- [ ] Cost per weekly letter under 15 cents.  
- [ ] Cost per daily letter under 30 cents (so $1 is profitable).

---

## Phase 7: Marketing and Evaluation

**What ships.** Landing page with founder story and testimonials. PostHog wired. Eval harness running nightly. Support email flow live. Privacy policy, ToS, and consent pages.

**Prerequisites.**

- [ ] Phase 6 complete.  
- [ ] Founder photo and three testimonials with names and photos collected.  
- [ ] Marketing copy drafted with Kaycee.  
- [ ] Lineage statement finalized in IDENTITY.md.

### Start Here: Claude Code Prompt for Phase 7

COPY → CLAUDE CODE

Phase 7: Marketing and evaluation.

Implementation:

1\. Build /(marketing)/page.tsx as a server-rendered landing page. Sections:

   \- Hero with the lineage statement prominent.

   \- Three feature blocks: written report, narrated audio in Kaycee's voice, weekly transit letters.

   \- Pricing.

   \- Founder story (200 words \+ photo).

   \- Three testimonials with photos and names.

   \- FAQ (6 questions; top three objections answered).

   \- Footer with privacy, terms, contact.

2\. Build /(marketing)/about with the full lineage story: how Kaycee assembled the archive, why "AI organized not AI generated" matters, what's referenced.

3\. Build /(marketing)/archive with a transparent inventory of source material categories (not the content itself; copyright). Last-updated date.

4\. Build /privacy and /terms. Plain-language versions; legal review before launch but draft now.

5\. Build /(marketing)/consent shown to every new customer before their first report. Single page covering: what the source archive is, how the AI is used, what Kaycee personally reviews, what the report is and isn't. Customer clicks through to proceed. Stored in profiles.consent\_at.

6\. Wire PostHog. Events: started\_signup, completed\_checkout, first\_report\_delivered, weekly\_letter\_opened, daily\_letter\_purchased, regenerate\_clicked, flag\_clicked.

7\. Build the eval harness at scripts/eval-reports.ts. Inputs: 5 seed charts in test/charts.json, 5 expected anchor phrases per chart in test/anchors.json. Generate a report for each, score presence of anchor phrases, print a markdown table. Run nightly via Vercel Cron, save results to test/results/eval-{timestamp}.md.

8\. Add a /support page. Form posts to /api/support which sends a Resend email to Kaycee and acks the user.

9\. Update the visual web SVG to mark all completed phases.

### Start Here: Claude Chat Marketing Copy Session

COPY → CLAUDE CHAT

Read docs/INTENT.md and docs/IDENTITY.md and docs/VOICE.md. Help Kaycee write:

1\. The hero headline (under 12 words).

2\. The hero subhead (under 25 words). Must include the lineage framing.

3\. The three feature block copy (60 words each).

4\. The 200-word founder story.

5\. The three FAQ answers (top three objections from our hesitation map).

6\. The lineage statement for the archive page.

After drafting, score each draft against IDENTITY.md and VOICE.md voice principles on a 1-10 scale. Iterate twice. No em dashes anywhere.

### Optional: Social Presence

If Kaycee wants to build a public audience leading into launch, this is where it threads in. If not, skip. Both paths work.

**With social presence.** Kaycee posts 3 times per week on her chosen platform starting Phase 1\. By launch, she has 8 weeks of content building anticipation. Launch goes to a warm audience.

**Without social presence.** Launch is a quiet release to her existing customer list, friends, and Human Design community contacts. Word of mouth and one-to-one reach. Slower but works.

The plan is agnostic. Pick what's true to her.

### Phase 7 Exit Criteria

- [ ] Marketing site live.  
- [ ] All copy approved by Kaycee.  
- [ ] PostHog firing events.  
- [ ] Eval harness runs and reports.  
- [ ] Privacy, terms, consent pages live.  
- [ ] Visual web updated.

---

## Phase 8: Launch

**What ships.** Public availability. Ten paying customers. Daily monitoring rhythm.

**Prerequisites.**

- [ ] Phase 7 complete.  
- [ ] Soft launch (3 trusted people) completed; feedback incorporated.  
- [ ] Stripe switched to live mode.  
- [ ] Final security audit clear.  
- [ ] Email DKIM/SPF/DMARC verified.

### Start Here: The Soft Launch Block (Pre-Phase-8)

Before public launch, three real customers receive free reports and a structured feedback form. Run this between Phases 7 and 8\.

COPY → CLAUDE CHAT

I am running a soft launch for HD Reports. Three trusted customers will receive free reports. After they read, I want feedback that will sharpen the launch.

Help me design the feedback form. It should be 5-7 questions max. The questions should not be "did you like it." They should be:

\- What surprised you about the report?

\- What felt off, even if you can't say why?

\- What did you want more of?

\- What did you want less of?

\- Would you have paid $49 for this? Why or why not?

\- Who in your life would you most want to send this to?

Draft the email that delivers the report and asks for feedback. Make it warm, not corporate. Set expectations: response within 7 days, your honest reaction is the gift.

### Start Here: Codex Cloud Final Pre-Launch Audit

COPY → CODEX CLOUD

Final pre-launch audit of the hd-reports repo. Cover:

1\. Secret hygiene: anything sensitive exposed to client?

2\. RLS: every table has a policy.

3\. Stripe: live keys not committed, webhook signature verified, idempotent.

4\. Cost ceilings: invoke-llm has a hard cap. Per-user usage\_events writing.

5\. Cron: vercel.json schedules align with intended frequency.

6\. Auth: middleware protects /portal/\* and /api/admin/\*.

7\. CSP and security headers in place.

8\. Email DKIM/SPF/DMARC for the sending domain.

9\. Privacy/terms/consent pages link from all the right places.

10\. Kaycee-reviewed gate is enforced.

Output a blocking-vs-warning-vs-nit table. Anything blocking, fix before launch.

### Start Here: Claude Code Admin Dashboard

COPY → CLAUDE CODE

Build /portal/admin (gated by profiles.is\_admin flag). Show:

1\. Today's signups, revenue, active subs.

2\. Reports generated today \+ cost (sum from usage\_events).

3\. Failed reports queue with retry button.

4\. Pending Kaycee-review queue (reports waiting for approval).

5\. Top expensive users (per-user cost in last 7 days).

6\. Library health: chunks total, by source\_origin, recently retrieved, never retrieved.

7\. Recent support tickets.

Make it boring and functional. Redesign in v2.

### Launch Day Checklist

- [ ] Stripe in live mode.  
- [ ] Real domain pointed at Vercel.  
- [ ] All env vars in production set correctly.  
- [ ] Admin dashboard accessible.  
- [ ] Kaycee-reviewed gate enforced for first 30 days.  
- [ ] Eval harness running nightly.  
- [ ] PostHog dashboard set up with key funnels.  
- [ ] Email deliverability verified.  
- [ ] Privacy/terms/consent pages live and linked.  
- [ ] Daily standup time confirmed for first 30 days.  
- [ ] Soft launch feedback incorporated.

### The First 30 Days After Launch

- Daily standup, 15 minutes.  
- Every report Kaycee-reviewed before send.  
- Per-report cost tracked daily.  
- Support response within 24 hours.  
- Friday: weekly review of metrics, pick one improvement for next week.

### When to Drop the Manual Review Gate

The plan calls for human review of every report for the first 30 days. The bar to drop the gate: when 95% of last-30-days reports passed Kaycee's review without edits. Document the decision in DECISIONS.md.

### Phase 8 Exit Criteria

- [ ] Public launch executed.  
- [ ] 10 paying customers received first report.  
- [ ] No P0 bugs.  
- [ ] Cost per report tracking under target.  
- [ ] Kaycee approves quality of first 10 reports.

---

## What's Next, Roughly

Beyond Phase 8, in the architecture but not in v1:

**The Chart Conversation.** Once a customer has their report, give them a chat interface against their own chart. Cheap to build (it's already a RAG against the same library plus their chart context), hugely sticky. Architect for this in Phase 4 by ensuring the invoke-llm function can handle multi-turn conversations.

**Compatibility readings.** Two charts overlaid. Natural product extension. Natural referral mechanism: customers want to look up their partner, kid, friend.

**Depth dial (if Option A was chosen at launch).** Add the per-section "go deeper" feature once you have engagement data on what people actually want more of.

**Field notes for Kaycee.** Private dashboard where she can log observations across customers over time. Becomes proprietary training data and pattern-recognition material later.

**Self-hosted chart provider.** Stand up the open-source MCP\_Human\_design service in dev. Verify output parity with HumanDesignHub. Switch when free-tier limits or pricing demand it.

**Practitioner platform.** Other Human Design practitioners use the same stack with their own archives. Multi-tenant version of what Kaycee has. This is the largest possible market expansion and worth keeping in mind even early on.

---

## Appendix A: File Templates

These are the core files for the project. Each is a template with starter content and clearly marked sections that need Kaycee's input.

### CLAUDE.md (the agent rulebook)

\# HD Reports — Claude Code Instructions

\#\# Read first

\- docs/CONTEXT.md is the factual ground truth.

\- docs/INTENT.md is the strategic ground truth.

\- docs/IDENTITY.md is the brand and lineage voice.

\- docs/VOICE.md is how Kaycee writes.

\- docs/ARCHITECTURE.md is the system map.

\- docs/DECISIONS.md is the append-only log of why-we-chose-X.

\- docs/STACK\_PORTED.md describes Tennyson's prior work being ported in.

\#\# Cost discipline (the whole point)

\- All Claude API calls go through the invoke-llm Supabase Edge Function. No exceptions.

\- Anthropic prompt caching is mandatory on all report-generation calls. Cache the static system prompt and the relevant Human Design library chunks as ephemeral cache blocks.

\- Default to Haiku 4.5 for short outputs (transit summaries, classifications). Use Sonnet 4.6 for full report generation. Never use Opus in production.

\- Before adding any new Claude API path, write a one-paragraph cost note in DECISIONS.md.

\#\# Git and deploy

\- Work on main. Commit and push directly to main. Vercel deploys main on push.

\- Migrations are date-prefixed: supabase/migrations/YYYYMMDD\_description.sql.

\- No em dashes anywhere in user-facing copy or prose generated by the system.

\#\# Stack rules

\- Frontend: Next.js 16 App Router. No client-side secrets.

\- Database: Supabase Postgres \+ pgvector. RLS on by default. Every new table gets a policy in the same migration.

\- Payments: Stripe. The webhook is the source of truth for subscription state.

\- Audio: ElevenLabs cloned voice. Store generated MP3 in Supabase Storage with signed URLs.

\- Transits: Vercel Cron triggers /api/cron/transits, which calls the daily-transit edge function.

\#\# Workflow

\- Plain English explanations preferred. No heavy test suites EXCEPT for: Stripe webhook handling, the cost ceiling enforcement, RLS policies. These three need real tests.

\- Don't add features beyond the task. No premature abstraction.

\- Markdown is the canonical content format. Notion sync is one-way (Notion to markdown).

\#\# Skills (load when relevant)

\- cost-aware-llm-pipeline, claude-api, iterative-retrieval, postgres-patterns, database-migrations, nextjs-turbopack, knowledge-ops, brand-voice, eval-harness.

### AGENTS.md (mirrors CLAUDE.md for Codex)

\# HD Reports — Agent Instructions (Codex)

This file mirrors CLAUDE.md so Claude Code and Codex follow the same rules. If they conflict, CLAUDE.md wins.

\#\# Your role when invoked

\- You are usually invoked for verification, parallel implementation, or browser automation. Claude Code is the primary builder.

\- When invoked for verification, output a structured review: blockers, security issues, correctness issues, style notes. Do not edit unless asked.

\- When invoked for parallel implementation, write the change on a branch named codex/\<feature\> and stop. Do not push to main.

\#\# Hard rules

\- Never call Anthropic, OpenAI, ElevenLabs, or Stripe from the client. Server-only.

\- Never commit secrets. Use .env.local locally, Vercel env vars in production.

\- All Claude API calls flow through invoke-llm Supabase Edge Function.

\- RLS is on for every new table.

\- Migrations append-only, date-prefixed.

\- No em dashes anywhere.

\#\# When in doubt

\- Ask in the response. Do not improvise. The operators read every diff.

### IDENTITY.md (the lineage and brand voice)

This is the most important file in the project. Three layers.

\# HD Reports — Identity

\> Read this on every Claude API call. Inject as part of the system prompt.

\#\# Layer 1: Ra Uru Hu's Voice (the founder of Human Design)

Ra was the channeler and original teacher of Human Design. The reports must carry his lineage. He was:

\- Unsentimental. He distrusted "love and light" spirituality and refused to soften observations to make people comfortable.

\- Mechanically precise. He spoke about Human Design as a system, not a religion. Charts are mechanics, not magic.

\- Direct. He told people difficult truths without apology, on the assumption that the truth was useful.

\- Allergic to guru dynamics. He insisted he was "just the messenger" and that the system itself was the teacher.

\- Lineage-focused. He cited his sources (the I Ching, the Kabbalah, the chakra system, astrology) and refused to claim originality where there wasn't.

When the report has to choose between a soft phrasing and a precise one, choose precise. When it has to choose between New Age comfort language and direct observation, choose observation.

Phrases that honor Ra's voice:

\- "Your design shows..."

\- "The mechanics here are..."

\- "This is not about belief. It's about correctness or non-correctness for you."

\- "What you're not is just as important as what you are."

Phrases that betray Ra's voice (forbidden):

\- "Your soul's purpose..."

\- "The universe wants you to..."

\- "Sending you love and light..."

\- "Trust the journey..."

\- "Everything happens for a reason..."

\#\# Layer 2: Kaycee's Voice (filled in by Kaycee)

\[FILL IN — recorded in a voice-capture session with Tennyson. Goal: 500-1000 words on how Kaycee filters, softens, or extends Ra's voice. Her own phrases. The way she opens a reading. The way she lands difficult observations. What only she does that nobody else does.\]

Suggested questions for the recording session:

\- How do you open a reading? What are the first words?

\- When you have to deliver a hard truth from someone's chart, how do you say it?

\- What phrases do you find yourself using over and over?

\- What do you refuse to say?

\- What's a reading you're proud of? What made it land?

\- Where do you depart from Ra most? Where do you stay closest to him?

\#\# Layer 3: The Customer Relationship

The report addresses the customer directly. "You" not "the native" or "the seeker."

The report does not:

\- Predict the future.

\- Prescribe action ("you should do X").

\- Claim certainty about outcomes ("this means you will...").

\- Use the customer's chart to flatter them.

\- Compare them to others.

The report does:

\- Address the customer by name in the opening and closing.

\- Ground every claim in a specific feature of the chart.

\- Use specific, concrete language over abstract generality.

\- Offer invitations, not directives.

\- Honor the customer's autonomy to interpret their own life.

\#\# Lineage Statement (canonical, do not paraphrase)

Used in marketing, in every report's footer, in the about page:

"This report is organized from a private archive of Ra Uru Hu's original lectures, interviews, and writings, assembled by Kaycee over years of study. The AI does not generate Human Design teachings. It organizes them, in Kaycee's voice, against your specific chart."

\#\# Forbidden Moves (audit every output for these)

\- Em dashes anywhere.

\- "In conclusion," "It's important to note," "Furthermore" (AI tells).

\- Future predictions.

\- Prescriptive action.

\- "Love and light" language.

\- Claiming the customer is "special" or "rare."

\- Comparing the customer to other types or designs as better/worse.

### VOICE.md (how Kaycee writes, mechanically)

\# HD Reports — Voice Notes (Kaycee)

\> How Kaycee writes, at the sentence level. Inject alongside IDENTITY.md.

\#\# Sentence rhythm

\[FILL IN: short and punchy? long and flowing? mix? what's the cadence?\]

\#\# Vocabulary preferences

\- Words she uses often: \[FILL IN\]

\- Words she avoids: \[FILL IN\]

\- Technical Human Design terms she uses without defining: \[FILL IN\]

\- Technical terms she always pauses to explain: \[FILL IN\]

\#\# Openings she uses

\[FILL IN: 3-5 examples of how she opens a reading\]

\#\# Closings she uses

\[FILL IN: 3-5 examples\]

\#\# How she lands difficult observations

\[FILL IN: examples of phrasings that work\]

\#\# Things she'd never say

\[FILL IN: 5-10 phrases or constructions that aren't her\]

\#\# Capture method

This file gets richer over time. After the initial voice-capture session, add to it whenever Kaycee notices something the AI got wrong or right.

### CONTEXT.md (factual ground truth)

\# HD Reports — Context

\> Factual, long-lived. Update when material things change.

\#\# What this is

A paid web app that delivers personalized Human Design reports as written text, audio in Kaycee's cloned voice, and PDF. Weekly transit synthesis included; daily transit reports available as $1 metered upsell. Source of truth for content is markdown in this repo, synced one-way nightly from Kaycee's Notion library, which itself is built from her private archive of Ra Uru Hu's original lectures, interviews, and writings.

\#\# Who it's for

Three primary personas: curious one-off readers (Single Reading), recurring subscribers who want weekly synthesis (Monthly), committed students of Human Design (Annual). Secondary: people gifting readings.

\#\# Stack

\- Next.js 16 App Router on Vercel.

\- Supabase: Postgres \+ pgvector \+ Auth \+ Storage \+ Edge Functions.

\- Stripe: subscriptions and one-time.

\- Anthropic Claude API: report generation \+ transit summaries via invoke-llm with prompt caching.

\- ElevenLabs: cloned-voice audio.

\- Resend: transactional email.

\- HumanDesignHub: chart calculation (v1) with adapter for swap to self-hosted later.

\- PostHog: analytics.

\- GitHub: source of truth for repo and content.

\#\# Operators

\- Operator A (Tennyson): infrastructure, integrations, deploys, AI orchestration.

\- Operator B (Kaycee): brand, voice, content, customer experience, source archive.

\#\# Pricing

\[FILL IN once chosen: Option A or Option B from Master Plan\]

\#\# Constraints

\- Cost-per-report is the central technical concern. Target under 30 cents per full report.

\- No em dashes anywhere in user-facing copy.

\- Plain-language explanations preferred. Tests only for: Stripe webhooks, cost ceiling, RLS.

\- AI organized, not AI generated. Lineage statement appears on every report.

\#\# Source archive

Kaycee maintains a private archive of Ra Uru Hu's original work. Categories include: gates, channels, centers, types, profiles, definitions, transits. Source material is tagged in Notion by category. The AI references this archive only; it does not generate Human Design teachings.

### INTENT.md (strategic ground truth)

\# HD Reports — Intent

\> Why we're building this and how we know we've succeeded.

\#\# The bet

That a private archive of original Human Design source material, organized by AI in Kaycee's voice against an individual chart, is meaningfully more valuable than what's currently available in the category. That customers will pay for depth and lineage when nearly everyone else is selling surface and AI slop.

\#\# What success looks like

\- 6 months: 100 paying customers, 70%+ retention on subscribers, eval scores stable.

\- 12 months: 500 paying customers, weekly letter has cult-following energy, customers refer organically.

\- 24 months: practitioner platform option live, archived content has been translated/adapted across multiple modalities.

\#\# What failure looks like

\- Cost per report stays above 50 cents and we can't acquire customers profitably.

\- Quality regresses below Kaycee's manual baseline.

\- Customers don't perceive the lineage difference and treat us as another AI astrology app.

\- Kaycee burns out from review burden.

\#\# Constraints we accept

\- Slower growth in exchange for higher quality.

\- More expensive infrastructure in exchange for cost predictability.

\- Smaller TAM in exchange for stronger moat.

\#\# What we will not do

\- Sell to people who don't know what Human Design is yet.

\- Compete on price.

\- Drop the lineage framing under marketing pressure.

\- Build the practitioner platform until v1 is genuinely working.

### ARCHITECTURE.md, DECISIONS.md, STACK\_PORTED.md

These are templates Tennyson fills in during the build. ARCHITECTURE.md is system map (auto-generated from migrations and route lists). DECISIONS.md is the append-only log. STACK\_PORTED.md describes the memory and prompt-efficiency tooling Tennyson is bringing in from prior projects, identified during Phase 0 setup.

\# HD Reports — Stack Ported (filled by Tennyson during Phase 0\)

\> What I'm bringing into this project from my prior work.

\#\# Memory architecture

\[FILL IN: which repo, what it does, how it integrates at the invoke-llm layer\]

\#\# Prompt efficiency / compression

\[FILL IN: which tool, what the savings look like, where in the pipeline it sits\]

\#\# Design tokens / component library

\[FILL IN: lifted from which prior project, what's reusable\]

\#\# Supabase patterns

\[FILL IN: auth, RLS, Edge Functions patterns from Geck Inspect / CreditRepair / etc.\]

\#\# Stripe patterns

\[FILL IN: from prior projects\]

\#\# Other reusable infrastructure

\[FILL IN\]

---

## Appendix B: vercel.json Security Headers

{

  "$schema": "https://openapi.vercel.sh/vercel.json",

  "headers": \[

    {

      "source": "/(.\*)",

      "headers": \[

        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },

        { "key": "X-Content-Type-Options", "value": "nosniff" },

        { "key": "X-Frame-Options", "value": "SAMEORIGIN" },

        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },

        { "key": "Permissions-Policy", "value": "accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(self)" }

      \]

    }

  \],

  "crons": \[

    { "path": "/api/cron/cache-warmer", "schedule": "50 5 \* \* \*" },

    { "path": "/api/cron/notion-sync", "schedule": "0 4 \* \* \*" },

    { "path": "/api/cron/transits", "schedule": "0 6 \* \* \*" },

    { "path": "/api/cron/weekly-letters", "schedule": "0 7 \* \* 0" },

    { "path": "/api/cron/eval-reports", "schedule": "0 3 \* \* \*" }

  \]

}

---

## Appendix C: invoke-llm Edge Function (the cost spine)

The full implementation lives at `supabase/functions/invoke-llm/index.ts` after Phase 4\. Key characteristics:

- Single entry point for all Anthropic API calls.  
- Sets `cache_control: { type: "ephemeral" }` on system prompt and `cache_blocks`.  
- Logs every call to `usage_events` with token counts and computed cost.  
- Hard ceiling at 80 cents per call; aborts and writes alert.  
- Routes to Haiku for short tasks, Sonnet for reports.  
- Integrates Tennyson's prompt-compression tooling from STACK\_PORTED.md.

// COPY → FILE: supabase/functions/invoke-llm/index.ts (skeleton)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC \= "https://api.anthropic.com/v1/messages";

Deno.serve(async (req) \=\> {

  if (req.method \!== "POST") return new Response("method", { status: 405 });

  const { system, messages, cache\_blocks \= \[\], model \= "claude-sonnet-4-6", max\_tokens \= 4000, user\_id } \= await req.json();

  const systemBlocks \= \[

    { type: "text", text: system },

    ...cache\_blocks.map((b) \=\> ({ type: "text", text: b, cache\_control: { type: "ephemeral" } })),

  \];

  const res \= await fetch(ANTHROPIC, {

    method: "POST",

    headers: {

      "x-api-key": Deno.env.get("ANTHROPIC\_API\_KEY"),

      "anthropic-version": "2023-06-01",

      "content-type": "application/json",

    },

    body: JSON.stringify({ model, max\_tokens, system: systemBlocks, messages }),

  });

  if (\!res.ok) {

    return new Response(JSON.stringify({ error: await res.text() }), { status: 500 });

  }

  const data \= await res.json();

  const u \= data.usage || {};

  const cost\_cents \= computeCost(model, u);

  await logUsage(user\_id, model, u, cost\_cents);

  if (cost\_cents \> 80\) {

    return new Response(JSON.stringify({ error: "cost\_ceiling\_exceeded", cost\_cents }), { status: 402 });

  }

  return new Response(JSON.stringify({ text: data.content?.\[0\]?.text || "", usage: u, cost\_cents }));

});

function computeCost(model, u) {

  const rates \= {

    "claude-sonnet-4-6": \[3, 15, 0.30, 3.75\],

    "claude-haiku-4-5-20251001": \[1, 5, 0.10, 1.25\],

  };

  const \[inR, outR, cacheReadR, cacheCreateR\] \= rates\[model\] || rates\["claude-sonnet-4-6"\];

  const inT \= (u.input\_tokens || 0\) / 1\_000\_000;

  const outT \= (u.output\_tokens || 0\) / 1\_000\_000;

  const crT \= (u.cache\_read\_input\_tokens || 0\) / 1\_000\_000;

  const ccT \= (u.cache\_creation\_input\_tokens || 0\) / 1\_000\_000;

  return Math.round((inT \* inR \+ outT \* outR \+ crT \* cacheReadR \+ ccT \* cacheCreateR) \* 100);

}

---

## Appendix D: .env.example

\# Supabase

NEXT\_PUBLIC\_SUPABASE\_URL=

NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY=

SUPABASE\_SERVICE\_ROLE\_KEY=

\# Anthropic (used by invoke-llm edge function only)

ANTHROPIC\_API\_KEY=

\# OpenAI (embeddings only)

OPENAI\_API\_KEY=

\# Stripe

STRIPE\_SECRET\_KEY=

STRIPE\_WEBHOOK\_SECRET=

STRIPE\_PRICE\_SINGLE=

STRIPE\_PRICE\_DEEP=

STRIPE\_PRICE\_FULL=

STRIPE\_PRICE\_MONTHLY=

STRIPE\_PRICE\_ANNUAL=

STRIPE\_PRICE\_DAILY\_LETTER=

\# ElevenLabs

ELEVENLABS\_API\_KEY=

ELEVENLABS\_VOICE\_ID=

\# HumanDesignHub

HD\_HUB\_API\_KEY=

\# Resend

RESEND\_API\_KEY=

RESEND\_FROM\_EMAIL=

\# PostHog

NEXT\_PUBLIC\_POSTHOG\_KEY=

NEXT\_PUBLIC\_POSTHOG\_HOST=https://us.i.posthog.com

\# GitHub (for Notion sync to commit markdown)

GITHUB\_PAT=

GITHUB\_REPO=tennysonmilesperhour/hd-reports

\# Notion

NOTION\_TOKEN=

NOTION\_DATABASE\_ID=

---

## Appendix E: Day-Zero Setup Checklist (printable)

A one-page checklist of every Phase 0 action.

**Tennyson:**

- [ ] Create Vercel account  
- [ ] Create Supabase account, create project  
- [ ] Create Stripe account, switch to test mode  
- [ ] Create ElevenLabs account  
- [ ] Create Resend account  
- [ ] Create HumanDesignHub account  
- [ ] Create PostHog account  
- [ ] Create GitHub repo `hd-reports`  
- [ ] Install Claude Code locally  
- [ ] Install Codex CLI  
- [ ] Subscribe to ChatGPT Plus  
- [ ] Install Vercel CLI  
- [ ] Set up shared 1Password vault, invite Kaycee

**Kaycee:**

- [ ] Record 5-minute voice sample  
- [ ] Identify top 50 library chunks  
- [ ] Draft 200-word founder story  
- [ ] Pick 3 sample charts (with permission)  
- [ ] Schedule walk-through of manual report process with Tennyson

**Together:**

- [ ] 90-minute kickoff call  
- [ ] Pricing model decided and documented  
- [ ] Voice clone recording uploaded to ElevenLabs

---

## Appendix F: Risks and Watch-Outs

- **Anthropic prompt-cache TTL is 5 minutes.** Sporadic generation \= no cache benefit. Solution: warm cache in batches, schedule generation in waves.  
- **Stripe webhook idempotency.** Webhooks fire multiple times. The stripe\_events table is the only thing keeping you from double-charging.  
- **PDF cold starts.** Background-render. Email when ready.  
- **HumanDesignHub free-tier limit (100 calls/mo).** Cache hard. Chart per-day per-user; don't recompute on page loads.  
- **Voice clone consent.** Document Kaycee's consent in writing in DECISIONS.md and store outside the repo.  
- **Birth-data PII.** RLS on day one. No logging of full birth times outside the profiles table. Non-negotiable.  
- **Codex and Claude can disagree.** Third opinion from Claude Chat reading both outputs is the tiebreaker. Don't average; pick one.  
- **Em dashes.** Both AIs love them. The CLAUDE.md and AGENTS.md rules block them in user-facing copy. Audit before launch.  
- **Quality regression.** The Phase 3.5 gate catches this early. Don't skip it.  
- **Kaycee burnout.** Manual review for 30 days is necessary but burns her out if reports are bad. Phase 3.5 gate is also burnout protection.

---

## Appendix G: External Links

**Templates and references**

- next-supabase-stripe-starter: [https://github.com/KolbySisk/next-supabase-stripe-starter](https://github.com/KolbySisk/next-supabase-stripe-starter)  
- launch-mvp-stripe-nextjs-supabase: [https://github.com/ShenSeanChen/launch-mvp-stripe-nextjs-supabase](https://github.com/ShenSeanChen/launch-mvp-stripe-nextjs-supabase)

**Human Design**

- HumanDesignHub API: [https://humandesignhub.app/docs](https://humandesignhub.app/docs)  
- MCP\_Human\_design (self-host option): [https://github.com/dvvolkovv/MCP\_Human\_design](https://github.com/dvvolkovv/MCP_Human_design)  
- hdkit (reference): [https://github.com/jdempcy/hdkit](https://github.com/jdempcy/hdkit)

**Vendors**

- Anthropic Claude: [https://docs.claude.com](https://docs.claude.com)  
- ElevenLabs: [https://elevenlabs.io/docs](https://elevenlabs.io/docs)  
- Stripe: [https://stripe.com/docs](https://stripe.com/docs)  
- Supabase: [https://supabase.com/docs](https://supabase.com/docs)  
- Resend: [https://resend.com/docs](https://resend.com/docs)  
- PostHog: [https://posthog.com/docs](https://posthog.com/docs)

**AI tooling**

- Claude Code: [https://docs.claude.com/claude-code](https://docs.claude.com/claude-code)  
- Codex (OpenAI): [https://openai.com/codex](https://openai.com/codex)  
- ChatGPT Operator: in the ChatGPT app

---

*End of Master Plan. Build the visual web. Then begin Phase 0\.*  
