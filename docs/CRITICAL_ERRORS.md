# CRITICAL_ERRORS.md

> Status: **DRAFT PROPOSAL for Kaycee's review (2026-07-26).** Nothing here is implemented as a full-stop yet. Today, every condition below is a **flag** (logged to System Health / Flags.md, system keeps running). Before go-live, we review real Flags-log history together, you edit this list, and then the STOP tier gets built. This is the proposal to react to.

## The two tiers

- **FLAG (active now).** Something was off; the system handled it and kept running (held last-good, skipped one item, shipped without an optional piece). Logged to `System Health / Flags.md`. This is the default so nothing breaks.
- **STOP (proposed, not yet built).** A defined broken condition where continuing would produce a wrong or empty deliverable. Halts **that one product only**, keeps its last good copy, and sends a notification. Other products are unaffected.

Guiding line: **a paying customer must never receive a silently broken or partial report.** So client-facing products (Foundation, Planetary, Quickstart) have a higher bar, more conditions are STOP. Internal/daily products (Transit, Evening Echoes) lean toward FLAG-and-ship, since a slightly-thin internal report beats no report.

---

## Proposed STOP conditions per product

### The nightly sync
| Condition | Proposed | Why |
|---|---|---|
| Cannot reach Notion at all (directory query fails after retries) | **STOP**, keep last-good library | No fresh data; do not overwrite the library with nothing |
| Guard finds **massive** loss (> 20% of pages thinned, or total chunk count drops > 20%) | **STOP**, keep last-good library | Systemic failure, not a page or two |
| `chunks.json` cannot be written (disk) | **STOP** | Nothing to ship |
| A few pages thin / held by the guard | FLAG | Normal; guard handled it |
| A synced block unshared, one gate's callout not found | FLAG | Local, visible, non-systemic |

### Daily Transit Report
| Condition | Proposed | Why |
|---|---|---|
| mybodygraph unreachable (cannot cast the sky) | **STOP**, keep yesterday's | No chart data at all |
| Library missing/empty (no grounding) | **STOP** | Would produce ungrounded prose |
| Anthropic narrative fails after retries (empty body) | **STOP** | No report |
| Chiron/Lilith detected in the field (tripwire) | **STOP** | Invariant violated |
| Some phase or baby charts skipped, a synthesis batch short, mandala embed failed, a gate/line name missing | FLAG, ship | Partial but usable |

### Evening Echoes
| Condition | Proposed | Why |
|---|---|---|
| Morning report missing (its dependency) | **STOP** | Nothing to echo |
| Anthropic fails | **STOP** | No judging step |
| Few or no news echoes found; a theme returns 0 | FLAG, ship what there is | Normal on a quiet news day |

### Foundation / Planetary / Quickstart (client-facing, paid)
| Condition | Proposed | Why |
|---|---|---|
| mybodygraph chart fetch fails | **STOP** | No chart, no reading |
| Library missing/empty | **STOP** | Ungrounded = violates "no source, no sentence" |
| Anthropic fails | **STOP** | No report |
| Missing core chart data (type, authority, profile, incarnation cross) | **STOP** | Incomplete reading |
| A single non-core section comes through thin | FLAG (proposed) — *your call whether client reports tolerate any thin section at all* | Higher bar for paid work |
| Any em dash in the delivered file | **STOP** (proposed for client reports) | Brand rule; a lint failure on a paid deliverable |

### Interactive Chart / Mandala Motion
| Condition | Proposed | Why |
|---|---|---|
| mybodygraph branded SVG fails (nothing to draw) | **STOP** | No chart |
| Chiron/Lilith detected (tripwire) | **STOP** | Invariant |
| A sample or two missing in the animation | FLAG | Interpolation covers it |

---

## Open questions for you

1. **Client reports and thin sections:** should *any* thin section stop a paid Foundation/Planetary report, or flag-and-ship with the thin section noted? (I lean STOP for paid work.)
2. **Massive-loss threshold for the sync:** 20% is a placeholder. What fraction of the library going missing should halt the sync vs flag?
3. **Em dashes in client deliverables:** STOP, or flag-and-auto-fix (strip them) and continue?
4. Anything I've mis-tiered based on how you actually work.

Once you've marked this up, the STOP tier gets built against your final list.
