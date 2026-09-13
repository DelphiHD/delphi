/**
 * Simple split or wide split, which no API will tell you.
 *
 * Kaycee, 2026-09-12: "I still don't know how to program the simple and broad
 * split definition. It's easy in my mind - both have two islands, but simple
 * split is a single gate difference whereas broad split needs a full channel or
 * more to bridge. The psychological difference is vast. Ra talked about it all
 * the time, I've observed it in my clients, but nobody talks about it now and
 * there is no API that is smart enough to make the distinction."
 *
 * It is her rule, implemented exactly as she stated it, and it is graph maths
 * rather than a judgement: split definition is already deterministic here from
 * the island count, and this asks one more question of the same graph.
 *
 * Take the two islands. Walk every channel the person does not have. If they
 * hold exactly one of its two gates, and that gate and its missing partner sit
 * in different islands, then one gate from somebody else closes the split. If
 * any such gate exists the split is simple. If none does, every route between
 * the two islands needs both ends of a channel, so it takes a whole channel or
 * more, and the split is wide.
 *
 * Only ever two islands. Kaycee: "doesn't apply to triples or quads."
 */

import { CHANNELS } from "@/lib/hd/channels";
import { centerOf, type Center } from "@/lib/hd/gate-center";

export type SplitKind = "simple" | "wide";

export interface SplitReading {
  /** How many islands the definition falls into. */
  islands: number;
  /** Only set at two islands, where the distinction means something. */
  kind: SplitKind | null;
  /** The single gates that would close it. Empty on a wide split, by definition. */
  bridgeGates: number[];
  /**
   * The shortest routes across a wide split, each a run of channels they hold
   * neither end of. Usually one channel. Sometimes two, when the two islands
   * have no channel between them at all and the route has to pass through a
   * centre they do not have: the first version of this listed nothing at all
   * for those people, which read as broken rather than as "it takes two".
   */
  bridgeRoutes: { gates: [number, number]; name: string }[][];
}

/** "10-20" either way round, so a set of channel keys can be compared. */
const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * `definedChannels` are the person's own, as "lo-hi". `gates` is every gate
 * they carry, hanging ones included: a hanging gate is exactly what makes a
 * split simple rather than wide.
 */
export function readSplit(args: {
  definedChannels: Iterable<string>;
  definedCenters: Iterable<Center>;
  gates: Iterable<number>;
}): SplitReading {
  const defined = new Set(args.definedChannels);
  const gates = new Set(args.gates);

  // the islands: centres joined by a channel the person actually holds
  const adj = new Map<Center, Set<Center>>();
  for (const c of args.definedCenters) adj.set(c, new Set());
  for (const ch of CHANNELS) {
    if (!defined.has(key(ch.gates[0], ch.gates[1]))) continue;
    const a = centerOf(ch.gates[0]), b = centerOf(ch.gates[1]);
    adj.get(a)?.add(b);
    adj.get(b)?.add(a);
  }
  const seen = new Set<Center>();
  const islands: Center[][] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const group: Center[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      for (const n of adj.get(cur) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
    islands.push(group);
  }

  const islandOf = new Map<Center, number>();
  islands.forEach((g, i) => g.forEach((c) => islandOf.set(c, i)));

  if (islands.length !== 2) {
    return { islands: islands.length, kind: null, bridgeGates: [], bridgeRoutes: [] };
  }

  // A single gate closes the split when the person already holds one end of a
  // channel whose other end lands in the far island. That is the whole test.
  const bridgeGates: number[] = [];
  for (const ch of CHANNELS) {
    const [g1, g2] = ch.gates;
    if (defined.has(key(g1, g2))) continue;
    const i1 = islandOf.get(centerOf(g1)), i2 = islandOf.get(centerOf(g2));
    if (i1 === undefined || i2 === undefined || i1 === i2) continue;
    if (gates.has(g1) !== gates.has(g2)) bridgeGates.push(gates.has(g1) ? g2 : g1);
  }
  if (bridgeGates.length) {
    return {
      islands: 2, kind: "simple",
      bridgeGates: [...new Set(bridgeGates)].sort((a, b) => a - b),
      bridgeRoutes: [],
    };
  }

  // Wide. The shortest way across, which may pass through a centre they do not
  // have, in which case it takes two channels rather than one.
  type Step = { gates: [number, number]; name: string };
  const routes: Step[][] = [];
  const start = new Set(islands[0]);
  const goal = new Set(islands[1]);
  let frontier: { at: Center; path: Step[] }[] = [...start].map((c) => ({ at: c, path: [] }));
  const seenC = new Set<Center>(start);
  for (let depth = 0; depth < 3 && !routes.length; depth++) {
    const next: { at: Center; path: Step[] }[] = [];
    for (const node of frontier) {
      for (const ch of CHANNELS) {
        if (defined.has(key(ch.gates[0], ch.gates[1]))) continue;
        const a = centerOf(ch.gates[0]), b = centerOf(ch.gates[1]);
        const to = a === node.at ? b : b === node.at ? a : null;
        if (!to || seenC.has(to)) continue;
        const step: Step = { gates: [ch.gates[0], ch.gates[1]], name: ch.name };
        if (goal.has(to)) routes.push([...node.path, step]);
        else next.push({ at: to, path: [...node.path, step] });
      }
    }
    for (const n of next) seenC.add(n.at);
    frontier = next;
  }

  return { islands: 2, kind: "wide", bridgeGates: [], bridgeRoutes: routes };
}
