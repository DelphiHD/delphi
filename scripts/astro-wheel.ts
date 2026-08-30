/**
 * A Delphi natal wheel, drawn from the astrology endpoint's numbers.
 *
 * The provider returns its own wheel, but every glyph and number in it is a
 * vector path rather than text, so its typography cannot be changed and it
 * reads heavier than the rest of the brand. Drawing from the raw longitudes
 * costs nothing extra (same API call) and gives Montserrat and the real purple.
 *
 *   npx tsx scripts/astro-wheel.ts <slug>
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);
import { mkdirSync, writeFileSync } from "node:fs";
import { getAstro, type AstroChart } from "../lib/astro";
import { CLIENTS, clientFromSlug, placeForLookup } from "./client-roster";

const PURPLE = "#845095";
const INK = "#2f2a33";
const CREAM = "#fdfcfd";

// Two purples and two greys, the way the four elements read on the design page.
const ELEMENT: Record<string, string> = {
  Fire: PURPLE, Water: "#c9a7d4", Earth: "#9b9aa0", Air: "#5f5a66",
};
const HARD = new Set(["opposition", "square"]);
const SOFT = new Set(["trine", "sextile"]);
const MAJOR = new Set(["opposition", "square", "trine", "sextile"]);
/** Real points, but not what a classic wheel draws aspect lines to. */
const MINOR_POINT = new Set(["Chiron", "Mean_Lilith", "Mean_Node", "True_Node"]);

const GLYPH: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
  True_Node: "☊", Mean_Node: "☋", Mean_Lilith: "⚸", Chiron: "⚷",
};

const DESIGN = "#e06666";   // the same red the bodygraph uses for the design side

const CX = 360, CY = 360;
const R_OUT = 330, R_SIGN = 288, R_TICK = 278, R_PLANET = 252, R_HOUSE = 232, R_ASPECT = 178;
/** Design planets sit just inside the personality ring, on the same zodiac. */
const R_DESIGN = 208;

/** Screen angle for a zodiac longitude: Ascendant on the left, signs counterclockwise. */
function pt(lon: number, asc: number, r: number): [number, number] {
  const a = ((180 + (lon - asc)) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}
const f = (n: number) => Math.round(n * 100) / 100;

function arc(from: number, to: number, asc: number, rOuter: number, rInner: number): string {
  const [x1, y1] = pt(from, asc, rOuter), [x2, y2] = pt(to, asc, rOuter);
  const [x3, y3] = pt(to, asc, rInner), [x4, y4] = pt(from, asc, rInner);
  const big = ((to - from + 360) % 360) > 180 ? 1 : 0;
  return `M${f(x1)} ${f(y1)}A${rOuter} ${rOuter} 0 ${big} 0 ${f(x2)} ${f(y2)}` +
    `L${f(x3)} ${f(y3)}A${rInner} ${rInner} 0 ${big} 1 ${f(x4)} ${f(y4)}Z`;
}

const degLabel = (pos: number) => {
  const d = Math.floor(pos);
  const m = Math.round((pos - d) * 60);
  return m === 60 ? `${d + 1}°` : `${d}°${String(m).padStart(2, "0")}'`;
};

export function renderWheel(chart: AstroChart, name: string, design?: AstroChart | null): string {
  const asc = chart.ascendant;
  const s: string[] = [];
  s.push(`<svg viewBox="0 -66 720 780" width="720" height="780" xmlns="http://www.w3.org/2000/svg" ` +
    `font-family="Montserrat, 'Helvetica Neue', sans-serif">`);
  s.push(`<rect x="0" y="-66" width="720" height="780" fill="${CREAM}"/>`);

  // the twelve signs, coloured by element
  const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  const ELEM_OF = ["Fire", "Earth", "Air", "Water"];
  // U+FE0E, the text variation selector. The zodiac signs default to colour
  // emoji presentation, so without it every sign draws as a filled badge with
  // its own background. The planet symbols are not in the emoji set, which is
  // why they were already coming out as plain text.
  const TEXT = "\uFE0E";
  const GL = ["♈", "♉", "♊", "♋", "♌", "♍",
    "♎", "♏", "♐", "♑", "♒", "♓"].map((g) => g + TEXT);
  for (let i = 0; i < 12; i++) {
    const start = i * 30, end = start + 30;
    s.push(`<path class="signband" data-asign="${SIGNS[i]}" d="${arc(start, end, asc, R_OUT, R_SIGN)}" ` +
      `fill="${ELEMENT[ELEM_OF[i % 4]]}" opacity=".92"/>`);
    const [gx, gy] = pt(start + 15, asc, (R_OUT + R_SIGN) / 2);
    s.push(`<text class="signband" data-asign="${SIGNS[i]}" x="${f(gx)}" y="${f(gy + 7)}" ` +
      `text-anchor="middle" font-size="20" fill="#fff">${GL[i]}</text>`);
  }
  // a tick every degree, longer every five
  for (let d = 0; d < 360; d++) {
    const [x1, y1] = pt(d, asc, R_SIGN);
    const [x2, y2] = pt(d, asc, d % 5 === 0 ? R_TICK - 6 : R_TICK);
    s.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${INK}" ` +
      `stroke-width="${d % 30 === 0 ? 1.4 : 0.4}" opacity="${d % 5 === 0 ? 0.5 : 0.25}"/>`);
  }
  s.push(`<circle cx="${CX}" cy="${CY}" r="${R_SIGN}" fill="none" stroke="${INK}" stroke-width="1" opacity=".5"/>`);
  s.push(`<circle cx="${CX}" cy="${CY}" r="${R_HOUSE}" fill="none" stroke="${INK}" stroke-width="1" opacity=".35"/>`);
  s.push(`<circle cx="${CX}" cy="${CY}" r="${R_ASPECT}" fill="none" stroke="${INK}" stroke-width="1" opacity=".2"/>`);

  // house cusps, numbered in the space between the house ring and the aspect circle
  chart.houses.forEach((h, i) => {
    const angular = i % 3 === 0;
    const [x1, y1] = pt(h.abs_pos, asc, R_SIGN);
    const [x2, y2] = pt(h.abs_pos, asc, R_ASPECT);
    s.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${INK}" ` +
      `stroke-width="${angular ? 1.6 : 0.7}" opacity="${angular ? 0.6 : 0.3}"/>`);
    const next = chart.houses[(i + 1) % 12].abs_pos;
    const mid = h.abs_pos + (((next - h.abs_pos) % 360) + 360) % 360 / 2;
    const [nx, ny] = pt(mid, asc, (R_HOUSE + R_ASPECT) / 2);
    s.push(`<text class="hnum" data-house="${i + 1}" x="${f(nx)}" y="${f(ny + 4)}" ` +
      `text-anchor="middle" font-size="11" fill="${INK}" opacity=".55">${i + 1}</text>`);
  });

  // Aspects, drawn as chords inside. Two things get left out. Conjunctions,
  // because a chord between two points in the same place is a dot. And anything
  // involving a house cusp: the API returns those alongside the planet-to-planet
  // aspects, and drawing "Node opposition First House" as a chord across the
  // wheel says something that isn't true.
  const planetNames = new Set(chart.planets.map((p) => p.name));
  for (const a of chart.aspects) {
    if (a.aspect === "conjunction") continue;
    if (!planetNames.has(a.p1_name) || !planetNames.has(a.p2_name)) continue;
    const colour = HARD.has(a.aspect) ? "#c0603c" : SOFT.has(a.aspect) ? PURPLE : "#b9b6bd";
    // The classic set is the one most charts draw: a major aspect between two
    // traditional planets, held to a six degree orb. Everything else is real and
    // returned by the API, it is just a denser read than most people want on
    // opening, so it is a class the page can switch on rather than a deletion.
    const core = MAJOR.has(a.aspect) && !MINOR_POINT.has(a.p1_name) &&
      !MINOR_POINT.has(a.p2_name) && Math.abs(a.orbit) <= 6;
    const [x1, y1] = pt(a.p1_abs_pos, asc, R_ASPECT);
    const [x2, y2] = pt(a.p2_abs_pos, asc, R_ASPECT);
    s.push(`<line class="asp ${core ? "core" : "extra"}" x1="${f(x1)}" y1="${f(y1)}" ` +
      `x2="${f(x2)}" y2="${f(y2)}" stroke="${colour}" ` +
      `stroke-width="${HARD.has(a.aspect) ? 0.9 : 0.8}" opacity=".5"/>`);
  }

  // planets, nudged apart when they crowd
  const placed: number[] = [];
  for (const p of [...chart.planets].sort((a, b) => a.abs_pos - b.abs_pos)) {
    let lon = p.abs_pos;
    while (placed.some((q) => Math.abs(((lon - q + 540) % 360) - 180) < 6)) lon += 3;
    placed.push(lon);
    const [x, y] = pt(lon, asc, R_PLANET);
    const [tx, ty] = pt(lon, asc, R_PLANET - 26);
    s.push(`<text class="pglyph pside" data-aplanet="${p.name}" data-side="personality" x="${f(x)}" y="${f(y + 8)}" ` +
      `text-anchor="middle" font-size="21" fill="${INK}">` +
      `${GLYPH[p.name] ?? p.name.slice(0, 2)}</text>`);
    s.push(`<text class="pglyph pside" data-aplanet="${p.name}" data-side="personality" x="${f(tx)}" y="${f(ty + 4)}" ` +
      `text-anchor="middle" font-size="9.5" ` +
      `fill="${INK}" opacity=".6" letter-spacing=".02em">${degLabel(p.position)}</text>`);
  }

  // The design side: the same person 88 degrees of solar arc earlier. Only its
  // planets come across. Its own houses and angles belong to a horizon this
  // wheel is not drawn on, exactly as in a synastry bi-wheel where the second
  // chart contributes planets and nothing else.
  if (design) {
    const placedD: number[] = [];
    for (const p of [...design.planets].sort((a, b) => a.abs_pos - b.abs_pos)) {
      let lon = p.abs_pos;
      while (placedD.some((q) => Math.abs(((lon - q + 540) % 360) - 180) < 6)) lon += 3;
      placedD.push(lon);
      const [x, y] = pt(lon, asc, R_DESIGN);
      const [tx, ty] = pt(lon, asc, R_DESIGN - 22);
      s.push(`<text class="pglyph dside" data-aplanet="${p.name}" data-side="design" ` +
        `x="${f(x)}" y="${f(y + 7)}" text-anchor="middle" font-size="19" fill="${DESIGN}">` +
        `${GLYPH[p.name] ?? p.name.slice(0, 2)}</text>`);
      // no degree label on the design ring: with 26 glyphs on two rings the
      // numbers collide into noise. The hover carries the exact degree.
      void tx; void ty;
    }
  }

  // the angles
  const angles: [string, number][] = [["As", asc], ["Ds", asc + 180], ["Mc", chart.mc], ["Ic", chart.mc + 180]];
  for (const [label, lon] of angles) {
    const [x, y] = pt(lon, asc, R_OUT + 16);
    s.push(`<text class="angle" data-angle="${label}" x="${f(x)}" y="${f(y + 4)}" ` +
      `text-anchor="middle" font-size="12" font-weight="600" fill="${PURPLE}" ` +
      `letter-spacing=".06em">${label}</text>`);
  }
  // Nothing in the middle. The chords are the point of the middle, and a label
  // sitting on top of them makes them impossible to follow.
  s.push(`<text x="${CX}" y="-26" text-anchor="middle" font-size="27" font-weight="600" ` +
    `letter-spacing=".02em" fill="${INK}">${name}</text>`);
  s.push("</svg>");
  return s.join("\n");
}

async function main() {
  const slug = process.argv[2] ?? "kaycee";
  const c = clientFromSlug(slug);
  const chart = await getAstro({
    birthDate: c.birthDate, birthTime: c.birthTime, place: placeForLookup(c),
  });
  const svg = renderWheel(chart, c.name);
  mkdirSync(".cache/astro", { recursive: true });
  writeFileSync(`.cache/astro/${c.slug}-wheel.svg`, svg);
  console.log(`  ${c.name}: ${chart.planets.length} planets, ${chart.houses.length} houses, ` +
    `${chart.aspects.length} aspects, Asc ${degLabel(chart.ascendant % 30)} ${chart.houses[0].sign}`);
  console.log(`  .cache/astro/${c.slug}-wheel.svg`);
}
if (process.argv[1]?.includes("astro-wheel")) main();
