# DECISIONS.md

Append-only log of why-we-chose-X. New entries go at the top. Each entry: date, decision, why, alternatives considered, and any open questions.

## 2026-07-29 — Transit report: channel headers, consolidated Who Feels It Most, Sky-in-Motion removed

**Decision.** Three consolidations to the daily transit report at Kaycee's request. (1) The Channels sub-section in The Weather Today now gives each active channel a standardized document header, `Name | Type | Centers | Keynote`, matching the per-placement header pattern. Name/Type/Keynote come from the synced HD Channels metadata (new `channel()` accessor on `LibraryNames`); the two centers are derived from the gate pair. The model writes a bare `#### Channel {id}` heading plus a grounded description; `injectChannelHeaders()` rewrites the heading. (2) "Who Feels It Most" and the separate ranked appendix are merged into ONE section: the full roster, ranked, each person a synthesis paragraph followed by their exact ranking data. (3) The embedded "Sky in Motion" mandala is removed from the daily report (the animated chart is delivered separately).

**Cost note (new Claude path: `buildPersonReads`).** One Haiku 4.5 call per batch of 6 people, roster ~16 so ~3 calls. Input per batch is the person's completions plus the grounded library bodies for the channels/gates involved (a few thousand tokens), with IDENTITY/VOICE cached across batches; output is ~60-70 words per person. Estimated ~$0.02 per report on top of the existing narrative + syntheses spend, well under the run's ceiling. Replaces nothing in cost (the old top-few prose was inside the one narrative call) but buys a grounded read for every person instead of the top few.

**Why.** The channel headers make the collective channels scannable like the placements. The merged Who section is what Kaycee reads for her daily analysis: she wanted a read for everyone, not just the top few, each next to its driving data. Sky-in-Motion was not relevant to this report and cost a 5-minute subprocess per run.

**Open.** Channel Type is shown verbatim from the library (for example "PROJECTED" title-cased to "Projected"); if Kaycee prefers circuit names (Individual / Tribal / Collective) instead, that is a one-line metadata swap.

---

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

## 2026-07-13 — Daily transit report: new Claude path (cost note)

**Decision.** A new local script (`scripts/transit-report.ts`) generates a daily collective Human Design transit report. It casts the live sky via mybodygraph, scans the day for gate/line shifts, scores the client roster for who is most impacted, and calls Claude once to write the narrative. This is the first transit-flavored Claude path; it predates the Phase 6 portal build and is a standalone operator tool for now.

**Cost note (required by CLAUDE.md).** One Claude call per report on **Haiku 4.5**. Input is small: the static system prompt plus IDENTITY/VOICE (cached blocks) plus a compact deterministic brief (active sky table, shift timeline, roster impact), on the order of 2-4k input tokens. Output is capped at 3,500 tokens and lands around 1,200-1,500 words. Measured first run: **$0.0089** total. Cache hit rate is low here (the daily brief changes every run and IDENTITY/VOICE are still stubs), but the absolute cost is trivial at Haiku pricing. A hard 40-cent per-call ceiling is enforced. mybodygraph is the larger call-count cost (about 26 calls per run after natal charts cache: 25 day-scan samples at 60-min resolution plus one live cast; the 15 natal charts are cached to `.cache/charts/` on first run). Coarsen with `TRANSIT_INTERVAL_MIN` if the mybodygraph quota matters.

**Why.** Kaycee asked for a daily transit report showing what is active, what shifts through the day, who is most impacted, and the collective read. The wheel geometry (`lib/hd/gate-longitude.ts`) and roster already existed; this assembles them.

**How to apply.** Run `npx tsx scripts/transit-report.ts` (defaults to today, Mountain time). Output lands in `~/Desktop/HD Reports/Transits/`. Gate names (`lib/hd/gate-names.ts`) and channel names (`lib/hd/channels.ts`) are Ra-standard placeholders pending Kaycee's Black Book verification. Markdown-first by decision; branded `.docx` render and Notion-sourced gate names are the natural v2.

**Open.** Center-definition modeling reports the transit-side center only, not both centers a completed channel spans. Day-scan transition times are accurate to the sampling interval, not the minute.

---

## 2026-07-13 — Transit report: branded .docx + resvg rasterizer + daily schedule

**Decision.** The daily transit report now also emits a Delphi-branded `.docx` (Montserrat, purple, logo cover) and runs automatically every morning. The `.docx` uses NO mandala; instead it shows the transit sky as a BODYGRAPH at each Moon phase of the day (`scripts/render-transit-docx.ts`), so the reader watches the chart change from morning to evening. Both `.md` and `.docx` land in `~/Desktop/HD Reports/Transits/`.

**Bodygraph SVG.** The branded bodygraph is the `design=delphi` inline SVG from mybodygraph (`raw.SVG`), cast for a moment rather than a birth. Two gotchas were resolved: (1) the wrapper now supports `brandedSvg: true` and exposes `chart.bodygraphSvg`; (2) that SVG ships with an INVALID lowercase `viewbox` and no width/height, so it is normalized (`lib/transit/sky.ts` `normalizeBodygraphSvg`) before rasterizing.

**Rasterizer.** Switched bodygraph SVG→PNG from `qlmanage` to **`@resvg/resvg-js`** (added as a dependency; it was already referenced by `scripts/check-render.ts` but not installed). `qlmanage` forces a square canvas and clips the lower centers, which is exactly where the fast-moving Moon's gate lives, so every phase rasterized identically. resvg honors the viewBox and renders true portrait at an exact width. The Planetary Overview renderer still uses `qlmanage` for its square mandala; only the transit bodygraph needed resvg.

**Schedule.** A LaunchAgent (`~/Library/LaunchAgents/com.delphihd.transit-report.plist`, label `com.delphihd.transit-report`) runs `scripts/run-transit-report.sh` daily at 06:00 local, mirroring the existing `com.delphihd.delphi-pull` agent. `RunAtLoad` is false (calendar only). Logs to `~/Library/Logs/com.delphihd.transit-report.log`. Cost impact is unchanged from the note above: one Haiku call (~$0.01) plus a handful of extra `design=delphi` casts for the cover and phase bodygraphs.

**Open.** Gate/channel names still Ra-standard placeholders pending Kaycee's Black Book verification. `.docx` visual layout verified structurally (valid package, six distinct embedded images, headings/tables present) but not yet eyeballed as a rendered page (no LibreOffice on the box to auto-convert to PDF).

---

## 2026-07-13 — Transit bodygraphs: personality-only, with placements

**Decision.** The transit `.docx` bodygraphs now show the PERSONALITY side only (the live sky), and each bodygraph is paired with its planetary placements list to the right (glyph, planet, gate.line, gate name).

**Why.** A transit chart's Design side is the meaningless ~88-day-prior sky; drawing it (red) alongside the live Personality activations (black) clutters the chart and inflates center definition. Kaycee asked for personality-only plus a placements column.

**How.** The delphi bodygraph SVG draws both sides, coloring Personality black and Design red (#e06666) on both halves of each activated gate leg. `lib/transit/sky.ts` `personalityOnly()` rewrites the SVG data-driven from the known personality gates: every activation element (gate leg, channel connector, gate-number circle+numeral) survives only if all of its gates are personality-activated (recolored black), everything else is hidden, and any center not defined by a complete personality channel is re-opened to white (#ffffff). `castTransitBodygraph()` returns the transformed SVG plus the personality placements. Verified visually: red fully removed, centers recompute correctly (e.g., Sacral re-opens; Ajna/Throat stay defined via personality channel 17-62, Root/Solar-Plexus via 39-55).

---

## 2026-07-13 — Transit deliverable switched from .docx to branded HTML

**Decision.** The rich transit deliverable is now a self-contained **HTML** file (`scripts/render-transit-html.ts`), not `.docx`. `render-transit-docx.ts` was deleted. The `.md` is still written; the LaunchAgent is unchanged (same script now emits `.html`).

**Why.** Kaycee wanted the Genetic-Matrix-style layout: bodygraphs side by side, each with a compact vertical shorthand placement column (planet glyph + gate.line), personality side only. HTML embeds the personality-only SVG natively (no rasterizing, always crisp), makes the little placement boxes trivial with CSS, wraps the charts side by side, and matches the interactive-chart medium she already likes. docx tables made all of this fight the tool.

**How.** `renderTransitHtml()` builds one page: Delphi logo header, the narrative (a small markdown→HTML pass), a "sky right now" card, a wrapping grid of one card per Moon phase, and the deterministic data tables. Each card = inline personality-only bodygraph SVG + a `.cols` column of `.pbox` boxes (glyph + gate.line, exalted ▲ / detriment ▽). Inline SVG ids are namespaced per card (`namespaceSvg`) to avoid cross-chart id collisions. Brand tokens (purple #845095, gold, Montserrat) mirror the interactive chart. Verified in-browser: layout matches the Genetic Matrix reference, phases visibly differ (Solar Plexus lights via 39-55 in the Moon-39 phase). @resvg/resvg-js is no longer used by the transit path (still a dep, referenced by `scripts/check-render.ts`).

**Open.** Shorthand shows gate.line (e.g., 62.1) to match the reference; drop the line if Kaycee wants bare gate numbers. The narrative's own "As The Day Moves" text and the bodygraph grid are separate sections rather than interleaved. No Word/`.docx` output anymore (easy to re-add if a shareable Word file is ever needed).

---

## 2026-07-13 — Transit report: established names, changed-gate highlight, split shifts, babies section

**Decision.** Four refinements to the HTML transit report, all from Kaycee's feedback.

1. **Established names.** Gate and line names now come from her synced Notion library (`.cache/chunks.json`) via `lib/hd/library-names.ts` `loadLibraryNames()` (same source the interactive chart uses), with the static `gate-names.ts` as fallback. Threaded through the LLM brief (so the narrative speaks her vocabulary, e.g. "gate 52, Keeping Still (Mountain)", line "Routine"), the shorthand tooltips, all appendix tables, and the impact prose.
2. **Changed-gate highlight.** In the phase bodygraph shorthand columns, a placement box turns Delphi purple when that planet has changed gate since the previous chart (`.pbox.chg`), with a legend. Driven by passing the prior phase's positions into `shorthandColumn`.
3. **Shifts delineated.** The "shifts across the day" is now two tables: **Gate changes** (always visible, the field's theme turning over, "Enters" in purple) and **Line movements** (collapsed `<details>`, the finer within-gate shifts). Replaces the single mixed table.
4. **Babies Born on This Day.** New section: a FULL natal chart (both sides, not personality-only) cast for 12:00 UTC via `castNatalChart()`, shown as the branded bodygraph plus a Type/Strategy/Authority/Profile/Definition/Cross facts row and a short overview reading. The reading is a second Haiku 4.5 call, `buildBabyOverview()` in `lib/report/transit.ts`, ~180-260 words, with a one-line caveat that the exact birth hour can shift Profile/Definition.

**Cost.** Adds one Haiku call per run (~$0.002). Total per run now ~$0.012 in Claude spend plus the mybodygraph casts (one extra noon-UTC cast for the baby chart).

**Open.** Baby chart uses noon UTC as the representative snapshot (Profile can differ earlier/later in the day). Line-name coverage depends on the library cache being present and current (`.cache/chunks.json`); falls back to Ra gate names and blank line names if absent.

---

## 2026-07-13 — Baby charts per interval as clickable tabs; from/to columns; em-dash sanitizer

**Decision.** Three more refinements from Kaycee.

1. **Baby charts per interval, clickable.** Instead of one noon-UTC chart, the "Babies Born on This Day" section now casts one full natal chart per day-phase interval (the same Moon-phase times as "The Bodygraph Through the Day"), each with its own Haiku overview. They render as birth-time tabs (`.btab` + a small inline `<script>` toggling `.tabpanel[hidden]`); clicking a birth time shows that chart and reading. Value confirmed: on 2026-07-13 the profile shifts from 1/3 (morning) to 2/4 (evening), so the tabs actually differ. `buildBabyOverview` now takes the birth time and speaks to it.
2. **From/To columns.** Both shift tables (gate changes, line movements) now have explicit "Moving from" and "Moving to" columns, from left to right.
3. **Em-dash sanitizer.** Found a leak: the narrative lint only checked the collective text, but the baby overviews (a separate Haiku call) contained em dashes. Fixed at the source, `stripEmDashes()` in `lib/report/transit.ts` runs on every model output (em dash between words becomes a comma; en dashes in time ranges are left alone). Also fixed two hardcoded em dashes in our own copy (the HTML `<title>` and the "quiet day" impact line). The end-of-run lint now scans the published `.md` and `.html` files for em dashes rather than just the narrative string, so any future leak (including from a library name) is caught.

**Cost.** Now one collective narrative + N baby overviews per run (N = day phases, typically 3), all Haiku. Roughly $0.017 per run on 2026-07-13.

**Open.** Baby intervals follow the Moon phases (so their spacing is Moon-driven, not a fixed 3-hour grid like the Genetic Matrix rectification report); switch to fixed intervals if Kaycee wants that cadence.

---

## 2026-07-16 — Transit automation reliability (retries + backup run)

**Symptom.** The 6am LaunchAgent fired on 2026-07-16 (at 06:12, after wake) but exited 1: a transient `ECONNRESET` / "fetch failed" during the day scan aborted the whole run, so no report was produced. The morning automation was real but fragile.

**Fix.** (1) `lib/mybodygraph.ts` now wraps every API call in `fetchWithRetry` (4 attempts, 1s/2s/4s backoff, retrying thrown network errors and 429/5xx). This is the primary fix: a run makes dozens of sequential chart calls and any single blip used to kill it. (2) `scanDay` now skips a sample that still fails after retries instead of aborting (a missing sample only widens a shift-detection gap). (3) The LaunchAgent gained a second `StartCalendarInterval` at 07:30 as a backup, and `run-transit-report.sh` is now idempotent (exits early if today's HTML already exists), so the backup is a no-op after a successful 6am run and a real retry after a failed one.

**Open.** Idempotency keys on the machine's local date, which matches the default TRANSIT_TZ (America/Denver); revisit if the two ever diverge. Still Mac-local (needs the local Desktop path + env), so it only runs when the machine is on; launchd runs a missed calendar job once on wake.

---

## 2026-07-13 — Clickable placement columns (transit charts)

**Decision.** The shorthand placement columns on the transit bodygraphs (the "sky right now" card and each Moon-phase card) are now clickable. Clicking a placement box highlights that gate on the same card's bodygraph in brand gold (#c79a2e) and shows a readout below the chart: planet glyph, name, gate.line (purple), gate keynote, and line name. Clicking again clears it. Same teaching interaction as the interactive chart, scoped per card.

**How.** Each `.pbox` carries `data-gate/planet/gl/glyph/gname/lname`. A small inline `<script>` iterates `.chart` cards; on click it toggles `.sel` on the box, adds `.hl` (gold stroke) to the bodygraph elements whose namespaced id ends with `_<gate>` (the gate circle) or `personality-<gate>` (the personality leg), and fills the `.readout`. The `personality-<gate>` suffix match deliberately excludes the hidden `design-<gate>` legs so the personality-only chart does not sprout phantom gold outlines. No new dependency, no build step; it is plain DOM JS in the self-contained file. The babies section charts have no placement column, so they are unaffected.

**Open.** The appendix "Active sky right now" table is not clickable (it has no adjacent bodygraph to drive); only the per-chart columns are.

---

## 2026-07-13 — Baby overview: outer-planet (generational) paragraph

**Decision.** Each baby overview now includes a dedicated paragraph on the outer-planet influences (Uranus, Neptune, Pluto). The report passes their gate.line on both Personality and Design sides (with established names) into the facts, and `BABY_SYSTEM` now asks for a 4-paragraph reading whose third paragraph covers these as the slow, generational current the child shares with everyone born around that time, framed as collective backdrop, not individual. Length bumped to 210-300 words. Verified: all three overviews name the outer-planet gates and keynotes and explicitly mark them as shared. Adds ~$0.001 per baby (longer output); still under $0.02/run total.

---

## 2026-08-24 — Client chart links (delphihd.com/c/<token>)

**Decision.** A client's interactive chart can be published as a plain link on Kaycee's own domain: `https://delphihd.com/c/<token>`, no sign-in for the client, live until she pulls it. Chosen over emailing the .html (Drive and most mail clients will not render a shared HTML file, so it arrives as raw code or a download) and over the Claude artifact link (private to her workspace, so a client may not be able to open it at all). Kaycee's call, 2026-08-24: plain link, her domain, no expiry.

**How.** New `public.client_charts` table: one row per client, holding a 128-bit hex token, the client slug and name, and the path of the built HTML in a **private** `charts` storage bucket. RLS is on with **no policies**, so neither the anon key nor a signed-in user can read the table; the only reader is `/c/<token>`, a dynamic route that uses the service role, treats an unknown or revoked token as a plain 404, and streams the file with `X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy: no-referrer` and `Cache-Control: private, no-store`. `/c/` and `/portal/` are disallowed in robots.txt. `scripts/energy-flow-diagram.ts <slug> --publish` uploads and prints the link, reusing the client's existing token so a link already sent keeps working and shows the newest build; `--unpublish` sets `revoked_at` and the link goes dead.

**Security model.** The token is the credential, as with a Google Docs "anyone with the link" share. Not guessable, not crawlable (nothing links to it, and it is marked noindex), no referrer leakage (the page has no outbound links). The real exposure is forwarding, which revocation answers. If that stops being enough, the next step is a second factor the client knows (birth date or a short code), not a full login.

**Also fixed to get here.** The app did not build: `middleware.ts` had survived alongside its Next 16 replacement `proxy.ts` (same semantics, `proxy.ts` wins), and the production type check was failing on pre-existing errors in operator scripts. Removed the dead middleware file, and pointed the Next build at `tsconfig.build.json`, which excludes `scripts/**`. Those scripts are still checked by `npm run typecheck`; they are dev tools run with tsx and are not part of the deployed app, so an unrelated script error should never block a deploy. The four pre-existing script errors are untouched and still need a decision: two of them (`italic` should be `italics` in the docx runs) would change report output, so they are Kaycee's call, not a silent fix.

**Shipped 2026-08-24.** Migration applied, code pushed (`d4c20dc`) and deployed to production. The Supabase env vars were already present for Production, so nothing had to be added. Bryan's chart verified live end to end: 200 with the privacy headers, byte-identical 1,804,552-byte payload, popups pulling his report text, unknown and malformed tokens 404. Note that the previous production deployment (May 29) had been in an Error state, so this push also restored the site itself.

**Domain: a subdomain, not the apex.** The apex was attached to the Vercel project first, and pointing it would have been a mistake: `delphihd.com` already serves Kaycee's live Wix website (the apex redirects to `www.delphihd.com`, title "Home | Delphi Human Design"). Repointing the apex A record at Vercel would have taken her site off her own domain. Caught before any DNS was changed; the apex has been removed from the Vercel project so it cannot be pointed by accident.

Client links live at **`charts.delphihd.com/c/<token>`** instead — Kaycee's call, 2026-08-24, and **live the same day**. The record at Wix is a **CNAME**, host **charts**, value **8795503e42a0869e.vercel-dns-017.com**. Wix warned it could take 48 hours; it resolved and the certificate issued within minutes. Verified after the change: the chart serves over HTTPS on the subdomain, unknown tokens 404, and `delphihd.com` and `www.delphihd.com` still return her Wix site unchanged. `delphi-woad.vercel.app/c/<token>` also keeps working, so a link sent before the switch never breaks.

**Lesson.** Check what a domain is already serving before attaching or pointing it. A registrar record looks like config; on an apex it is the whole business's front door.

**Open.** No cost note: no Claude calls on this path; storage is a fraction of a cent per chart.

---

## Astrology view on the client chart (2026-08-27)

**The endpoint was there all along.** Natal astrology lives at
`GET /v240815/astro-data`, a different API version from the Human Design
`/v221006/hd-data`. Probing for it under the HD version returns
`{"error":"API endpoint not found"}`, which is how two separate sessions
concluded the subscription did not include it. It does. So does the
relationship chart, at `/v221006/hd-data` with `date[]`, `timezone[]` and
`relationship=1`. **Read the vendor's docs at https://bodygraph.com/docs before
concluding an API cannot do something.**

It returns 14 planets with sign, degree, element, modality and house, all twelve
cusps, ~50 aspects with orbs, the angles, and a rendered wheel.

**We draw our own wheel.** The provider's wheel draws every glyph and number as
a vector path rather than text, so its typography cannot be restyled and it
reads heavier than the brand. `scripts/astro-wheel.ts` draws from the same
numbers in Montserrat and `#845095`. Nothing on it is derived or estimated.

**Coordinates come from OpenStreetMap, not from the chart provider.** The
provider's `locations` endpoint returns a timezone and nothing else: no
latitude, no longitude, and `hd-data` carries none either. Human Design only
needs the instant, so this never mattered before. Astrology needs the place.

**And a missing coordinate is silent.** `astro-data` accepts a missing latitude
without complaint and returns a chart computed from a default point in the
ocean. For a 6:29am Utah birth that put the Ascendant in Sagittarius instead of
Cancer and moved every planet into the wrong house. `lib/astro.ts` now throws
rather than letting that through, and geocodes are cached in
`.cache/geocode.json`.

**The node names are misleading.** `Mean_Node` and `True_Node` come back exactly
180 degrees apart on every chart, which is the node axis, not the one degree
that separates a mean from a true north node. Checked against the Human Design
North Node, which we compute ourselves, on four charts: `True_Node` matched to
two decimals every time and `Mean_Node` was opposite. **`True_Node` is North,
`Mean_Node` is South.** Verify against HD before trusting a name in this API.

**The sign copy is Kaycee's.** The provider's zodiac text is written in the
second person for someone with that Sun sign, so used as a hover it tells every
client they are all twelve signs. Hers is in `SIGN_NOTE` in `lib/astro.ts`,
written about the sign rather than about the reader. Nine charts went out with
the provider's text before she caught it.

**Open.** No cost note: no Claude calls on this path, and charts are unlimited
on her subscription.

---

## Runs must outlive the dashboard (2026-08-27)

The form spawned `add-client` as a child of the server, so reloading the server
killed the queue. On 2026-08-27 a reload to pick up a dashboard change did
exactly that, thirty seconds after a three-client batch started: the report
already in flight finished, because those are detached, but nothing advanced the
queue and the dashboard showed "waiting" for ever. The run was gone and nothing
said so.

Runs are now their own process writing to `.cache/runs/<id>.log`. The server
follows that log for progress instead of a pipe, picks live runs back up on
startup, and closes out any that ended while it was down. **A run is current
only while its process is alive**; that is the only test, because a job from
before this change has no log to follow and would otherwise read "running" for
ever.

Verified by restarting the server repeatedly during live batches, including
Kaycee's own test run.

---

## The source library is never filtered (Kaycee, 2026-08-27)

**Non-negotiable. Do not strip, trim, or filter the source material before it
reaches the model, for any reason.** She has been down this road before and the
answer is settled.

Recorded because it is an attractive-looking idea that will occur again. 309 of
the 384 line-level chunks carry exaltation and detriment prose naming the fixing
planets, because that is how Ra's line material is written. When the model writes
about a fixing on a placement that carries none, the library sitting in the
prompt looks like the culprit, and "just don't send that passage for neutral
placements" looks clean. It is not on the table.

**And the measurement does not support the theory anyway.** Attributed at
paragraph level across 33 reports: of 650 fixation mentions, 88% sit in a
paragraph about a placement that genuinely has a fixing, 10% about one that does
not, 1% floating. The model is not mostly riffing on phantom fixing planets. It
is talking about real fixings two and a half times more often than it needs to:
211 fixings across the roster, 518 mentions.

So the levers are on the output side, where they belong:

- `fixation-over-mentioned` — hard, caps mentions at one per fixing in the chart.
  Removes 307 of 518 mentions roster-wide and loses no fixation. Proportional per
  chart, because charts carry between 2 and 13 fixings and an absolute ceiling
  would suppress real ones on a heavy chart (Lisa has 13).
- `fixation-claimed-without-fixing` — hard, catches the 10%: a fixing state
  claimed on a placement that has none.
