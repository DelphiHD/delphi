# Model Education

Ongoing log of Human Design understanding corrections for the report-generation
model. This is the repo half of a two-part system:

- **This doc** — the index of every correction plus the prompt/validator changes
  that enforce them. Version-controlled, sits next to the code it drives.
- **Notion "Model Corrections" database** — where Kaycee authors the HD-content
  corrections (the correct understanding, in her words) and the library
  enrichments. Each Notion entry is cross-linked to its row here.

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

### MG (Manifesting Generator) energy — Foundation — pending
- Observed: errors in Bryan Rodabough's Foundation report pointing to
  misunderstandings of how MG / Sacral energy works. **Awaiting Kaycee's
  specifics (which passages, what's wrong, the correct understanding).** This is
  the correction that opened the project.
- Correct understanding (Kaycee): _to be provided_
- Routing: _tbd (likely library enrichment + a prompt framing rule)_
- Enforcement: _pending_

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
