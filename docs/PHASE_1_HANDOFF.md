# Phase 1 Handoff — Foundation

Hand this whole file to a fresh Claude Code session opened in `~/delphi` to scaffold Phase 1.

---

## Context

You are picking up the HD Reports build at the start of Phase 1: Foundation. Read these in order before doing anything:

1. `CLAUDE.md` (rulebook — read once at session start)
2. `HD-Reports-Master-Plan.md` lines 245–351 (Phase 1 spec)
3. `docs/DECISIONS.md` (already-made calls, including the `hd-reports` → `delphi` rename)
4. `docs/STACK_PORTED.md` (the 18 forks under `DelphiHD/*` you may pull from later — Phase 1 does not need any of them)

**Naming.** Repo is `DelphiHD/delphi` cloned at `~/delphi`. The master plan still says `hd-reports` in places — that's a stale placeholder. Use `delphi`.

**Working tree.** On a fresh clone, run `git config core.hooksPath .githooks` once so the pre-push canonical-doc check fires. The `gh` CLI is installed at `~/.local/bin/gh` and authenticated as `DelphiHD`.

## Prerequisites you must verify before writing code

- [ ] `node --version` ≥ 20 and `npm --version` work.
- [ ] `vercel --version` works. (CLI installed at `~/.local/bin/vercel`.) Run `vercel whoami` — must show a logged-in account. If not, run `vercel login` and stop until it returns.
- [ ] `supabase --version` works. Run `supabase projects list` — must succeed. If not, run `supabase login` with a personal access token from https://supabase.com/dashboard/account/tokens and stop until it returns.
- [ ] Supabase project `biufjcapnuzbdowoksnb` exists (per `docs/DECISIONS.md`). Run `supabase link --project-ref biufjcapnuzbdowoksnb` from `~/delphi`. If the link prompts for the database password, ask the operator — it's in the shared 1Password vault. After linking, you'll need the anon key and service-role key from the dashboard (https://supabase.com/dashboard/project/biufjcapnuzbdowoksnb/settings/api) — ask the operator to paste them.
- [ ] `vercel link` has been run inside `~/delphi` and `.vercel/project.json` exists. If not, link to a Vercel project (create new if needed).
- [ ] Pricing model decision: **deferred**, per `docs/DECISIONS.md` entry "Pricing model decision is deferred". Do NOT scaffold any pricing-shaped code (no `prices`/`tiers` table, no Stripe products, no tier gates in the UI). If you reach a point where the master plan demands pricing scaffolding, stop and surface it to the operator instead of guessing.

If any prerequisite fails, stop and tell the operator exactly which one, with the one-step fix. Do not paper over it by stubbing values.

## What to ship in this session

Per master plan Phase 1 (lines 261–311):

1. Scaffold a Next.js 16 App Router project with TypeScript, Tailwind, shadcn/ui at the repo root. Do not nest under `app/` or `web/` — the repo root is the project root.
2. Add `@supabase/ssr` and create `lib/supabase/{client,server,admin}.ts`.
3. Create the auth flow: `/login`, `/signup`, `/auth/callback`, `/portal/*` (welcome page only for now). Magic link + email/password.
4. Add middleware that protects `/portal/*`.
5. Write `supabase/migrations/0001_init_profiles.sql` — `profiles` table linked to `auth.users`, RLS on, "users can read/update own profile" policy. Migration is date-prefixed per the rulebook: rename to `YYYYMMDD_init_profiles.sql` using today's date.
6. Add `vercel.json` with the security headers from master plan Appendix A. (If Appendix A isn't fleshed out yet, use a known-good Next.js header set — CSP, HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy locked down. Document the choice in `docs/DECISIONS.md`.)
7. Create `AGENTS.md` at repo root mirroring `CLAUDE.md` for Codex Cloud. Same rules, same Read-first list. (If `AGENTS.md` already exists, leave it alone unless the rules in `CLAUDE.md` have changed.)
8. Stub these doc files in `docs/`: `CONTEXT.md`, `INTENT.md`, `IDENTITY.md`, `VOICE.md`, `ARCHITECTURE.md`. Each gets a one-paragraph placeholder explaining what eventually goes there. `STACK_PORTED.md` and `DECISIONS.md` already exist — leave them alone.
9. Add `lib/design/tokens.ts` with placeholder values clearly marked TBD.
10. Update `.githooks/pre-push` to also require any new canonical doc you create above (`AGENTS.md`, `CONTEXT.md`, etc.) and update the "Read first" list in `CLAUDE.md` to match.

Do **not** in this session: Stripe, the report engine, the audio pipeline, any Anthropic call, anything pulling from `DelphiHD/*` ported repos.

## Cost discipline

You will not call any LLM API in Phase 1 code. The `invoke-llm` Edge Function and prompt-caching machinery come in Phase 4. If you find yourself reaching for it, stop — you are out of scope.

## Exit criteria (master plan lines 343–350)

- [ ] `vercel deploy` succeeds on push to `main`.
- [ ] Fresh user signup → email confirmation → login → `/portal/welcome` works end-to-end against the real Supabase project.
- [ ] `/portal/welcome` returns 401/redirect when logged out.
- [ ] `supabase db push` applies the migration cleanly on a fresh project.
- [ ] `vercel.json` security headers verified in the deployed response (`curl -I` the deploy URL).
- [ ] All canonical docs listed in `CLAUDE.md` exist and are tracked. `git push` succeeds without `--no-verify` (i.e., the pre-push hook passes).
- [ ] No `NEXT_PUBLIC_*` env contains a service-role key, Stripe secret, or Anthropic key.

After all criteria pass, report back: deploy URL, migration filename, and a short summary of any decisions you made that aren't in `docs/DECISIONS.md`. Add those decisions to the log.

## Working style

- Plain English over ceremony.
- No em dashes anywhere in user-facing copy.
- Three similar lines beat a bad helper.
- Don't mock the database in tests. The three things that get real tests are listed in `CLAUDE.md` — Phase 1 does not need any of them yet.
- If something feels wrong, stop and surface it. Don't push through.

End of handoff.
