# INTENT.md

Strategic ground truth for HD Reports. What we are building, what we are deliberately not building, what success looks like.

This file gets injected into prompts that need to make scope or priority calls. CONTEXT.md is the facts; INTENT.md is the direction. When the two diverge, the work is to update one of them, not paper over the gap.

> Status: DRAFT for Kaycee's review (2026-07-26). Items marked **[CONFIRM]** are inferences from the master plan or from conversation and need Kaycee's yes/no or edit. Once she signs off, delete this banner.

---

## Product thesis

HD Reports turns Kaycee's private archive of original Ra Uru Hu material, and her interpretive judgment, into a paid product that delivers itself. Customers receive personalized Human Design readings, as written reports, narrated audio in Kaycee's cloned voice, and PDFs, tied to their chart and to current transits. The defensible core is **AI-organized, not AI-generated**: every sentence a customer reads comes from Kaycee's source library, never from a model's training. The AI's only jobs are to retrieve the right pieces for a specific chart and lay them out in her voice. The moat is the completeness and quality of the library plus her methodology, not the model. That is why the content pipeline must capture the source material in full and faithfully: the product's quality and its defensibility are a direct function of the library being complete.

## What this is (scope)

- A paid web product (Next.js on Vercel, Supabase backend) delivering subscription HD readings: weekly synthesis tied to transits, with deeper daily readings as a metered upsell.
- Grounded entirely in Kaycee's Notion source library, mirrored nightly into the retrieval system so reports generate at production speed and low cost.
- Built to grow: the library expands over time, and the pipeline ingests any new source database Kaycee marks for sync with no code change. **[CONFIRM]** Near-term corpus expansion includes the I-Ching, Gene Keys, and A Course in Miracles, to enable deeper cross-system synthesis on top of the HD core.
- Operated by two people (Kaycee: voice, source, brand, quality, customer; Tennyson: infrastructure and AI orchestration), neither writing production code by hand.

## Non-goals (what this is deliberately NOT)

- **Not AI-generated content.** The model never writes HD interpretation from its own knowledge. No source, no sentence. This is the line the whole product depends on.
- **Not a generic astrology or free chart-calculator tool.** The chart is an input; the product is the synthesized reading.
- **Not a coaching, therapy, or advice platform.** It delivers readings, not sessions or guidance relationships.
- **Not softened, watered-down HD.** Detriments, challenging gates, and open-center patterns are presented mechanically, in Ra's full directness. The mechanical framing is the compassion (see CONTEXT.md methodology rules).
- **Not a free content library or SEO play.** The archive is the paid product, not marketing bait.
- **[CONFIRM] Not a community/social product on day one.** A social app is a stated long-term direction (see Long-term vision), but it is explicitly out of scope for launch and does not shape near-term architecture beyond keeping the data model clean.

## The bar

**Launch bar (what has to be true on day one), from the master plan:**
- Ten paying customers receiving weekly readings, with capacity to onboard more.
- Per-report cost under thirty cents.
- Quality parity or better with Kaycee's manual reports, validated by her blind review (the Phase 3.5 quality gate; do not ship until it passes).
- Audio in her cloned voice; professional PDFs; a working customer portal.

**System bar (non-negotiable, added 2026-07-26 after repeated silent-failure incidents):** the pipeline must be **complete by default and loud on failure**. The nightly sync captures every synced database, every page, the full page body AND all metadata, or it fails loudly and preserves the last good copy. It never silently ships less than it had. Every report self-verifies for completeness before it reaches a customer or Kaycee. Fixes are made at the source, never worked around, and every change is confirmed against the whole pipeline. This bar exists because a product Kaycee sells cannot require daily babysitting, and because silent partial failure is what makes a system feel fragile and untrustworthy.

**Post-launch bar (what we measure to know it is working):** **[CONFIRM]** retention/renewal of subscribers; report quality holding at or above manual parity as the library grows; per-report cost staying under target as new corpora are added; zero silent-content-loss incidents (the sync completeness check passes every night).

## Long-term vision

A self-sustaining reading practice with a meaningful subscriber base and a growing, multi-system library. Two directions the master plan names, both open:
- **Deepen:** richer personalization, a chart-conversation feature, compatibility/partnership readings, and cross-system synthesis (HD with I-Ching, Gene Keys, A Course in Miracles).
- **Widen:** a platform other Human Design practitioners can use, and/or **[CONFIRM]** a social app that Kaycee has named as the eventual destination. The near-term job is to keep the content pipeline and data model clean and complete enough that this remains possible without a rebuild.

## Client portal is the destination (stated 2026-08-25)

The token-linked chart pages at `charts.delphihd.com` are a stepping stone, not the end
state. Kaycee's words: "These prototype pages are great, but I'll want everything housed in
a portal eventually." A client should log in and find everything of theirs in one place:
their chart, their reports, their audio, any charts they later buy, plus **transit overlays**
and **composite charts**, both of which she named as required features.

Nothing is scheduled. Do not treat the current chart links as the finished shape of client
delivery, and do not invest in them in ways that would have to be unwound.

The one architectural fork to settle before building it: charts are currently **baked files**,
which suits a natal chart that never changes but not transits (change daily) or composites
(one file per possible pairing). The alternative is rendering charts live inside the app from
birth data. Recommended lean is render-live, precisely because both named features are the
cases baking handles badly. Kaycee has not decided, and asked for the trade-offs written up
properly before she does.

Sketched order of work: accounts (email-link sign-in, existing chart links keep working) →
a per-client home page listing what they already have → restructure storage from one chart
per person to many → transit overlay → composites → Stripe-automated purchase. Purchase
automation is last on purpose: she can sell a composite through her booking page today.

## The next strategic decisions we expect to face

1. **Pricing model.** Option A (three fixed report lengths: Single $49 / Deep $79 / Full $129) vs Option B (base $49 plus $7 go-deeper sections plus optional $19/month). Recorded lean is **[CONFIRM]** in DECISIONS.md; needs a final call before Phase 2 ships.
2. **Multi-system synthesis boundaries.** How I-Ching, Gene Keys, and ACIM material combine with the HD core without diluting the HD voice or the "no source, no sentence" rule. What a cross-system reading is and is not.
3. **When and how the social/community layer enters,** and what it must not compromise in the reading product.

---

*Ground-truth companions: CONTEXT.md (facts), IDENTITY.md and VOICE.md (brand voice), ARCHITECTURE.md (system map), DECISIONS.md (why-we-chose-X). When this file changes, update the relevant memory entry under the project memory directory.*
