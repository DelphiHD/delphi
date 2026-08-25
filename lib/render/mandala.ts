/**
 * Delphi mandala renderer.
 *
 * Two entry points:
 *   - renderFullMandala  → cover page of the Planetary Overview
 *   - renderCrossMandala → start of the Incarnation Cross section
 *
 * Both return self-contained SVG strings. The same shape feeds the
 * current docx pipeline and a future interactive portal embed.
 *
 * See docs/DECISIONS.md (2026-05-27 entry) for the design rationale and
 * the canonical render rules. Brand palette is encoded in PALETTE below
 * and mirrored in memory/brand_delphi.md.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  GATE_ARC_DEGREES,
  GATE_RANGES,
  LINE_ARC_DEGREES,
  RANGE_BY_GATE,
  WHEEL_SEQUENCE,
} from "@/lib/hd/gate-longitude";
import { centerOf, type Center } from "@/lib/hd/gate-center";
import {
  PLANET_ORDER,
  type Activation,
  type MandalaChart,
  type RenderOptions,
} from "./mandala.types";

const PALETTE = {
  ink: "#000000",
  inactiveGateFill: "#ffffff",
  inactiveGateStroke: "#666666",
  activeGateStroke: "#333333",
  inactiveSpoke: "#dedede",
  personality: "#000000",
  design: "#e06666",
  quarter: {
    // Cardinal-sign anchored: each quarter starts at the cusp of its first sign.
    initiation: "#fbf7b2",     // Aries-Gemini    (0°–90°)
    civilization: "#e8e8e8",   // Cancer-Virgo    (90°–180°)
    duality: "#f5d4d4",        // Libra-Sagittarius (180°–270°)
    mutation: "#e8d8ed",       // Capricorn-Pisces (270°–360°)
  },
  spokeByCenter: {
    head: "#bcbcbc",
    ajna: "#a86bbd",
    throat: "#fbf7b2",
    g: "#fbf7b2",
    heart: "#bcbcbc",
    spleen: "#a86bbd",
    sacral: "#bcbcbc",
    "solar-plexus": "#a86bbd",
    root: "#bcbcbc",
  } satisfies Record<Center, string>,
  // Stronger variant used only for the thin activated-spoke lines, where
  // pale yellow against white was disappearing. Wedge fills keep the
  // light palette above.
  activeSpokeStroke: {
    head: "#888888",
    ajna: "#845095",
    throat: "#c9a728",
    g: "#c9a728",
    heart: "#888888",
    spleen: "#845095",
    sacral: "#888888",
    "solar-plexus": "#845095",
    root: "#888888",
  } satisfies Record<Center, string>,
} as const;

/**
 * Longitude that sits at the visual top (12 o'clock) of the rendered wheel.
 *
 * 268.25° = boundary between Gate 11 (ends 268.25°) and Gate 10 (starts
 * 268.25°). Putting that boundary at the top gives the traditional HD
 * mandala orientation with gates 10 and 11 straddling the top.
 *
 * This is purely visual rotation; the canonical gate→longitude math
 * (anchored at Gate 41 line 1 = 2° Aquarius = 302°) is unchanged.
 */
const VISUAL_TOP_LONGITUDE = 268.25;

interface Geometry {
  size: number;
  cx: number;
  cy: number;
  r: {
    /** Outer perimeter of the SVG canvas. */
    outer: number;
    /** Inner edge of the quarter halo band (band runs outer → quarterInner). */
    quarterInner: number;
    /** Outer edge of the hexagram ring. */
    hexagramOuter: number;
    /** Inner edge of the hexagram ring. */
    hexagramInner: number;
    /** Outer edge of the zodiac sign ring. */
    zodiacOuter: number;
    /** Inner edge of the zodiac sign ring. */
    zodiacInner: number;
    /** Outer edge of the gate number cells. */
    gateOuter: number;
    /** Inner edge of the gate cells. */
    gateInner: number;
    /** Outer end of the line subdivision spokes. */
    spokeOuter: number;
    /** Inner end of the line subdivision spokes. */
    spokeInner: number;
    /** Half the size of the embedded bodygraph SVG. */
    bodygraph: number;
  };
}

function geometry(size: number): Geometry {
  const cx = size / 2;
  const cy = size / 2;
  return {
    size,
    cx,
    cy,
    r: {
      outer: size * 0.495,
      quarterInner: size * 0.455,
      hexagramOuter: size * 0.450,
      hexagramInner: size * 0.410,
      gateOuter: size * 0.405,
      gateInner: size * 0.365,
      // Zodiac now sits INSIDE the gate ring with small gaps either side.
      zodiacOuter: size * 0.358,
      zodiacInner: size * 0.342,
      spokeOuter: size * 0.335,
      spokeInner: size * 0.180,
      bodygraph: size * 0.180,
    },
  };
}

/** Convert ecliptic longitude (0-360, 0° = Aries) to SVG angle in radians.
 *  VISUAL_TOP_LONGITUDE sits at the top of the wheel (12 o'clock).
 *  Increasing longitude runs counter-clockwise (standard astrology
 *  convention, matches the Mandala Template). */
function longitudeToRadians(longitude: number): number {
  const fromTop = ((longitude - VISUAL_TOP_LONGITUDE) % 360 + 360) % 360;
  return Math.PI / 2 + (fromTop * Math.PI) / 180;
}

function pointAt(g: Geometry, radius: number, longitude: number) {
  const a = longitudeToRadians(longitude);
  return { x: g.cx + radius * Math.cos(a), y: g.cy - radius * Math.sin(a) };
}

/** SVG path for a ring sector (annulus slice) between two longitudes. */
function annulusSector(
  g: Geometry,
  rOuter: number,
  rInner: number,
  startLon: number,
  endLon: number,
): string {
  const p1 = pointAt(g, rOuter, startLon);
  const p2 = pointAt(g, rOuter, endLon);
  const p3 = pointAt(g, rInner, endLon);
  const p4 = pointAt(g, rInner, startLon);
  const arcSpan = ((endLon - startLon) % 360 + 360) % 360;
  const largeArc = arcSpan > 180 ? 1 : 0;
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function quarterHalo(g: Geometry): string {
  // Quarters live OUTSIDE the gate ring as a halo band running from the
  // outer perimeter inward to quarterInner.
  // Quarters align to the HD wheel (16-gate arcs), NOT to zodiac signs.
  // Each quarter is 90° wide starting where its first gate begins.
  // Mutation runs from Gate 1 to Gate 19 (the arc straddling the top),
  // with Gate 19's start at longitude 313.25°.
  const quarters: {
    start: number;
    end: number;
    fill: string;
    opacity: number;
    label: string;
    labelColor: string;
  }[] = [
    { start: 313.25, end: 43.25,  fill: PALETTE.quarter.initiation,   opacity: 0.85, label: "INITIATION",   labelColor: "#a89400" },
    { start: 43.25,  end: 133.25, fill: PALETTE.quarter.civilization, opacity: 1.0,  label: "CIVILIZATION", labelColor: "#5a5a5a" },
    { start: 133.25, end: 223.25, fill: PALETTE.quarter.duality,      opacity: 1.0,  label: "DUALITY",      labelColor: "#a14848" },
    { start: 223.25, end: 313.25, fill: PALETTE.quarter.mutation,     opacity: 1.0,  label: "MUTATION",     labelColor: "#6b3a7a" },
  ];

  const bandRadius = (g.r.outer + g.r.quarterInner) / 2;
  const fontSize = (g.r.outer - g.r.quarterInner) * 0.42;
  // Compensate for renderers that ignore dominant-baseline="central" on
  // textPath (Quartz/qlmanage, used in docx PNG rasterization). The
  // glyph baseline sits ON the path with letters extending outward; pull
  // the path inward by ~half the cap height so the glyph mass ends up
  // visually centered on bandRadius.
  const baselineShift = fontSize * 0.35;
  const textPathRadius = bandRadius - baselineShift;

  const paths: string[] = [];
  const textPaths: string[] = [];
  const labels: string[] = [];

  for (let i = 0; i < quarters.length; i++) {
    const q = quarters[i];
    paths.push(
      `<path class="q-sector" d="${annulusSector(g, g.r.outer, g.r.quarterInner, q.start, q.end)}" ` +
        `fill="${q.fill}" fill-opacity="${q.opacity}" stroke="none" />`,
    );

    // Draw each label's text path going CW around the wheel so glyph bases
    // face the wheel center (the "outer text" convention used by the MM
    // reference mandala). With CCW=increasing longitude, going from q.end
    // (higher longitude) to q.start (lower longitude) along the arc gives
    // the CW screen direction.
    const pad = 8;
    const arcStart = q.end - pad;
    const arcEnd = q.start + pad;
    const p1 = pointAt(g, textPathRadius, arcStart);
    const p2 = pointAt(g, textPathRadius, arcEnd);
    const pathId = `quarter-arc-${i}`;
    textPaths.push(
      `<path id="${pathId}" d="M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ` +
        `A ${textPathRadius} ${textPathRadius} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}" ` +
        `fill="none" stroke="none" />`,
    );
    labels.push(
      `<text class="q-label" data-quarter="${i}" font-family="Montserrat, 'Helvetica Neue', sans-serif" ` +
        `font-size="${fontSize.toFixed(1)}" letter-spacing="6" font-weight="300" ` +
        `fill="${q.labelColor}" dominant-baseline="central">` +
        `<textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${q.label}</textPath>` +
        `</text>`,
    );
  }

  return paths.join("\n") + "\n" + textPaths.join("\n") + "\n" + labels.join("\n");
}

/* ---------- Hexagram glyphs ---------- */

const HEXAGRAM_ASSET_DIR = join(
  process.env.HOME ?? "",
  "Desktop",
  "Delphi Brand Assets",
  "sections",
  "hexagrams",
);

const hexagramCache = new Map<number, string>();

/** Default resolver: file-system → base64 data URL. Override in RenderOptions
 *  for a portal-friendly version that returns HTTP URLs. */
function defaultHexagramResolver(gate: number): string {
  const cached = hexagramCache.get(gate);
  if (cached) return cached;
  try {
    const buf = readFileSync(join(HEXAGRAM_ASSET_DIR, `${gate}.png`));
    const url = `data:image/png;base64,${buf.toString("base64")}`;
    hexagramCache.set(gate, url);
    return url;
  } catch {
    return "";
  }
}

function hexagramRing(
  g: Geometry,
  activatedGates: ReadonlySet<number>,
  resolver: (gate: number) => string,
): string {
  // Place each hexagram at the midpoint of its gate wedge, oriented radially
  // (base toward center). Inactive gates render at low opacity (gray);
  // activated gates render at full opacity (black).
  const side = (g.r.hexagramOuter - g.r.hexagramInner) * 0.475;
  const radius = (g.r.hexagramOuter + g.r.hexagramInner) / 2;
  return GATE_RANGES
    .map((range) => {
      const url = resolver(range.gate);
      if (!url) return "";
      const mid = (range.start + GATE_ARC_DEGREES / 2) % 360;
      const p = pointAt(g, radius, mid);
      const isActive = activatedGates.has(range.gate);
      const opacity = isActive ? 1.0 : 0.28;
      // No rotation: keep every hexagram upright so the trigram order
      // (line 1 at bottom, line 6 at top) reads consistently regardless
      // of position on the wheel. This matches the MM Mandala convention.
      return (
        `<image class="hex-img" data-hex="${range.gate}" href="${url}" x="${(p.x - side / 2).toFixed(2)}" y="${(p.y - side / 2).toFixed(2)}" ` +
        `width="${side.toFixed(2)}" height="${side.toFixed(2)}" opacity="${opacity}" ` +
        `preserveAspectRatio="xMidYMid meet" />`
      );
    })
    .join("\n");
}

/* ---------- Zodiac ring ---------- */

const ZODIAC_SIGNS: { name: string; glyph: string; start: number }[] = [
  { name: "Aries",       glyph: "♈", start: 0 },
  { name: "Taurus",      glyph: "♉", start: 30 },
  { name: "Gemini",      glyph: "♊", start: 60 },
  { name: "Cancer",      glyph: "♋", start: 90 },
  { name: "Leo",         glyph: "♌", start: 120 },
  { name: "Virgo",       glyph: "♍", start: 150 },
  { name: "Libra",       glyph: "♎", start: 180 },
  { name: "Scorpio",     glyph: "♏", start: 210 },
  { name: "Sagittarius", glyph: "♐", start: 240 },
  { name: "Capricorn",   glyph: "♑", start: 270 },
  { name: "Aquarius",    glyph: "♒", start: 300 },
  { name: "Pisces",      glyph: "♓", start: 330 },
];

function zodiacRing(g: Geometry): string {
  const bandRadius = (g.r.zodiacOuter + g.r.zodiacInner) / 2;
  const fontSize = (g.r.zodiacOuter - g.r.zodiacInner) * 0.60;
  // Same baseline-shift compensation as the quarter labels.
  const textPathRadius = bandRadius - fontSize * 0.35;

  // Alternating muted grey / light blue fills per sign.
  const fillA = "#f1f1f3";
  const fillB = "#e6ecf3";

  const cells = ZODIAC_SIGNS.map((s, i) => {
    const path = annulusSector(g, g.r.zodiacOuter, g.r.zodiacInner, s.start, s.start + 30);
    const fill = i % 2 === 0 ? fillA : fillB;
    return `<path class="z-cell" data-sign="${i}" d="${path}" fill="${fill}" stroke="#cccccc" stroke-width="0.4" />`;
  }).join("\n");

  // Sign names as curved text. CW direction (end → start) so glyph bases
  // face the wheel center, matching the quarter-label convention.
  const pad = 1.5;
  const textPaths: string[] = [];
  const labels: string[] = [];
  ZODIAC_SIGNS.forEach((s, i) => {
    const arcStart = s.start + 30 - pad;
    const arcEnd = s.start + pad;
    const p1 = pointAt(g, textPathRadius, arcStart);
    const p2 = pointAt(g, textPathRadius, arcEnd);
    const pathId = `zodiac-arc-${i}`;
    textPaths.push(
      `<path id="${pathId}" d="M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ` +
        `A ${textPathRadius} ${textPathRadius} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}" ` +
        `fill="none" stroke="none" />`,
    );
    labels.push(
      `<text class="z-label" data-sign="${i}" font-family="Montserrat, 'Helvetica Neue', sans-serif" ` +
        `font-size="${fontSize.toFixed(1)}" letter-spacing="1.5" font-weight="300" fill="#555555" ` +
        `dominant-baseline="central">` +
        `<textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${s.name}</textPath>` +
        `</text>`,
    );
  });

  return cells + "\n" + textPaths.join("\n") + "\n" + labels.join("\n");
}

/* ---------- Gate ring (cell numbers) ---------- */

function gateRing(g: Geometry, activatedGates: ReadonlySet<number>): string {
  const cells = GATE_RANGES.map((range) => {
    const isActive = activatedGates.has(range.gate);
    const fill = isActive
      ? PALETTE.spokeByCenter[centerOf(range.gate)]
      : PALETTE.inactiveGateFill;
    const fillOpacity = isActive ? 0.45 : 1.0;
    const stroke = isActive ? PALETTE.activeGateStroke : PALETTE.inactiveGateStroke;
    const strokeWidth = isActive ? 1.0 : 0.7;
    const path = annulusSector(g, g.r.gateOuter, g.r.gateInner, range.start, range.end);
    const mid = (range.start + GATE_ARC_DEGREES / 2) % 360;
    const labelPos = pointAt(g, (g.r.gateOuter + g.r.gateInner) / 2, mid);
    const textFill = isActive ? PALETTE.ink : "#555555";
    const textWeight = isActive ? "bold" : "normal";
    return (
      `<g data-gatecell="${range.gate}">` +
      `<path class="g-cell" d="${path}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}" />` +
      `<text class="g-num" x="${labelPos.x.toFixed(2)}" y="${labelPos.y.toFixed(2)}" ` +
      `text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="Georgia, serif" font-size="${(g.size * 0.013).toFixed(1)}" ` +
      `font-weight="${textWeight}" fill="${textFill}">${range.gate}</text>` +
      `</g>`
    );
  });
  const perimeter =
    `<circle cx="${g.cx}" cy="${g.cy}" r="${g.r.gateOuter}" fill="none" stroke="#333333" stroke-width="1.2" />` +
    `<circle cx="${g.cx}" cy="${g.cy}" r="${g.r.gateInner}" fill="none" stroke="#333333" stroke-width="1.0" />`;
  return cells.join("\n") + "\n" + perimeter;
}

/* ---------- Spokes and activations ---------- */

function activationWedges(g: Geometry, activatedGates: ReadonlySet<number>): string {
  // Inset slightly so adjacent same-color gates (e.g. Gate 9 and 34,
  // both Sacral) read as distinct ribbons rather than one merged band.
  const inset = 0.08;
  return [...activatedGates]
    .map((gate) => {
      const range = RANGE_BY_GATE.get(gate);
      if (!range) return "";
      const color = PALETTE.spokeByCenter[centerOf(gate)];
      const start = range.start + inset;
      const end = (range.start + GATE_ARC_DEGREES - inset) % 360;
      // Wedge runs from the gate ring all the way to a hair off center,
      // matching the spoke grid. The bodygraph (drawn on top) covers the
      // inner portion so the wedge appears to radiate from behind it.
      const path = annulusSector(g, g.r.gateInner, 1, start, end);
      return `<path d="${path}" fill="${color}" fill-opacity="0.28" stroke="none" />`;
    })
    .join("\n");
}

function spokeGrid(g: Geometry): string {
  // Spokes run from a small radius near the wheel center (so they appear
  // to radiate from behind the bodygraph instead of stopping at a visible
  // inner ring) out to slightly past the gate ring (peeking through the
  // gap underneath it). Boundary spokes (k=0, line 1 of each gate) extend
  // further still, cradling each hexagram. Extension lengths shortened
  // ~25% from the previous pass.
  const interiorExt = (g.r.hexagramInner - g.r.gateInner) * 1.125;
  const boundaryExt = (g.r.hexagramOuter - g.r.gateInner) * 0.6375;
  const interiorOuter = g.r.gateInner + interiorExt;
  const boundaryOuter = g.r.gateInner + boundaryExt;
  const innerEnd = 0;
  const lines: string[] = [];
  for (let w = 0; w < WHEEL_SEQUENCE.length; w++) {
    for (let k = 0; k < 6; k++) {
      const range = GATE_RANGES[w];
      const lon = (range.start + k * LINE_ARC_DEGREES) % 360;
      const outerR = k === 0 ? boundaryOuter : interiorOuter;
      const a = pointAt(g, outerR, lon);
      const b = pointAt(g, innerEnd, lon);
      lines.push(
        `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" ` +
          `x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" ` +
          `stroke="${PALETTE.inactiveSpoke}" stroke-width="0.4" />`,
      );
    }
  }
  return lines.join("\n");
}

function activationLongitude(a: Activation): number {
  if (typeof a.longitude === "number") return a.longitude;
  const range = RANGE_BY_GATE.get(a.gate);
  if (!range) throw new Error(`activation gate ${a.gate} out of range`);
  return (range.lines[a.line - 1] + LINE_ARC_DEGREES / 2) % 360;
}

function activationSpokes(g: Geometry, activations: readonly Activation[]): string {
  const innerEnd = 0;
  return activations
    .map((a) => {
      const lon = activationLongitude(a);
      const color = PALETTE.activeSpokeStroke[centerOf(a.gate)];
      const top = pointAt(g, g.r.gateInner, lon);
      const bot = pointAt(g, innerEnd, lon);
      return (
        `<line data-side="${a.side}" data-planet="${a.planet}" data-gate="${a.gate}" ` +
        `x1="${top.x.toFixed(2)}" y1="${top.y.toFixed(2)}" ` +
        `x2="${bot.x.toFixed(2)}" y2="${bot.y.toFixed(2)}" ` +
        `stroke="${color}" stroke-width="1.4" stroke-opacity="0.85" />`
      );
    })
    .join("\n");
}

const PLANET_GLYPH: Record<string, string> = {
  sun: "☉",          // ☉
  earth: "⊕",        // ⊕
  moon: "☽",         // ☽
  "north-node": "☊", // ☊
  "south-node": "☋", // ☋
  mercury: "☿",      // ☿
  venus: "♀",        // ♀
  mars: "♂",         // ♂
  jupiter: "♃",      // ♃
  saturn: "♄",       // ♄
  uranus: "♅",       // ♅
  neptune: "♆",      // ♆
  pluto: "♇",        // ♇
};

/**
 * Solar-system-inspired radial order for planet rings. Innermost (closest
 * to the bodygraph) to outermost (closest to the gate ring): Sun, Mercury,
 * Venus, Earth, Moon (and Nodes, grouped with the Moon), Mars, Jupiter,
 * Saturn, Uranus, Neptune, Pluto.
 */
const PLANET_RING_ORDER = [
  "sun",
  "mercury",
  "venus",
  "earth",
  "moon",
  "north-node",
  "south-node",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
] as const;

function activationGlyphs(g: Geometry, activations: readonly Activation[], glyphScale = 1): string {
  // Each planet has its own concentric ring within the spoke region.
  // Order matches the solar system: Sun closest to the bodygraph, Pluto
  // farthest out (closest to the gate ring). The planet's identity is
  // encoded by radial position; side (Personality / Design) by color.
  // glyphScale (default 1, unchanged for the docx) enlarges the glyphs for the
  // interactive web embed where the wheel is viewed smaller.
  const fontSize = g.size * 0.0121 * glyphScale;
  const padOuter = g.size * 0.010;
  const padInner = g.size * 0.010;
  const ringStart = g.r.spokeInner + padInner;
  const ringEnd = g.r.spokeOuter - padOuter;
  const ringStep = (ringEnd - ringStart) / (PLANET_RING_ORDER.length - 1);

  // Personality and Design at the same gate.line for the same planet
  // (rare but possible) get a small radial nudge so they don't overlap.
  const seen = new Map<string, number>();
  return activations
    .map((a) => {
      const planetIdx = PLANET_RING_ORDER.indexOf(a.planet as (typeof PLANET_RING_ORDER)[number]);
      if (planetIdx < 0) return "";
      const baseR = ringStart + planetIdx * ringStep;
      const key = `${a.planet}-${a.gate}.${a.line}`;
      const sameCount = seen.get(key) ?? 0;
      seen.set(key, sameCount + 1);
      const nudge = sameCount === 0 ? 0 : (a.side === "design" ? -1 : 1) * g.size * 0.006;
      const r = baseR + nudge;
      const lon = activationLongitude(a);
      const p = pointAt(g, r, lon);
      const glyph = PLANET_GLYPH[a.planet] ?? "•";
      const fill = a.side === "design" ? PALETTE.design : PALETTE.personality;
      return (
        `<text data-side="${a.side}" data-planet="${a.planet}" data-gate="${a.gate}" ` +
        `x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" ` +
        `text-anchor="middle" dominant-baseline="central" ` +
        `font-family="'Apple Symbols', 'Segoe UI Symbol', 'DejaVu Sans', serif" ` +
        `font-size="${fontSize.toFixed(1)}" fill="${fill}">${glyph}</text>`
      );
    })
    .join("\n");
}

function highlightCrossGates(g: Geometry, gates: readonly number[]): string {
  return gates
    .map((gate) => {
      const range = RANGE_BY_GATE.get(gate);
      if (!range) return "";
      const path = annulusSector(
        g,
        g.r.gateOuter,
        g.r.gateInner,
        range.start,
        range.end,
      );
      return `<path d="${path}" fill="none" stroke="#000000" stroke-width="2" />`;
    })
    .join("\n");
}

/* ---------- Center halo + bodygraph ---------- */

function defs(g: Geometry): string {
  // Center halo: a soft Delphi-purple wash at the bodygraph radius, easing
  // out to fully transparent at the spoke ends. Many intermediate stops
  // with a low starting opacity so the falloff is continuous and the
  // "hard line" at the gradient edge disappears.
  const PURPLE = "#845095";
  // 35% purple holds across the bodygraph area (the bodygraph occupies
  // ~0.567 of the gradient radius, since bodygraphRadius / spokeOuter).
  // Past that, the falloff matches the previous pass's curve and lands
  // at the same outer stops.
  const stops = [
    { o: 0.00, alpha: 0.35 },
    { o: 0.40, alpha: 0.35 },
    { o: 0.55, alpha: 0.20 },
    { o: 0.70, alpha: 0.07 },
    { o: 0.85, alpha: 0.03 },
    { o: 1.00, alpha: 0.00 },
  ];
  const stopXml = stops
    .map(
      (s) =>
        `<stop offset="${s.o.toFixed(2)}" stop-color="${PURPLE}" stop-opacity="${s.alpha}" />`,
    )
    .join("");

  return (
    `<defs>` +
    `<radialGradient id="delphi-halo" cx="${g.cx}" cy="${g.cy}" r="${g.r.spokeOuter}" ` +
    `gradientUnits="userSpaceOnUse">` +
    stopXml +
    `</radialGradient>` +
    `<filter id="bodygraph-shadow" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation="${(g.size * 0.004).toFixed(2)}" />` +
    `<feOffset dx="0" dy="${(g.size * 0.0025).toFixed(2)}" result="offsetblur" />` +
    `<feComponentTransfer><feFuncA type="linear" slope="0.20" /></feComponentTransfer>` +
    `<feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>` +
    `</filter>` +
    `</defs>`
  );
}

function centerHalo(g: Geometry): string {
  return (
    `<circle cx="${g.cx}" cy="${g.cy}" r="${g.r.spokeOuter}" ` +
    `fill="url(#delphi-halo)" />`
  );
}

function bodygraphComposite(g: Geometry, svg: string): string {
  const side = g.r.bodygraph * 2;
  const x = g.cx - g.r.bodygraph;
  const y = g.cy - g.r.bodygraph;
  const cleaned = svg
    .replace(/<\?xml[^?]*\?>\s*/, "")
    // mybodygraph returns SVG with lowercase `viewbox`; nested-SVG
    // rendering is case-sensitive and would otherwise drop the bottom.
    .replace(/\bviewbox=/i, "viewBox=");
  const sized = cleaned.replace(
    /<svg\b([^>]*)>/,
    `<svg$1 x="${x.toFixed(2)}" y="${y.toFixed(2)}" ` +
      `width="${side.toFixed(2)}" height="${side.toFixed(2)}" ` +
      `preserveAspectRatio="xMidYMid meet">`,
  );
  return `<g filter="url(#bodygraph-shadow)">${sized}</g>`;
}

function svgShell(geometry: Geometry, inner: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${geometry.size} ${geometry.size}" ` +
    `width="${geometry.size}" height="${geometry.size}" font-family="Georgia, serif">` +
    inner +
    `</svg>`
  );
}

/* ---------- Reusable backdrop (for the transit animation) ---------- */

/**
 * The mandala's static rings ONLY — quarter halo, hexagram glyphs, zodiac, and
 * gate cells — with no chart activations, spokes, or center bodygraph. Used as
 * the backdrop for the animated transit wheel (planets are drawn over it). All
 * hexagrams render at full opacity; gate cells stay neutral.
 */
export function renderMandalaRings(
  size = 1600,
  opts: { hexagramResolver?: (gate: number) => string } = {},
): string {
  const g = geometry(size);
  const none = new Set<number>();
  const all = new Set<number>(GATE_RANGES.map((r) => r.gate));
  const resolver = opts.hexagramResolver ?? defaultHexagramResolver;
  return [
    quarterHalo(g),
    hexagramRing(g, all, resolver), // all "active" == full opacity glyphs
    zodiacRing(g),
    gateRing(g, none),              // neutral cells (no center coloring)
  ].join("\n");
}

/**
 * Geometry accessor so callers (the animation) can place elements on the same
 * wheel the rings use: identical center, radii, and longitude→point mapping
 * (VISUAL_TOP_LONGITUDE at 12 o'clock, longitude increasing counter-clockwise).
 */
export function mandalaWheelGeometry(size = 1600) {
  const g = geometry(size);
  return {
    size,
    cx: g.cx,
    cy: g.cy,
    r: g.r,
    pointAt: (radius: number, longitude: number) => pointAt(g, radius, longitude),
  };
}

/* ---------- Entry points ---------- */

export function renderFullMandala(
  chart: MandalaChart,
  opts: RenderOptions = {},
): string {
  const g = geometry(opts.size ?? 1600);
  const activated = new Set(chart.activations.map((a) => a.gate));
  const resolver = opts.hexagramResolver ?? defaultHexagramResolver;
  const parts = [
    defs(g),
    quarterHalo(g),
    hexagramRing(g, activated, resolver),
    activationWedges(g, activated),
    spokeGrid(g),
    activationSpokes(g, chart.activations),
    zodiacRing(g),
    gateRing(g, activated),
    centerHalo(g),
    activationGlyphs(g, chart.activations, opts.glyphScale ?? 1),
    bodygraphComposite(g, chart.bodygraphSvg),
  ];
  return svgShell(g, parts.join("\n"));
}

export function renderCrossMandala(
  chart: MandalaChart,
  opts: RenderOptions = {},
): string {
  const g = geometry(opts.size ?? 1600);
  const crossGates = [
    chart.cross.personalitySun,
    chart.cross.personalityEarth,
    chart.cross.designSun,
    chart.cross.designEarth,
  ];
  const crossSet = new Set(crossGates);
  // Pull the four Sun/Earth activations from the full chart so the cross
  // mandala can show planet glyphs and activated spokes alongside the
  // gate highlights.
  const crossActivations = chart.activations.filter(
    (a) =>
      (a.planet === "sun" || a.planet === "earth") && crossSet.has(a.gate),
  );
  const resolver = opts.hexagramResolver ?? defaultHexagramResolver;
  const parts = [
    defs(g),
    quarterHalo(g),
    hexagramRing(g, crossSet, resolver),
    activationWedges(g, crossSet),
    spokeGrid(g),
    activationSpokes(g, crossActivations),
    zodiacRing(g),
    gateRing(g, crossSet),
    highlightCrossGates(g, crossGates),
    centerHalo(g),
    activationGlyphs(g, crossActivations),
    bodygraphComposite(g, chart.bodygraphSvg),
  ];
  return svgShell(g, parts.join("\n"));
}
