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

export function linesFor(body: string, when: Date): BodyLines {
  const { ra, dec } = equatorial(body, when);
  const gast = SiderealTime(MakeTime(when)) * 15;
  const mc = wrap180(ra - gast);
  const ic = wrap180(mc + 180);

  const asc: LonLat[] = [];
  const dsc: LonLat[] = [];
  const tanDec = Math.tan(dec * RAD);
  for (const lat of LATS) {
    const c = -Math.tan(lat * RAD) * tanDec;
    if (c < -1 || c > 1) continue;   // circumpolar or never up: no horizon crossing
    const h0 = Math.acos(c) / RAD;
    asc.push([wrap180(mc - h0), lat]);
    dsc.push([wrap180(mc + h0), lat]);
  }

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
