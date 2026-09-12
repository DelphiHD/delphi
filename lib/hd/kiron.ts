/**
 * Where Kiron is, from a table rather than from anybody.
 *
 * Kiron is the one body the runtime ephemeris does not carry, and its return is
 * the marker that matters most for 6-line beings. Finding that date by asking
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
 * Catmull-Rom through four samples. Kiron moves at most about two hundredths of
 * a degree a day, so five days is a tenth of a degree between samples and the
 * curve through them is far finer than anything the chart reports.
 */

import table from "@/lib/hd/kiron-table.json";

const START = new Date(table.start).getTime();
const STEP = table.stepDays * 86_400_000;

/** Rebuilt once, from the differences the file stores. */
const LONGITUDES: Float64Array = (() => {
  const d = table.deltas as number[];
  const out = new Float64Array(d.length);
  let acc = 0;
  for (let i = 0; i < d.length; i++) {
    acc += d[i];
    out[i] = acc / table.scale;
  }
  return out;
})();

export const KIRON_FROM = new Date(START);
export const KIRON_TO = new Date(START + (LONGITUDES.length - 1) * STEP);

/** Unwrap b so it is the nearest turn to a, so 359 and 1 are two apart. */
const near = (a: number, b: number) => a + (((b - a + 540) % 360) - 180);

/**
 * Kiron's ecliptic longitude at an instant, or null outside the table.
 *
 * The four samples around the moment are unwrapped onto one continuous line
 * before the curve is fitted, because a spline through 359, 0, 1 would sweep
 * backwards through the whole wheel.
 */
export function kironLongitudeAt(when: Date): number | null {
  const t = when.getTime();
  const x = (t - START) / STEP;
  const i = Math.floor(x);
  if (!isFinite(x) || i < 1 || i + 2 >= LONGITUDES.length) return null;
  const f = x - i;

  const p1 = LONGITUDES[i];
  const p0 = near(p1, LONGITUDES[i - 1]);
  const p2 = near(p1, LONGITUDES[i + 1]);
  const p3 = near(p2, LONGITUDES[i + 2]);

  const a = 2 * p1;
  const b = p2 - p0;
  const c = 2 * p0 - 5 * p1 + 4 * p2 - p3;
  const d = -p0 + 3 * p1 - 3 * p2 + p3;
  const lon = 0.5 * (a + b * f + c * f * f + d * f * f * f);
  return ((lon % 360) + 360) % 360;
}
