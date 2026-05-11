# ARCHITECTURE.md

System map for HD Reports. Updated whenever a new top-level component or integration lands. This is the file an engineer reads to orient themselves in under five minutes.

To be filled in across Phases 1 to 4 as the surface area grows:

- Request lifecycle from browser to Supabase to `invoke-llm` to Anthropic and back.
- Database schema diagram: `profiles` (Phase 1), `orders` and `reports` (Phase 2), the OpenBrain memory tables (Phase 3 to 4), `chunk_retrievals` and `cost_logs` (Phase 4).
- Auth surface: middleware, server vs client Supabase clients, the `/auth/callback` route, magic link and email-confirmation flows.
- Edge Functions inventory: `invoke-llm` (Phase 4), daily-transit cron (Phase 6), Notion-to-markdown sync (Phase 3).
- Storage surface: report MP3s in Supabase Storage with signed URLs; report markdown in Postgres.
- External services and what each one is the source of truth for: Stripe for subscription state, Supabase Auth for user identity, OpenBrain tables for retrieval context, ElevenLabs for voice synthesis, PostHog for product analytics.

Phase 1 surface: Next.js 16 App Router on Vercel, Supabase Postgres + Supabase Auth, middleware-gated `/portal/*`, one migration (`profiles`) with RLS.
