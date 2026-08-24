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

### MG definition & fabricated Sacral→Throat connection — Foundation — pending
- Observed (Bryan Rodabough): claimed his Sacral connects to the Throat (via
  10-34 through the G, and via 34→20 with a partner's Gate 20) and used that to
  define his MG energy. He has no Sacral→Throat connection and no Gate 20.
- Correct understanding (Kaycee): MG = defined Sacral AND a connection between
  any of the four motors and the Throat. Bryan's Sacral is islanded with his G
  Center; what makes him an MG is that his other three motors (Heart, Root,
  Solar Plexus) reach the Throat via a long, circuitous path, plus the standalone
  defined Sacral. The Sacral itself does NOT reach the Throat.
- Routing (proposed, awaiting Kaycee's confirm): Library (state the MG definition
  in the Type/MG material) + Prompt (never assert connections/channels beyond the
  Data Pass; derive MG mechanics from the actual definition) + Validator (flag a
  channel/gate named as the reader's own that isn't in the Data Pass, with a
  carve-out for gates explicitly attributed to another person).
- Notion: https://app.notion.com/p/3c6e3fadcaaa81d99e56fdb4ec230cd1

### Profile line 4 is the Opportunist, not the Hermit — Foundation — pending
- Observed (Bryan Rodabough, Design Sun 24.4): called the 4th line the "Hermit"
  and framed it as "works best in isolation."
- Correct understanding (Kaycee): line 4 = Opportunist (Hermit is line 2). A 4th
  line externalizes through its network and relationships; it is not about
  isolation. Lines: 1 Investigator, 2 Hermit, 3 Martyr, 4 Opportunist, 5 Heretic,
  6 Role Model.
- Routing (proposed, awaiting Kaycee's confirm): Validator (line-number ↔
  archetype consistency check) + Prompt (reinforce the exact mapping).
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
