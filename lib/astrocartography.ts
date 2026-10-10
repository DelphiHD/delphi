/**
 * Where on Earth each body was angular at one instant.
 *
 * A UTC instant in, each body's four lines out as [longitude, latitude]
 * arrays. No network, no rendering. See docs/ASTROCARTOGRAPHY_PLAN.md.
 *
 * Lines are drawn in mundo, from the body's real right ascension and
 * declination, the way Jim Lewis drew them. Points that sit on the ecliptic by
 * definition (the nodes, and Earth as the far end of the Sun's axis) are
 * converted from ecliptic longitude with latitude zero.
 *
 * MC and IC are meridians: the longitude where the body's right ascension
 * equals local sidereal time, and the one opposite. Ascendant and Descendant
 * are curves: the body is on the horizon where cos H = -tan(lat) tan(dec).
 * Past latitude 90 - |dec| the body never rises or never sets, so those curves
 * stop there. They are never closed across the gap.
 *
 * A paran is two bodies angular at once. Where one body's line crosses
 * another's, both are angular at that spot; and because the whole sky turns
 * past every place on that latitude once a day, everywhere along the latitude
 * gets the same pair angular together at some moment of the day. So a paran is
 * drawn as a latitude, and carries the crossing it came from.
 */

import {
  Body, GeoVector, GeoMoon, RotateVector, Rotation_EQJ_EQD, EquatorFromVector,
  SiderealTime, MakeTime, e_tilt,
} from "astronomy-engine";
import { longitudeAt } from "@/lib/hd/ephemeris";

export type Angle = "MC" | "IC" | "ASC" | "DSC";
export type LonLat = [number, number];

export interface BodyLines {
  body: string;
  ra: number;   // degrees
  dec: number;  // degrees
  /** Each angle's line, split into runs wherever it crosses the 180 meridian. */
  lines: Record<Angle, LonLat[][]>;
}

/** The thirteen Human Design bodies, in the chart's order. */
export const HD_BODIES = [
  "Sun", "Earth", "North Node", "South Node", "Moon", "Mercury", "Venus",
  "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
] as const;

const BODY: Record<string, Body> = {
  Sun: Body.Sun, Mercury: Body.Mercury, Venus: Body.Venus, Mars: Body.Mars,
  Jupiter: Body.Jupiter, Saturn: Body.Saturn, Uranus: Body.Uranus,
  Neptune: Body.Neptune, Pluto: Body.Pluto,
};

const RAD = Math.PI / 180;
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Geocentric right ascension and declination of date, in degrees. */
export function equatorial(body: string, when: Date): { ra: number; dec: number } {
  const t = MakeTime(when);
  if (body === "Moon" || BODY[body] !== undefined) {
    const eqj = body === "Moon" ? GeoMoon(t) : GeoVector(BODY[body], t, true);
    const eq = EquatorFromVector(RotateVector(Rotation_EQJ_EQD(t), eqj));
    return { ra: eq.ra * 15, dec: eq.dec };
  }
  // On the ecliptic by definition: convert longitude with latitude zero.
  const lon = longitudeAt(body, when);
  if (lon === null) throw new Error(`astrocartography: no position for ${body}`);
  const eps = e_tilt(t).tobl * RAD;
  const l = lon * RAD;
  const ra = Math.atan2(Math.sin(l) * Math.cos(eps), Math.cos(l)) / RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(l)) / RAD;
  return { ra: (ra + 360) % 360, dec };
}

/** Split a run of points wherever it jumps across the 180 meridian. */
function splitAtDateline(points: LonLat[]): LonLat[][] {
  const runs: LonLat[][] = [];
  let run: LonLat[] = [];
  for (const p of points) {
    if (run.length && Math.abs(p[0] - run[run.length - 1][0]) > 180) {
      runs.push(run);
      run = [];
    }
    run.push(p);
  }
  if (run.length) runs.push(run);
  return runs;
}

/** Latitudes the curves are sampled at. Finer near the poles, where they bend. */
const LATS: number[] = (() => {
  const out: number[] = [];
  for (let lat = -85; lat <= 85; lat += 0.5) out.push(lat);
  return out;
})();

/** The horizon curves before they are split, sampled at LATS, for crossings. */
function horizonCurves(mc: number, dec: number): { ASC: LonLat[]; DSC: LonLat[] } {
  const ASC: LonLat[] = [];
  const DSC: LonLat[] = [];
  const tanDec = Math.tan(dec * RAD);
  // The two curves meet at 90 - |dec|, north and south, where the body just
  // grazes the horizon. Longitude races there, so half-degree steps stopped
  // well short and left a gap between a body's ASC and DSC (Kaycee, 10
  // October). Sample in close to each limit and end exactly on it.
  const limit = 90 - Math.abs(dec);
  const lats = LATS.filter((lat) => Math.abs(lat) < limit);
  if (limit <= 85) {
    for (const d of [0.25, 0.1, 0.04, 0.01, 0.002, 0]) lats.push(limit - d, -(limit - d));
  }
  lats.sort((a, b) => a - b);
  for (const lat of lats) {
    const c = Math.max(-1, Math.min(1, -Math.tan(lat * RAD) * tanDec));
    const h0 = Math.acos(c) / RAD;
    ASC.push([wrap180(mc - h0), lat]);
    DSC.push([wrap180(mc + h0), lat]);
  }
  return { ASC, DSC };
}

export function linesFor(body: string, when: Date): BodyLines {
  const { ra, dec } = equatorial(body, when);
  const gast = SiderealTime(MakeTime(when)) * 15;
  const mc = wrap180(ra - gast);
  const ic = wrap180(mc + 180);

  const { ASC: asc, DSC: dsc } = horizonCurves(mc, dec);

  return {
    body, ra, dec,
    lines: {
      MC: [[[mc, -85], [mc, 85]]],
      IC: [[[ic, -85], [ic, 85]]],
      ASC: splitAtDateline(asc),
      DSC: splitAtDateline(dsc),
    },
  };
}

export function mapFor(when: Date, bodies: readonly string[] = HD_BODIES): BodyLines[] {
  return bodies.map((b) => linesFor(b, when));
}

export interface Paran {
  a: string; angleA: Angle;
  b: string; angleB: Angle;
  /** The latitude the paran runs along, and the crossing it came from. */
  lat: number;
  lon: number;
}

/** Two ends of one axis are angular together everywhere, which is no paran. */
const SAME_AXIS = new Set(["Sun|Earth", "Earth|Sun", "North Node|South Node", "South Node|North Node"]);

/** Where a horizon curve passes a given longitude. */
function curveAtLongitude(curve: LonLat[], lon: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const d0 = wrap180(curve[i - 1][0] - lon);
    const d1 = wrap180(curve[i][0] - lon);
    if (Math.abs(d0 - d1) > 180 || Math.sign(d0) === Math.sign(d1)) continue;
    const t = d0 / (d0 - d1);
    out.push(curve[i - 1][1] + t * (curve[i][1] - curve[i - 1][1]));
  }
  return out;
}

/** Where two horizon curves, sampled at the same latitudes, cross. */
function curvesCross(p: LonLat[], q: LonLat[]): LonLat[] {
  const qAt = new Map(q.map(([lon, lat]) => [lat, lon]));
  const out: LonLat[] = [];
  let prev: { d: number; lat: number; lon: number } | null = null;
  for (const [lon, lat] of p) {
    const qLon = qAt.get(lat);
    if (qLon === undefined) { prev = null; continue; }
    const d = wrap180(lon - qLon);
    if (prev && Math.sign(d) !== Math.sign(prev.d) && Math.abs(d - prev.d) < 90) {
      const t = prev.d / (prev.d - d);
      out.push([wrap180(prev.lon + t * wrap180(lon - prev.lon)), prev.lat + t * (lat - prev.lat)]);
    }
    prev = { d, lat, lon };
  }
  return out;
}

/** Every paran among these bodies at one instant. */
export function paransFor(when: Date, bodies: readonly string[] = HD_BODIES): Paran[] {
  const gast = SiderealTime(MakeTime(when)) * 15;
  const sky = bodies.map((body) => {
    const { ra, dec } = equatorial(body, when);
    const mc = wrap180(ra - gast);
    return { body, MC: mc, IC: wrap180(mc + 180), ...horizonCurves(mc, dec) };
  });
  const out: Paran[] = [];
  for (let i = 0; i < sky.length; i++) {
    for (let j = 0; j < sky.length; j++) {
      if (i === j) continue;
      const A = sky[i], B = sky[j];
      if (SAME_AXIS.has(`${A.body}|${B.body}`)) continue;
      // A on a meridian, B on the horizon. Both orders come from the loop.
      for (const angleA of ["MC", "IC"] as const) {
        for (const angleB of ["ASC", "DSC"] as const) {
          for (const lat of curveAtLongitude(B[angleB], A[angleA])) {
            out.push({ a: A.body, angleA, b: B.body, angleB, lat, lon: A[angleA] });
          }
        }
      }
      // Both on the horizon. Once per pair.
      if (j < i) continue;
      for (const angleA of ["ASC", "DSC"] as const) {
        for (const angleB of ["ASC", "DSC"] as const) {
          for (const [lon, lat] of curvesCross(A[angleA], B[angleB])) {
            out.push({ a: A.body, angleA, b: B.body, angleB, lat, lon });
          }
        }
      }
    }
  }
  return out;
}
