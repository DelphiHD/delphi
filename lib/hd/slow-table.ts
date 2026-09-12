/**
 * Where the slow bodies are, from a table rather than from anybody.
 *
 * Kiron is the one body the runtime ephemeris does not carry at all, and its
 * return is the marker that matters most for 6-line beings. Finding that date by asking
 * bodygraph.com costs about sixty five calls, per chart, for an answer that is
 * the same for everyone alive: where Kiron was on a given day is a fact about
 * the sky, not about the person. Kaycee, 2026-09-12: "I don't want to have to
 * make that many calls per chart, that's silly."
 *
 * So scripts/build-kiron-table.py sampled it once, out of Swiss Ephemeris,
 * every five days from 1900 to 2130, and this reads between the samples. No
 * network, no rate limit, no key, and it works with no signal at all, which
 * matters for anything that has to run at an event in the wilderness.
 *
 * Saturn and Uranus are in the table too, and not because they were missing.
 * astronomy-engine has them, and its dates for a return matched Swiss Ephemeris
 * exactly. Its times did not: a disagreement of half an arcminute is nothing on
 * a chart and is tens of minutes on the clock for a body moving two arcminutes
 * an hour. Kaycee, 2026-09-12: "when we do the return chart work it will be
 * important to have the exact times." A return chart is cast for the moment the
 * return happens, so the moment has to be right, and the way to have it agree
 * with Swiss Ephemeris is to come from Swiss Ephemeris.
 *
 * Catmull-Rom through four samples. These bodies move at most a few hundredths
 * of a degree a day, so five days is a tenth of a degree between samples and
 * the curve through them is far finer than anything the chart reports.
 *
 * Outside 1900 to 2130 this returns null and the caller falls back to
 * astronomy-engine, which is right everywhere and merely less exact here.
 */

import table from "@/lib/hd/slow-table.json";

const START = new Date(table.start).getTime();
const STEP = table.stepDays * 86_400_000;

/** Rebuilt once per body, from the differences the file stores. */
const SERIES: Record<string, Float64Array> = (() => {
  const out: Record<string, Float64Array> = {};
  for (const [name, deltas] of Object.entries(table.bodies as Record<string, number[]>)) {
    const arr = new Float64Array(deltas.length);
    let acc = 0;
    for (let i = 0; i < deltas.length; i++) {
      acc += deltas[i];
      arr[i] = acc / table.scale;
    }
    out[name] = arr;
  }
  return out;
})();

export const TABLE_FROM = new Date(START);
export const TABLE_TO = new Date(START + (table.count - 1) * STEP);
export const TABLED_BODIES = Object.keys(SERIES);

/** Unwrap b so it is the nearest turn to a, so 359 and 1 are two apart. */
const near = (a: number, b: number) => a + (((b - a + 540) % 360) - 180);

/**
 * Kiron's ecliptic longitude at an instant, or null outside the table.
 *
 * The four samples around the moment are unwrapped onto one continuous line
 * before the curve is fitted, because a spline through 359, 0, 1 would sweep
 * backwards through the whole wheel.
 */
export function tabledLongitudeAt(body: string, when: Date): number | null {
  const series = SERIES[body];
  if (!series) return null;
  const t = when.getTime();
  const x = (t - START) / STEP;
  const i = Math.floor(x);
  if (!isFinite(x) || i < 1 || i + 2 >= series.length) return null;
  const f = x - i;

  const p1 = series[i];
  const p0 = near(p1, series[i - 1]);
  const p2 = near(p1, series[i + 1]);
  const p3 = near(p2, series[i + 2]);

  const a = 2 * p1;
  const b = p2 - p0;
  const c = 2 * p0 - 5 * p1 + 4 * p2 - p3;
  const d = -p0 + 3 * p1 - 3 * p2 + p3;
  const lon = 0.5 * (a + b * f + c * f * f + d * f * f * f);
  return ((lon % 360) + 360) % 360;
}
