# DECISIONS.md

Append-only log of why-we-chose-X. New entries go at the top. Each entry: date, decision, why, alternatives considered, and any open questions.

## 2026-05-10 — PostHog analytics wired up

**Decision.** Use PostHog (US Cloud, project 417782) for client-side and server-side analytics. SDK: `posthog-js` (client) and `posthog-node` (server). Initialized via `instrumentation-client.ts` at the Next.js app root using the new `instrumentation-client` file convention (Next.js 15+).

**Why.** PostHog was already chosen in the master plan for analytics. The `instrumentation-client.ts` approach is the current recommended pattern per PostHog docs (avoids the deprecated `_app.tsx` provider pattern). Token and host are stored as `NEXT_PUBLIC_POSTHOG_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` per Next.js public env var conventions.

**Files added.** `instrumentation-client.ts` (client init), `app/posthog.ts` (server-side PostHogClient function), `.env.local.example` (env var template with real token and host).

**Open.** Add `posthog-js` and `posthog-node` to `package.json` when Phase 1 Next.js scaffold runs. Consider adding a reverse proxy via Next.js rewrites to reduce ad-blocker interference.

---

## 2026-05-10 — Supabase project: `biufjcapnuzbdowoksnb`

**Decision.** HD Reports' Supabase project is `biufjcapnuzbdowoksnb` ("DelphiHD's Project"), West US (Oregon), Free plan. Dashboard URL `https://supabase.com/dashboard/project/biufjcapnuzbdowoksnb`. API URL `https://biufjcapnuzbdowoksnb.supabase.co`.

**Why.** First Supabase project in the DelphiHD org. West US for low latency to Tennyson and Kaycee. Free plan covers Phase 1–3; upgrade to Pro before customer data lands (Phase 5+).

**How to apply.** Phase 1 runs `supabase link --project-ref biufjcapnuzbdowoksnb` to associate the local repo with this project. Migrations land in `supabase/migrations/` and apply via `supabase db push`. Anon key + service-role key come from the dashboard; service-role key never goes in a `NEXT_PUBLIC_*` env.

**Open.** Database password is stored in Tennyson's 1Password vault — share it with Kaycee before she needs to run a migration herself. Upgrade to Pro plan before Phase 5 (customer data + 7-day backup retention). Configure auth redirect URLs in the dashboard once Vercel domain is known.

---

## 2026-05-10 — Pricing model decision is deferred

**Decision.** No pricing tier (Option A vs Option B from master plan lines 144–177) is being chosen at this time. Phase 1 ships without any pricing-shaped code: no `prices` table, no Stripe products, no tier-gating in the UI. The `/portal/welcome` page is a flat landing for any signed-in user.

**Why.** Pricing decisions land best when the product is real enough to price against. Forcing a choice now would either lock in Option A by default (the master plan's recommendation) or scaffold dead code we'll rip out. Deferring also unblocks Phase 1 — the original handoff treated pricing as a prereq, which it isn't for foundation work.

**How to apply.** Phase 1 + Phase 2's payment scaffolding may need a placeholder. If the new session reaches a point where it would write a `prices` or `tiers` table, it should pause and surface the decision instead of guessing. Master plan Phase 2 ("Payments") cannot start until this gap is filled — that's the natural forcing function.

**Open.** When ready to revisit, A vs B is the question. Master plan's default recommendation is A unless we want engagement data.

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
