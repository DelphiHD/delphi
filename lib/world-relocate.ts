/**
 * The relocated chart: the birth moment, both sides, cast at another place.
 *
 * The planets do not move; the angles and houses are the new place's. Cast by
 * the provider for the birth instant at the new coordinates (getAstro with
 * coords), drawn with the Astrology view's own renderWheel. Used by
 * /api/relocate on the site and by the local preview server, so the two can
 * never disagree. See docs/ASTROCARTOGRAPHY_PLAN.md.
 */
import { getAstro, type AstroChart } from "@/lib/astro";
import { houseOf, ZODIAC } from "@/lib/astro-extras";
import { gateLineFromLongitude } from "@/lib/hd/gate-longitude";
import { renderWheel } from "@/scripts/astro-wheel";

export async function relocate(args: {
  /** The birthplace, for the provider's timezone lookup; coords override it. */
  place: string;
  utc: string;
  designUtc: string;
  lat: number;
  lon: number;
  wheels: boolean;
  name: string;
  /** Where it is cast, for the wheel corners. */
  at: string;
  personalityGates: readonly number[];
  designGates: readonly number[];
}) {
  const coords = { lat: args.lat, lon: args.lon };
  const cast = (atUtc: string) => getAstro({ birthDate: "", birthTime: "", place: args.place, atUtc, coords });
  const [p, d] = await Promise.all([cast(args.utc), cast(args.designUtc)]);
  const HOUSE: Record<string, number> = { First: 1, Second: 2, Third: 3, Fourth: 4, Fifth: 5, Sixth: 6,
    Seventh: 7, Eighth: 8, Ninth: 9, Tenth: 10, Eleventh: 11, Twelfth: 12 };
  const sum = (a: AstroChart) => {
    const cusps = a.houses.map((h) => h.abs_pos);
    const out: Record<string, number> = {};
    for (const pl of a.planets) out[pl.label] = HOUSE[String(pl.house).split("_")[0]] ?? 0;
    // Earth is the far end of the Sun's axis; the provider does not name it.
    const sun = a.planets.find((x) => x.label === "Sun");
    if (sun) out.Earth = houseOf((sun.abs_pos + 180) % 360, cusps);
    const at = (v: number) => ({ sign: ZODIAC[Math.floor(v / 30)], deg: v % 30 });
    // What a hover on the relocated wheel reads, by the name the wheel tags
    // each glyph with. Earth is placed opposite the Sun, as on the natal.
    const planets: Record<string, { label: string; sign: string; deg: number; element: string; quality: string; house: number }> = {};
    for (const pl of a.planets) planets[pl.name] = { label: pl.label, sign: pl.sign, deg: pl.position,
      element: pl.element, quality: pl.quality, house: out[pl.label] ?? 0 };
    if (sun) {
      const e = (sun.abs_pos + 180) % 360;
      const sign = ZODIAC[Math.floor(e / 30)];
      planets.Earth = { label: "Earth", sign, deg: e % 30,
        element: a.signs[sign]?.element ?? "", quality: a.signs[sign]?.quality ?? "", house: out.Earth };
    }
    // Each relocated angle falls in a gate on the mandala, the way a planet
    // does. Kaycee, 10 October, liked seeing which gates rise at a place.
    const angle = (v: number) => { const g = gateLineFromLongitude(((v % 360) + 360) % 360); return { ...at(((v % 360) + 360) % 360), gate: g.gate, line: g.line }; };
    const angles = { ASC: angle(a.ascendant), DSC: angle(a.ascendant + 180), MC: angle(a.mc), IC: angle(a.mc + 180) };
    return { asc: at(a.ascendant), mc: at(a.mc), house: out, planets, angles };
  };
  if (!args.wheels) return { personality: sum(p), design: sum(d) };
  // Three wheels, as the chart draws them. Each side on its OWN relocated
  // horizon, because a design chart carries its own ascendant and houses
  // (Kaycee, 2026-10-08), and both together on the personality horizon,
  // the way the Astrology view shows a natal chart. Kaycee, 10 October: "I
  // would like to be able to see the astrological chart for both the
  // design and personality sides." Corners say when and where each was
  // cast: the birth instant in UTC, since the local clock is another
  // place's, and the place it was cast for.
  const pG = [...new Set(args.personalityGates)], dG = [...new Set(args.designGates)], all = [...new Set([...pG, ...dG])];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"];
  const when = (utc: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(utc);
    if (!m) return utc;
    const h = Number(m[4]);
    return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]} \u00b7 ${h % 12 === 0 ? 12 : h % 12}:${m[5]} ${h < 12 ? "AM" : "PM"} UTC`;
  };
  const at = args.at;
  const pWhen = [when(args.utc), at], dWhen = [when(args.designUtc), at];
  const name = args.name;
  const svg = {
    personality: renderWheel(p, name, null, "ascendant", pG, pG, [], null, undefined, null, null,
      "personality", null, null, null, false, [pWhen]),
    design: renderWheel(d, name, null, "ascendant", dG, [], dG, null, undefined, null, null,
      "design", null, null, null, false, [dWhen]),
    both: renderWheel(p, name, d, "ascendant", all, pG, dG, null, undefined, null, null,
      "personality", null, null, null, false, [pWhen, dWhen]),
  };
  return { personality: sum(p), design: sum(d), svg };
}
