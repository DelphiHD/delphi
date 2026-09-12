/**
 * Where the planets are, computed here rather than asked for.
 *
 * This never makes a chart and never decides what a chart says. The chart
 * provider remains the only authority on Human Design: type, profile, the
 * nodes, Chiron, Lilith, all of it, exactly as before. This module answers one
 * much smaller question, which is astronomy and not Human Design:
 *
 *     which minutes of this day are worth asking the provider about?
 *
 * Before this, the birth-time scan answered that by sampling: cast the chart
 * at forty-eight moments across the window and see what moved. That is
 * approximate by construction, and it spends nine seconds of somebody's
 * attention. Planet positions are free to compute here, so instead we work out
 * the exact minute each body crosses a boundary and ask the provider only
 * about those minutes. Fewer calls, and exact rather than bracketed.
 *
 * ACCURACY, MEASURED
 *
 * Checked against the provider on 2026-09-12 across three births, both sides,
 * every body it can compute. Worst disagreement anywhere: 0.64 arcminutes, on
 * Neptune. A line is 56 arcminutes, so we agree to within a hundredth of the
 * smallest thing the scan claims to find. Nothing here is trusted beyond
 * deciding when to look.
 *
 * WHAT IT CANNOT SEE, AND WHY THAT IS FINE
 *
 * North Node, South Node, Chiron and Lilith are not computable this way. They
 * are also the four slowest things on the chart. Measured across a full day:
 *
 *     North / South Node   did not move at all
 *     Lilith               207 hours to cross one line
 *     Chiron               370 hours
 *
 * The fastest of them needs eight and a half days to change a line, so none of
 * them can change one inside a birth window. Below the line, at tone, Lilith
 * can move within a long window, so scanWindow keeps a safety net: anything
 * the two endpoints disagree about that this module did not predict is still
 * hunted down the old way.
 */

import {
  Body, GeoVector, Ecliptic, EclipticGeoMoon,
} from "astronomy-engine";
import { GATE_ARC_DEGREES, LINE_ARC_DEGREES } from "@/lib/hd/gate-longitude";

/** The rungs of the wheel, coarse to fine. Base is deliberately absent. */
export const COLOR_ARC_DEGREES = LINE_ARC_DEGREES / 6;
export const TONE_ARC_DEGREES = COLOR_ARC_DEGREES / 6;

/** Bodies this can compute. The rest come from the provider, as always. */
const COMPUTABLE: Record<string, Body | "earth"> = {
  Sun: Body.Sun,
  Earth: "earth",
  Mercury: Body.Mercury,
  Venus: Body.Venus,
  Mars: Body.Mars,
  Jupiter: Body.Jupiter,
  Saturn: Body.Saturn,
  Uranus: Body.Uranus,
  Neptune: Body.Neptune,
  Pluto: Body.Pluto,
  // Moon is handled separately: astronomy-engine has a dedicated, faster path.
};

export const COMPUTABLE_BODIES = ["Moon", ...Object.keys(COMPUTABLE)];

/**
 * Ecliptic longitude of one body at one instant, in degrees.
 *
 * The Human Design wheel is anchored to the tropical zodiac (gate 41 line 1 at
 * 302 degrees), which is the same frame this returns, so the number compares
 * directly against lib/hd/gate-longitude with no conversion in between.
 */
export function longitudeAt(planet: string, when: Date): number | null {
  if (planet === "Moon") return EclipticGeoMoon(when).lon;
  const body = COMPUTABLE[planet];
  if (body === undefined) return null;
  if (body === "earth") {
    // Earth is where the Sun is not: the same axis, read from the other end.
    const sun = Ecliptic(GeoVector(Body.Sun, when, true)).elon;
    return (sun + 180) % 360;
  }
  return Ecliptic(GeoVector(body, when, true)).elon;
}

/** How fine a boundary is being watched. */
export type Rung = "gate" | "line" | "color" | "tone";

const ARC: Record<Rung, number> = {
  gate: GATE_ARC_DEGREES,
  line: LINE_ARC_DEGREES,
  color: COLOR_ARC_DEGREES,
  tone: TONE_ARC_DEGREES,
};

export interface Crossing {
  /** Minutes past local midnight, the first minute on the far side. */
  mins: number;
  planet: string;
  rung: Rung;
}

/**
 * Every minute inside a window at which some body steps over a boundary.
 *
 * Sampled once a minute, which is not an approximation of the answer but the
 * resolution of the question: the scan reports times to the minute, and the
 * fastest body moves a hundredth of a line in one. Roughly sixteen thousand
 * position calculations for a whole day, which takes about a third of a
 * second on the machine and costs nothing.
 *
 * `designOffsetMins` is how far before birth the design side is cast. It moves
 * with the birth time almost exactly one for one, so treating it as fixed
 * across a window is good to a few seconds.
 */
export function crossingsIn(args: {
  startUtc: Date;
  startMins: number;
  endMins: number;
  designOffsetMins: number;
  rungs?: Rung[];
}): Crossing[] {
  const rungs = args.rungs ?? ["line", "color", "tone"];
  const span = Math.max(1, args.endMins - args.startMins);
  const out: Crossing[] = [];

  for (const planet of COMPUTABLE_BODIES) {
    // Both sides of the chart move when the birth time moves, so both are
    // watched. A crossing on either side is a minute worth asking about.
    for (const side of [0, args.designOffsetMins]) {
      let previous: number[] | null = null;
      for (let m = 0; m <= span; m++) {
        const when = new Date(args.startUtc.getTime() + (m + side) * 60_000);
        const lon = longitudeAt(planet, when);
        if (lon === null) break;
        const cell = rungs.map((r) => Math.floor(lon / ARC[r]));
        if (previous) {
          for (let i = 0; i < rungs.length; i++) {
            if (cell[i] !== previous[i]) {
              out.push({ mins: args.startMins + m, planet, rung: rungs[i] });
            }
          }
        }
        previous = cell;
      }
    }
  }

  out.sort((a, b) => a.mins - b.mins);
  return out;
}
