# Model Education

Ongoing log of Human Design understanding corrections for the report-generation
model. This is the repo half of a two-part system:

- **This doc** — the index of every correction plus the prompt/validator changes
  that enforce them. Version-controlled, sits next to the code it drives.
- **Notion "Model Corrections" database** — where Kaycee authors the HD-content
  corrections (the correct understanding, in her words) and the library
  enrichments. Each Notion entry is cross-linked to its row here.
  Location: `HD Claude Correction Log` page in the HD Database Directory →
  https://app.notion.com/p/e7a1101a94194b07875c4e432c6709cc
  (Sync to Delphi = off; this is a curation log, not retrieved source.)

## How "educating the model" actually works here

The report model is **not fine-tuned and keeps no memory between runs**. Every
report starts from a blank model. What it "knows" about HD on a given run comes
from three layers we control, all fed to it at generation time:

1. **The Notion library** (retrieved source chunks) — the model is told to
   organize *only* this material and not generate HD teachings from its own
   training. A wrong understanding usually means the relevant library material
   was thin or not retrieved, and it improvised to fill the gap.
2. **The generation prompt** (`lib/report/foundation.ts` and the other tiers) —
   rules and framing (banned phrases, type-drift guards, the fixing-planet rule).
3. **The validator** (`lib/report/validate.ts`) — what gets caught and forced to
   rewrite, loud on every run.

So a correction is only "learned" once it is pushed into one of those three
layers. Routing is **case by case** (Kaycee's call per correction):

- **Knowledge gap** (it lacked the material) → enrich the Notion library entry.
  Deepest, most durable fix.
- **Framing / energy error** (had the material, framed it wrong) → a prompt rule.
- **Mechanically checkable claim** → a validator rule.
- Optionally, an eval case so the fix can't silently regress.

## Entry template

```
### <short title>  — <tier(s)>  — <status: pending | enforced>
- Observed: <the error, with the example that exposed it>
- Correct understanding (Kaycee): <the right framing, in her words>
- Routing: <library | prompt | validator | combination>
- Enforcement: <what changed, where; commit ref>
- Notion: <link to the Model Corrections entry>
- Eval: <test case, if any>
```

## Corrections log (append-only)

### MG definition & fabricated Sacral→Throat connection — Foundation — ENFORCED (verified on Bryan re-run)
- Observed (Bryan Rodabough): claimed his Sacral connects to the Throat (via
  10-34 through the G, and via 34→20 with a partner's Gate 20) and used that to
  define his MG energy. He has no Sacral→Throat connection and no Gate 20.
- Correct understanding (Kaycee): MG = defined Sacral AND at least one of the
  four motors (Sacral, Heart, Solar Plexus, Root) sharing the Throat's defined
  island — reachable through ANY chain of defined channels, however long (Root →
  Spleen → Throat counts). The connecting motor need not be the Sacral. Bryan's
  Sacral is islanded with his G; he is MG because Heart/Root/Solar Plexus reach
  the Throat, plus the standalone defined Sacral.
- **Root cause (not a library gap — the canonical MG page is correct):** the
  Data Pass `typeJustification` hardcoded a Sacral-to-Throat story for every MG
  and discarded the already-computed motor connectivity, so it fed the model
  "Sacral ↔ Throat path: PRESENT" for Bryan (false). The model trusted that
  deterministic fact and elaborated on it.
- Routing: **Data Pass (code)** — done; + Prompt + Validator — pending.
- Enforcement (all three layers):
  1. **Data Pass** (`lib/chart/datapass.ts`): MG branch rewritten to the
     motor-to-Throat rule; reports the actual connecting motor(s) and, when the
     Sacral is islanded elsewhere, injects an explicit "do NOT describe the
     Sacral connecting to the Throat" note.
  2. **Prompt** (`lib/report/foundation.ts`): the corrected `typeJustification`
     + island layout + channels are now injected into call 1 (the call that
     writes Your Type) — they were absent, which is why the fix at first didn't
     reach the model. Plus a house rule to never assert a connection/channel/gate
     the chart lacks.
  3. **Validator** (`lib/report/validate.ts`): `sacral-throat-fabricated` flags
     a Sacral-to-Throat assertion when the Sacral is not in the Throat's island,
     skipping negated / bridging statements.
- Verified on the Bryan re-run: the Type section now reads "at least one motor
  center connects ... to the Throat," "Island 1 connect[s] the Heart, Solar
  Plexus, and Root ... into the Throat," and "the Sacral ... sits in its own
  island, connected to the G center." No fabricated Sacral→Throat path or Gate 20.
- Notion: https://app.notion.com/p/3c6e3fadcaaa81d99e56fdb4ec230cd1

### Profile line 4 is the Opportunist, not the Hermit — Foundation — ENFORCED
- Observed (Bryan Rodabough, Design Sun 24.4): called the 4th line the "Hermit"
  and framed it as "works best in isolation."
- Correct understanding (Kaycee): line 4 = Opportunist (Hermit is line 2). A 4th
  line externalizes through its network and relationships; it is not about
  isolation. Lines: 1 Investigator, 2 Hermit, 3 Martyr, 4 Opportunist, 5 Heretic,
  6 Role Model.
- Enforcement: `validate.ts` `line-archetype-mismatch` flags a line ordinal
  paired with the wrong archetype. Verified: fired on Bryan v1, gone on the
  re-run (line 4 now reads Opportunist).
- Notion: https://app.notion.com/p/3c6e3fadcaaa81ddb414c3f76082a441

### Type section: no island numbers; name the connecting motors + what they bring — Foundation — ENFORCED
- Observed (Bryan Rodabough): the Your Type section leaned on "Island 1 / Island 2"
  numbering before the Definition section introduces the island concept, and it
  named the connecting motors (Heart, Solar Plexus, Root) only in passing without
  saying what those specific motors reaching the Throat mean.
- Correct understanding (Kaycee): the Type section must not reference islands by
  number (Definition comes later); describe the architecture by naming centers
  and how they connect. Name which motor(s) reach the Throat and what each
  contributes (Solar Plexus = emotional, Root = pressure/drive, Heart =
  willpower, Sacral = generative response) and what that means for how the person
  manifests. If the Sacral is islanded away from the Throat, say plainly it is
  not on the manifestation path and name the motors that are.
- Routing: Prompt.
- Enforcement: `foundation.ts` call 1 (Your Type) now instructs the model to
  avoid island numbers, name the connecting motors and their contributions, and
  state plainly when the Sacral is off the manifestation path. (Applied after
  hand-editing Bryan v6 to this standard.)
- Notion: https://app.notion.com/p/3c6e3fadcaaa815580a7fffc7a239326

### Fixing-planet named in prose — Foundation/Planetary — enforced
- Observed: prose named the planet behind an exaltation/detriment, e.g. "Venus
  exalted at the fifth line," "the Sun in detriment here."
- Correct understanding: convey the fixing state as a property of the placement
  ("exalted here, this clarity runs clean"); never name the planet as the fixer.
- Routing: prompt + validator.
- Enforcement: house rule in the Foundation prompt; validator rule
  `fixing-planet-named` (matches "[Planet] exalted/in detriment" regardless of
  following word).

### Source material / library named in prose — Foundation/Planetary — enforced
- Observed: prose named its own inputs, e.g. "the source material," "the tribal
  source material describes...," "in the Rave I'Ching."
- Correct understanding: state every claim directly in the report's voice; the
  reader never sees the report point at where the content came from.
- Routing: prompt + validator.
- Enforcement: prompt rule banning source-naming anywhere in body prose;
  validator rule `inline-source-citation` (matches "source material" after any
  intervening word, plus named source titles).

### Engine QA rules must not surface in reader prose — Foundation — ENFORCED
- Observed (Paul Hollingshead, pure Generator): the report explained Manifesting
  Generator mechanics the reader has no use for ("Manifesting Generators have the
  Sacral connected to the Throat..."). Root cause: the deterministic type-facts we
  inject were written as engine instructions ("Pattern-match trap: do NOT call this
  person a Manifesting Generator") mixed with cross-type definitions, and the prompt
  told the model to "ground the Your Type section in this." The model echoed our SOP.
- Correct understanding (Kaycee): our operational rules are for our eyes. A publisher
  does not print its style guide inside the book. The report describes the reader's
  own Type on its own terms; other Types are never mentioned, on any chart, any Type.
- Routing: prompt + deterministic facts (both non-structural; one product, Foundation).
- Enforcement:
  1. `datapass.ts` type-facts (`buildTypeJustification`) now emit two registers: a
     DESCRIBABLE section (neutral architecture, no other Type named, no island numbers)
     and a fenced INTERNAL TYPE-CHECK section holding the mislabel guards / traps, marked
     "never surface." Self-fencing, so any future consumer stays safe.
  2. `foundation.ts`: removed the MG-definition lecture from the house rules; fenced the
     type-facts injection as internal QA notes (obey silently, never quote, never name or
     contrast another Type); cut the "manifestation path / which motors reach the Throat"
     framing from the general Type instructions (it only means something as an MG
     contrast, and was nonsensical for a Projector). Motor-naming now fires ONLY on actual
     Manifesting Generator charts, described as that person's own design.
- Verified: Paul v6 re-validates 34/34 APPROVE; the describable facts for a Generator and
  an MG carry zero cross-type language. Correctness is unchanged (guards preserved; validator
  still catches mislabels).

---

Related: recurring leak classes are also tracked in the agent memory note
"Foundation report leak classes." Validator **false positives** on correct HD
terminology (e.g. "pure Generator" contrast on an MG chart, "role model" line vs
profile) are validator-calibration issues, not model-understanding errors, and
are tracked separately.

## Never state how far away a date is (2026-08-27)

**What happened.** Kaycee's Foundation said "June 5, 2027 is approximately four
years away from now," in a report written in August 2026. It is nine months away.

**Why.** The model was never told the current date. Asked to work out a distance
it answers from where its training data ends, around 2023, and 2027 minus 2023 is
four. It will be wrong by that same margin on every report.

**Why it recurred.** Kaycee had already corrected this in an earlier chat. The
correction was never written into the prompt, the validator, or this file, so it
died with that conversation. This is the case for committing corrections rather
than making them: a fix that lives only in a chat is not a fix.

**Three guards now, because prompt-only enforcement leaks:**

1. The Data Pass states today's real date, so the model is not guessing.
2. The Foundation prompt forbids stating any distance from the present.
3. The validator hard-fails `distance-from-now`, but ONLY when the distance sits
   within ~220 characters of a specific year. The model is allowed to talk about
   time; what is being caught is arithmetic against an unknown present. "Come
   back to this a decade from now" in the preamble passes. "June 5, 2027 is
   approximately four years away" does not, nor does a distance in the sentence
   after a date. A blanket "next year / last summer" rule was tried and removed:
   too strict, and not a calculation error.

**And the generation date must never appear in the prose at all** (Kaycee,
2026-08-27, immediately after the above): not as a distance, not as a quote, not
as "as of". A fourth guard hard-fails `generation-date-in-prose` if today's date
shows up in any format. The metadata comment block is exempt, since it is not
prose and `generated_at` belongs there. Note the shape of this: giving the model
the date to stop it guessing invites it to start quoting it, so the fix for one
failure opened the next. Worth expecting whenever a fact is added to a prompt.

**The underlying reason, worth keeping in mind for anything similar:** these
reports are evergreen. A client re-reads them for decades. Any sentence measured
from the moment of writing is wrong the day after it is written, even when the
arithmetic is right.

---

## Nine centers, always (Kaycee, 2026-08-27)

**Every report goes into detail on all nine centers, regardless of definition
status. No exceptions.** Defined, undefined and open are three different things
to say about a center, not a reason to say nothing about one.

This came from Lisa Bradshaw's Foundation, which rendered four of her five
defined centers. The failure is worth understanding, because the model did not
misunderstand the chart. Its own orientation paragraph read "This chart has five
defined centers... the Head, Ajna, Heart, Sacral, and Spleen", and its closing
synthesis referred to "the defined Heart, Sacral, and Spleen". It knew. It simply
never wrote the Spleen's section. Four H3s where the same page said there should
be five, and the report contradicted itself between its prose and its headings.

Nothing was truncated: the call ended cleanly, well inside its token budget. This
is a rendering omission, not a comprehension failure, which means instructions
alone will not reliably prevent it. The validator's `center-missing` rule is what
caught it, checking the rendered H3s against the nine centers in the Data Pass,
and that check is the reason the report never reached her as a deliverable.

**Do not weaken that rule.** A missing center is a hard failure whatever its
state, and an open center with no activations still gets its own section: the
open-center mechanic, conditioning, wisdom and challenges.

---

## Reaching gates yes, phantom paragraphs no (Kaycee, 2026-08-27)

The `neutral-placement-exaltation-hedge` rules exist because the model was
writing **whole paragraphs about gates the chart does not have**. Not a passing
mention: sustained prose about what a gate would do if the partner were there.

**Naming the reaching gate is correct and stays.** A hanging gate hangs because
its partner is absent, and the reader cannot understand the mechanic without
knowing which gate it reaches toward. "Without Gate 63 completing the channel,
this pressure has no internal circuit" is the explanation, not the problem.

What was banned is dwelling: paragraphs of hypothetical, and the hedging
constructions that introduce them ("which this chart does not carry", "but the
structural theme remains"). Do not widen these rules into a ban on mentioning a
partner gate, and do not delete them as redundant. Absence prose now measures
1-2% of a report **because** the rule is holding, not because it was never a
problem.

**Related, and unsolved.** Kaycee, same day: fixation prose is "probably the
number one thing that people complain about that makes them stop reading". Across
41 Foundation reports, the 727 sentences containing exalted/detriment run 37%
longer than the rest (27.9 words vs 20.4) and carry 162% more technical
vocabulary. The problem is sentence shape rather than vocabulary: fixation
content arrives as a subordinate clause bolted onto an already long sentence. A
ban on the words would not fix it. Left as is by her decision, 2026-08-27.
