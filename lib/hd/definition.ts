// Deterministic definition + split analysis.
//
// A chart's DEFINITION type is pure graph connectivity, never an interpretation:
// treat each COMPLETE channel (both gates activated) as a bridge between the two
// centers it touches, then count the separate islands of connected centers.
//   1 island  -> single definition
//   2 islands -> split definition
//   3 islands -> triple split
//   4 islands -> quadruple split
//   0 (no complete channel) -> no definition (a Reflector)
//
// The model has always gotten splits wrong because it was asked to do this
// geometry in prose. It is countable, so we compute it here and hand the model
// the finished answer, the same way active channels are deterministic.
//
// SIMPLE vs WIDE split (Kaycee's rule): a split is SIMPLE when the two islands
// can be joined by a single bridging gate (the person already carries one gate
// of a channel that spans the gap and needs only its partner); it is WIDE when
// no single gate bridges them (it would take two or more gates to close).
//
// Node-only geometry helper; no I/O.

import { CHANNELS, channelId } from "@/lib/hd/channels";
import { centerOf, type Center } from "@/lib/hd/gate-center";
import type { Chart } from "@/lib/chart/types";

// Definition uses ONLY the 13 core bodies. Chiron, Lilith, and any other
// asteroids are not part of channel/center definition; counting their gates
// invents phantom channels and miscounts splits. Verified against mybodygraph's
// own Definition field across the roster: excluding these makes all 15 match.
const DEFINITION_BODIES = new Set<string>([
  "Sun", "Earth", "North Node", "South Node", "Moon", "Mercury", "Venus",
  "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
]);

/** The activated gates (both sides) that count toward definition. */
export function gatesForDefinition(chart: Chart): Set<number> {
  const s = new Set<number>();
  for (const a of chart.activations.personality) if (DEFINITION_BODIES.has(a.planet)) s.add(a.gate);
  for (const a of chart.activations.design) if (DEFINITION_BODIES.has(a.planet)) s.add(a.gate);
  return s;
}

export type DefinitionType = "none" | "single" | "split" | "triple" | "quadruple";

export interface Definition {
  type: DefinitionType;
  /** Number of separate islands of connected defined centers (0 = Reflector). */
  islandCount: number;
  /** Each island as a sorted list of center ids; largest island first. */
  islands: Center[][];
  /** Complete-channel ids (low-high) that produced the definition. */
  definedChannels: string[];
  /** Only meaningful for a two-island split. */
  splitKind?: "simple" | "wide";
  /**
   * For a two-island split ONLY: gates the person does NOT carry whose
   * activation would bridge the two islands (they already hold the partner
   * gate of a channel that spans the gap). These are the deepest conditioning
   * hooks, a transit landing on one temporarily closes the split. Non-empty
   * exactly when the split is simple; empty for single / triple / quadruple /
   * wide, where conditioning is read through the centers instead.
   */
  bridgingGates: number[];
}

/**
 * Compute definition + split analysis from a person's activated gates (both the
 * personality and design sides, merged). Deterministic and self-contained.
 */
export function computeDefinition(natalGates: Set<number>): Definition {
  // Complete channels: both gates activated.
  const complete = CHANNELS.filter((ch) => natalGates.has(ch.gates[0]) && natalGates.has(ch.gates[1]));

  if (complete.length === 0) {
    return { type: "none", islandCount: 0, islands: [], definedChannels: [], bridgingGates: [] };
  }

  // Islands = connected components of the graph whose edges are complete
  // channels (nodes are the centers those channels touch).
  const adj = new Map<Center, Set<Center>>();
  const link = (a: Center, b: Center) => (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
  for (const ch of complete) {
    const [ca, cb] = [centerOf(ch.gates[0]), centerOf(ch.gates[1])];
    link(ca, cb);
    link(cb, ca);
  }
  const islands: Center[][] = [];
  const visited = new Set<Center>();
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    const stack = [start];
    visited.add(start);
    const comp: Center[] = [];
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const nb of adj.get(cur) ?? []) if (!visited.has(nb)) { visited.add(nb); stack.push(nb); }
    }
    islands.push(comp.sort());
  }
  islands.sort((x, y) => y.length - x.length || x[0].localeCompare(y[0]));

  const islandCount = islands.length;
  const type: DefinitionType =
    islandCount === 1 ? "single" : islandCount === 2 ? "split" : islandCount === 3 ? "triple" : "quadruple";

  // Bridging analysis: two islands only. A channel bridges the split when its
  // two centers sit in different islands AND the person already holds exactly
  // one of its gates (a hanging gate reaching across); the missing partner gate
  // is the single-gate bridge. If some cross-island channel qualifies, the split
  // is simple; if none does (every spanning channel needs both gates), it is
  // wide and there is no single-gate hook.
  let splitKind: "simple" | "wide" | undefined;
  const bridging = new Set<number>();
  if (islandCount === 2) {
    const island0 = new Set(islands[0]);
    const island1 = new Set(islands[1]);
    for (const ch of CHANNELS) {
      const [g1, g2] = ch.gates;
      const [c1, c2] = [centerOf(g1), centerOf(g2)];
      const spans =
        (island0.has(c1) && island1.has(c2)) || (island1.has(c1) && island0.has(c2));
      if (!spans) continue;
      const has1 = natalGates.has(g1);
      const has2 = natalGates.has(g2);
      if (has1 && !has2) bridging.add(g2);
      else if (has2 && !has1) bridging.add(g1);
      // neither held -> needs two gates, contributes only to "wide"
    }
    splitKind = bridging.size > 0 ? "simple" : "wide";
  }

  return {
    type,
    islandCount,
    islands,
    definedChannels: complete.map((ch) => channelId(ch.gates[0], ch.gates[1])),
    splitKind,
    bridgingGates: [...bridging].sort((a, b) => a - b),
  };
}

/** Short human label, e.g. "Split Definition (simple)" or "Single Definition". */
export function definitionLabel(d: Definition): string {
  switch (d.type) {
    case "none": return "No Definition";
    case "single": return "Single Definition";
    case "split": return `Split Definition (${d.splitKind})`;
    case "triple": return "Triple Split Definition";
    case "quadruple": return "Quadruple Split Definition";
  }
}
