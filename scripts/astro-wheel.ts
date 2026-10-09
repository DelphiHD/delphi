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
// White, matching the page. The old off-white carried a pink cast that read as
// a different background from every other view.
const CREAM = "#ffffff";

// Two purples and two greys, the way the four elements read on the design page.
const ELEMENT: Record<string, string> = {
  Fire: PURPLE, Water: "#c9a7d4", Earth: "#9b9aa0", Air: "#5f5a66",
};
const HARD = new Set(["opposition", "square"]);
const SOFT = new Set(["trine", "sextile"]);
const MAJOR = new Set(["opposition", "square", "trine", "sextile"]);
/** Real points, but not what a classic wheel draws aspect lines to. */
const MINOR_POINT = new Set(["Chiron", "Mean_Lilith", "Mean_Node", "True_Node"]);

export const GLYPH: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "⛢", Neptune: "♆", Pluto: "♇",
  True_Node: "☊", Mean_Node: "☋", Mean_Lilith: "⚸", Chiron: "⚷",
  // Earth belongs on an astrology wheel here because the Human Design side
  // of the chart reads it as a placement in its own right. Without this it
  // fell through to the two-letter fallback and the wheel said "Ea".
  Earth: "⊕",
};

const DESIGN = "#e06666";   // the same red the bodygraph uses for the design side
const HILITE = "#fbf7b2";   // the defined Throat yellow, for highlights

const CX = 360, CY = 360;
/** The 64 gates ride outside the zodiac, on the same wheel and the same
 *  longitudes: the Rave mandala and the zodiac are one circle, anchored at
 *  Gate 41 line 1 = 2 Aquarius = 302 degrees. */
const R_GATE = 348, R_GATE_IN = 316;
/* Kaycee, 2026-10-05: "We're going to have to make the inner rings bigger to
   allow for conjunctions." Conjunct bodies stagger inward, so the room they
   need is radial: the planet ring starts further out, the steps are wider, and
   the aspect circle moves in to make space for three levels of stagger on both
   rings without either crossing it. */
/* Kaycee, 2026-10-05: "I do think we need to move the ring and glyphs back to
   the inside, there's room and it's easier to see. The House number ring is
   taking up a ridiculous amount of space. We can add a ring for transits, and
   later relationships when we do the synastry charts."

   So the bodies live in concentric bands inside the zodiac, about 32 apart,
   each with room to stagger a conjunction without reaching the next band in.
   The house band used to run 214 down to 150, sixty-four pixels to carry
   twelve small numbers; it is a third of that now, and the space it gave back
   is what the transit band is standing in. A relationship band belongs
   between the design and the houses when the synastry charts arrive. */
const R_OUT = 310, R_SIGN = 272, R_TICK = 262;
// The middle of the wheel is empty at rest now that the chords wait to be
// asked for, so the house numbers and the chord circle move inward and hand
// that room to the bands. Kaycee, 2026-10-08: "I think we have lots of room
// to play with here if we remove the aspects from the center."
const R_TRANSIT = 244, R_PLANET = 212, R_HOUSE = 78, R_ASPECT = 62;
const R_PLANET_STEP = 14, R_DESIGN_STEP = 14;
/** Design planets sit just inside the personality ring, on the same zodiac. */
const R_DESIGN = 180;
/** The transit band, inside the zodiac with the rest of the bodies. It sat
 *  outside the gate ring for a while, which was legible but far from the
 *  chart and left the aspect lines running right across it. Inside, it reads
 *  with everything else and there is room, because the house band gave some
 *  back. Crowded transits stagger inward, the same as every other band. */
const R_OVERLAY = R_TRANSIT;
/** The teal a transit is drawn in everywhere else in the chart. */
const TRANSIT_TEAL = "#0d9488";
const R_OVERLAY_STEP = 14;

/** Retrograde, beside the glyph rather than in a table. Kaycee, 2026-10-05:
 *  "add the R retrograde subscript for transiting planets that are in
 *  retrograde... on the glyphs I mean." The provider sends no retrograde flag,
 *  so the caller works it out from our own ephemeris, the same source the
 *  placements rows already use. */
const retroMark = (x: number, y: number, size: number, colour: string,
  planet: string, side: string, ring: string) =>
  `<text class="rmark" data-aplanet="${planet}" data-side="${side}" data-ring="${ring}" ` +
  `x="${f(x + size * 0.5)}" y="${f(y + size * 0.16)}" ` +
  `text-anchor="middle" font-size="${f(size * 0.55)}" fill="${colour}">\u211e</text>`;

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
 *
 * Kaycee, 2026-10-03: "Can we adjust the astrology charts so that the ascendant
 * is always at 9:00?" So ASCENDANT is the default everywhere now, overlays and
 * two-person wheels included. The houses are the point of reading a wheel, and
 * they are only in their familiar places when the rising degree is on the left.
 */
export type WheelAnchor = "ascendant" | "aries";
let ANCHOR: WheelAnchor = "ascendant";

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

/**
 * A second person on the wheel.
 *
 * Not the `design` argument: that is one person's design side, and borrowing it
 * for a partner made a synastry chart claim somebody else's placements were this
 * person's unconscious. A connection has two people and each of them has both
 * sides, so it is its own thing.
 */
export interface WheelPartner {
  personality: AstroChart;
  design?: AstroChart | null;
  colour: string;
  name: string;
  /** WHICH PERSON this is, not which ring they are on. The tag used to be
   *  written from the ring: the base chart was always "a". Swapping
   *  perspective puts the other person on the base ring, so every hover and
   *  click then answered out of the wrong chart. Kaycee, 2026-10-08:
   *  "clicking Patrick's sun highlights mine. Clicking mine highlights his."
   *  Defaults to "b", with the base taking whichever is left. */
  who?: "a" | "b";
}

/**
 * The twelve houses: an invisible sector each for highlighting, the cusp
 * lines, and the numbers between the house ring and the aspect circle.
 *
 * Separate from the wheel so a page already built can be handed the same ring
 * cast under another house system. The anchor has to match the wheel it goes
 * into, which is why the Ascendant is passed rather than read.
 */
export function renderHouseLayer(cusps: readonly number[], asc: number): string {
  const s: string[] = [];
  cusps.forEach((lon, i) => {
    const next = cusps[(i + 1) % 12];
    s.push(`<path class="housesector" data-hsector="${i + 1}" ` +
      `d="${arc(lon, next, asc, R_SIGN, R_ASPECT)}" fill="${HILITE}" fill-opacity="0"/>`);
  });
  cusps.forEach((lon, i) => {
    const angular = i % 3 === 0;
    const [x1, y1] = pt(lon, asc, R_SIGN);
    const [x2, y2] = pt(lon, asc, R_ASPECT);
    s.push(`<line class="cusp" data-cusp="${i + 1}" x1="${f(x1)}" y1="${f(y1)}" ` +
      `x2="${f(x2)}" y2="${f(y2)}" stroke="${INK}" ` +
      `stroke-width="${angular ? 1.6 : 0.7}" opacity="${angular ? 0.6 : 0.3}"/>`);
    const next = cusps[(i + 1) % 12];
    const mid = lon + (((next - lon) % 360) + 360) % 360 / 2;
    const [nx, ny] = pt(mid, asc, (R_HOUSE + R_ASPECT) / 2);
    s.push(`<text class="hnum" data-house="${i + 1}" x="${f(nx)}" y="${f(ny + 4)}" ` +
      `text-anchor="middle" font-size="11" fill="${INK}" opacity=".55">${i + 1}</text>`);
  });
  return s.join("");
}

export function renderWheel(chart: AstroChart, name: string, design?: AstroChart | null,
  anchor: WheelAnchor = "ascendant", carriedGates: readonly number[] = [],
  personalityGates: readonly number[] = [], designGates: readonly number[] = [],
  partner?: WheelPartner | null, selfColour?: string,
  ringColours?: { a: string; b: string } | null,
  /** How the second set of bodies is drawn. A design side sits inside the
   *  chart's own ring, which is the bi-wheel convention for two readings of
   *  one person. A transit sits OUTSIDE it, which is the convention for the
   *  sky arriving over a chart that was already there. Defaults to the design
   *  behaviour so every existing caller is unchanged. */
  overlayAs: { side: string; outside?: boolean; colour?: string } | null = null,
  /** Which side this wheel's own chart is. Colour and identity follow the
   *  SIDE, never the ring: on a design wheel carrying the personality as its
   *  inner ring, both rings came out in the design red and read as one set.
   *  Kaycee, 2026-10-05: "this synastry view would be much more useful if the
   *  personality planets showed up on the chart." They were drawn; they were
   *  painted the same colour as the design and tagged as the design too, so
   *  nothing could tell them apart, including the hover. */
  mainSide: "personality" | "design" = "personality",
  /** A third set, always drawn outside the chart's own ring. The design side
   *  sits inside and a transit arrives over the top, so reading a transit
   *  against the WHOLE chart needs all three at once: Kaycee, 2026-10-05,
   *  "There should be an option to cast it against the whole chart as well,
   *  not just personality/design." */
  outer: { chart: AstroChart; side: string; colour: string } | null = null,
  /** Aspects BETWEEN the two sets on this wheel, drawn as their own class so
   *  the page can show or hide them. The provider never returns these: it
   *  aspects within one chart only, which is why a synastry has to be worked
   *  out rather than asked for. */
  crossAspects?: readonly { p1_name: string; p2_name: string;
    p1_abs_pos: number; p2_abs_pos: number; aspect: string; orbit: number }[] | null,
  /** Which transiting bodies are retrograde, by name. The provider sends no
   *  retrograde flag on either endpoint, so the caller works this out from our
   *  own ephemeris and passes it in. A natal wheel passes nothing and draws
   *  exactly as it did before. */
  transitRetro?: Record<string, boolean | null> | null,
  /** True when this wheel's OWN ring is the sky rather than a birth chart,
   *  which is what Transit Only draws. Without it the retrograde marks would
   *  have nowhere to go in the one view where every body is transiting. */
  mainIsTransit = false): string {
  ANCHOR = anchor;
  const asc = chart.ascendant;
  const s: string[] = [];
  s.push(`<svg viewBox="-54 -118 828 884" width="828" height="884" xmlns="http://www.w3.org/2000/svg" ` +
    `font-family="Montserrat, 'Helvetica Neue', sans-serif">`);
  s.push(`<rect x="-54" y="-118" width="828" height="884" fill="${CREAM}"/>`);
  if (ringColours) {
    s.push(`<defs><radialGradient id="pairsplit" gradientUnits="userSpaceOnUse" ` +
      `cx="${CX}" cy="${CY}" r="${R_GATE}">` +
      `<stop offset="${(R_GATE_IN / R_GATE).toFixed(4)}" stop-color="${ringColours.b}"/>` +
      `<stop offset="1" stop-color="${ringColours.a}"/>` +
      `</radialGradient></defs>`);
  }
  s.push(`<defs><radialGradient id="gsplit" gradientUnits="userSpaceOnUse" ` +
    `cx="${CX}" cy="${CY}" r="${R_GATE}">` +
    `<stop offset="${(R_GATE_IN / R_GATE).toFixed(4)}" stop-color="${DESIGN}"/>` +
    `<stop offset="1" stop-color="${PURPLE}"/>` +
    `</radialGradient></defs>`);

  // The 64 gates, outside the zodiac on the same circle. A gate the chart
  // carries is filled; the rest are outline only, the same convention the
  // bodygraph uses for activated and unactivated gates.
  // A gate is coloured by the side that activates it, the same convention the
  // bodygraph uses: personality in the brand purple, design in Delphi red. A
  // gate both sides carry takes the purple fill and a red edge, because it is
  // genuinely both and neither colour alone is true.
  const carried = new Set(carriedGates);
  const pSide = new Set(personalityGates);
  const dSide = new Set(designGates);
  // On a pair the two sets are two people, not two sides of one chart, so the
  // ring reads by person: each in their own colour, and a gate they both carry
  // split across the band rather than blended into a third colour that is
  // neither of them.
  const R_MID = (R_GATE + R_GATE_IN) / 2;
  for (const g of GATE_RANGES) {
    const on = carried.has(g.gate);
    const isP = pSide.has(g.gate), isD = dSide.has(g.gate);
    if (ringColours) {
      const band = (outer: number, inner: number, fill: string) =>
        `<path class="gateband" data-gate="${g.gate}" ` +
        `d="${arc(g.start, g.end, asc, outer, inner)}" ` +
        `fill="${on ? fill : "none"}" fill-opacity="${on ? 0.34 : 0}" ` +
        `stroke="${INK}" stroke-width="0.5" stroke-opacity=".35"/>`;
      if (isP && isD) {
        // A gate they both carry fades between their two colours, the same way a
        // doubled placement does on the individual chart. A hard line read as a
        // border between them rather than something they share.
        s.push(band(R_GATE, R_GATE_IN, "url(#pairsplit)"));
      } else {
        s.push(band(R_GATE, R_GATE_IN, isP ? ringColours.a : ringColours.b));
      }
      const span0 = ((g.end - g.start) % 360 + 360) % 360;
      const mid0 = (g.start + span0 / 2) % 360;
      const [tx, ty] = pt(mid0, asc, R_MID);
      s.push(`<text class="gateband" data-gate="${g.gate}" x="${f(tx)}" y="${f(ty + 4)}" ` +
        `text-anchor="middle" font-size="11" font-weight="${on ? 600 : 400}" ` +
        `fill="${INK}" opacity="${on ? 0.95 : 0.4}">${g.gate}</text>`);
      continue;
    }
    // A gate carried by both sides is filled with a gradient across the band,
    // Delphi red at the inner edge for design fading to purple at the outer
    // edge for personality. A hard split read as two separate bands.
    const both = isP && isD;
    s.push(`<path class="gateband" data-gate="${g.gate}" ` +
      `d="${arc(g.start, g.end, asc, R_GATE, R_GATE_IN)}" ` +
      `fill="${!on ? "none" : both ? "url(#gsplit)" : (isP ? PURPLE : DESIGN)}" ` +
      `fill-opacity="${on ? 0.3 : 0}" ` +
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

  // The house layer, in a group of its own so the page can swap it when the
  // reader picks a different house system. Kaycee, 2026-10-05: "the house
  // picker doesn't actually do anything yet, is that on purpose?" It was
  // changing the numbers in the panel and leaving the drawn ring on Placidus,
  // which with those sections closed looks like a control that does nothing.
  s.push(`<g class="houselayer">${renderHouseLayer(chart.houses.map((h) => h.abs_pos), asc)}</g>`);

  // ── ONE RING PER SET ──────────────────────────────────────────────────
  // A wheel carries one set, two or three: the chart alone, the chart with
  // its design or with a transit over it, or all three at once. Each gets a
  // band of its own with a line between them, which is what a bi-wheel and a
  // tri-wheel are. Kaycee, 2026-10-08: "We may as well create a tri-wheel
  // version too... The bi-wheel version should be the default for
  // relationships, transit with design or personality only and in the
  // individual synastry view when comparing personality and design."
  //
  // The chart whose HOUSES are drawn is innermost and everything read
  // against it goes outward, which is the convention her reference bi-wheel
  // uses and the one the pair already follows. Each band is a short stack of
  // rings and a crowded glyph takes the first free one, measured in glyph
  // widths rather than degrees, because the same gap is wide out by the signs
  // and narrow near the middle. Angle is never touched.
  const setCount = 1 + (design && !partner ? 1 : 0) + (outer ? 1 : 0);
  // Three rings to a band where there is room for them: two was not enough
  // on this chart, where the Sun and the North Node sit a degree apart and
  // Earth and Neptune do the same, so a third body at the same angle landed
  // back on top of the second. A tri-wheel has room for two each, which
  // covers everything but a three-way pile-up.
  const BANDS: Record<number, number[][]> = {
    1: [[R_PLANET, R_PLANET - 18, R_PLANET - 36]],
    2: [[190, 168, 146], [256, 234, 212]],
    3: [[136, 118, 100], [194, 176, 158], [252, 234, 216]],
  };
  const bands = BANDS[setCount] ?? BANDS[1];
  const taken = new Map<number, { lon: number; slot: number }[]>();
  const placeIn = (bandIdx: number, lon: number): number => {
    const band = bands[bandIdx] ?? bands[0];
    const here = taken.get(bandIdx) ?? [];
    taken.set(bandIdx, here);
    for (let i = 0; i < band.length; i++) {
      const apart = (21 / band[i]) * (180 / Math.PI);
      const clash = here.some((q) => q.slot === i &&
        Math.abs(((lon - q.lon + 540) % 360) - 180) < apart);
      if (!clash) { here.push({ lon, slot: i }); return band[i]; }
    }
    here.push({ lon, slot: band.length - 1 });
    return band[band.length - 1];
  };
  // the lines between the bands, so they read as separate wheels
  if (setCount > 1 && !partner) {
    for (let i = 1; i < bands.length; i++) {
      const r = (bands[i - 1][0] + bands[i][bands[i].length - 1]) / 2;
      s.push(`<circle cx="${CX}" cy="${CY}" r="${r.toFixed(1)}" fill="none" ` +
        `stroke="#cfc7d6" stroke-width="1"/>`);
    }
  }

  // Aspects, drawn as chords inside. Two things get left out. Conjunctions,
  // because a chord between two points in the same place is a dot. And anything
  // involving a house cusp: the API returns those alongside the planet-to-planet
  // aspects, and drawing "Node opposition First House" as a chord across the
  // wheel says something that isn't true.
  // On a pair each person's own aspects are drawn, in their own colour, so a
  // line says whose chart it belongs to. Both sets come back from the provider;
  // neither is worked out here.
  const aspectSets: { list: readonly typeof chart.aspects[number][]; own?: string; names: Set<string> }[] = [
    { list: chart.aspects, own: partner ? selfColour : undefined,
      names: new Set(chart.planets.map((p) => p.name)) },
  ];
  if (partner) {
    aspectSets.push({
      list: partner.personality.aspects, own: partner.colour,
      names: new Set(partner.personality.planets.map((p) => p.name)),
    });
  }
  // The aspects between a person's two sides, drawn in the gold so they read as
  // a third thing rather than as either chart's own. Kaycee, 2026-10-05: "the
  // option to cast the design against the personality as a synastry chart and
  // vice versa."
  for (const a of crossAspects ?? []) {
    // Same core and extra split the rest of the wheel uses, so a synastry opens
    // at the readable set and the wide ones are one click away rather than a
    // hundred lines on sight.
    const core = MAJOR.has(a.aspect) && !MINOR_POINT.has(a.p1_name) &&
      !MINOR_POINT.has(a.p2_name) && Math.abs(a.orbit) <= 6;
    // A chord drawn in the middle of the wheel says two bodies are in aspect
    // without saying which. These reach the ring each body is actually drawn
    // on, so the line arrives at the glyph. The first body in a cross aspect is
    // always the personality's, which is the inner ring when the wheel itself
    // is the design side.
    const fromDesign = mainSide === "design";
    // Where each end actually sits. A transit is drawn on the ring outside the
    // chart, so a line to it has to reach THAT ring: drawn to the design ring
    // instead, a transit aspect ends in empty space short of its own glyph.
    // Kaycee, 2026-10-05: "how do we see the aspects of the transiting
    // planets? CAn you add those mouseover lines here as well?"
    const transitSecond = !!outer || !!overlayAs?.outside;
    const p1Design = a.p1_name.startsWith("design:");
    const r1 = p1Design ? R_DESIGN - 11
      : (!transitSecond && fromDesign ? R_DESIGN - 11 : R_PLANET - 13);
    const r2 = transitSecond ? R_TRANSIT - 11
      : (fromDesign ? R_PLANET - 13 : R_DESIGN - 11);
    const [x1, y1] = pt(a.p1_abs_pos, asc, r1);
    const [x2, y2] = pt(a.p2_abs_pos, asc, r2);
    // Which set each end belongs to, so a hover can tell whether the glyph
    // under the pointer is this line's first end or its second. Matching on
    // name alone lit a natal planet's lines when a transit of the same name
    // was hovered, and missed the transit's own.
    const c1side = p1Design ? "design" : (transitSecond ? mainSide : "personality");
    const c2side = outer ? outer.side
      : (overlayAs?.side ?? (mainSide === "design" ? "personality" : "design"));
    const bare1 = a.p1_name.replace(/^design:/, "");
    // Named, because these are shown one at a time on hover rather than all at
    // once. Kaycee, 2026-10-05: "The lines to nowhere are kind of meaningless
    // to me." A line you asked for is an answer; thirty you did not is noise.
    s.push(`<line class="asp cross ${core ? "core" : "extra"}" ` +
      `data-cross="${bare1}|${a.p2_name}" data-c1side="${c1side}" data-c2side="${c2side}" ` +
      `x1="${f(x1)}" y1="${f(y1)}" ` +
      `x2="${f(x2)}" y2="${f(y2)}" stroke="#c9a227" ` +
      `stroke-width="${HARD.has(a.aspect) ? 1.3 : 1.1}" opacity="0"/>`);
  }

  for (const [setIndex, set] of aspectSets.entries()) {
  // On a connection there are two full webs of chords and they bury the
  // middle of the wheel. Kaycee, 2026-10-08: "We can remove the aspects by
  // default and have them show when clicked maybe?" So they are drawn and
  // held at nothing until a planet is picked, which then shows that planet's
  // own, in that person's colour.
  // Every wheel's chords are held at nothing until a body is picked, not
  // only a pair's. The web across the middle is what made this unreadable
  // and what was filling the room the bands needed. Kaycee, 2026-10-08:
  // "we have lots of room to play with here if we remove the aspects from
  // the center, but we need to really nail the aspect clicks if we do that."
  const pairWho = partner
    ? (setIndex === 0 ? ((partner.who ?? "b") === "b" ? "a" : "b") : (partner.who ?? "b"))
    : "a";
  const planetNames = set.names;
  for (const a of set.list) {
    if (a.aspect === "conjunction") continue;
    if (!planetNames.has(a.p1_name) || !planetNames.has(a.p2_name)) continue;
    const colour = set.own
      ? set.own
      : HARD.has(a.aspect) ? "#c0603c" : SOFT.has(a.aspect) ? PURPLE : "#b9b6bd";
    // The classic set is the one most charts draw: a major aspect between two
    // traditional planets, held to a six degree orb. Everything else is real and
    // returned by the API, it is just a denser read than most people want on
    // opening, so it is a class the page can switch on rather than a deletion.
    const core = MAJOR.has(a.aspect) && !MINOR_POINT.has(a.p1_name) &&
      !MINOR_POINT.has(a.p2_name) && Math.abs(a.orbit) <= 6;
    const [x1, y1] = pt(a.p1_abs_pos, asc, R_ASPECT);
    const [x2, y2] = pt(a.p2_abs_pos, asc, R_ASPECT);
    s.push(`<line class="asp ${core ? "core" : "extra"}${pairWho ? " pairasp" : ""}" ` +
      (pairWho
        ? `data-apwho="${pairWho}" data-ap1="${a.p1_name}" data-ap2="${a.p2_name}" `
        : "") +
      `x1="${f(x1)}" y1="${f(y1)}" ` +
      `x2="${f(x2)}" y2="${f(y2)}" stroke="${colour}" ` +
      `stroke-width="${HARD.has(a.aspect) ? 0.9 : 0.8}" opacity="${pairWho ? 0 : ".5"}"/>`);
  }
  }

  // A third ring, outside everything, for a transit over a whole chart. It
  // carries no ring marker of its own: every set has a band with a divider
  // drawn between them now, so the teal circle was a second answer to a
  // question already answered. Kaycee, 2026-10-08: "Is the chord web that
  // teal band? If so, remove it."
  if (outer) {
    const outerBand = bands.length - 1;
    for (const p of [...outer.chart.planets].sort((a, b) => a.abs_pos - b.abs_pos)) {
      const lon = p.abs_pos;
      const [x, y] = pt(lon, asc, placeIn(outerBand, lon));
      s.push(`<text class="pglyph oside" data-aplanet="${p.name}" data-side="${outer.side}" ` +
        `data-ring="outer" x="${f(x)}" y="${f(y)}" text-anchor="middle" dominant-baseline="central" font-size="19" ` +
        `fill="${outer.colour}">${GLYPH[p.name] ?? p.name.slice(0, 2)}</text>`);
      if (transitRetro?.[p.name]) {
        s.push(retroMark(x, y, 19, outer.colour, p.name, outer.side, "outer"));
      }
    }
  }

  // planets, nudged apart when they crowd
  // Crowded glyphs are staggered INWARD, never sideways. Moving a planet round
  // the wheel to make room changes the one thing the wheel asserts: Kaycee's Sun
  // sits at 85.76, inside gate 12, and a 3 degree nudge to clear the North Node
  // put it visually inside gate 15. With a gate ring outside the zodiac, an
  // angular nudge is the chart telling a lie. Radius is free; angle is not.
  // With a partner on the wheel the block below draws every set, this one
  // included, tagged by person. Running this loop as well drew person one's
  // placements a second time, which is what the doubled glyphs were.
  for (const p of (partner ? [] : [...chart.planets]).sort((a, b) => a.abs_pos - b.abs_pos)) {
    const lon = p.abs_pos;
    const rHere = placeIn(0, lon);
    const [x, y] = pt(lon, asc, rHere);
    const [tx, ty] = pt(lon, asc, rHere - 13);
    // Transit Only draws the sky as the chart's own ring. Tagged and coloured
    // as the personality it was indistinguishable from a natal chart, so
    // Kaycee read it as the natal placements refusing to go away, and every
    // hover and click treated those bodies as hers. 2026-10-05.
    const mSide = mainIsTransit ? "transit" : mainSide;
    const mFill = mainIsTransit ? TRANSIT_TEAL : (mainSide === "design" ? DESIGN : INK);
    s.push(`<text class="pglyph ${mainIsTransit ? "oside" : mainSide === "design" ? "dside" : "pside"}" ` +
      `data-aplanet="${p.name}" data-side="${mSide}" data-ring="main" x="${f(x)}" y="${f(y)}" ` +
      `text-anchor="middle" dominant-baseline="central" font-size="21" fill="${mFill}">` +
      `${GLYPH[p.name] ?? p.name.slice(0, 2)}</text>`);
    // Transit Only draws the sky as the chart's own ring, so the retrograde
    // mark belongs here too. A natal wheel passes nothing and is unchanged.
    if (mainIsTransit && transitRetro?.[p.name]) {
      s.push(retroMark(x, y, 21, mFill, p.name, mSide, "main"));
    }
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
  // A connection: each person keeps both of their own sides, and a person is one
  // colour with the lighter tone for their design. Nobody's placements are filed
  // under somebody else's unconscious.
  if (partner) {
    const lighten = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      const m = (v: number) => Math.round(v + (255 - v) * 0.42);
      return `#${m(r).toString(16).padStart(2, "0")}${m(g).toString(16).padStart(2, "0")}${m(b).toString(16).padStart(2, "0")}`;
    };
    const mine = selfColour ?? PURPLE;
    // A BI-WHEEL. The two of them used to be laid at 212/170 and 180/138, which
    // interleaves: one person's design sat between the other's two sides and
    // the whole middle of the chart read as one crowd. Kaycee, 2026-10-08,
    // with a Harry and Meghan bi-wheel beside it: "the synastry charts are
    // getting messy. Would it be possible to adopt a style similar to the one
    // shown? Where each person gets their own ring."
    // So each person keeps a band, the base person inside and the other
    // outside, with a line drawn between them. Crowded glyphs step inward by
    // less than before, or a stepped glyph would walk out of its own band.
    // Each band is a short stack of rings a glyph may sit on, and the two
    // sides of one person SHARE that stack. Crowding used to be worked out
    // per side, a side at a time, against a step of its own: two glyphs a few
    // degrees apart were pushed eleven pixels off each other while the glyph
    // itself is about fifteen tall, so they still overlapped, and a side
    // could be nudged straight onto the other side's ring without noticing.
    // Kaycee, 2026-10-08: "Is there anything we can do about the signs
    // crowding each other like this?"
    // Now a glyph takes the first free ring in its band, measuring free in
    // GLYPH WIDTHS rather than in degrees, because six degrees is a wide gap
    // against the signs and a narrow one near the middle.
    const BAND_A = [198, 180, 162], BAND_B = [256, 238, 220];
    const GLYPH_PX = 21;
    const taken = new Map<number, { lon: number; slot: number }[]>();
    const place = (band: number[], bandId: number, startSlot: number, lon: number) => {
      const here = taken.get(bandId) ?? [];
      taken.set(bandId, here);
      for (let i = 0; i < band.length; i++) {
        const slot = (startSlot + i) % band.length;
        const apart = (GLYPH_PX / band[slot]) * (180 / Math.PI);
        const clash = here.some((q) => q.slot === slot &&
          Math.abs(((lon - q.lon + 540) % 360) - 180) < apart);
        if (!clash) { here.push({ lon, slot }); return band[slot]; }
      }
      here.push({ lon, slot: band.length - 1 });
      return band[band.length - 1];
    };
    // Which side each ring IS follows the wheel's own base, not the slot it
    // sits in. A design chart is cast at its own moment and has its own
    // ascendant and houses, so reading two designs together means a wheel
    // built on a design horizon, with the personalities as the second set.
    // Kaycee, 2026-10-08: "each design date comes with its own astrology
    // chart and houses. I want to see those charts cast together."
    const baseSide = mainSide;
    const otherSide = mainSide === "design" ? "personality" : "design";
    const themWho = partner.who ?? "b";
    const meWho = themWho === "b" ? "a" : "b";
    const sets: [AstroChart | null | undefined, number[], number, number, string, string, string][] = [
      [chart, BAND_A, 0, 0, mine, meWho, baseSide],
      [design, BAND_A, 0, 1, lighten(mine), meWho, otherSide],
      [partner.personality, BAND_B, 1, 0, partner.colour, themWho, baseSide],
      [partner.design, BAND_B, 1, 1, lighten(partner.colour), themWho, otherSide],
    ];
    // the boundary between the two of them, so the bands read as two wheels
    s.push(`<circle cx="${CX}" cy="${CY}" r="${(BAND_A[0] + BAND_B[2]) / 2}" fill="none" ` +
      `stroke="#cfc7d6" stroke-width="1"/>`);
    for (const [set, band, bandId, startSlot, colour, who, side] of sets) {
      if (!set) continue;
      for (const p of [...set.planets].sort((a, b) => a.abs_pos - b.abs_pos)) {
        const lon = p.abs_pos;
        const [x, y] = pt(lon, asc, place(band, bandId, startSlot, lon));
        s.push(`<text class="pglyph pside" data-aplanet="${p.name}" data-person="${who}" ` +
          `data-side="${side}" x="${f(x)}" y="${f(y)}" text-anchor="middle" ` +
          `dominant-baseline="central" font-size="19" fill="${colour}">` +
          `${GLYPH[p.name] ?? p.name.slice(0, 2)}</text>`);
      }
    }
  } else if (design) {
    // The second set has the band after the chart's own: on a tri-wheel the
    // middle one, with the transit outside it. A transit arriving as the
    // SECOND set (cast over one side alone) takes the outer band, because the
    // sky arrives over a chart that was already there.
    const secondBand = overlayAs?.outside ? bands.length - 1 : Math.min(1, bands.length - 1);
    for (const p of [...design.planets].sort((a, b) => a.abs_pos - b.abs_pos)) {
      const lon = p.abs_pos;
      const rD = placeIn(secondBand, lon);
      const [x, y] = pt(lon, asc, rD);
      const [tx, ty] = pt(lon, asc, rD - 12);
      const innerSide = overlayAs?.side ?? (mainSide === "design" ? "personality" : "design");
      const innerFill = overlayAs?.colour ?? (innerSide === "design" ? DESIGN : INK);
      if (overlayAs?.outside && transitRetro?.[p.name]) {
        s.push(retroMark(x, y, 19, innerFill, p.name, innerSide, "inner"));
      }
      s.push(`<text class="pglyph ${innerSide === "design" ? "dside" : "pside"}" ` +
        `data-aplanet="${p.name}" data-side="${innerSide}" data-ring="inner" ` +
        `x="${f(x)}" y="${f(y)}" text-anchor="middle" dominant-baseline="central" font-size="19" ` +
        `fill="${innerFill}">` +
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
  const spokeFor = (list: AstroPoint[], side: string, who?: string, colour?: string) => {
    for (const p of list) {
      const [x1, y1] = pt(p.abs_pos, asc, R_GATE);
      const [x2, y2] = pt(p.abs_pos, asc, R_ASPECT);
      s.push(`<line class="spoke" data-spoke="${side}:${p.name}" ` +
        (who ? `data-person="${who}" ` : "") +
        `x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" ` +
        `stroke="${colour ?? (side === "design" ? DESIGN : PURPLE)}" stroke-width="2" ` +
        `stroke-linecap="round" opacity="0"/>`);
    }
  };
  if (partner) {
    // A spoke belongs to a PERSON as much as to a side. Only this person's
    // were ever drawn, so clicking the other person's Venus lit the spoke of
    // the same name on this chart: Kaycee, 2026-10-08, "clicking HIS venus
    // still highlight my venus line in the astrology view."
    const pale = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const m = (v: number) => Math.round(v + (255 - v) * 0.42);
      return `#${m((n >> 16) & 255).toString(16).padStart(2, "0")}` +
        `${m((n >> 8) & 255).toString(16).padStart(2, "0")}${m(n & 255).toString(16).padStart(2, "0")}`;
    };
    const selfInk = selfColour ?? PURPLE;
    const bSide = mainSide, oSide = mainSide === "design" ? "personality" : "design";
    const them = partner.who ?? "b", me = them === "b" ? "a" : "b";
    spokeFor(chart.planets, bSide, me, selfInk);
    if (design) spokeFor(design.planets, oSide, me, pale(selfInk));
    if (partner.personality) spokeFor(partner.personality.planets, bSide, them, partner.colour);
    if (partner.design) spokeFor(partner.design.planets, oSide, them, pale(partner.colour));
  } else {
    spokeFor(chart.planets, mainIsTransit ? "transit" : mainSide);
    if (design) {
      spokeFor(design.planets, overlayAs?.side ?? (mainSide === "design" ? "personality" : "design"));
    }
  }

  // the angles
  const angles: [string, number][] = [["As", asc], ["Ds", asc + 180], ["Mc", chart.mc], ["Ic", chart.mc + 180]];
  // Outside the gate ring, not tucked underneath it. Nothing is drawn beyond
  // the gates any more, so this is back where it belongs.
  const rAngle = R_GATE + 20;
  for (const [label, lon] of angles) {
    const [x, y] = pt(lon, asc, rAngle);
    s.push(`<text class="angle" data-angle="${label}" x="${f(x)}" y="${f(y + 4)}" ` +
      `text-anchor="middle" font-size="12" font-weight="600" fill="${PURPLE}" ` +
      `letter-spacing=".06em">${label}</text>`);
  }
  // Nothing in the middle. The chords are the point of the middle, and a label
  // sitting on top of them makes them impossible to follow.
  // On a connection each name is written in the colour that person is drawn
  // in, the way the composite bodygraph's heading already does it, so the
  // title says which ring is whose before anything is hovered. Kaycee,
  // 2026-10-08: "can we have the names at the top of the chart be in the
  // color that they are represented by?"
  // ── who is on which ring, in the corners ──────────────────────────────
  // Her reference bi-wheel names each chart in a corner and says which wheel
  // it is, so the reader knows what they are looking at without hovering
  // anything. Kaycee, 2026-10-08: "can we put Person 1 (personality here)
  // info in the upper left corner, person 2 (design) in the upper right and
  // person three (transit) in the lower left of the stage in their
  // corresponding colors and an indication of which ring they are in?"
  // The corners of the square are empty: the wheel is a circle inside it.
  if (setCount > 1) {
    const ringWord = (i: number) =>
      setCount === 2 ? (i === 0 ? "Inner wheel" : "Outer wheel")
        : ["Inner wheel", "Middle wheel", "Outer wheel"][i];
    const mineInk = selfColour ?? (mainIsTransit ? TRANSIT_TEAL : mainSide === "design" ? DESIGN : INK);
    const legend: { name: string; ink: string }[] = partner
      ? [{ name, ink: mineInk }, { name: partner.name, ink: partner.colour }]
      : [
          { name: mainIsTransit ? "Transit" : mainSide === "design" ? "Design" : "Personality",
            ink: mineInk },
          ...(design ? [{
            name: overlayAs?.side === "transit" ? "Transit"
              : mainSide === "design" ? "Personality" : "Design",
            ink: overlayAs?.colour ?? (mainSide === "design" ? INK : DESIGN),
          }] : []),
          ...(outer ? [{ name: "Transit", ink: outer.colour }] : []),
        ];
    // Upper left, upper right, then lower RIGHT. She asked for lower left and
    // that is where her reference puts it, but on this stage the floating
    // chart-type dock sits in that corner and the label landed behind it.
    // The opposite corner is the only other one the wheel leaves empty.
    const spots: [number, number, string][] = [[2, 8, "start"], [718, 8, "end"], [718, 676, "end"]];
    legend.slice(0, 3).forEach((entry, i) => {
      const [lx, ly, anchor] = spots[i];
      s.push(`<text x="${lx}" y="${ly}" text-anchor="${anchor}" font-size="15" ` +
        `font-weight="600" fill="${entry.ink}">${entry.name}</text>`);
      s.push(`<text x="${lx}" y="${ly + 17}" text-anchor="${anchor}" font-size="11.5" ` +
        `fill="#6b6790">${ringWord(i)}</text>`);
    });
  }

  const titled = partner
    ? `<tspan fill="${selfColour ?? PURPLE}">${name}</tspan>` +
      `<tspan fill="#6b6790" font-weight="400"> and </tspan>` +
      `<tspan fill="${partner.colour}">${partner.name}</tspan>`
    : name;
  s.push(`<text x="${CX}" y="-26" text-anchor="middle" font-size="27" font-weight="600" ` +
    `letter-spacing=".02em" fill="${INK}">${titled}</text>`);
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
