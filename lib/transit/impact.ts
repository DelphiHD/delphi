// Transit impact: given the live sky and a person's natal chart, find where
// today's transits land on their design. The strongest effect is a transit
// GATE that completes a channel with one of the person's natal gates — a
// temporary electromagnetic connection that can color an otherwise-open center
// for as long as the transit holds. A transit landing on a gate they already
// carry is reinforcement (lighter). We score and rank so the report can name
// who is most affected.

import type { Chart, CenterName } from "@/lib/chart/types";
import { channelsForGate } from "@/lib/hd/channels";
import { centerOf, type Center as WheelCenter } from "@/lib/hd/gate-center";
import { gateName } from "@/lib/hd/gate-names";
import { computeDefinition, gatesForDefinition, definitionLabel, type Definition } from "@/lib/hd/definition";
import type { TransitPosition } from "@/lib/transit/sky";

// gate-center uses hyphenated ids ("solar-plexus"); the Chart center vocabulary
// uses spaces ("solar plexus"). Bridge the two so we can look up a client's
// center status by the center a gate belongs to.
function toCenterName(c: WheelCenter): CenterName {
  return (c === "solar-plexus" ? "solar plexus" : c) as CenterName;
}

// A transiting planet holds a gate for very different spans depending on speed.
// This drives both the score weight (sustained hits matter more) and the prose
// ("for the next few hours" vs "for days").
function durationClass(planet: string): "fleeting" | "days" | "long" {
  if (planet === "Moon") return "fleeting";
  if (planet === "Mercury" || planet === "Venus" || planet === "Sun" || planet === "Earth") return "days";
  return "long"; // Mars through Pluto, plus the Nodes
}

export interface Completion {
  /** The transiting planet driving it. */
  planet: string;
  /** The transiting gate (the client does NOT carry this natally). */
  transitGate: number;
  transitLine: number;
  /** The client's natal gate that gets connected. */
  natalGate: number;
  channelId: string;
  channelName: string;
  /** Center the completed channel touches on the transit side. */
  center: CenterName;
  /** True when that center is open in the client's chart — the notable case. */
  definesOpenCenter: boolean;
  /**
   * True when this transit gate bridges the person's split (they carry a two-
   * island split and this gate is one of its bridging gates). Per Ra, "the
   * deepest conditioning is the thing that will bridge your split" — this is the
   * strongest hook, but only for a simple two-island split. For single and
   * triple/quadruple splits there is no bridge signal and conditioning is read
   * through the centers instead.
   */
  bridgesSplit: boolean;
  duration: "fleeting" | "days" | "long";
}

export interface ClientImpact {
  slug: string;
  name: string;
  score: number;
  completions: Completion[];
  /** Count of transits reinforcing a gate the client already carries. */
  reinforcements: number;
  /** Deterministic definition + split analysis (drives the conditioning read). */
  definition: Definition;
  /** Short label, e.g. "Split Definition (simple)". */
  definitionLabel: string;
}

function openCenters(chart: Chart): Set<CenterName> {
  return new Set(chart.centers.filter((c) => !c.defined).map((c) => c.name));
}

function weightFor(c: Omit<Completion, "channelName" | "channelId">): number {
  let w = 3;
  // The U-shape (Kaycee's rule): at a two-island split the bridging gate is the
  // deepest, most-worth-watching hook; at single / triple / quadruple there is
  // no bridge signal, so a transit lighting an open center is the headline.
  if (c.bridgesSplit) w += 5;
  if (c.definesOpenCenter) w += 3;
  if (c.duration === "days") w += 1;
  if (c.duration === "long") w += 2;
  // Moon completions are real but blink past; no bonus.
  return w;
}

/** Score one person against the live sky. */
export function computeImpact(
  client: { slug: string; name: string },
  chart: Chart,
  sky: TransitPosition[],
): ClientImpact {
  const natal = gatesForDefinition(chart);
  const open = openCenters(chart);
  const definition = computeDefinition(natal);
  // Bridging only matters at a two-island split (see the U-shape above); for any
  // other definition the set is empty, so no completion is ever flagged.
  const bridges = new Set(definition.type === "split" ? definition.bridgingGates : []);

  const completions: Completion[] = [];
  let reinforcements = 0;

  for (const pos of sky) {
    if (natal.has(pos.gate)) {
      reinforcements++;
      continue;
    }
    for (const ch of channelsForGate(pos.gate)) {
      if (!natal.has(ch.partner)) continue;
      const center = toCenterName(centerOf(pos.gate));
      completions.push({
        planet: pos.planet,
        transitGate: pos.gate,
        transitLine: pos.line,
        natalGate: ch.partner,
        channelId: ch.id,
        channelName: ch.name,
        center,
        definesOpenCenter: open.has(center),
        bridgesSplit: bridges.has(pos.gate),
        duration: durationClass(pos.planet),
      });
    }
  }

  const score =
    completions.reduce((sum, c) => sum + weightFor(c), 0) +
    reinforcements * 0.25;

  return {
    slug: client.slug,
    name: client.name,
    score,
    completions,
    reinforcements,
    definition,
    definitionLabel: definitionLabel(definition),
  };
}

/** Score everyone and return most-affected first. */
export function rankImpacts(
  people: { client: { slug: string; name: string }; chart: Chart }[],
  sky: TransitPosition[],
): ClientImpact[] {
  return people
    .map((p) => computeImpact(p.client, p.chart, sky))
    .sort((a, b) => b.score - a.score);
}

/** One-line human summary of a person's strongest hits, for logs / prompts. */
export function impactHeadline(i: ClientImpact): string {
  if (i.completions.length === 0) {
    return i.reinforcements > 0
      ? `${i.reinforcements} gate(s) reinforced, no channels completed`
      : "quiet day";
  }
  const rank = (c: Completion) => (c.bridgesSplit ? 2 : 0) + (c.definesOpenCenter ? 1 : 0);
  const top = [...i.completions].sort((a, b) => rank(b) - rank(a));
  const parts = top.slice(0, 3).map(
    (c) =>
      `${c.planet} in ${c.transitGate} (${gateName(c.transitGate)}) completes ${c.channelId} ${c.channelName}` +
      (c.bridgesSplit ? ", bridges their split" : "") +
      (c.definesOpenCenter ? `, lights open ${c.center}` : ""),
  );
  return parts.join("; ");
}
