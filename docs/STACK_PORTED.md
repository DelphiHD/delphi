# STACK_PORTED.md

Inventory of prior-work repositories ported into HD Reports. Generated 2026-05-10.

All 19 listed repos have been forked into `github.com/DelphiHD/*` as the canonical home for HD Reports work. Most were re-forked from copies that live at `github.com/tennysonmilesperhour/*`; a few (e.g. `mempalace`, `mnemo-cortex`) were forked directly from upstream. **All 19 are forks** — none contain Tennyson-original code that this inventory could verify from READMEs alone. The ported value here is a chosen tool stack plus whatever local modifications live on the fork branches (not audited in this pass). Provenance (`parent` repo) is recorded per-entry so we know what we're actually depending on. When this doc references "the fork", it means the `DelphiHD/*` copy.

## Stack overview

The cost spine for HD Reports runs through two categories: **memory architecture** (OpenBrain primary; mnemo-cortex and memory-palace as reference) and **the build harness** (superpowers, everything-claude-code, claude-behave). These are the only repos that touch the per-report dollar number directly. lean-geck (lean-ctx upstream) was originally categorized here as a runtime cost lever; on closer read it's **dev-time tooling that sits next to Tennyson's coding agent (Cursor / Claude Code / Copilot), not a runtime layer for `invoke-llm`** — see the `lean-geck` entry and the 2026-05-10 reclassification in `DECISIONS.md`. Everything else is supporting infrastructure (transcription, scraping, design, security, viz) or reference material.

The three memory repos overlap heavily — all three ultimately do "store text, embed it, retrieve by semantic search, expose via MCP." mnemo-cortex (fork of `GuyMannDude/mnemo-cortex`) is SQLite + FTS5, fully local, claims "80% token reduction, zero information loss on named entities" via DAG compaction. OpenBrain (fork of `NateBJones-Projects/OB1`) is Postgres + pgvector, defaults to Supabase. memory-palace (fork of `MemPalace/mempalace`) is SQLite + ChromaDB, claims 96.6% R@5 on LongMemEval. **For HD Reports the natural choice is OpenBrain**, because its default backend is Supabase and HD Reports already runs on Supabase — so OpenBrain's tables can live in the same Postgres instance the rest of the app uses, no second store to operate. The other two are kept as reference architectures, not deployed.

**lean-geck (lean-ctx) is dev-time tooling, not runtime.** Its 99% reduction figure applies to *coding-agent sessions* — file reads, CLI output, and `git status` chatter that Cursor/Claude Code/Copilot/Windsurf send to their LLMs while Tennyson is building HD Reports. It's an MCP server + shell hook installed locally on the developer's machine. It does **not** plug into `invoke-llm` and does **not** reduce per-customer-report cost. The Phase 4 cost target (under 30¢/report) is met instead by Anthropic prompt caching, capped retrieval (top 12 chunks), and model routing (Sonnet for full reports, Haiku for short outputs) — all already specified in the master plan. Install lean-ctx on Tennyson's laptop to compound dev-side savings; do not try to port it.

The build harness — superpowers (fork of `obra/superpowers`), everything-claude-code (fork of `affaan-m/everything-claude-code`), and claude-behave (fork of `forrestchang/andrej-karpathy-skills`) — does not run in production. It shapes how Tennyson and Kaycee build the product. These get referenced in `CLAUDE.md` and skills directories, not in `supabase/functions/`.

The remaining repos split into "real but adjacent" (claude-video and openwhispr for Ra's lecture archive ingestion; awesome-design-md and ui-ux-pro-max-skill for Phase 1 UI work; safe-chain-aikido-security for the dependency tree) and "reference only" (data-visualization which is a fork of `d3/d3` with no apparent local mods, awesome-opensource-ai which is a curated link list, agency-agents which is 144 personality markdowns).

## By category

### Memory architecture

#### mnemo-cortex
- **Parent:** `GuyMannDude/mnemo-cortex` · **Branch:** `master` · **License:** MIT · **Last push:** 2026-05-04
- **What it is.** Persistent memory coprocessor for AI agents. Python FastAPI server with SQLite + FTS5 embeddings, Node.js MCP bridge, optional cross-agent messaging ("Sparks Bus"). Fully local, zero API cost.
- **Provides.** Python server, MCP bridge, "WikAI compiler" that auto-generates a searchable knowledge view, integration guides for Claude Code / LM Studio / Open WebUI / Ollama. Diagnostic CLI.
- **HD Reports touch-points.** Reference architecture for how to structure Kaycee's source archive as queryable memory. The DAG-compaction claim ("80% token reduction, zero information loss on named entities") is directly relevant to Phase 3 chunking strategy. **Probably not deployed** — running a parallel SQLite+FTS5 service alongside Supabase is operational overhead we don't need.
- **Maturity.** Production per README ("3,000+ memories, 12+ weeks of recall verified"). Active.
- **Friction.** Overlaps with OpenBrain and memory-palace. README credits Guy Hutchins as lead, with collaborators including ChatGPT — Tennyson's contributions on the fork branch are unaudited in this pass.

#### OpenBrain
- **Parent:** `NateBJones-Projects/OB1` · **Branch:** `main` · **License:** FSL-1.1-MIT · **Last push:** 2026-04-21
- **What it is.** Persistent AI memory infrastructure on Postgres + pgvector with auto-embedding capture. "OB1" and "Open Brain" are used interchangeably.
- **Provides.** Postgres schema, capture/recipe scripts (ChatGPT, Perplexity, Obsidian, Gmail, X imports), SvelteKit + Next.js dashboard templates, K8s deployment manifest, Slack/Discord capture bots, six "extension" learning modules, reusable skill prompts.
- **HD Reports touch-points.** **Highest-fit memory repo.** Default backend is Supabase, which is HD Reports' database — same instance, additional schema. Tables can underlie both the per-customer report-history memory (Phase 4–6) and the long-term Ra source archive (Phase 3). The Next.js dashboard template might also save work in Phase 7 ops tooling.
- **Maturity.** Production per README. Has community contribution pipeline.
- **License verdict (2026-05-10).** FSL-1.1-MIT confirmed safe for HD Reports. Per the FSL "Permitted Purpose" clause: "Permitted Purposes specifically include using the Software for your internal use and access." HD Reports uses OpenBrain as internal memory infrastructure inside a paid Human Design product — not as a competing memory-as-a-service offering — so it falls within Permitted Purpose. After 2 years from each release the license converts to plain MIT. Recorded in DECISIONS.md.
- **Friction.** The "OB1" branding in the parent repo is a different project than Nate B. Jones' public "OpenBrain" content; verify the fork is the version we want.

#### memory-palace (the "mempalace" Tennyson named)
- **Parent:** `MemPalace/mempalace` · **Branch:** `develop` · **License:** MIT · **Last push:** 2026-04-22
- **What it is.** Local-first memory: stores conversation history verbatim, retrieves with semantic search. Hierarchical metaphor (people = "wings", topics = "rooms", content = "drawers"). SQLite knowledge graph + ChromaDB vectors.
- **Provides.** PyPI package `mempalace`, CLI, MCP server with 29 tools.
- **HD Reports touch-points.** The "verbatim storage, no summarization" stance is philosophically aligned with Kaycee's "AI-organized, not AI-generated" principle — worth borrowing the framing even if we don't run the code. 96.6% R@5 retrieval claim on LongMemEval is a useful bar to measure our Phase 3 pipeline against.
- **Maturity.** v3.3.0, production per README. Default branch is `develop` (not `main`) — minor pointer that the upstream is mid-flight.
- **Friction.** Tennyson's directory note called this "mempalace" but his fork is named `memory-palace`; the parent org is `MemPalace`. Same project, three different spellings — **resolve naming before referencing in code.** Overlaps OpenBrain/mnemo-cortex; pick one.

### Cost reduction

#### lean-geck
- **Parent:** `yvgude/lean-ctx` · **Branch:** `main` · **License:** Apache-2.0 (with MIT portions) · **Last push:** 2026-04-17
- **What it is.** MCP server + shell-hook system that compresses context before it hits the LLM. Single Rust binary. Originally `lean-ctx`.
- **Provides.** Binary distributions (cargo, npm `lean-ctx-bin`, Homebrew, AUR), 46 MCP tools, 90+ shell-output compression patterns across 34 categories, web dashboard, CLI analytics.
- **HD Reports touch-points (revised 2026-05-10).** **Dev-time only.** lean-ctx compresses the input that AI coding tools (Cursor, Claude Code, Copilot, Windsurf, Gemini CLI) send to their LLMs during interactive sessions: file reads, `git status` output, `ls` listings, test runner output, etc. Its 99% / 88% figures apply to those flows, not to customer-report generation. For HD Reports it reduces *Tennyson's build cost* across every Phase 1–8 coding session, but it does **not** plug into `invoke-llm` or reduce per-report cost. Installation: `curl -fsSL https://leanctx.com/install.sh | sh` (installs to `~/.local/bin`), then `lean-ctx setup` to auto-configure detected editors. Already installed on Tennyson's machine as of 2026-05-10.
- **Maturity.** Production per README. Distributed via four package managers.
- **Friction.** Misclassified in earlier inventory passes as a runtime cost lever — see DECISIONS.md 2026-05-10. The actual Phase 4 cost levers are the master plan's existing prescriptions: Anthropic prompt caching with `cache_control` on system prompt and chunk blocks, capped retrieval, and Haiku-vs-Sonnet routing. None of those require lean-ctx.

### Skills framework + Claude Code config

#### superpowers
- **Parent:** `obra/superpowers` · **Branch:** `main` · **License:** MIT · **Last push:** 2026-04-24
- **What it is.** Claude Code plugin / skill library by Jesse Vincent. 13+ skills for testing, debugging, collaboration, meta workflows. Two-stage code review pattern.
- **Provides.** Plugin via Claude Code marketplace + Superpowers Marketplace. Skills as markdown.
- **HD Reports touch-points.** Build-time only. Install in `~/.claude/` for both developers; reference the testing/review skills in HD Reports' `CLAUDE.md`. Does not touch production cost.
- **Maturity.** Active, MIT, public marketplace presence.
- **Friction.** None for build-side use.

#### everything-claude-code
- **Parent:** `affaan-m/everything-claude-code` · **Branch:** `main` · **License:** MIT · **Last push:** 2026-05-06
- **What it is.** Large bundled Claude Code config: 48 agents, 183 skills, 79 legacy command shims, 34 rules, hooks for 8+ event types, MCP server configs.
- **Provides.** Cross-platform installer (bash/PS), dashboard GUI, the bundle above.
- **HD Reports touch-points.** Build-time. The hook configurations are the most directly reusable piece — pre-commit / pre-push hooks that enforce HD Reports' invariants (no direct Anthropic calls, no client-side keys, etc., per Phase 1 plan).
- **Maturity.** Per README v1.10.0 (April 2026), claims "140K+ stars" — almost certainly inflated/upstream-counted; treat as marketing copy, not a maturity signal.
- **Friction.** Big bundle (183 skills, 48 agents). Picking the subset we actually want is a non-trivial curation task. Don't install wholesale.

#### claude-behave
- **Parent:** `forrestchang/andrej-karpathy-skills` · **Branch:** `main` · **License:** MIT · **Last push:** 2026-04-15
- **What it is.** Four-principle behavior framework distilled from Karpathy's LLM observations: Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution.
- **Provides.** A `CLAUDE.md` file. That's it — README describes it as installable as a Claude Code plugin or copied per-project.
- **HD Reports touch-points.** Copy the four principles into HD Reports' `CLAUDE.md`. Done.
- **Maturity.** Reference / educational. The fork name (`claude-behave`) implies more skills exist; **the parent is named `andrej-karpathy-skills` but the README describes one CLAUDE.md.** Worth verifying whether Tennyson's fork branch adds skills or just the rename.
- **Friction.** Naming mismatch. Thin scope.

### Video transcription

#### claude-video
- **Parent:** `bradautomates/claude-video` · **Branch:** `main` · **License:** MIT · **Last push:** 2026-04-24
- **What it is.** A Claude skill for analyzing video: download, frame-extract, transcribe, feed to Claude. Captions used when present; falls back to Groq `whisper-large-v3` (cheaper than OpenAI per README).
- **Provides.** SKILL.md, Python scripts, `watch.skill` bundle for claude.ai, Claude Code marketplace plugin, Codex variant.
- **HD Reports touch-points.** Phase 3 archive ingestion. Kaycee's archive likely includes Ra's recorded lectures — this is the path from raw video to transcript-text-in-Notion-or-Postgres. Use Groq route for cost.
- **Maturity.** Production per README. Active.
- **Friction.** None obvious. Groq API key needs to be in scope for Phase 3 cost accounting (small but non-zero per-hour-of-video).

#### openwhispr
- **Parent:** `OpenWhispr/openwhispr` · **Branch:** `main` · **License:** MIT · **Last push:** 2026-05-05
- **What it is.** Desktop app (macOS / Windows / Linux) for voice → text → notes/actions. Local processing via whisper.cpp + sherpa-onnx; optional cloud providers.
- **Provides.** `.dmg` / `.exe` / `.AppImage` builds, public API, MCP server.
- **HD Reports touch-points.** **Probably overlaps with claude-video.** If claude-video handles the lecture-archive case, openwhispr is for Kaycee's own voice notes (Phase 5 calls for cloning her voice anyway, so dictation may complement that). Lower priority than claude-video for the archive pipeline.
- **Maturity.** Active project, release versioning.
- **Friction.** Pick one of {claude-video, openwhispr} for the archive path. Keep openwhispr as a productivity tool for Kaycee, not a production component.

### Web scraping

#### geckcrawl
- **Parent:** `unclecode/crawl4ai` · **Branch:** `main` · **License:** Apache-2.0 · **Last push:** 2026-04-16
- **What it is.** Fork of Crawl4AI — async Playwright-based crawler that emits clean Markdown for RAG.
- **Provides.** Python package, CLI, Docker image with FastAPI server.
- **HD Reports touch-points.** Phase 3 archive expansion. If Kaycee wants to import any public HD writing (jovianarchive.com, IHDS, etc.) into the source library, this is the tool.
- **Maturity.** Upstream is highly active (51K+ stars per README). Tennyson's fork is recent.
- **Friction.** README is the upstream README — no signal on what the fork modifies. Treat as upstream until proven otherwise.

#### obscura-scrape-browser
- **Parent:** `h4ckf0r0day/obscura` · **Branch:** `main` · **License:** Apache-2.0 · **Last push:** 2026-04-27
- **What it is.** Rust headless browser engine with V8 + CDP, anti-fingerprinting, tracker blocking. Stealth-focused.
- **Provides.** Pre-compiled binaries, source.
- **HD Reports touch-points.** Backup option if `geckcrawl` (Crawl4AI under the hood) gets blocked by a target site. **Almost certainly overkill for HD Reports' use case** — we're not scraping hostile targets, we're pulling from sites Kaycee already references.
- **Maturity.** Production per README.
- **Friction.** Reference / fallback only. Don't operate two scraping stacks.

### Design system

#### awesome-design-md
- **Parent:** `VoltAgent/awesome-design-md` · **Branch:** `main` · **License:** MIT · **Last push:** 2026-04-16
- **What it is.** 68 `DESIGN.md` files — markdown-encoded design tokens for real sites (Claude, Stripe, Apple, Tesla, etc.).
- **Provides.** The 68 files, plus light/dark preview HTML catalogs.
- **HD Reports touch-points.** Phase 1 UI: drop one of these into the repo as a starting design system, then customize. Skip the Figma round-trip entirely.
- **Maturity.** Active.
- **Friction.** No license issue on the format itself (publicly visible CSS values per README), but pick a base that matches the brand Kaycee wants — not all 68.

#### ui-ux-pro-max-skill
- **Parent:** `nextlevelbuilder/ui-ux-pro-max-skill` · **Branch:** `main` · **License:** MIT · **Last push:** 2026-04-03
- **What it is.** Claude Code skill that generates design systems from project requirements: 67 styles, 161 palettes, 57 font pairings, 99 UX guidelines, supports 15 tech stacks.
- **Provides.** Skill files, CLI installer.
- **HD Reports touch-points.** Phase 1 design pass — runs once, picks a style/palette/fonts, output gets committed. Then we don't need it again.
- **Maturity.** v2.0 per README. Older push (April 3) than most.
- **Friction.** Overlaps with awesome-design-md (one is a generator, one is a library of pre-made systems). Pick one path; don't run both.

### Security

#### safe-chain-aikido-security
- **Parent:** `AikidoSec/safe-chain` · **Branch:** `main` · **License:** *not stated in README* · **Last push:** 2026-04-22
- **What it is.** Aikido's package-install interceptor: scans npm/yarn/pnpm/bun/pip/uv/poetry/pipx installs for malware before code lands on disk. Enforces minimum package age (default 48h).
- **Provides.** One-line installers, CLI, CI/CD integration examples (GH Actions, GitLab, etc.).
- **HD Reports touch-points.** Wrap our `npm install` / `pip install` operations — both Tennyson's local environment and the CI pipeline. Cheap, real value.
- **Maturity.** Production (1.3.2+ per README, npm-tracked).
- **Friction.** **README does not state license.** Aikido is a commercial security company; verify the Apache/MIT status of `safe-chain` specifically before depending on it for production CI.

### Visualization

#### data-visualization
- **Parent:** `d3/d3` · **Branch:** `main` · **License:** ISC (D3 standard) · **Last push:** 2026-05-06
- **What it is.** Fork of D3.js. The README is the standard D3 README.
- **Provides.** D3.
- **HD Reports touch-points.** Phase 5 / Phase 7 — chart visuals in the customer portal (bodygraph, transit graphs). Pull D3 from npm directly. The fork itself adds nothing visible.
- **Maturity.** Upstream is the most mature viz lib in the JS ecosystem. The fork is a fork.
- **Friction.** **The fork has no value over upstream `d3` from npm.** Don't take a dependency on the fork. Use `d3` from npm or a higher-level wrapper (Visx, Observable Plot). Categorize this entry as "reference only."

### Multi-model verification

#### claude-octopus
- **Parent:** `nyldn/claude-octopus` · **Branch:** `main` · **License:** MIT · **Last push:** 2026-05-06
- **What it is.** Claude Code plugin that orchestrates up to 8 LLM providers (Claude, Codex, Gemini, Copilot, Qwen, Ollama, Perplexity, OpenRouter). Double Diamond workflow. 75% consensus thresholds.
- **Provides.** 48 slash commands, 32 personas, MCP server, CLI tools incl. token compression diagnostic.
- **HD Reports touch-points.** **Build-time, not runtime.** Pre-launch Phase 3.5 ("Quality Parity Gate") could use this for adversarial review of generated reports against Kaycee's manual baseline. Do NOT put 8 providers in `invoke-llm` — that destroys the cost target.
- **Maturity.** v9.29.2, 146 passing tests per README.
- **Friction.** Provider sprawl. Each additional provider is API key surface area and bill exposure. Be deliberate about which providers we actually wire up.

### Browser automation

#### browser-use
- **Parent:** `browser-use/browser-use` · **Branch:** `main` · **License:** MIT · **Last push:** 2026-04-25
- **What it is.** Python framework for LLM-driven browser automation. Natural-language objectives → site navigation, form fill, transactions.
- **Provides.** Python library, hosted cloud service (separate terms), CLI.
- **HD Reports touch-points.** **Unclear.** No Phase 1–8 step needs Operator-style automation today. Possible Phase 6+ use: scraping astronomical/transit data sources that don't have APIs. Otherwise reference-only.
- **Maturity.** Production per README.
- **Friction.** Without a concrete HD Reports task, this should not be installed. Park it.

### Specialized agent patterns

#### agency-agents
- **Parent:** `msitarzewski/agency-agents` · **Branch:** `main` · **License:** MIT · **Last push:** 2026-04-12
- **What it is.** 144+ markdown agent personalities across 12 divisions (engineering, marketing, design, sales, etc.).
- **Provides.** Markdown files, multi-tool installer.
- **HD Reports touch-points.** Reference only. Browse for prompt/persona patterns we might apply to Kaycee's report-author voice; skip wholesale install.
- **Maturity.** Active.
- **Friction.** 144 markdown files of varying quality; signal-to-noise is the user's problem.

### Reference

#### awesome-opensource-ai
- **Parent:** `alvinreal/awesome-opensource-ai` · **Branch:** `main` · **License:** CC0-1.0 · **Last push:** 2026-04-29
- **What it is.** Curated link list of production-proven open-source AI tools across 14 categories.
- **Provides.** A README full of links.
- **HD Reports touch-points.** Reference only. Useful for tooling decisions ("is there a known-good X for Y?"); not code.
- **Maturity.** N/A — it's a list.
- **Friction.** None. Bookmark and move on.

## Open questions

- **OpenBrain license — RESOLVED 2026-05-10.** FSL-1.1-MIT permits internal use; HD Reports is a downstream consumer, not a competing memory product. Safe to use. (DECISIONS.md.)
- **lean-geck integration model — RESOLVED 2026-05-10.** Reclassified as dev-time tooling. Installed on Tennyson's machine via the upstream installer. Not ported, not run as a sidecar, not in `invoke-llm`. (DECISIONS.md.)
- **safe-chain-aikido-security has no license file.** No fix yet. Either ask Tennyson to drop MIT/Apache-2.0 on the fork, or depend on the upstream `aikidosec/safe-chain` repo (verify its license) instead of his fork. Don't depend on it in production until resolved.
- **Memory repo selection: pick one.** OpenBrain, mnemo-cortex, and memory-palace overlap. Recommend OpenBrain on the basis of Supabase alignment. Tennyson should confirm or veto before Phase 4 prompt is run.
- **Fork audit.** All 19 repos are forks; the READMEs above are upstream READMEs. We don't know what (if anything) Tennyson has changed on his branches. Before depending on any fork's specific behavior, run `git log` against upstream to see the diff.
- **Naming inconsistency on memory-palace / mempalace / MemPalace.** Pick one spelling, document in DECISIONS.md.
- **`data-visualization` is a vanilla d3/d3 fork** with no visible local mods. Drop the fork and depend on `d3` from npm. (Reclassifies as "do not use this repo.")
- **`browser-use` and `obscura-scrape-browser` have no concrete HD Reports use case** in Phases 1–8. Park, don't install.
- **claude-behave's parent is named `andrej-karpathy-skills` (plural)** but the README describes one CLAUDE.md. Tennyson's fork may include more — verify before assuming it's a one-file repo.

## Phase 4 integration plan (draft)

Concrete plug-in points for the Phase 4 prompt:

1. **`supabase/functions/invoke-llm` — prompt caching + cost ceiling + model routing.** Implement directly per the master plan: `cache_control` on system prompt and on retrieved chunk blocks, hard 80-cent abort with alert row, default Sonnet 4.6 for full reports and Haiku 4.5 for short outputs. This is plain Anthropic SDK code; no port required. Together with #2 below, this is where the 30¢/report target is actually met.
2. **Retrieval discipline at `invoke-llm` call site.** Cap `nearest_chunks(match_count)` at 12 by default; never pass the full library. Log which chunks were used per report (`chunk_retrievals` table) so we can detect bloat over time. The prompt cache only saves money if the chunk set is stable across calls — code review any change that varies the cached block count or order.
3. **Postgres schema — memory store via OpenBrain.** Add OpenBrain's pgvector tables to the Supabase database. Two memory namespaces: `archive` (Ra's lectures + Kaycee's source material — populated in Phase 3) and `customer:{id}` (per-customer report history — populated as reports generate). `invoke-llm` queries `archive` at retrieval time; results go into `cache_blocks` so subsequent calls hit prompt cache.
4. **Phase 3 ingestion — claude-video + geckcrawl feed OpenBrain.** Lectures → claude-video → transcript → OpenBrain `archive`. Public HD pages (where Kaycee has them flagged) → geckcrawl → markdown → OpenBrain `archive`. Single ingestion target.
5. **Phase 3.5 quality gate — claude-octopus for adversarial review.** Use claude-octopus *once* during the Phase 3.5 quality gate to run Kaycee's manual report and our generated report past 2–3 providers (Claude + Gemini + one local Ollama model) for blind comparison. Do not wire claude-octopus into the per-report path.
6. **Memory hygiene cron.** The master plan already specifies a 5:50am UTC cache warmer. Add a second cron: nightly OpenBrain compaction (mnemo-cortex pattern: DAG summaries on cold memories) to keep the customer memory namespace from unbounded growth. Implement only if/when retrieval latency or token budget shows pressure — don't optimize early.

End of document.
