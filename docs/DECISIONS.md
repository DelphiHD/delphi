# DECISIONS.md

Append-only log of why-we-chose-X. New entries go at the top. Each entry: date, decision, why, alternatives considered, and any open questions.

## 2026-05-27 — Delphi mandala chart is a programmatic SVG renderer

**Decision.** The Delphi mandala chart, embedded in the Planetary Overview report, is a programmatic SVG renderer driven by chart data. Two outputs ship in Phase 1:

1. `renderFullMandala(chart)` — full Planetary Mandala, used as the **cover page** of the Planetary Overview. Includes all 26 planetary activations (13 Personality + 13 Design), the Delphi-styled bodygraph at center (sourced from the `mybodygraph` `design=delphi` SVG), and four soft quarter color bands behind the wheel.
2. `renderCrossMandala(chart)` — Incarnation Cross Mandala, used at the **start of the Incarnation Cross section**. Highlights only the four cross gates on the ring; quarter *labels* (no color bands) for Mutation, Initiation, Civilization, Duality.

Both functions return SVG strings. The same data contract feeds the current `.docx` deliverable today and a future interactive client-portal embed later. Module location: `lib/render/mandala.ts` (data contract at `lib/render/mandala.types.ts`, gate→longitude lookup at `lib/hd/gate-longitude.ts`).

**Why.** Two outputs, one engine, one data contract. Kaycee's stated horizon is "this is Phase 1 to get the reports usable; at some point I want it as an interactive element in the client portal." A hand-designed template approach (Figma/Illustrator with overlays) cannot drive an interactive portal element. Programmatic SVG can: the same `<g>` paths the docx pipeline flattens are the same paths a React component later mounts and binds hover/click handlers to. One renderer, two consumers, no design-tool round-trip when chart data changes.

**Render rules.** Encoded in canonical brand memory (`brand_delphi.md`):
- Unactivated gates: gray (template default). Activated gates: filled with color so they pop.
- Spokes (384 line subdivisions): unactivated stay gray; activated take a slightly muted version of the *activating center's* color, with a fade near the center and outer ring so the brightest part is mid-spoke.
- Activation glyphs in spokes: Personality black, Design `#e06666`.
- Channels: undefined white outline, Personality black, Design `#e06666`, mixed = half-and-half stripes.
- Bodygraph center: composited from the `mybodygraph` `design=delphi` SVG; colors already match the Delphi palette, no color-swap pass needed.
- Quarter palette (full mandala only): Mutation `#e8d8ed`, Initiation `#fbf7b2` at ~40% opacity, Civilization `#e8e8e8`, Duality `#f5d4d4`.

**Gate→longitude anchor.** 0° Aquarius = Gate 41.1. Each gate spans 5.625° of the ecliptic; each line spans 0.9375°. Lookup table is canonical for both the renderer and any future ephemeris work.

**Alternatives considered.**
- (a) Hand-designed PNG/SVG template with per-chart overlay layer — ruled out because it cannot drive a future interactive portal element and forces a design-tool step into every chart update.
- (b) Use a third-party HD mandala API (none of high quality exist; Maia Mechanics is the closest visually but is closed and image-only) — ruled out for the same portal reason and for cost/dependency.
- (c) Embed the mandala in the Foundation Report alongside the bodygraph — ruled out: the bodygraph is the Foundation visual; the mandala is the Planetary Overview's visual. Separation is intentional.

**How to apply.** Any new chart visual that needs the wheel reuses this renderer. Skill workflows (`hd-phase2-reports`, `hd-analysis`) call into `lib/render/mandala.ts` rather than generating their own visuals. The Phase 5 PDF / portal work inherits the same module without rewriting.

**Cost note.** No Claude API calls in this path; the renderer is deterministic compute. Zero per-report cost beyond the existing `mybodygraph` SVG fetch (already in the Foundation Report path).

**Open.** Mixed-activation channel rendering (gate active on both Personality and Design) defaults to half-and-half stripes; revisit if it reads poorly at docx-embed size. Quarter palette is provisional pending visual review of the first rendered output.

---

## 2026-05-10 — Phase 1 scaffold landed (Next.js 16 + Tailwind 4 + Supabase SSR)

**Decision.** Phase 1 foundation scaffolded directly into the repo root: Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4 (PostCSS plugin, no `tailwind.config.js`), `@supabase/ssr` for auth, shadcn/ui in `new-york` style with `neutral` base color and CSS variables, Radix primitives for `Button`/`Input`/`Label`/`Card`. Auth pages: `/login` (password + magic link), `/signup`, `/auth/callback`, `/portal/welcome` (gated). Root `middleware.ts` refreshes cookies on every request and redirects unauthenticated traffic away from `/portal/*`. First migration `supabase/migrations/20260510_init_profiles.sql` creates `public.profiles` with RLS on, own-row read/update, and a `handle_new_user()` trigger.

**Why.** Master plan Phase 1 lines 245–351 plus `docs/PHASE_1_HANDOFF.md`. Couldn't run `create-next-app` against a non-empty repo (already had PostHog wizard output, docs, `.env.example`, hooks); merged the scaffold by hand instead of nesting under a sub-directory, since the handoff explicitly says repo-root is the project root. Scripts use Turbopack for `dev` since Next 16 ships it as the default. `next lint` is deprecated in Next 16, so `npm run lint` calls `eslint` directly via `eslint-config-next`.

**Files added.** `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `next-env.d.ts`, `components.json`, `app/{layout,page,globals.css}`, `app/login/*`, `app/signup/*`, `app/auth/callback/route.ts`, `app/portal/welcome/*`, `middleware.ts`, `lib/utils.ts`, `lib/supabase/{client,server,admin,middleware}.ts`, `lib/posthog/server.ts`, `lib/design/tokens.ts`, `components/ui/{button,input,label,card}.tsx`, `supabase/migrations/20260510_init_profiles.sql`, `vercel.json`, `AGENTS.md`, `docs/{CONTEXT,INTENT,IDENTITY,VOICE,ARCHITECTURE}.md`. Updated `package.json`, `.githooks/pre-push`, `.env.local.example`, `README.md`.

**Open.** `vercel link` and `supabase link --project-ref biufjcapnuzbdowoksnb` not yet run — operator action required (DB password from 1Password, Supabase anon + service-role keys pasted into `.env.local`). `vercel whoami` returns `hello-22519849`, which doesn't look like the DelphiHD account; verify before linking. No deploy attempted yet.

---

## 2026-05-10 — Security headers chosen per master plan Appendix B

**Decision.** `vercel.json` ships exactly the header set listed in master plan Appendix B: HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(self)`. No CSP yet.

**Why.** Appendix B is the agreed default. CSP is intentionally deferred — getting it right requires knowing the final set of third-party origins (Stripe, ElevenLabs CDN, PostHog, Supabase Storage signed URLs). Adding a partial CSP now would either be too loose to matter or break Stripe Checkout / PostHog autocapture. Revisit at Phase 2 (Stripe lands the first cross-origin script) and again at Phase 5 (audio).

**Open.** Add CSP at the start of Phase 2. Confirm `X-Frame-Options: SAMEORIGIN` doesn't block any future Stripe/HumanDesignHub iframe (master plan Appendix B chose `SAMEORIGIN` over the original `DENY` from the handoff text).

---

## 2026-05-10 — PostHog env var renamed: TOKEN → KEY

**Decision.** The PostHog project API key is read as `NEXT_PUBLIC_POSTHOG_KEY` everywhere. Updated `instrumentation-client.ts`, the new `lib/posthog/server.ts`, and `.env.local.example`.

**Why.** The PostHog setup wizard wrote `NEXT_PUBLIC_POSTHOG_TOKEN`, but the canonical multi-phase env contract in `.env.example` already used `NEXT_PUBLIC_POSTHOG_KEY`. Two names for the same value would have caused either a silent boot failure (one of the two reads `undefined`) or future copy-paste errors. PostHog's own docs use "project API key" terminology, so `_KEY` reads more naturally.

**How to apply.** Anything new that needs the key reads `process.env.NEXT_PUBLIC_POSTHOG_KEY`. The previous PostHog DECISIONS entry below is now slightly stale on the env-var name; this entry supersedes it.

---

## 2026-05-10 — `app/posthog.ts` moved to `lib/posthog/server.ts`

**Decision.** The PostHog server-side `PostHogClient()` factory now lives at `lib/posthog/server.ts`. The old `app/posthog.ts` was deleted.

**Why.** Under Next.js App Router, `app/` is for routes (pages, layouts, route handlers, loading/error boundaries). A non-route module placed there is at best wasted convention and at worst can confuse the router. Server-side helpers belong under `lib/`. The root-level `instrumentation-client.ts` stays where it is — that one is a Next.js file convention.

---

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
