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

---

Related: recurring leak classes are also tracked in the agent memory note
"Foundation report leak classes." Validator **false positives** on correct HD
terminology (e.g. "pure Generator" contrast on an MG chart, "role model" line vs
profile) are validator-calibration issues, not model-understanding errors, and
are tracked separately.
