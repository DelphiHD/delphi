/**
 * Gate keynotes (1-64). Ra Uru Hu's standard short names for each gate.
 *
 * Used to make transit output human-readable ("Gate 41 — Contraction")
 * without a database round-trip. This is a convenience label layer only; the
 * authoritative narrative gate content still lives in the Notion library and
 * is pulled by lib/chart/datapass.ts for client reports.
 *
 * If Kaycee prefers different phrasing for a gate, edit it here.
 * Verify against the Black Book when convenient.
 */

export const GATE_NAMES: Record<number, string> = {
  1: "Self-Expression",
  2: "Higher Self",
  3: "Ordering",
  4: "Formulization",
  5: "Fixed Rhythms",
  6: "Friction",
  7: "The Role of the Self",
  8: "Contribution",
  9: "Focus",
  10: "Behavior of the Self",
  11: "Ideas",
  12: "Caution",
  13: "The Listener",
  14: "Power Skills",
  15: "Extremes",
  16: "Skills",
  17: "Opinions",
  18: "Correction",
  19: "Wanting",
  20: "The Now",
  21: "The Hunter",
  22: "Openness",
  23: "Assimilation",
  24: "Rationalizing",
  25: "The Spirit of the Self",
  26: "The Egoist",
  27: "Caring",
  28: "The Game Player",
  29: "Perseverance",
  30: "Recognition of Feelings",
  31: "Influence",
  32: "Continuity",
  33: "Privacy",
  34: "Power",
  35: "Change",
  36: "Crisis",
  37: "Friendship",
  38: "The Fighter",
  39: "Provocation",
  40: "Aloneness",
  41: "Contraction",
  42: "Growth",
  43: "Insight",
  44: "Alertness",
  45: "The Gatherer",
  46: "The Determination of the Self",
  47: "Realizing",
  48: "Depth",
  49: "Principles",
  50: "Values",
  51: "Shock",
  52: "Stillness",
  53: "Beginnings",
  54: "Ambition",
  55: "Spirit",
  56: "Stimulation",
  57: "Intuitive Clarity",
  58: "Vitality",
  59: "Sexuality",
  60: "Acceptance",
  61: "Inner Truth",
  62: "Detail",
  63: "Doubt",
  64: "Confusion",
};

export function gateName(gate: number): string {
  return GATE_NAMES[gate] ?? `Gate ${gate}`;
}

/** "41.1 — Contraction" style label. */
export function gateLineLabel(gate: number, line: number): string {
  return `${gate}.${line} — ${gateName(gate)}`;
}
