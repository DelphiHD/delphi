/**
 * The moment a cycle returns, and the design moment that belongs to it.
 *
 * A return chart is a chart of an instant, not of a date. The old cycle pills
 * jumped the transit view to the date and kept whatever hour the picker was on;
 * on Kaycee's own Uranus Opposition that was four hours and nineteen minutes
 * out, which moves the Sun about a fifth of a line and the Moon nearly three
 * whole lines. Her point, 2026-09-12: "The line on the sun/earth placements is
 * incredibly important as it's a profile that sets the tone for the cycle."
 *
 * TWO SIDES, THE SAME AS A BIRTH
 *
 * A Rave Return initiates 88 solar degrees apart exactly as a birth does, so it
 * has a design side of its own and the design side comes first in time. Kaycee,
 * 2026-09-12: "they do need to have the design calculation as well."
 *
 * That 88 degrees is solved here rather than approximated: the Sun does not
 * move at a constant rate, so 88 degrees is between 89 and 90 days depending on
 * where in the orbit it falls. Checked against the provider's own design dates,
 * which it computes the same way.
 */

import { longitudeAt } from "@/lib/hd/ephemeris";

const DAY = 86_400_000;
const MINUTE = 60_000;

/** Shortest signed angle from a to b. */
const delta = (a: number, b: number) => ((b - a + 540) % 360) - 180;

/** The Sun's own arc between a birth and its design. */
export const DESIGN_ARC_DEGREES = 88;

/**
 * When a body last stood at, or next stands at, a given longitude.
 *
 * Walked a day at a time then halved, the same as the cycle crossings, so the
 * answer is the instant rather than the day.
 */
function crossingNear(planet: string, target: number, from: number, to: number): number | null {
  let prevT = from;
  let prev = longitudeAt(planet, new Date(from));
  if (prev === null) return null;
  let prevD = delta(target, prev);

  for (let t = from + DAY; t <= to; t += DAY) {
    const lon = longitudeAt(planet, new Date(t));
    if (lon === null) return null;
    const d = delta(target, lon);
    if (Math.sign(d) !== Math.sign(prevD) && Math.abs(d - prevD) < 180) {
      let lo = prevT, hi = t, dlo = prevD;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        const l = longitudeAt(planet, new Date(mid));
        if (l === null) break;
        const dm = delta(target, l);
        if (Math.sign(dm) === Math.sign(dlo)) { lo = mid; dlo = dm; } else hi = mid;
      }
      return (lo + hi) / 2;
    }
    prevT = t; prevD = d;
  }
  return null;
}

/**
 * The design moment for any birth or return: when the Sun stood 88 degrees
 * earlier. Roughly 89 days, never exactly, which is why it is solved.
 */
export function designMomentFor(momentUtc: string | Date): Date | null {
  const t = new Date(momentUtc).getTime();
  const sun = longitudeAt("Sun", new Date(t));
  if (sun === null) return null;
  const target = ((sun - DESIGN_ARC_DEGREES) % 360 + 360) % 360;
  // It falls between 87 and 92 days back; the window is wide enough to be safe
  // and narrow enough that no other crossing of the same longitude is inside it.
  const found = crossingNear("Sun", target, t - 93 * DAY, t - 86 * DAY);
  return found === null ? null : new Date(Math.round(found / MINUTE) * MINUTE);
}

/**
 * The Rave Return: when the Sun comes back to where it stood at birth.
 *
 * `after` is where to start looking, so a caller can ask for this year's or any
 * other. The reading belongs three months before the birthday rather than on
 * it, because the design side arrives first and carries the unconscious themes.
 */
export function raveReturnAfter(birthUtc: string | Date, after: string | Date): Date | null {
  const natal = longitudeAt("Sun", new Date(birthUtc));
  if (natal === null) return null;
  const from = new Date(after).getTime();
  const found = crossingNear("Sun", natal, from, from + 370 * DAY);
  return found === null ? null : new Date(Math.round(found / MINUTE) * MINUTE);
}
