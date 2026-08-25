/**
 * Educational diagram: a zoomed-in view of a single gate within the
 * mandala wheel, with its 6 line subdivisions highlighted in yellow
 * and numbered. Built for Gate 13 but parameterized — works for any
 * of the 64 gates.
 */

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  GATE_ARC_DEGREES,
  GATE_RANGES,
  LINE_ARC_DEGREES,
  RANGE_BY_GATE,
  WHEEL_SEQUENCE,
} from "@/lib/hd/gate-longitude";

const VISUAL_TOP_LONGITUDE = 268.25;
const HEXAGRAM_ASSET_DIR = join(
  process.env.HOME ?? "",
  "Desktop",
  "Delphi Brand Assets",
  "sections",
  "hexagrams",
);

function hexagramDataUrl(gate: number): string {
  const buf = readFileSync(join(HEXAGRAM_ASSET_DIR, `${gate}.png`));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

interface Geometry {
  size: number;
  cx: number;
  cy: number;
  r: {
    hexagramOuter: number;
    hexagramInner: number;
    gateOuter: number;
    gateInner: number;
    zodiacOuter: number;
    zodiacInner: number;
    spokeOuter: number;
  };
}

function geometry(size: number): Geometry {
  return {
    size,
    cx: size / 2,
    cy: size / 2,
    r: {
      hexagramOuter: size * 0.450,
      hexagramInner: size * 0.410,
      gateOuter: size * 0.405,
      gateInner: size * 0.365,
      zodiacOuter: size * 0.358,
      zodiacInner: size * 0.342,
      spokeOuter: size * 0.335,
    },
  };
}

function longitudeToRadians(longitude: number): number {
  const fromTop = ((longitude - VISUAL_TOP_LONGITUDE) % 360 + 360) % 360;
  return Math.PI / 2 + (fromTop * Math.PI) / 180;
}

function pointAt(g: Geometry, r: number, longitude: number) {
  const a = longitudeToRadians(longitude);
  return { x: g.cx + r * Math.cos(a), y: g.cy - r * Math.sin(a) };
}

function annulusSector(g: Geometry, rOuter: number, rInner: number, startLon: number, endLon: number): string {
  const p1 = pointAt(g, rOuter, startLon);
  const p2 = pointAt(g, rOuter, endLon);
  const p3 = pointAt(g, rInner, endLon);
  const p4 = pointAt(g, rInner, startLon);
  const span = ((endLon - startLon) % 360 + 360) % 360;
  const largeArc = span > 180 ? 1 : 0;
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function renderGateInWheel(focusGate: number, size = 1600): string {
  const g = geometry(size);

  // 1. Gate ring (cells with numbers, focus gate gets yellow fill).
  const cells: string[] = [];
  for (const range of GATE_RANGES) {
    const isFocus = range.gate === focusGate;
    const fill = isFocus ? "#fbf7b2" : "#ffffff";
    const stroke = isFocus ? "#c9a728" : "#666666";
    const strokeW = isFocus ? 2 : 0.7;
    const path = annulusSector(g, g.r.gateOuter, g.r.gateInner, range.start, (range.start + GATE_ARC_DEGREES) % 360);
    const mid = (range.start + GATE_ARC_DEGREES / 2) % 360;
    const labelPos = pointAt(g, (g.r.gateOuter + g.r.gateInner) / 2, mid);
    const textFill = isFocus ? "#000000" : "#555555";
    const textWeight = isFocus ? "bold" : "normal";
    const textSize = isFocus ? (size * 0.015).toFixed(1) : (size * 0.013).toFixed(1);
    const textWeightValue = isFocus ? "700" : "300";
    cells.push(
      `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" />` +
      `<text x="${labelPos.x.toFixed(2)}" y="${labelPos.y.toFixed(2)}" ` +
      `text-anchor="middle" dominant-baseline="central" ` +
      `font-family="Montserrat, 'Helvetica Neue', sans-serif" font-size="${textSize}" ` +
      `font-weight="${textWeightValue}" fill="${textFill}">${range.gate}</text>`
    );
  }
  // Perimeter rings (gate ring outer/inner)
  cells.push(
    `<circle cx="${g.cx}" cy="${g.cy}" r="${g.r.gateOuter}" fill="none" stroke="#333333" stroke-width="1.2" />` +
    `<circle cx="${g.cx}" cy="${g.cy}" r="${g.r.gateInner}" fill="none" stroke="#333333" stroke-width="1.0" />`
  );

  // 2. Spokes — light gray template, just long enough to suggest the
  // radial structure (not all the way to center, to keep the diagram
  // uncluttered).
  const spokeInnerForTemplate = g.r.gateInner - size * 0.18;
  const spokeLines: string[] = [];
  for (let w = 0; w < WHEEL_SEQUENCE.length; w++) {
    const range = GATE_RANGES[w];
    for (let k = 0; k < 6; k++) {
      const lon = (range.start + k * LINE_ARC_DEGREES) % 360;
      const a = pointAt(g, g.r.gateInner, lon);
      const b = pointAt(g, spokeInnerForTemplate, lon);
      spokeLines.push(
        `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" ` +
        `x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" ` +
        `stroke="#e0e0e0" stroke-width="0.4" />`
      );
    }
  }

  // 3. For the focus gate, fill each of the 6 line sub-wedges in yellow,
  // with leader lines extending inward from each line's spoke to a
  // numbered callout. The callouts fan out at a wider angle than the
  // raw spokes so the numbers don't crowd.
  const range = RANGE_BY_GATE.get(focusGate);
  if (!range) throw new Error(`unknown gate ${focusGate}`);

  const lineOuter = g.r.gateInner;
  const lineInner = g.r.gateInner - size * 0.045; // shallow yellow band

  const lineWedges: string[] = [];
  const leaderLines: string[] = [];
  const numberLabels: string[] = [];

  const gateCenterLon = (range.start + GATE_ARC_DEGREES / 2) % 360;
  // Callouts sit on an inner arc, fanned out to ±SPREAD/2° around the gate
  // — wide enough that the 6 numbers don't crowd into each other.
  const calloutRadius = g.r.gateInner - size * 0.13;
  const calloutSpreadDeg = 60;
  for (let k = 0; k < 6; k++) {
    const subStart = (range.start + k * LINE_ARC_DEGREES) % 360;
    const subEnd = (range.start + (k + 1) * LINE_ARC_DEGREES) % 360;
    const path = annulusSector(g, lineOuter, lineInner, subStart, subEnd);
    lineWedges.push(
      `<path d="${path}" fill="#fbf7b2" stroke="#c9a728" stroke-width="1.5" />`
    );
    // Spoke midpoint at the line band's inner edge
    const spokeMidLon = (range.start + k * LINE_ARC_DEGREES + LINE_ARC_DEGREES / 2) % 360;
    const spokeEnd = pointAt(g, lineInner, spokeMidLon);
    // Callout longitude: fan out from gate center
    const tFrac = (k - 2.5) / 2.5; // -1 to +1 across the 6 lines
    const calloutLon = (gateCenterLon + tFrac * calloutSpreadDeg / 2 + 360) % 360;
    const calloutPos = pointAt(g, calloutRadius, calloutLon);
    leaderLines.push(
      `<line x1="${spokeEnd.x.toFixed(2)}" y1="${spokeEnd.y.toFixed(2)}" ` +
      `x2="${calloutPos.x.toFixed(2)}" y2="${calloutPos.y.toFixed(2)}" ` +
      `stroke="#c9a728" stroke-width="1.5" />`
    );
    numberLabels.push(
      `<circle cx="${calloutPos.x.toFixed(2)}" cy="${calloutPos.y.toFixed(2)}" ` +
      `r="${(size * 0.018).toFixed(2)}" fill="#ffffff" stroke="#c9a728" stroke-width="2" ` +
      `filter="url(#callout-shadow)" />`,
      `<text x="${calloutPos.x.toFixed(2)}" y="${calloutPos.y.toFixed(2)}" ` +
      `text-anchor="middle" dominant-baseline="central" ` +
      `font-family="Montserrat, 'Helvetica Neue', sans-serif" font-size="${(size * 0.020).toFixed(1)}" ` +
      `font-weight="600" fill="#845095">${k + 1}</text>`
    );
  }

  // 4. Hexagram for the focus gate.
  const hexSize = (g.r.hexagramOuter - g.r.hexagramInner) * 0.95;
  const hexMid = (range.start + GATE_ARC_DEGREES / 2) % 360;
  const hexR = (g.r.hexagramOuter + g.r.hexagramInner) / 2;
  const hexCenter = pointAt(g, hexR, hexMid);
  const hexagram = `<image href="${hexagramDataUrl(focusGate)}" ` +
    `x="${(hexCenter.x - hexSize / 2).toFixed(2)}" y="${(hexCenter.y - hexSize / 2).toFixed(2)}" ` +
    `width="${hexSize.toFixed(2)}" height="${hexSize.toFixed(2)}" preserveAspectRatio="xMidYMid meet" />`;

  // 5. Compute viewBox cropped around the focus gate. Tighter zoom now
  // that the numbers sit on callouts further inside.
  const focusCenter = pointAt(g, (g.r.gateOuter + g.r.gateInner) / 2, hexMid);
  const viewW = size * 0.42;
  const viewH = size * 0.42;
  // Bias the viewbox inward so we see the callouts under the line band.
  const inward = pointAt(g, calloutRadius - size * 0.04, hexMid);
  const viewCx = (focusCenter.x + inward.x) / 2;
  const viewCy = (focusCenter.y + inward.y) / 2;
  const vbX = viewCx - viewW / 2;
  const vbY = viewCy - viewH / 2;

  // 6. Title block lives in a dedicated band BELOW the wheel content so
  // the typographic hierarchy isn't crowded by the lowest callout.
  const titleBandHeight = size * 0.16;
  const totalViewH = viewH + titleBandHeight;

  // Thin divider rule between graphic and title — purely typographic.
  const ruleY = vbY + viewH + size * 0.03;
  const ruleHalfWidth = size * 0.05;
  const rule = `<line x1="${(viewCx - ruleHalfWidth).toFixed(2)}" ` +
    `y1="${ruleY.toFixed(2)}" ` +
    `x2="${(viewCx + ruleHalfWidth).toFixed(2)}" y2="${ruleY.toFixed(2)}" ` +
    `stroke="#c9a728" stroke-width="1.2" />`;

  const titleX = viewCx;
  const titleY = vbY + viewH + size * 0.085;
  const subtitleY = titleY + size * 0.038;
  const title = `<text x="${titleX.toFixed(2)}" y="${titleY.toFixed(2)}" ` +
    `text-anchor="middle" dominant-baseline="auto" ` +
    `font-family="Montserrat, 'Helvetica Neue', sans-serif" ` +
    `font-size="${(size * 0.030).toFixed(1)}" font-weight="600" ` +
    `letter-spacing="5" fill="#845095">GATE ${focusGate}</text>`;
  const subtitle = `<text x="${titleX.toFixed(2)}" y="${subtitleY.toFixed(2)}" ` +
    `text-anchor="middle" dominant-baseline="auto" ` +
    `font-family="Montserrat, 'Helvetica Neue', sans-serif" ` +
    `font-size="${(size * 0.020).toFixed(1)}" font-weight="300" ` +
    `letter-spacing="2" fill="#777777">The Six Lines</text>`;

  // Soft drop shadow under the callout circles for a designed depth feel.
  const defs = `<defs>` +
    `<filter id="callout-shadow" x="-50%" y="-50%" width="200%" height="200%">` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation="${(size * 0.003).toFixed(2)}" />` +
    `<feOffset dx="0" dy="${(size * 0.002).toFixed(2)}" result="offsetblur" />` +
    `<feComponentTransfer><feFuncA type="linear" slope="0.18" /></feComponentTransfer>` +
    `<feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>` +
    `</filter>` +
    `</defs>`;

  // Output canvas matches the extended viewBox aspect.
  const canvasW = 900;
  const canvasH = Math.round((canvasW * totalViewH) / viewW);

  // Explicit white background so rasterizers that treat unset bg as black
  // (librsvg / sharp) still produce a clean print-ready image.
  const background = `<rect x="${vbX.toFixed(2)}" y="${vbY.toFixed(2)}" ` +
    `width="${viewW.toFixed(2)}" height="${totalViewH.toFixed(2)}" fill="#ffffff" />`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="${vbX.toFixed(2)} ${vbY.toFixed(2)} ${viewW.toFixed(2)} ${totalViewH.toFixed(2)}" ` +
    `width="${canvasW}" height="${canvasH}">` +
    defs +
    background +
    spokeLines.join("\n") +
    cells.join("\n") +
    hexagram +
    lineWedges.join("\n") +
    leaderLines.join("\n") +
    numberLabels.join("\n") +
    rule +
    title +
    subtitle +
    `</svg>`
  );
}

async function rasterize(svg: string, width: number): Promise<Buffer> {
  // qlmanage forces square output (1400x1400) which clips this diagram's
  // non-square aspect. sharp preserves the SVG's aspect ratio. This
  // diagram uses only straight <text> (no textPath / gradients), so
  // sharp's known textPath/opacity edge cases don't apply here.
  const { default: sharp } = await import("sharp");
  return await sharp(Buffer.from(svg), { density: 200 })
    .resize({ width })
    .png()
    .toBuffer();
}

(async () => {
  const outDir = "/Users/dorothygale/Desktop/Mandala Renderer Output/Educational";
  mkdirSync(outDir, { recursive: true });

  const gate = 13;
  const svg = renderGateInWheel(gate, 1600);
  writeFileSync(join(outDir, `gate-${gate}-in-wheel.svg`), svg);
  writeFileSync(join(outDir, `gate-${gate}-in-wheel.png`), await rasterize(svg, 1400));
  console.log(`Wrote ${outDir}/gate-${gate}-in-wheel.{svg,png}`);
})();
