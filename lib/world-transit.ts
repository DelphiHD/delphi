/**
 * Transits for The World. Kaycee's decisions, 2026-10-11, in
 * docs/ASTROCARTOGRAPHY_PLAN.md ("Transit in The World").
 *
 * transitSky: where every transiting body is at one moment, as right ascension
 * and declination, so the page can draw Cyclo*Carto*Graphy lines: where on
 * Earth each transiting body sits on the person's natal angles, which is the
 * transiting body set against the NATAL moment's sidereal time. Positions come
 * the way the natal ones do: astronomy-engine, Chiron from NASA Horizons,
 * Lilith from the provider's longitude. Sign and degree from the provider, as
 * every hover on the chart reads them.
 *
 * placeTimeline: for one place, when each transiting body comes within orb of
 * that place's relocated angles over the coming year, with the exact moments.
 * Her transit orbs: one degree, three for the Sun and the Moon.
 */
import { MakeTime, SiderealTime } from "astronomy-engine";
import { getAstro, type AstroChart } from "@/lib/astro";
import { ZODIAC } from "@/lib/astro-extras";
import { equatorial, lilithEquatorial } from "@/lib/astrocartography";
import { chironEquatorial } from "@/lib/horizons";
import { longitudeAt } from "@/lib/hd/ephemeris";
import { WORLD_BODIES } from "@/lib/world";

/** London stands in for Greenwich: the provider has no Greenwich of its own,
 *  and the moment is read as UTC, so the place only names a horizon nobody
 *  uses here. The same stand-in /api/transit-wheel uses. */
const GREENWICH_PLACE = "London, England, United Kingdom";

const deg = (v: number) => {
  let d = Math.floor(v), m = Math.round((v - d) * 60);
  if (m === 60) { d += 1; m = 0; }
  return `${d}°${m < 10 ? "0" : ""}${m}'`;
};
const signDeg = (v: number) => { const w = ((v % 360) + 360) % 360; return `${ZODIAC[Math.floor(w / 30)]} ${deg(w % 30)}`; };
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** The provider's chart of one UTC moment. */
const skyAt = (when: Date): Promise<AstroChart> => getAstro({
  birthDate: when.toISOString().slice(0, 10), birthTime: when.toISOString().slice(11, 16),
  place: GREENWICH_PLACE, atUtc: when.toISOString().slice(0, 16) + ":00+00:00",
});

export async function transitSky(when: Date) {
  const astro = await skyAt(when);
  const lil = astro.planets.find((p) => p.name === "Mean_Lilith");
  if (!lil) throw new Error("transit sky: no Lilith from the provider");
  const L = lilithEquatorial(lil.abs_pos, when);
  const given = { Chiron: await chironEquatorial(when), Lilith: { ra: L.ra, dec: L.dec } };
  const bodies: Record<string, { ra: number; dec: number }> = {};
  for (const b of WORLD_BODIES) {
    const e = equatorial(b, when, given);
    bodies[b] = { ra: r4(e.ra), dec: r4(e.dec) };
  }
  const where: Record<string, string> = {};
  for (const p of astro.planets) where[p.label] = `${p.sign} ${deg(p.position)}`;
  const sun = astro.planets.find((p) => p.label === "Sun");
  if (sun) where.Earth = signDeg(sun.abs_pos + 180);
  return { at: when.toISOString(), gast: r4(SiderealTime(MakeTime(when)) * 15), bodies, where };
}

// ---- The place timeline ------------------------------------------------------

const ORB: Record<string, number> = { Sun: 3, Moon: 3 };
const orbOf = (b: string) => ORB[b] ?? 1;
/** How often each body is sampled: often enough that it cannot pass through an
 *  orb between samples. The Moon moves 13 degrees a day; her orb for it is 3. */
const stepHours = (b: string) => (b === "Moon" ? 2 : ["Sun", "Earth", "Mercury", "Venus", "Mars"].includes(b) ? 12 : 24);
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Mean lunar apogee (Meeus ch. 47), only to carry the provider's Lilith across
 *  a year: the provider gives one longitude at the start and the drift is
 *  taken from this, so the two differ by a constant the start removes. */
function meanApogee(when: Date): number {
  const T = MakeTime(when).tt / 36525;
  return (83.3532465 + 4069.0137287 * T - 0.01032 * T * T - T ** 3 / 80053 + T ** 4 / 18999000 + 180) % 360;
}

export interface TimelineEvent {
  side: "personality" | "design";
  angle: "ASC" | "DSC" | "MC" | "IC";
  body: string;
  /** Within orb from (null: already within orb when the window opens) to (null: still within orb when it closes). */
  start: string | null;
  end: string | null;
  /** Each moment the body is exactly on the angle; more than one when it turns retrograde over it. */
  exact: string[];
}

export async function placeTimeline(args: {
  place: string; utc: string; designUtc: string; lat: number; lon: number;
  from: Date; days: number; bodies: readonly string[];
}): Promise<TimelineEvent[]> {
  const coords = { lat: args.lat, lon: args.lon };
  const cast = (atUtc: string) => getAstro({ birthDate: "", birthTime: "", place: args.place, atUtc, coords });
  const [p, d, start] = await Promise.all([cast(args.utc), cast(args.designUtc), skyAt(args.from)]);
  const angles: Record<"personality" | "design", Record<TimelineEvent["angle"], number>> = {
    personality: { ASC: p.ascendant, DSC: (p.ascendant + 180) % 360, MC: p.mc, IC: (p.mc + 180) % 360 },
    design: { ASC: d.ascendant, DSC: (d.ascendant + 180) % 360, MC: d.mc, IC: (d.mc + 180) % 360 },
  };
  const lil = start.planets.find((x) => x.name === "Mean_Lilith");
  const lilOffset = lil ? wrap180(lil.abs_pos - meanApogee(args.from)) : 0;
  const lonOf = (b: string, t: Date): number | null =>
    b === "Lilith" ? (meanApogee(t) + lilOffset + 360) % 360 : longitudeAt(b, t);

  const out: TimelineEvent[] = [];
  const t0 = args.from.getTime(), t1 = t0 + args.days * 86400e3;
  for (const body of args.bodies) {
    const step = stepHours(body) * 3600e3, orb = orbOf(body);
    const samples: { t: number; lon: number }[] = [];
    for (let t = t0; t <= t1 + step; t += step) {
      const l = lonOf(body, new Date(t));
      if (l === null) { samples.length = 0; break; }
      samples.push({ t, lon: l });
    }
    if (!samples.length) continue;
    for (const side of ["personality", "design"] as const) {
      for (const angle of ["ASC", "DSC", "MC", "IC"] as const) {
        const A = angles[side][angle];
        let cur: TimelineEvent | null = null;
        for (let i = 0; i < samples.length; i++) {
          const s = samples[i], dd = wrap180(s.lon - A), inside = Math.abs(dd) <= orb;
          const prev = i ? samples[i - 1] : null, pd = prev ? wrap180(prev.lon - A) : dd;
          const at = (a: number, b: number, va: number, vb: number, target: number) =>
            new Date(a + ((target - va) / (vb - va)) * (b - a)).toISOString();
          if (inside && !cur) {
            cur = { side, angle, body, exact: [], end: null,
              start: prev ? at(prev.t, s.t, Math.abs(pd), Math.abs(dd), orb) : null };
          }
          if (cur && prev && Math.sign(dd) !== Math.sign(pd) && Math.abs(dd - pd) < 90) {
            cur.exact.push(at(prev.t, s.t, pd, dd, 0));
          }
          if (!inside && cur) {
            cur.end = prev ? at(prev.t, s.t, Math.abs(pd), Math.abs(dd), orb) : null;
            out.push(cur); cur = null;
          }
          if (s.t > t1) break;
        }
        if (cur) out.push(cur);
      }
    }
  }
  const key = (e: TimelineEvent) => e.start ?? e.exact[0] ?? args.from.toISOString();
  return out.filter((e) => (e.start ?? args.from.toISOString()) <= new Date(t1).toISOString())
    .sort((a, b) => key(a).localeCompare(key(b)));
}
