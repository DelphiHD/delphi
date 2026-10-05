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
import {
  GATE_ARC_DEGREES, LINE_ARC_DEGREES, WHEEL_ANCHOR_LONGITUDE,
} from "@/lib/hd/gate-longitude";
import { tabledLongitudeAt } from "@/lib/hd/slow-table";

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
  // The slow bodies come from a Swiss Ephemeris table first, because a return
  // is cast for the moment it happens and half an arcminute of disagreement is
  // tens of minutes on the clock. Kiron is only there at all. Outside the
  // table's years this falls through to the library below.
  if (planet === "Chiron" || planet === "Kiron" || planet === "Saturn" || planet === "Uranus") {
    const tabled = tabledLongitudeAt(planet === "Kiron" ? "Chiron" : planet, when);
    if (tabled !== null) return tabled;
  }
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

/* ────────────────────────────────────────────────────────────────────────────
 * Ingress: when a body entered the sign or gate it is in, and when it leaves.
 *
 * crossingsIn above samples every minute, which is right for a birth-time
 * window of a few hours and hopeless here: Pluto holds a sign for twenty
 * years. This walks outward from the moment in growing steps and then bisects
 * the step that straddles the boundary, so it costs a few dozen position
 * calculations per answer instead of ten million.
 *
 * Retrograde is handled by not assuming direction: "entered" is the most
 * recent crossing INTO the band the body is in now, which is the ingress an
 * astrologer means when a planet has retrograded back over a cusp and
 * returned. "leaves" is the next crossing out, forwards or backwards.
 *
 * Kaycee, 2026-10-05: "We want to know, when this planet entered this sign and
 * gate and when it moves to the next sign and gate."
 * ──────────────────────────────────────────────────────────────────────────── */

export type Band = "sign" | "gate";

const DAY_MS = 86_400_000;
/** Pluto can hold one sign for a little over twenty years. */
const MAX_SEARCH_DAYS = 40 * 365;

const norm360 = (d: number) => ((d % 360) + 360) % 360;

/** Which band a longitude falls in. Both are monotonic in longitude, so a
 *  change of index is a boundary crossing and nothing else. */
function cellOf(lon: number, band: Band): number {
  return band === "sign"
    ? Math.floor(norm360(lon) / 30)
    : Math.floor(norm360(lon - WHEEL_ANCHOR_LONGITUDE) / GATE_ARC_DEGREES);
}

/** Degrees per day, signed magnitude, measured either side of the moment. */
function speedOf(planet: string, when: Date): number {
  const a = longitudeAt(planet, new Date(when.getTime() - DAY_MS / 2));
  const b = longitudeAt(planet, new Date(when.getTime() + DAY_MS / 2));
  if (a === null || b === null) return 1;
  return Math.abs(((b - a + 540) % 360) - 180);
}

/**
 * The instant the body crosses out of the band it occupies at `from`, looking
 * forwards (dir 1) or backwards (dir -1). Returns the first instant on the far
 * side going forwards, and the first instant INSIDE the band going backwards,
 * which is the ingress.
 */
function edgeOf(planet: string, from: Date, band: Band, dir: 1 | -1): Date | null {
  const lon0 = longitudeAt(planet, from);
  if (lon0 === null) return null;
  const base = cellOf(lon0, band);
  const arc = band === "sign" ? 30 : GATE_ARC_DEGREES;
  // Never step so far that a whole stay in the band could fall between two
  // samples. A quarter of the time this body takes to cross one band.
  const maxStep = Math.max(0.02, Math.min(arc / Math.max(speedOf(planet, from), 1e-4) / 4, 20));

  let step = Math.min(0.25, maxStep);
  let elapsed = 0;
  let inside = from;
  while (elapsed < MAX_SEARCH_DAYS) {
    const t = elapsed + step;
    const probe = new Date(from.getTime() + dir * t * DAY_MS);
    const lon = longitudeAt(planet, probe);
    if (lon === null) return null;
    if (cellOf(lon, band) !== base) {
      // bisect to the minute between the last sample inside and this one out
      let lo = inside, hi = probe;
      while (Math.abs(hi.getTime() - lo.getTime()) > 60_000) {
        const mid = new Date((lo.getTime() + hi.getTime()) / 2);
        const lm = longitudeAt(planet, mid);
        if (lm === null) break;
        if (cellOf(lm, band) === base) lo = mid; else hi = mid;
      }
      return dir === 1 ? hi : lo;
    }
    inside = probe;
    elapsed = t;
    step = Math.min(step * 1.6, maxStep);
  }
  return null;
}

export interface BandStay {
  planet: string;
  band: Band;
  /** Sign name or gate number, whichever band this is. */
  index: number;
  enteredUtc: string | null;
  leavesUtc: string | null;
}

/** Where a body sits in this band right now, and the span it is inside. */
export function bandStay(planet: string, when: Date, band: Band): BandStay | null {
  const lon = longitudeAt(planet, when);
  if (lon === null) return null;
  const entered = edgeOf(planet, when, band, -1);
  const leaves = edgeOf(planet, when, band, 1);
  return {
    planet, band, index: cellOf(lon, band),
    enteredUtc: entered ? entered.toISOString() : null,
    leavesUtc: leaves ? leaves.toISOString() : null,
  };
}
