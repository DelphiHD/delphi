/**
 * Canonical Human Design gate → center mapping.
 *
 * The mandala renderer uses this to color spokes by the activating
 * center. The bodygraph itself is sourced separately (mybodygraph SVG)
 * and already encodes center color; this table is for the wheel only.
 */

export type Center =
  | "head"
  | "ajna"
  | "throat"
  | "g"
  | "heart"
  | "spleen"
  | "sacral"
  | "solar-plexus"
  | "root";

const CENTER_GATES: Record<Center, readonly number[]> = {
  head: [64, 61, 63],
  ajna: [47, 24, 4, 11, 17, 43],
  throat: [62, 23, 56, 16, 20, 31, 8, 33, 35, 12, 45],
  g: [1, 13, 25, 46, 2, 15, 10, 7],
  heart: [26, 51, 21, 40],
  spleen: [48, 57, 44, 50, 32, 28, 18],
  sacral: [5, 14, 29, 59, 9, 3, 42, 27, 34],
  "solar-plexus": [36, 22, 37, 6, 49, 55, 30],
  root: [53, 60, 52, 19, 39, 41, 58, 38, 54],
};

const GATE_TO_CENTER = new Map<number, Center>();
for (const [center, gates] of Object.entries(CENTER_GATES) as [Center, readonly number[]][]) {
  for (const gate of gates) {
    GATE_TO_CENTER.set(gate, center);
  }
}

export function centerOf(gate: number): Center {
  const c = GATE_TO_CENTER.get(gate);
  if (!c) throw new Error(`gate ${gate} is not in 1..64`);
  return c;
}

export { CENTER_GATES };
