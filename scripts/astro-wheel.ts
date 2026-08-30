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
import { getAstro, type AstroChart, type AstroPoint } from "../lib/astro";
import { GATE_RANGES } from "../lib/hd/gate-longitude";
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
/** The 64 gates ride outside the zodiac, on the same wheel and the same
 *  longitudes: the Rave mandala and the zodiac are one circle, anchored at
 *  Gate 41 line 1 = 2 Aquarius = 302 degrees. */
const R_GATE = 348, R_GATE_IN = 316;
const R_OUT = 310, R_SIGN = 272, R_TICK = 262, R_PLANET = 244, R_HOUSE = 214, R_ASPECT = 168;
/** Design planets sit just inside the personality ring, on the same zodiac. */
const R_DESIGN = 200;

/**
 * Screen angle for a zodiac longitude.
 *
 * Two anchors. ASCENDANT puts the rising degree on the left, the convention for
 * a single natal chart, where the houses want to sit in their familiar places.
 * ARIES fixes 0 Aries at the top, so the zodiac never moves: the same degree is
 * always the same place on screen. That is what makes two sets of planets on one
 * wheel comparable, which is why it suits the personality-and-design overlay and
 * will suit a two-person composite. It also matches the HD mandala, which is
 * likewise fixed.
 */
export type WheelAnchor = "ascendant" | "aries";
let ANCHOR: WheelAnchor = "aries";

function pt(lon: number, asc: number, r: number): [number, number] {
  const deg = ANCHOR === "aries" ? 90 + lon : 180 + (lon - asc);
  const a = (deg * Math.PI) / 180;
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

export function renderWheel(chart: AstroChart, name: string, design?: AstroChart | null,
  anchor: WheelAnchor = "aries", carriedGates: readonly number[] = []): string {
  ANCHOR = anchor;
  const asc = chart.ascendant;
  const s: string[] = [];
  s.push(`<svg viewBox="-54 -118 828 884" width="828" height="884" xmlns="http://www.w3.org/2000/svg" ` +
    `font-family="Montserrat, 'Helvetica Neue', sans-serif">`);
  s.push(`<rect x="-54" y="-118" width="828" height="884" fill="${CREAM}"/>`);

  // The 64 gates, outside the zodiac on the same circle. A gate the chart
  // carries is filled; the rest are outline only, the same convention the
  // bodygraph uses for activated and unactivated gates.
  const carried = new Set(carriedGates);
  for (const g of GATE_RANGES) {
    const on = carried.has(g.gate);
    s.push(`<path class="gateband" data-gate="${g.gate}" d="${arc(g.start, g.end, asc, R_GATE, R_GATE_IN)}" ` +
      `fill="${on ? PURPLE : "none"}" fill-opacity="${on ? 0.16 : 0}" ` +
      `stroke="${INK}" stroke-width="0.5" stroke-opacity=".35"/>`);
    // Gate 25 runs 358.25 to 3.875, the only gate that crosses 0 Aries.
    // Averaging its ends puts the midpoint on the far side of the wheel, which
    // left its number missing from the ring and drew its band inside out.
    const span = ((g.end - g.start) % 360 + 360) % 360;
    const mid = (g.start + span / 2) % 360;
    const [gx, gy] = pt(mid, asc, (R_GATE + R_GATE_IN) / 2);
    s.push(`<text class="gateband" data-gate="${g.gate}" x="${f(gx)}" y="${f(gy + 4)}" ` +
      `text-anchor="middle" font-size="11" font-weight="${on ? 600 : 400}" ` +
      `fill="${INK}" opacity="${on ? 0.95 : 0.4}">${g.gate}</text>`);
  }

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
    s.push(`<path class="signband" data-asign="${SIGNS[i]}" data-signi="${i}" ` +
      `d="${arc(start, end, asc, R_OUT, R_SIGN)}" ` +
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
  // Crowded glyphs are staggered INWARD, never sideways. Moving a planet round
  // the wheel to make room changes the one thing the wheel asserts: Kaycee's Sun
  // sits at 85.76, inside gate 12, and a 3 degree nudge to clear the North Node
  // put it visually inside gate 15. With a gate ring outside the zodiac, an
  // angular nudge is the chart telling a lie. Radius is free; angle is not.
  const placed: { lon: number; ring: number }[] = [];
  for (const p of [...chart.planets].sort((a, b) => a.abs_pos - b.abs_pos)) {
    const lon = p.abs_pos;
    let ring = 0;
    while (placed.some((q) => q.ring === ring &&
      Math.abs(((lon - q.lon + 540) % 360) - 180) < 6)) ring++;
    placed.push({ lon, ring });
    const [x, y] = pt(lon, asc, R_PLANET - ring * 21);
    const [tx, ty] = pt(lon, asc, R_PLANET - ring * 21 - 13);
    s.push(`<text class="pglyph pside" data-aplanet="${p.name}" data-side="personality" x="${f(x)}" y="${f(y + 8)}" ` +
      `text-anchor="middle" font-size="21" fill="${INK}">` +
      `${GLYPH[p.name] ?? p.name.slice(0, 2)}</text>`);
    // The degree lives in the hover, not on the face. Twenty-six glyphs plus
    // twenty-six numbers is more ink than the wheel can carry, and the number is
    // the thing you want when you ask about one planet, not while reading all
    // of them at once.
    void tx; void ty;
  }

  // The design side: the same person 88 degrees of solar arc earlier. Only its
  // planets come across. Its own houses and angles belong to a horizon this
  // wheel is not drawn on, exactly as in a synastry bi-wheel where the second
  // chart contributes planets and nothing else.
  if (design) {
    const placedD: { lon: number; ring: number }[] = [];
    for (const p of [...design.planets].sort((a, b) => a.abs_pos - b.abs_pos)) {
      const lon = p.abs_pos;
      let ring = 0;
      while (placedD.some((q) => q.ring === ring &&
        Math.abs(((lon - q.lon + 540) % 360) - 180) < 6)) ring++;
      placedD.push({ lon, ring });
      const [x, y] = pt(lon, asc, R_DESIGN - ring * 19);
      const [tx, ty] = pt(lon, asc, R_DESIGN - ring * 20 - 12);
      s.push(`<text class="pglyph dside" data-aplanet="${p.name}" data-side="design" ` +
        `x="${f(x)}" y="${f(y + 7)}" text-anchor="middle" font-size="19" fill="${DESIGN}">` +
        `${GLYPH[p.name] ?? p.name.slice(0, 2)}</text>`);
      // no degree label on the design ring: with 26 glyphs on two rings the
      // numbers collide into noise. The hover carries the exact degree.
      void tx; void ty;
    }
  }

  // One radial line per planet. A planet's gate, its sign and its house all sit
  // at the same angle, so the line that joins them is a spoke: it leaves the
  // gate ring, crosses the zodiac, passes the house band, and ends at the
  // aspect circle. Drawn once and revealed on demand rather than built on click.
  const spokeFor = (list: AstroPoint[], side: string) => {
    for (const p of list) {
      const [x1, y1] = pt(p.abs_pos, asc, R_GATE);
      const [x2, y2] = pt(p.abs_pos, asc, R_ASPECT);
      s.push(`<line class="spoke" data-spoke="${side}:${p.name}" ` +
        `x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" ` +
        `stroke="${side === "design" ? DESIGN : PURPLE}" stroke-width="2" ` +
        `stroke-linecap="round" opacity="0"/>`);
    }
  };
  spokeFor(chart.planets, "personality");
  if (design) spokeFor(design.planets, "design");

  // the angles
  const angles: [string, number][] = [["As", asc], ["Ds", asc + 180], ["Mc", chart.mc], ["Ic", chart.mc + 180]];
  for (const [label, lon] of angles) {
    // outside the gate ring, not tucked underneath it
    const [x, y] = pt(lon, asc, R_GATE + 20);
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
