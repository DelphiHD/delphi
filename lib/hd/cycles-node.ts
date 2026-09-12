/**
 * The life cycle dates, computed where the chart is built.
 *
 * lib/chart/cycles.ts is the reference: it shells out to Swiss Ephemeris
 * through Python and is validated against Maia Mechanics to the minute. It is
 * also unreachable from the function that builds a chart for somebody on the
 * website, which has no Python, so those charts came out with no cycle dates at
 * all. Kaycee, 2026-09-12: "it didn't work. That's annoying. It really should
 * be with the api data, it's a pretty significant human design thing."
 *
 * So the same arithmetic in Node. Saturn and Uranus come from the local
 * ephemeris, which was measured against bodygraph.com on 2026-09-12 and agreed
 * everywhere to better than two thirds of an arcminute. Kiron is not in it and
 * is asked of bodygraph.com instead.
 *
 * A return is when a planet's ecliptic longitude comes back to where it stood
 * at birth. Saturn takes about twenty nine and a half years, Uranus about
 * eighty four, and the Uranus Opposition is the halfway mark. None of them
 * sails past: each retrogrades back over the point, so the crossing usually
 * happens three times across a year. All three are reported, because the
 * passage is the event rather than one date inside it.
 *
 * KIRON, AND WHAT IT DOES NOT GET
 *
 * Kiron's three passes would take dozens of calls to trace, because every
 * position has to be asked for. It gets its first crossing, found by closing in
 * from the mean period in four or five calls. Her library puts the reading at
 * three and a half years either side of the return, so tracing the retrograde
 * dance to the day would be precision spent on nothing.
 *
 * scripts/check-cycles.ts compares this against the Python reference.
 */

import { longitudeAt } from "@/lib/hd/ephemeris";

export interface Cycle {
  label: string;
  /** The first crossing, YYYY-MM-DD. */
  firstPass: string;
  /** Every crossing. One entry for Kiron, usually three for the rest. */
  allPasses: string[];
  status: "Passed" | "Current" | "Upcoming";
}

const DAY = 86_400_000;
const YEAR = 365.2422;

/** Shortest signed angle from a to b. */
const delta = (a: number, b: number) => ((b - a + 540) % 360) - 180;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Every moment in a window where a body crosses a longitude.
 *
 * Walked a day at a time because a local position costs nothing, then narrowed
 * to the hour so the date is the right side of midnight.
 */
function crossings(planet: string, target: number, from: number, to: number): number[] {
  const out: number[] = [];
  let prevT = from;
  let prev = longitudeAt(planet, new Date(from));
  if (prev === null) return out;
  let prevD = delta(target, prev);

  for (let t = from + DAY; t <= to; t += DAY) {
    const lon = longitudeAt(planet, new Date(t));
    if (lon === null) break;
    const d = delta(target, lon);
    // A sign flip is a crossing. The magnitude guard rejects the wrap from
    // +180 to -180, which is the far side of the wheel and not a return.
    if (Math.sign(d) !== Math.sign(prevD) && Math.abs(d - prevD) < 180) {
      let lo = prevT, hi = t, dlo = prevD;
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        const l = longitudeAt(planet, new Date(mid));
        if (l === null) break;
        const dm = delta(target, l);
        if (Math.sign(dm) === Math.sign(dlo)) { lo = mid; dlo = dm; } else hi = mid;
      }
      out.push((lo + hi) / 2);
    }
    prevT = t; prev = lon; prevD = d;
  }
  return out;
}

const statusOf = (passes: number[], now: number): Cycle["status"] =>
  !passes.length || now < passes[0] ? "Upcoming"
    : now > passes[passes.length - 1] ? "Passed" : "Current";

/**
 * KIRON IS NOT COMPUTED HERE, AND THAT IS DELIBERATE.
 *
 * Two attempts are recorded in the history of this file, both wrong. The first
 * stepped toward the answer from two guesses and missed by up to thirteen
 * years. The second bracketed with yearly samples and was consistently three
 * hundred days late, and the measurement showed exactly why: Kiron crosses its
 * birth longitude three times across roughly ten months, and two samples a year
 * apart can sit on the same side of all three. The scan saw no crossing at all
 * until after the last one.
 *
 * Catching the first pass honestly means asking bodygraph.com where Kiron is
 * every ten days across a couple of years, which is about sixty five calls for
 * one date. Saturn and Uranus cost nothing because the ephemeris here knows
 * them; Kiron is not in it.
 *
 * So this returns Saturn, Uranus and the second Saturn, exactly. Where Python
 * and Swiss Ephemeris are available, lib/chart/cycles.ts returns all four and
 * is used instead. A chart built on the website gets three of the four rather
 * than a fourth that is a year out.
 */

export async function cyclesFor(args: {
  birthUtc: string;
  /** Birth longitudes, which the caller already has from the chart it cast. */
  natal: { Saturn: number; Uranus: number };
  now?: Date;
}): Promise<Cycle[]> {
  const birth = new Date(args.birthUtc).getTime();
  const now = (args.now ?? new Date()).getTime();
  const at = (years: number) => birth + years * YEAR * DAY;
  const out: Cycle[] = [];

  const add = (label: string, passes: number[]) => {
    if (!passes.length) return;
    out.push({
      label,
      firstPass: iso(passes[0]),
      allPasses: passes.map(iso),
      status: statusOf(passes, now),
    });
  };

  add("Saturn Return", crossings("Saturn", args.natal.Saturn, at(26), at(33)));
  add("Uranus Opposition",
    crossings("Uranus", (args.natal.Uranus + 180) % 360, at(36), at(48)));
  add("Second Saturn Return", crossings("Saturn", args.natal.Saturn, at(55), at(62)));
  return out.sort((a, b) => a.firstPass.localeCompare(b.firstPass));
}
