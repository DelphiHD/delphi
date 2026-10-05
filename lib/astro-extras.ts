/**
 * The astrology the provider does not send.
 *
 * bodygraphchart returns zodiac longitude, signs, houses and the aspects
 * inside one chart. Everything here is what Kaycee asked the section to show
 * on top of that, 2026-10-05: rulerships, dignity, combustion on the Vedic
 * limits, retrograde, the aspects between two charts, and the house systems
 * that can be derived without asking the provider again.
 *
 * It is kept apart from lib/astro.ts on purpose. That file fetches; this one
 * only computes, from numbers already in hand, so none of it costs a call and
 * all of it can be tested without the network.
 */

import { longitudeAt } from "@/lib/hd/ephemeris";

export const ZODIAC = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;
export type SignName = (typeof ZODIAC)[number];

/**
 * Who rules what. Kaycee's own table, 2026-10-05, modern with the traditional
 * ruler in parentheses where they differ:
 *
 *   Sun Leo 5 · Moon Cancer 4 · Mercury Gemini and Virgo 3 and 6
 *   Mars Aries (Scorpio) 1 · Venus Taurus and Libra 2 and 7
 *   Jupiter Sagittarius (Pisces) 9 · Saturn Capricorn (Aquarius) 10
 *   Uranus Aquarius 11 · Neptune Pisces 12 · Pluto Scorpio 8
 */
export const SIGN_RULER: Record<SignName, { modern: string; traditional?: string }> = {
  Aries: { modern: "Mars" },
  Taurus: { modern: "Venus" },
  Gemini: { modern: "Mercury" },
  Cancer: { modern: "Moon" },
  Leo: { modern: "Sun" },
  Virgo: { modern: "Mercury" },
  Libra: { modern: "Venus" },
  Scorpio: { modern: "Pluto", traditional: "Mars" },
  Sagittarius: { modern: "Jupiter" },
  Capricorn: { modern: "Saturn" },
  Aquarius: { modern: "Uranus", traditional: "Saturn" },
  Pisces: { modern: "Neptune", traditional: "Jupiter" },
};

/** The natural ruler of a house number, which is the ruler of its own sign. */
export const HOUSE_RULER: Record<number, { modern: string; traditional?: string }> =
  Object.fromEntries(ZODIAC.map((s, i) => [i + 1, SIGN_RULER[s]]));

/** "Mars (Pluto)" or just "Mars", for a label. */
export function rulerLabel(r: { modern: string; traditional?: string }): string {
  return r.traditional ? `${r.modern} (${r.traditional})` : r.modern;
}

/** Every sign a planet rules, modern scheme, for dignity. */
const DOMICILE: Record<string, SignName[]> = (() => {
  const out: Record<string, SignName[]> = {};
  for (const s of ZODIAC) (out[SIGN_RULER[s].modern] ??= []).push(s);
  return out;
})();

const OPPOSITE = (s: SignName): SignName => ZODIAC[(ZODIAC.indexOf(s) + 6) % 12];

/**
 * Where a planet stands in its own scheme. Domicile is its own sign, detriment
 * the sign opposite. Exaltation and fall are a separate tradition and are not
 * claimed here, because Kaycee did not ask for them.
 */
export function dignityOf(planet: string, sign: string): "domicile" | "detriment" | null {
  const own = DOMICILE[planet];
  if (!own) return null;
  if (own.includes(sign as SignName)) return "domicile";
  if (own.some((s) => OPPOSITE(s) === sign)) return "detriment";
  return null;
}

/**
 * Combustion, on the traditional Vedic limits Kaycee gave, 2026-10-05. Six
 * combustible bodies; the Sun cannot combust itself and the nodes are shadow
 * points. Mercury and Venus tighten when retrograde.
 */
export const COMBUST_LIMIT: Record<string, { direct: number; retrograde?: number }> = {
  Moon: { direct: 12 },
  Mars: { direct: 17 },
  Mercury: { direct: 14, retrograde: 12 },
  Jupiter: { direct: 11 },
  Venus: { direct: 10, retrograde: 8 },
  Saturn: { direct: 15 },
};

/** Her orbs for the aspects between two charts, 2026-10-05. */
export const SYNASTRY_ORBS: Record<string, number> = {
  conjunction: 10, opposition: 10, square: 9, trine: 9, sextile: 6,
};

const ASPECT_ANGLE: Record<string, number> = {
  conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180,
};

/**
 * The short way round between two longitudes, 0 to 180.
 *
 * Written out rather than inlined because the inlined version was wrong on
 * 2026-10-05 and returned the reflex angle whenever the difference came out
 * negative: a true ten degrees read as three hundred and fifty, which would
 * have silently missed a combustion. Kaycee caught it by knowing her own chart
 * ("Isn't my mars much closer to the sun than my mercury"). The extra 540 is
 * what makes a negative remainder behave.
 */
export function separation(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}

const HOUR = 3_600_000;

/**
 * Whether a body's apparent longitude is falling, sampled six hours either
 * side. The provider sends no retrograde flag on either endpoint, so this is
 * ours. The Sun, Moon and Earth are never retrograde; Lilith and the nodes are
 * not in the ephemeris, so they are reported as unknown rather than guessed.
 */
export function retrogradeAt(planet: string, when: Date): boolean | null {
  if (planet === "Sun" || planet === "Moon" || planet === "Earth") return false;
  const a = longitudeAt(planet, new Date(when.getTime() - 6 * HOUR));
  const b = longitudeAt(planet, new Date(when.getTime() + 6 * HOUR));
  if (a === null || b === null) return null;
  return ((((b - a) % 360) + 540) % 360) - 180 < 0;
}

export interface CombustVerdict {
  planet: string;
  separation: number;
  limit: number;
  retrograde: boolean;
  combust: boolean;
}

/** Each combustible body against its own chart's Sun. */
export function combustion(
  planets: { name: string; abs_pos: number }[],
  sunLongitude: number,
  retrograde: Record<string, boolean | null>,
): CombustVerdict[] {
  const out: CombustVerdict[] = [];
  for (const p of planets) {
    const lim = COMBUST_LIMIT[p.name];
    if (!lim) continue;
    const r = retrograde[p.name] === true;
    const limit = r && lim.retrograde ? lim.retrograde : lim.direct;
    const d = separation(p.abs_pos, sunLongitude);
    out.push({ planet: p.name, separation: d, limit, retrograde: r, combust: d <= limit });
  }
  return out;
}

export interface CrossAspect {
  p1_name: string; p2_name: string;
  p1_abs_pos: number; p2_abs_pos: number;
  aspect: string; orbit: number; aspect_degrees: number;
}

/**
 * The aspects between two charts, which is what a synastry is and what the
 * provider never returns: it only aspects within a single chart, which is why
 * the relationship wheel has only ever drawn each person's own.
 */
export function crossAspects(
  a: { name: string; abs_pos: number }[],
  b: { name: string; abs_pos: number }[],
  orbs: Record<string, number> = SYNASTRY_ORBS,
): CrossAspect[] {
  const out: CrossAspect[] = [];
  for (const p of a) {
    for (const q of b) {
      const d = separation(p.abs_pos, q.abs_pos);
      for (const [aspect, angle] of Object.entries(ASPECT_ANGLE)) {
        const allowed = orbs[aspect];
        if (allowed === undefined) continue;
        const orbit = Math.abs(d - angle);
        if (orbit > allowed) continue;
        out.push({
          p1_name: p.name, p2_name: q.name,
          p1_abs_pos: p.abs_pos, p2_abs_pos: q.abs_pos,
          aspect, orbit, aspect_degrees: angle,
        });
      }
    }
  }
  return out.sort((x, y) => x.orbit - y.orbit);
}

/**
 * House cusps the provider does not have to be asked for.
 *
 * Placidus is what it returns and what the chart is built from. These three
 * are exact arithmetic on an Ascendant and Midheaven already in hand, so they
 * switch live on a page that has already been built. Any other system is one
 * more cast at build time.
 */
export type HouseSystem = "placidus" | "whole" | "equal" | "porphyry";

export function cuspsFor(system: HouseSystem, ascendant: number, mc: number): number[] | null {
  const norm = (d: number) => ((d % 360) + 360) % 360;
  if (system === "whole") {
    const start = Math.floor(ascendant / 30) * 30;
    return Array.from({ length: 12 }, (_, i) => norm(start + i * 30));
  }
  if (system === "equal") {
    return Array.from({ length: 12 }, (_, i) => norm(ascendant + i * 30));
  }
  if (system === "porphyry") {
    // Each quadrant between an angle and the next, divided in three.
    const ic = norm(mc + 180), ds = norm(ascendant + 180);
    const arc = (from: number, to: number) => norm(to - from);
    const q1 = arc(ascendant, ic) / 3, q2 = arc(ic, ds) / 3;
    const q3 = arc(ds, mc) / 3, q4 = arc(mc, ascendant) / 3;
    return [
      ascendant, norm(ascendant + q1), norm(ascendant + 2 * q1),
      ic, norm(ic + q2), norm(ic + 2 * q2),
      ds, norm(ds + q3), norm(ds + 2 * q3),
      mc, norm(mc + q4), norm(mc + 2 * q4),
    ];
  }
  return null;   // placidus comes from the provider
}

/** Which house a longitude falls in, given twelve cusps in order. */
export function houseOf(longitude: number, cusps: number[]): number {
  const norm = (d: number) => ((d % 360) + 360) % 360;
  for (let i = 0; i < 12; i++) {
    const from = cusps[i], to = cusps[(i + 1) % 12];
    const span = norm(to - from);
    if (norm(longitude - from) < span) return i + 1;
  }
  return 1;
}

/**
 * The bodies making no major aspect to any other planet.
 *
 * Kaycee, 2026-10-05: "would it also be possible to show unaspected planets in
 * the aspects list?" Unaspected here means none of the five Ptolemaic aspects
 * to another planet. Chiron, Lilith and the nodes neither count as planets nor
 * rescue one from being unaspected, which is the same demotion the panel
 * already applies when it separates core aspects from the rest.
 */
// Earth is here for the Human Design link, not as an astrological planet, and
// its only aspect is the exact opposition to the Sun that defines it. Counting
// it would report it unaspected on every chart, or rescue the Sun on every
// chart, depending which way round you read it. Neither is true.
const NOT_A_PLANET = new Set(["Earth", "Chiron", "Mean_Lilith", "Mean_Node", "True_Node"]);
const MAJOR = new Set(["conjunction", "opposition", "square", "trine", "sextile"]);

export function unaspected(
  planets: { name: string }[],
  aspects: { p1_name: string; p2_name: string; aspect: string }[],
): string[] {
  const touched = new Set<string>();
  for (const a of aspects) {
    if (!MAJOR.has(a.aspect)) continue;
    if (NOT_A_PLANET.has(a.p1_name) || NOT_A_PLANET.has(a.p2_name)) continue;
    touched.add(a.p1_name);
    touched.add(a.p2_name);
  }
  return planets
    .map((p) => p.name)
    .filter((n) => !NOT_A_PLANET.has(n) && !touched.has(n));
}

const ELEMENTS = ["Fire", "Earth", "Air", "Water"];
const QUALITIES = ["Cardinal", "Fixed", "Mutable"];

/** A placement built from a longitude alone, for a body the provider omits. */
export function pointAt(name: string, label: string, longitude: number, cusps: number[]) {
  const norm = ((longitude % 360) + 360) % 360;
  const i = Math.floor(norm / 30) % 12;
  const HOUSE_WORD = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth",
    "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth"];
  return {
    name, label,
    sign: ZODIAC[i], sign_num: i,
    position: norm % 30, abs_pos: norm,
    element: ELEMENTS[i % 4], quality: QUALITIES[i % 3],
    emoji: "", point_type: "Planet",
    house: `${HOUSE_WORD[houseOf(norm, cusps) - 1]}_House`,
  };
}

export interface ChartExtras {
  earth: ReturnType<typeof pointAt> | null;
  retrograde: Record<string, boolean | null>;
  combust: CombustVerdict[];
  dignity: Record<string, "domicile" | "detriment">;
  unaspected: string[];
  cusps: { whole: number[]; equal: number[]; porphyry: number[] };
}

/**
 * Everything the section shows that the provider does not send, for one chart.
 *
 * `earthLongitude` comes from the Human Design data, where Earth is a first
 * class placement with its own gate, line, colour, tone and base. It is not
 * derived from the Sun here: Kaycee, 2026-10-05, "We should have the exact
 * coordinates of the earth placement with the human design data, like all of
 * the others. Why do you think you have to make it up?" She was right.
 */
export function enrichChart(
  chart: {
    planets: { name: string; abs_pos: number; sign: string }[];
    houses: { abs_pos: number }[];
    aspects: { p1_name: string; p2_name: string; aspect: string }[];
    ascendant: number; mc: number;
  },
  when: Date,
  earthLongitude: number | null,
): ChartExtras {
  const cusps = chart.houses.map((h) => h.abs_pos);
  const retrograde: Record<string, boolean | null> = {};
  for (const p of chart.planets) retrograde[p.name] = retrogradeAt(p.name, when);

  const sun = chart.planets.find((p) => p.name === "Sun");
  const dignity: Record<string, "domicile" | "detriment"> = {};
  for (const p of chart.planets) {
    const d = dignityOf(p.name, p.sign);
    if (d) dignity[p.name] = d;
  }

  return {
    earth: earthLongitude === null ? null : pointAt("Earth", "Earth", earthLongitude, cusps),
    retrograde,
    combust: sun ? combustion(chart.planets, sun.abs_pos, retrograde) : [],
    dignity,
    unaspected: unaspected(chart.planets, chart.aspects),
    cusps: {
      whole: cuspsFor("whole", chart.ascendant, chart.mc)!,
      equal: cuspsFor("equal", chart.ascendant, chart.mc)!,
      porphyry: cuspsFor("porphyry", chart.ascendant, chart.mc)!,
    },
  };
}
