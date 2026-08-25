/**
 * Standalone educational graphic for the Planetary Overview reports:
 * a single gate diagram showing the 6 line subdivisions, each numbered
 * and highlighted in yellow. Built for Gate 13 by default but the gate
 * number is parameterized so the same template works for any gate.
 *
 * Output: PNG (via qlmanage) + source SVG, written to
 * ~/Desktop/Mandala Renderer Output/Educational/
 */

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

function pieSlice(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startDeg: number,
  endDeg: number,
): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const p = (r: number, d: number) => ({
    x: cx + r * Math.cos(rad(d)),
    y: cy - r * Math.sin(rad(d)),
  });
  const p1 = p(rOuter, startDeg);
  const p2 = p(rOuter, endDeg);
  const p3 = p(rInner, endDeg);
  const p4 = p(rInner, startDeg);
  const span = Math.abs(endDeg - startDeg);
  const largeArc = span > 180 ? 1 : 0;
  // For SVG: sweep=0 means CCW in screen (which equals CCW in math/our coords).
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function renderGateLineDiagram(gate: number, size = 900): string {
  const cx = size / 2;
  const cy = size / 2 + size * 0.10; // shift content slightly down to leave room for the gate title at the top
  const wedgeDeg = 96;               // total angular width of the gate wedge for visibility
  const lineDeg = wedgeDeg / 6;      // each line sub-wedge is 1/6 of the gate
  // Wedge centered on math angle 90° (pointing up)
  const startDeg = 90 - wedgeDeg / 2;
  const endDeg = 90 + wedgeDeg / 2;
  const rOuter = size * 0.40;
  const rInner = size * 0.10;

  const yellow = "#fbf7b2";       // brand light yellow (G / Throat centers)
  const yellowEdge = "#c9a728";   // active-line accent yellow
  const ink = "#333333";
  const purple = "#845095";

  const rad = (d: number) => (d * Math.PI) / 180;
  const point = (r: number, d: number) => ({
    x: cx + r * Math.cos(rad(d)),
    y: cy - r * Math.sin(rad(d)),
  });

  // 1. Yellow-filled sub-wedge for each line.
  // Within the wedge, going CCW (increasing math angle = visually leftward)
  // corresponds to ascending line number (line 1 at the rightmost / CW end,
  // line 6 at the leftmost / CCW end), matching the actual wheel layout.
  const wedges: string[] = [];
  const numbers: string[] = [];
  for (let line = 1; line <= 6; line++) {
    const segStart = startDeg + (line - 1) * lineDeg;
    const segEnd = segStart + lineDeg;
    wedges.push(
      `<path d="${pieSlice(cx, cy, rOuter, rInner, segStart, segEnd)}" ` +
        `fill="${yellow}" stroke="${yellowEdge}" stroke-width="2" />`,
    );
    const midDeg = (segStart + segEnd) / 2;
    const labelR = (rOuter + rInner) / 2;
    const lp = point(labelR, midDeg);
    numbers.push(
      `<text x="${lp.x.toFixed(2)}" y="${lp.y.toFixed(2)}" ` +
        `text-anchor="middle" dominant-baseline="central" ` +
        `font-family="Georgia, serif" font-size="${(size * 0.06).toFixed(1)}" ` +
        `font-weight="bold" fill="${ink}">${line}</text>`,
    );
  }

  // 2. Hexagram glyph sitting above the wedge.
  const hexSize = size * 0.10;
  const hexY = cy - rOuter - hexSize - size * 0.02;
  const hexX = cx - hexSize / 2;
  const hexagram = `<image href="${hexagramDataUrl(gate)}" ` +
    `x="${hexX.toFixed(2)}" y="${hexY.toFixed(2)}" ` +
    `width="${hexSize.toFixed(2)}" height="${hexSize.toFixed(2)}" ` +
    `preserveAspectRatio="xMidYMid meet" />`;

  // 3. "Gate 13" title and caption.
  const titleY = hexY - size * 0.02;
  const title = `<text x="${cx}" y="${titleY.toFixed(2)}" ` +
    `text-anchor="middle" dominant-baseline="auto" ` +
    `font-family="Georgia, serif" font-size="${(size * 0.05).toFixed(1)}" ` +
    `font-weight="bold" fill="${purple}">Gate ${gate}</text>`;

  const captionY = cy + rOuter + size * 0.07;
  const caption = `<text x="${cx}" y="${captionY.toFixed(2)}" ` +
    `text-anchor="middle" font-family="Georgia, serif" ` +
    `font-size="${(size * 0.028).toFixed(1)}" font-style="italic" fill="#555555">` +
    `The six lines of a gate</text>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="${size}" height="${size}">` +
    title +
    hexagram +
    wedges.join("\n") +
    numbers.join("\n") +
    caption +
    `</svg>`
  );
}

function rasterize(svg: string, width: number, tag: string): Buffer {
  const svgPath = `${tmpdir()}/diagram-${tag}-${Date.now()}.svg`;
  writeFileSync(svgPath, svg);
  execFileSync("qlmanage", ["-t", "-s", String(width), "-o", tmpdir(), svgPath], {
    stdio: "ignore",
  });
  const pngPath = `${svgPath}.png`;
  const png = readFileSync(pngPath);
  unlinkSync(svgPath);
  unlinkSync(pngPath);
  return png;
}

const outDir = "/Users/dorothygale/Desktop/Mandala Renderer Output/Educational";
mkdirSync(outDir, { recursive: true });

const gate = 13;
const svg = renderGateLineDiagram(gate, 900);
writeFileSync(join(outDir, `gate-${gate}-lines.svg`), svg);
writeFileSync(join(outDir, `gate-${gate}-lines.png`), rasterize(svg, 1200, "gate-lines"));
console.log(`Wrote ${outDir}/gate-${gate}-lines.{svg,png}`);
