/**
 * What a chart carries for The World, its astro-cartography view.
 *
 * Small on purpose. A chart page is already about 3 MB and is streamed through
 * a function with a response limit near 4.5 MB, so the page does not carry its
 * lines point by point. It carries where each body was in the sky (right
 * ascension and declination) and the sidereal time, for each side, and the page
 * draws the lines and parans from those with the same geometry as
 * lib/astrocartography.ts. The world itself (coast, borders, cities) is one
 * shared file, public/world/world-v1.json, fetched once and cached.
 *
 * Positions: astronomy-engine for the planets, NASA Horizons for Chiron, and
 * Lilith from the provider's own longitude. See docs/DECISIONS.md, 2026-10-10.
 */
import { SiderealTime, MakeTime } from "astronomy-engine";
import { equatorial, lilithEquatorial, HD_BODIES } from "@/lib/astrocartography";
import { chironEquatorial } from "@/lib/horizons";
import { gateLineFromLongitude } from "@/lib/hd/gate-longitude";
import { ZODIAC, houseOf } from "@/lib/astro-extras";
import type { AstroChart } from "@/lib/astro";

/** The bodies The World draws: the thirteen, then Chiron and Lilith. */
export const WORLD_BODIES = [...HD_BODIES, "Chiron", "Lilith"] as const;

export type Side = "personality" | "design";

export interface WorldData {
  v: 1;
  person: string;
  /** The birth as the person knows it: local date and clock, and the place. */
  born: { date: string; time: string; place: string };
  /** Birthplace, [lon, lat]. */
  birth: [number, number];
  /** UTC instants of each side, for the relocated chart and the corners. */
  cast: { place: string; p: string; d: string };
  /** Each side's sky: Greenwich apparent sidereal time and every body, degrees. */
  sky: Record<Side, { gast: number; bodies: Record<string, { ra: number; dec: number }> }>;
  /** Sign and degree per body, from the provider, as the Astrology view reads them. */
  where: Record<Side, Record<string, string>>;
  /** Natal angles (with their gates) and houses, for the relocated chart. */
  natal: Record<Side, {
    house: Record<string, number>;
    angles: Record<"ASC" | "DSC" | "MC" | "IC", { text: string; gate: number; line: number }>;
  }>;
  /** Gate.line per planet per side, from the chart's own activations. */
  gateOf: Record<Side, Record<string, string>>;
  /** Her Delphi Basic for each planet. */
  basic: Record<string, string>;
}

const deg = (v: number) => {
  let d = Math.floor(v), m = Math.round((v - d) * 60);
  if (m === 60) { d += 1; m = 0; }
  return `${d}°${m < 10 ? "0" : ""}${m}'`;
};
const signDeg = (v: number) => { const w = ((v % 360) + 360) % 360; return `${ZODIAC[Math.floor(w / 30)]} ${deg(w % 30)}`; };
const HOUSE: Record<string, number> = { First: 1, Second: 2, Third: 3, Fourth: 4, Fifth: 5, Sixth: 6,
  Seventh: 7, Eighth: 8, Ninth: 9, Tenth: 10, Eleventh: 11, Twelfth: 12 };

export async function buildWorldData(args: {
  person: string;
  born: { date: string; time: string; place: string };
  birthplace: { lat: number; lon: number };
  utc: string;
  designUtc: string;
  astro: Record<Side, AstroChart>;
  activations: Record<Side, readonly { planet: string; gate: number; line: number }[]>;
  basic: Record<string, string>;
}): Promise<WorldData> {
  const r3 = (n: number) => Math.round(n * 1e4) / 1e4;
  const sky = {} as WorldData["sky"];
  const where = {} as WorldData["where"];
  const natal = {} as WorldData["natal"];
  for (const side of ["personality", "design"] as const) {
    const when = new Date(side === "design" ? args.designUtc : args.utc);
    const astro = args.astro[side];
    const lil = astro.planets.find((p) => p.name === "Mean_Lilith");
    if (!lil) throw new Error(`The World: no ${side} Lilith from the provider`);
    const L = lilithEquatorial(lil.abs_pos, when);
    const given = { Chiron: await chironEquatorial(when), Lilith: { ra: L.ra, dec: L.dec } };
    const bodies: Record<string, { ra: number; dec: number }> = {};
    for (const b of WORLD_BODIES) {
      const e = equatorial(b, when, given);
      bodies[b] = { ra: r3(e.ra), dec: r3(e.dec) };
    }
    sky[side] = { gast: r3(SiderealTime(MakeTime(when)) * 15), bodies };

    where[side] = {};
    for (const p of astro.planets) where[side][p.label] = `${p.sign} ${deg(p.position)}`;
    const sun = astro.planets.find((p) => p.label === "Sun");
    if (sun) where[side].Earth = signDeg(sun.abs_pos + 180);
    for (const b of HD_BODIES) if (!where[side][b]) throw new Error(`The World: no ${side} position for ${b}`);

    const house: Record<string, number> = {};
    for (const p of astro.planets) house[p.label] = HOUSE[String(p.house).split("_")[0]] ?? 0;
    if (sun) house.Earth = houseOf((sun.abs_pos + 180) % 360, astro.houses.map((h) => h.abs_pos));
    const ang = (v: number) => { const w = ((v % 360) + 360) % 360; const g = gateLineFromLongitude(w); return { text: signDeg(w), gate: g.gate, line: g.line }; };
    natal[side] = { house, angles: { ASC: ang(astro.ascendant), DSC: ang(astro.ascendant + 180), MC: ang(astro.mc), IC: ang(astro.mc + 180) } };
  }
  const gateOf = {} as WorldData["gateOf"];
  for (const side of ["personality", "design"] as const) {
    gateOf[side] = Object.fromEntries(args.activations[side].map((a) => [a.planet, `${a.gate}.${a.line}`]));
  }
  return {
    v: 1, person: args.person, born: args.born,
    birth: [r3(args.birthplace.lon), r3(args.birthplace.lat)],
    cast: { place: args.born.place, p: args.utc, d: args.designUtc },
    sky, where, natal, gateOf, basic: args.basic,
  };
}
