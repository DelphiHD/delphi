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
import { cyclesFor } from "@/lib/hd/cycles-node";

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
 * The Solar Return: when the Sun comes back to where it stood at birth.
 *
 * `after` is where to start looking, so a caller can ask for any year's.
 */
export function solarReturnAfter(birthUtc: string | Date, after: string | Date): Date | null {
  const natal = longitudeAt("Sun", new Date(birthUtc));
  if (natal === null) return null;
  const from = new Date(after).getTime();
  const found = crossingNear("Sun", natal, from, from + 370 * DAY);
  return found === null ? null : new Date(Math.round(found / MINUTE) * MINUTE);
}

/** A return, with the design moment that belongs to it. */
export interface ReturnMoment {
  kind: "Solar Return" | "Saturn Return" | "Uranus Opposition" | "Kiron Return"
    | "Second Saturn Return" | "Uranus Return";
  /** Where this one sits relative to now. */
  when: "current" | "next";
  /** The instant the return happens, UTC. */
  moment: string;
  /** 88 solar degrees before it, which is where the reading starts. */
  design: string;
  /** When the reading belongs, which is not the same as when the return is. */
  readFrom: string;
}

/**
 * The Solar Return somebody is living in, and the one coming.
 *
 * Kaycee, 2026-09-12: "could we do current return and next return?" Both,
 * because a return is a year long and the one you are inside is the one
 * explaining your life right now, while the next is the one worth preparing
 * for. Neither alone is the answer.
 *
 * `readFrom` is the design moment rather than the return itself. The method is
 * explicit that a Solar Return reading belongs about three months before the
 * birthday, when the unconscious themes arrive, not on the day.
 */
export function solarReturns(birthUtc: string | Date, now = new Date()): ReturnMoment[] {
  const out: ReturnMoment[] = [];
  const t = now.getTime();

  // Start a year and a bit back so the crossing before now is certainly found.
  const previous = solarReturnAfter(birthUtc, new Date(t - 380 * DAY));
  const current = previous && previous.getTime() <= t
    ? previous
    : solarReturnAfter(birthUtc, new Date(t - 745 * DAY));
  const next = current ? solarReturnAfter(birthUtc, new Date(current.getTime() + DAY)) : null;

  for (const [when, m] of [["current", current], ["next", next]] as const) {
    if (!m) continue;
    const design = designMomentFor(m);
    if (!design) continue;
    out.push({
      kind: "Solar Return", when,
      moment: m.toISOString(),
      design: design.toISOString(),
      readFrom: design.toISOString(),
    });
  }
  return out;
}

/**
 * The long cycle behind somebody and the one ahead of them.
 *
 * Saturn, the Uranus Opposition, Kiron, the second Saturn and the Uranus
 * Return. Each happens once, so "current" is the one most recently crossed and
 * "next" is the one coming; a life usually has one of each in view.
 *
 * `readFrom` is not the return. The method is explicit that a Saturn Return
 * should not be delivered at the Saturn: wait until the middle thirties, three
 * or four years after, when somebody has actually been inside it. Kiron reads
 * three and a half years either side. So the date to act on is stored beside
 * the date it happens, and they are not the same date.
 */
const READING_OFFSET_DAYS: Record<string, number> = {
  "Saturn Return": 3.5 * 365,
  "Second Saturn Return": 3.5 * 365,
  "Uranus Opposition": 0,
  "Kiron Return": -3.5 * 365,
  "Uranus Return": 0,
};

export async function longCycleReturns(birthUtc: string | Date, now = new Date()): Promise<ReturnMoment[]> {
  const cycles = await cyclesFor({ birthUtc: new Date(birthUtc).toISOString(), now });
  const t = now.getTime();
  const dated = cycles
    .filter((c) => c.firstPassUtc)
    .map((c) => ({ kind: c.label as ReturnMoment["kind"], at: new Date(c.firstPassUtc).getTime() }))
    .sort((a, b) => a.at - b.at);

  const past = dated.filter((c) => c.at <= t).pop();
  const ahead = dated.find((c) => c.at > t);
  const out: ReturnMoment[] = [];

  for (const [when, c] of [["current", past], ["next", ahead]] as const) {
    if (!c) continue;
    const moment = new Date(c.at);
    const design = designMomentFor(moment);
    if (!design) continue;
    const offset = READING_OFFSET_DAYS[c.kind] ?? 0;
    out.push({
      kind: c.kind, when,
      moment: moment.toISOString(),
      design: design.toISOString(),
      readFrom: new Date(c.at + offset * DAY).toISOString(),
    });
  }
  return out;
}
