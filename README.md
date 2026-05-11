# delphi

HD Reports. Personalized Human Design readings.

Next.js 16 App Router on Vercel, Supabase (Auth + Postgres + pgvector + Edge Functions), Stripe for payments, ElevenLabs for cloned voice, PostHog for analytics. All Claude API calls go through the `invoke-llm` Supabase Edge Function.

## Read first

- `CLAUDE.md` — agent rulebook.
- `HD-Reports-Master-Plan.md` — phase-by-phase build plan.
- `docs/CONTEXT.md` and `docs/INTENT.md` — factual and strategic ground truth.
- `docs/DECISIONS.md` — append-only log of why-we-chose-X.

## Local dev

```bash
cp .env.example .env.local
# fill in Supabase URL + keys, then:
npm install
npm run dev
```

Open http://localhost:3000.

## Phase

Phase 1 (Foundation). See `docs/PHASE_1_HANDOFF.md` for the spec this scaffold satisfies.
