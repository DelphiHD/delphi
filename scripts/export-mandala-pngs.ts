// Export the standalone Bodygraph chart image + Full Mandala + Incarnation
// Cross Mandala as PNGs into the client's HD Reports folder. Mirrors
// render-planetary-docx.ts's chart-fetch + rasterize pipeline so output matches
// the in-docx images exactly.
//
//   npx tsx scripts/export-mandala-pngs.ts <client-slug>
//
// Writes (into Paid HD Reports/<Name>/ via clientOutputDir):
//   <Name> - Bodygraph.png      (the Delphi-styled chart, nice for slides)
//   <Name> - Full Mandala.png
//   <Name> - Cross Mandala.png

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { writeFileSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderFullMandala, renderCrossMandala } from "@/lib/render/mandala";
import { svgToPng } from "@/lib/render/docx";
import { gateName, GATE_NAMES } from "@/lib/hd/gate-names";
import { getChart } from "@/lib/mybodygraph";
import { centerOf } from "@/lib/hd/gate-center";
import { buildDataPass } from "@/lib/chart/datapass";
import { createClient } from "@supabase/supabase-js";
import type { MandalaChart, Activation, Planet } from "@/lib/render/mandala.types";

const HOST = "https://api.bodygraphchart.com";
const API_KEY = process.env.MYBODYGRAPH_API_KEY!;

import { CLIENTS, clientFromSlug, clientOutputDir, type ClientBrief } from "./client-roster";

const PLANET_KEY_MAP: Record<string, Planet> = {
  Sun: "sun", Earth: "earth", Moon: "moon",
  "North Node": "north-node", "South Node": "south-node",
  Mercury: "mercury", Mars: "mars", Venus: "venus",
  Jupiter: "jupiter", Saturn: "saturn",
  Uranus: "uranus", Neptune: "neptune", Pluto: "pluto",
};

// Canonical planetary order for the placement columns (matches the chart
// software's side-of-bodygraph layout).
const PLANET_ORDER = ["Sun", "Earth", "Moon", "North Node", "South Node", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const PLANET_GLYPHS: Record<string, string> = {
  Sun: "☉", Earth: "⊕", Moon: "☽", "North Node": "☊", "South Node": "☋",
  Mercury: "☿", Venus: "♀", Mars: "♂", Jupiter: "♃", Saturn: "♄",
  Uranus: "⛢", Neptune: "♆", Pluto: "♇",
};
const escXml = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Placement-table layout (shared so the width can be standardized in main()).
const PT = { mX: 22, glyphX: 22, planetX: 50, gateX: 196, nameX: 292, rowH: 44, charW: 9.7 };
// Standardize the name column to the longest gate name in the catalog so every
// image (both sides, every client) comes out the same width.
const LONGEST_GATE_NAME = Math.max(...Object.values(GATE_NAMES).map((n) => n.length));
const PROFILE_LINES: Record<number, string> = { 1: "Investigator", 2: "Hermit", 3: "Martyr", 4: "Opportunist", 5: "Heretic", 6: "Role Model" };

// Parse a Data Pass variable header into { variable, color, direction, tone }.
// e.g. "Digestion - Color 5: Sound, Left Arrow | Active: High, Tone 3: Outer Vision"
// (a trailing ", Transference: ..." / ", Distraction: ..." is intentionally dropped).
function parseVariableHeader(h: string): { variable: string; color: string; direction: string; tone: string } | null {
  const m = h.match(/^(.+?) - Color (\d+): (.+?), (Left|Right) Arrow \| (.+?), Tone (\d+): ([^,]+)/);
  if (!m) return null;
  const arrow = m[4] === "Left" ? "◀" : "▶";
  return { variable: m[1], color: `${m[2]}: ${m[3]}`, direction: `${arrow} ${m[5]}`, tone: `${m[6]}: ${m[7]}` };
}

// ── Bodygraph overlays: variable arrows + center labels ──────────────────────
// The Delphi bodygraph SVG is a 400x693 canvas that draws all 64 gate numbers as
// <text transform="translate(x y)"> elements. We parse those anchors to place
// center-name labels at each center's centroid, and draw the four PHS variable
// arrows in the margins (Design/red on the left, Personality/black on the right).
const CENTER_LABEL: Record<string, string> = {
  head: "Head", ajna: "Ajna", throat: "Throat", g: "G", heart: "Heart",
  spleen: "Spleen", sacral: "Sacral", "solar-plexus": "Solar Plexus", root: "Root",
};
function gateAnchors(svg: string): Record<number, { x: number; y: number }> {
  const re = /<text\b[^>]*transform="translate\(([\d.]+)\s+([\d.]+)\)[^>]*>([\s\S]*?)<\/text>/g;
  const a: Record<number, { x: number; y: number }> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const n = parseInt(m[3].replace(/<[^>]*>/g, "").trim(), 10);
    if (n >= 1 && n <= 64) a[n] = { x: +m[1], y: +m[2] };
  }
  return a;
}
function centerCentroids(a: Record<number, { x: number; y: number }>): Record<string, { x: number; y: number }> {
  const by: Record<string, { x: number; y: number }[]> = {};
  for (const [g, p] of Object.entries(a)) (by[centerOf(+g)] ??= []).push(p);
  const out: Record<string, { x: number; y: number }> = {};
  for (const [c, ps] of Object.entries(by)) out[c] = { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
  return out;
}
function arrowTriangle(x: number, y: number, dir: "left" | "right", color: string, s = 15): string {
  const pts = dir === "left" ? `${x + s},${y - s} ${x + s},${y + s} ${x - s},${y}` : `${x - s},${y - s} ${x - s},${y + s} ${x + s},${y}`;
  return `<polygon points="${pts}" fill="${color}"/>`;
}
// Build a bodygraph SVG with the four variable arrows and (optionally) center
// labels overlaid. `arrows` maps each variable to its left/right direction.
function overlayBodygraph(svg: string, arrows: Record<"determination" | "environment" | "motivation" | "perspective", "left" | "right">, withLabels: boolean): string {
  const cen = centerCentroids(gateAnchors(svg));
  const ff = `font-family="Montserrat, Arial, sans-serif"`;
  const RED = "#e06666", BLACK = "#333333", PURPLE = "#845095";
  let out = svg.replace(/viewbox="0 0 400 693"/i, `viewBox="-120 -75 640 850"`);
  let ov = "";
  const rows: { x: number; y: number; v: string; dir: "left" | "right"; color: string }[] = [
    { x: -55, y: 150, v: "Digestion", dir: arrows.determination, color: RED },
    { x: -55, y: 560, v: "Environment", dir: arrows.environment, color: RED },
    { x: 455, y: 150, v: "Perspective", dir: arrows.perspective, color: BLACK },
    { x: 455, y: 560, v: "Motivation", dir: arrows.motivation, color: BLACK },
  ];
  for (const r of rows) {
    ov += arrowTriangle(r.x, r.y, r.dir, r.color, 15);
    ov += `<text x="${r.x}" y="${r.y + 34}" ${ff} font-size="15" font-weight="700" fill="${r.color}" text-anchor="middle">${r.v}</text>`;
  }
  if (withLabels) {
    for (const [c, p] of Object.entries(cen)) {
      const name = CENTER_LABEL[c] || c;
      const w = name.length * 8 + 14;
      ov += `<rect x="${p.x - w / 2}" y="${p.y - 13}" width="${w}" height="24" rx="12" fill="#ffffff" opacity="0.82"/>`;
      ov += `<text x="${p.x}" y="${p.y + 5}" ${ff} font-size="14" font-weight="700" fill="${PURPLE}" text-anchor="middle">${name}</text>`;
    }
  }
  return out.replace(/<\/svg>\s*$/, ov + "</svg>");
}

// Herschel "H with a circle" Uranus symbol (⛢), drawn as vectors because that
// codepoint isn't in the fonts resvg can reach (it rasterizes as tofu). Clearer
// than the ♅ variant, and always renders. Positioned to sit like a text glyph
// whose left edge is at glyphX and whose baseline is y.
function uranusGlyphSvg(glyphX: number, y: number, color: string): string {
  const cx = glyphX + 7;
  return `<g stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round">`
    + `<line x1="${cx - 6}" y1="${y - 15}" x2="${cx - 6}" y2="${y - 3}"/>`
    + `<line x1="${cx + 6}" y1="${y - 15}" x2="${cx + 6}" y2="${y - 3}"/>`
    + `<line x1="${cx - 6}" y1="${y - 9}" x2="${cx + 6}" y2="${y - 9}"/>`
    + `<line x1="${cx}" y1="${y - 9}" x2="${cx}" y2="${y - 1}"/>`
    + `<circle cx="${cx}" cy="${y + 1.5}" r="2.4" fill="${color}" stroke="none"/>`
    + `</g>`;
}

// Canonical center order (top to bottom) + standard theme text. The theme
// column has no stored source, so these are standard HD center themes for
// Kaycee to adjust.
const CENTER_ORDER = ["Head", "Ajna", "Throat", "G", "Heart", "Sacral", "Solar Plexus", "Spleen", "Root"];
const CENTER_THEMES: Record<string, string> = {
  Head: "Inspiration & Mental Pressure",
  Ajna: "Conceptualization & Certainty",
  Throat: "Communication & Manifestation",
  G: "Identity, Love & Direction",
  Heart: "Willpower & Worth",
  Sacral: "Life Force & Work",
  "Solar Plexus": "Emotions & Spirit",
  Spleen: "Intuition, Health & Survival",
  Root: "Pressure & Drive",
};
// Normalize a Data Pass center name to a CENTER_THEMES key.
function normCenter(name: string): string {
  const n = name.toLowerCase().replace(/\s*center$/i, "").trim();
  if (/^(g|identity|self)$/.test(n)) return "G";
  if (/^(heart|ego|will)$/.test(n)) return "Heart";
  if (/spleen|splenic/.test(n)) return "Spleen";
  if (/solar|emotional|plexus/.test(n)) return "Solar Plexus";
  if (n === "head") return "Head";
  if (n === "ajna") return "Ajna";
  if (n === "throat") return "Throat";
  if (n === "sacral") return "Sacral";
  if (n === "root") return "Root";
  return name;
}

// Generic multi-column grid table (Centers, Channels), brand-styled with a
// centered all-caps title, a purple header row, and alternating row shading.
// Column x-positions auto-fit the content.
function gridTableSvg(title: string, headers: string[], rows: string[][]): { svg: string; w: number } {
  const { mX, rowH } = PT;
  const top = 138;
  const gap = 34;
  const xs: number[] = [];
  let x = mX;
  for (let c = 0; c < headers.length; c++) {
    xs.push(x);
    const colChars = Math.max(headers[c].length, ...rows.map((r) => (r[c] || "").length));
    x += Math.ceil(colChars * 9.7) + gap;
  }
  const W = Math.max(430, x - gap + mX);
  const H = top + rows.length * rowH + 16;
  const purple = "#845095", charcoal = "#333333", gray = "#555555";
  const ff = `font-family="Montserrat, 'Helvetica Neue', Arial, sans-serif"`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  s += `<text x="${W / 2}" y="46" ${ff} font-size="30" font-weight="700" fill="${charcoal}" text-anchor="middle" letter-spacing="2">${escXml(title.toUpperCase())}</text>`;
  headers.forEach((h, c) => { s += `<text x="${xs[c]}" y="98" ${ff} font-size="14" font-weight="700" fill="${purple}">${escXml(h.toUpperCase())}</text>`; });
  s += `<line x1="${mX}" y1="110" x2="${W - mX}" y2="110" stroke="${purple}" stroke-width="1.5"/>`;
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    if (i % 2 === 1) s += `<rect x="${mX - 8}" y="${y - 28}" width="${W - 2 * mX + 16}" height="${rowH}" fill="#f6f2f7"/>`;
    r.forEach((cell, c) => {
      const bold = c === 0 ? ` font-weight="700"` : "";
      const col = c === 0 ? charcoal : gray;
      s += `<text x="${xs[c]}" y="${y}" ${ff} font-size="18"${bold} fill="${col}">${escXml(cell)}</text>`;
    });
  });
  s += `</svg>`;
  return { svg: s, w: W };
}

// Generic two-column key/value table (Overview, Variables), same brand styling
// as the placement tables: centered all-caps title, purple labels, alternating
// row shading. Width flexes to the content.
function kvTableSvg(title: string, rows: { k: string; v: string }[]): { svg: string; w: number } {
  const { mX, rowH } = PT;
  const top = 104;
  const longestK = Math.max(...rows.map((r) => r.k.length));
  const valueX = mX + Math.ceil(longestK * 10.6) + 30;
  const longestV = Math.max(8, ...rows.map((r) => r.v.length));
  const W = Math.max(430, Math.ceil(valueX + longestV * 9.6 + mX));
  const H = top + rows.length * rowH + 16;
  const purple = "#845095", charcoal = "#333333", val = "#222222";
  const ff = `font-family="Montserrat, 'Helvetica Neue', Arial, sans-serif"`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  s += `<text x="${W / 2}" y="46" ${ff} font-size="30" font-weight="700" fill="${charcoal}" text-anchor="middle" letter-spacing="2">${escXml(title.toUpperCase())}</text>`;
  s += `<line x1="${mX}" y1="70" x2="${W - mX}" y2="70" stroke="${purple}" stroke-width="1.5"/>`;
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    if (i % 2 === 1) s += `<rect x="${mX - 8}" y="${y - 28}" width="${W - 2 * mX + 16}" height="${rowH}" fill="#f6f2f7"/>`;
    s += `<text x="${mX}" y="${y}" ${ff} font-size="18" font-weight="700" fill="${purple}">${escXml(r.k)}</text>`;
    s += `<text x="${valueX}" y="${y}" ${ff} font-size="18" fill="${val}">${escXml(r.v)}</text>`;
  });
  s += `</svg>`;
  return { svg: s, w: W };
}

// Standalone planetary placement table (one side) as a brand-styled SVG. These
// are the columns that flank the bodygraph in the chart software; Kaycee wants
// them on their own for slides. Personality reads in charcoal, Design in the
// red the software uses for the design side.
function placementTableSvg(side: "Personality" | "Design", raw: any, subtitle: string, W: number): string {
  const src = side === "Personality" ? raw.Personality : raw.Design;
  const rows = PLANET_ORDER
    .map((p) => {
      const d = src[p];
      if (!d) return null;
      const fix = /exalt/i.test(d.FixingState || "") ? "▲" : /detriment/i.test(d.FixingState || "") ? "▽" : "";
      return { planet: p, glyph: PLANET_GLYPHS[p] || "", gl: `${d.Gate}.${d.Line}`, fix, name: gateName(d.Gate) };
    })
    .filter(Boolean) as { planet: string; glyph: string; gl: string; fix: string; name: string }[];
  // Column x-positions from the shared layout; overall width W is standardized
  // by the caller (sized to the longest gate name so all images match).
  const { mX, glyphX, planetX, gateX, nameX, rowH } = PT;
  const top = 150;
  const H = top + rows.length * rowH + 16;
  // Personality reads charcoal; the Design image is entirely in the chart's
  // design red. Column headers/values/name follow that per-side scheme.
  const accent = side === "Design" ? "#e06666" : "#333333";
  const red = "#e06666", purple = "#845095", gray = "#666666";
  const headerCol = side === "Design" ? red : purple;
  const gateCol = side === "Design" ? red : "#222222";
  const nameCol = side === "Design" ? red : gray;
  const subCol = side === "Design" ? red : gray;
  const ff = `font-family="Montserrat, 'Helvetica Neue', Arial, sans-serif"`;
  const gf = `font-family="'Apple Symbols', 'Segoe UI Symbol', Montserrat, sans-serif"`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  s += `<text x="${W / 2}" y="44" ${ff} font-size="30" font-weight="700" fill="${accent}" text-anchor="middle" letter-spacing="2">${side.toUpperCase()}</text>`;
  s += `<text x="${W / 2}" y="72" ${ff} font-size="15" fill="${subCol}" text-anchor="middle">${escXml(subtitle)}</text>`;
  s += `<text x="${mX}" y="110" ${ff} font-size="14" font-weight="700" fill="${headerCol}">PLANET</text>`;
  s += `<text x="${gateX}" y="110" ${ff} font-size="14" font-weight="700" fill="${headerCol}">GATE</text>`;
  s += `<text x="${nameX}" y="110" ${ff} font-size="14" font-weight="700" fill="${headerCol}">NAME</text>`;
  s += `<line x1="${mX}" y1="122" x2="${W - mX}" y2="122" stroke="${headerCol}" stroke-width="1.5"/>`;
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    if (i % 2 === 1) s += `<rect x="${mX - 8}" y="${y - 28}" width="${W - 2 * mX + 16}" height="${rowH}" fill="#f6f2f7"/>`;
    if (r.planet === "Uranus") s += uranusGlyphSvg(glyphX, y, accent);
    else s += `<text x="${glyphX}" y="${y}" ${gf} font-size="19" fill="${accent}">${escXml(r.glyph)}</text>`;
    s += `<text x="${planetX}" y="${y}" ${ff} font-size="19" fill="${accent}">${escXml(r.planet)}</text>`;
    // Gate.line is its OWN pure-number text element so it always renders bold.
    // The fixation arrow (▲/▽) is a SEPARATE element positioned after it: mixing
    // the arrow into the number run makes resvg fall back to a non-bold font for
    // the whole run (the ▽ glyph isn't in the bold face), which silently dropped
    // the bold on exactly the fixed placements.
    s += `<text x="${gateX}" y="${y}" ${ff} font-size="19" font-weight="700" fill="${gateCol}">${escXml(r.gl)}</text>`;
    if (r.fix) {
      const glW = [...r.gl].reduce((w, ch) => w + (ch === "." ? 5 : 10.5), 0);
      s += `<text x="${(gateX + glW + 8).toFixed(1)}" y="${y}" ${gf} font-size="16" fill="${gateCol}">${r.fix}</text>`;
    }
    s += `<text x="${nameX}" y="${y}" ${ff} font-size="18" fill="${nameCol}">${escXml(r.name)}</text>`;
  });
  s += `</svg>`;
  return s;
}

async function lookupTimezone(query: string): Promise<string> {
  const url = new URL(`${HOST}/v210502/locations`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("query", query);
  const res = await fetch(url);
  const data = await res.json() as Array<{ value: string; timezone: string }>;
  return data[0].timezone;
}

async function fetchChart(c: ClientBrief): Promise<any> {
  const tz = await lookupTimezone(c.birthPlace);
  const url = new URL(`${HOST}/v221006/hd-data`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("date", `${c.birthDate} ${c.birthTime}`);
  url.searchParams.set("timezone", tz);
  url.searchParams.set("design", "delphi");
  return (await fetch(url)).json();
}

function toActivations(side: "personality" | "design", planets: Record<string, any>): Activation[] {
  const out: Activation[] = [];
  for (const [apiKey, planet] of Object.entries(PLANET_KEY_MAP)) {
    const d = planets[apiKey];
    if (d) out.push({ side, planet, gate: d.Gate, line: d.Line });
  }
  return out;
}

function rasterize(svg: string, width: number, tag: string): Buffer {
  const svgPath = `${tmpdir()}/mandala-${tag}-${Date.now()}.svg`;
  writeFileSync(svgPath, svg);
  execFileSync("qlmanage", ["-t", "-s", String(width), "-o", tmpdir(), svgPath], { stdio: "ignore" });
  const pngPath = `${svgPath}.png`;
  const png = readFileSync(pngPath);
  unlinkSync(svgPath);
  unlinkSync(pngPath);
  return png;
}

async function main() {
  const slug = process.argv[2];
  if (!slug || !CLIENTS[slug]) {
    console.error(`usage: npx tsx scripts/export-mandala-pngs.ts <client-slug>`);
    console.error(`available slugs: ${Object.keys(CLIENTS).join(", ")}`);
    process.exit(1);
  }
  const client = CLIENTS[slug];

  console.log(`\n=== Exporting mandalas for ${client.name} ===\n`);
  console.log(`Fetching chart from mybodygraph...`);
  const raw = await fetchChart(client);
  console.log(`  ${raw.Properties.Type.option}, ${raw.Properties.Profile.option}, ${raw.Properties.IncarnationCross.option}`);

  // Parse cross gates from string like "Right Angle Cross of Service (52/58 | 17/18)"
  const crossText = raw.Properties.IncarnationCross.option as string;
  const crossMatch = crossText.match(/\((\d+)\/(\d+)\s*\|\s*(\d+)\/(\d+)\)/);
  if (!crossMatch) throw new Error(`cannot parse cross from "${crossText}"`);

  const chart: MandalaChart = {
    clientName: client.name,
    activations: [
      ...toActivations("personality", raw.Personality),
      ...toActivations("design", raw.Design),
    ],
    cross: {
      personalitySun: +crossMatch[1],
      personalityEarth: +crossMatch[2],
      designSun: +crossMatch[3],
      designEarth: +crossMatch[4],
    },
    bodygraphSvg: raw.SVG,
  };

  console.log(`Rendering mandalas at 1600px...`);
  const fullSvg = renderFullMandala(chart, { size: 1600 });
  const crossSvg = renderCrossMandala(chart, { size: 1600 });
  const fullPng = rasterize(fullSvg, 1600, "full");
  const crossPng = rasterize(crossSvg, 1600, "cross");
  // Standalone Bodygraph chart image with the four PHS variable arrows overlaid,
  // plus a centers-labeled variant. Arrow directions come straight from
  // raw.Variables (no Data Pass needed). Rasterize with resvg (fit-to-width,
  // preserves the full portrait height) NOT qlmanage, which crops the tall SVG.
  const bgArrows = raw.SVG ? {
    determination: raw.Variables.Digestion as "left" | "right",
    environment: raw.Variables.Environment as "left" | "right",
    motivation: raw.Variables.Awareness as "left" | "right",
    perspective: raw.Variables.Perspective as "left" | "right",
  } : null;

  const outDir = clientOutputDir(client);
  mkdirSync(outDir, { recursive: true });

  const fullPath = join(outDir, `${client.name} - Full Mandala.png`);
  const crossPath = join(outDir, `${client.name} - Cross Mandala.png`);
  writeFileSync(fullPath, fullPng);
  writeFileSync(crossPath, crossPng);

  console.log("");
  if (raw.SVG && bgArrows) {
    const bodygraphPath = join(outDir, `${client.name} - Bodygraph.png`);
    const bodygraphLabeledPath = join(outDir, `${client.name} - Bodygraph Labeled.png`);
    const bgPng = svgToPng(overlayBodygraph(raw.SVG, bgArrows, false), { widthPx: 1500 });
    const bgLabeledPng = svgToPng(overlayBodygraph(raw.SVG, bgArrows, true), { widthPx: 1500 });
    writeFileSync(bodygraphPath, bgPng);
    writeFileSync(bodygraphLabeledPath, bgLabeledPng);
    console.log(`✓ ${bodygraphPath}  (${(bgPng.length / 1024).toFixed(0)} KB)`);
    console.log(`✓ ${bodygraphLabeledPath}  (${(bgLabeledPng.length / 1024).toFixed(0)} KB)`);
  } else {
    console.log(`  ⚠ no bodygraph SVG returned by mybodygraph; skipped Bodygraph images`);
  }
  console.log(`✓ ${fullPath}  (${(fullPng.length / 1024).toFixed(0)} KB)`);
  console.log(`✓ ${crossPath}  (${(crossPng.length / 1024).toFixed(0)} KB)`);

  // Standalone planetary placement tables (Personality + Design) for slides.
  // Subtitle: Personality shows the local birth date/time + place; Design shows
  // the design moment (~88 days prior) in the same local timezone.
  const tz = await lookupTimezone(client.birthPlace);
  const P = raw.Properties;
  const dfmt = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long", day: "numeric", year: "numeric" }).format(new Date(iso));
  const tfmt = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
  const persSub = `${dfmt(P.BirthDateUtcStandard)} · ${tfmt(P.BirthDateUtcStandard)} · ${client.birthPlace}`;
  const desSub = `${dfmt(P.DesignDateUtcStandard)} · ${tfmt(P.DesignDateUtcStandard)}`;
  // Standardize width across both images: size the name column to the longest
  // gate name in the catalog, and never let a long subtitle clip.
  const W = Math.max(
    430,
    Math.ceil(PT.nameX + LONGEST_GATE_NAME * PT.charW + PT.mX),
    Math.ceil(2 * PT.mX + Math.max(persSub.length, desSub.length) * 7.3),
  );
  const persTablePng = svgToPng(placementTableSvg("Personality", raw, persSub, W), { widthPx: W * 2 });
  const desTablePng = svgToPng(placementTableSvg("Design", raw, desSub, W), { widthPx: W * 2 });
  const persTablePath = join(outDir, `${client.name} - Personality Placements.png`);
  const desTablePath = join(outDir, `${client.name} - Design Placements.png`);
  writeFileSync(persTablePath, persTablePng);
  writeFileSync(desTablePath, desTablePng);
  console.log(`✓ ${persTablePath}  (${(persTablePng.length / 1024).toFixed(0)} KB)`);
  console.log(`✓ ${desTablePath}  (${(desTablePng.length / 1024).toFixed(0)} KB)`);

  // Overview table from getChart (values in the reports' vocabulary). Profile
  // includes the line names, e.g. "2 / 4 Hermit Opportunist".
  const hdChart = await getChart({ birthDate: client.birthDate, birthTime: client.birthTime, timezone: tz, locationQuery: client.birthPlace, includeChartImage: false });
  const profLines = (hdChart.profile.value.match(/\d/g) ?? []).map(Number).map((n) => PROFILE_LINES[n]).filter(Boolean);
  const overviewRows = [
    { k: "Type", v: hdChart.type.value },
    { k: "Profile", v: `${hdChart.profile.value} ${profLines.join(" ")}`.trim() },
    { k: "Definition", v: hdChart.definition.value },
    { k: "Authority", v: hdChart.authority.value },
    { k: "Strategy", v: hdChart.strategy.value },
    { k: "Not-Self Theme", v: hdChart.notSelfTheme.value },
    { k: "Incarnation Cross", v: hdChart.incarnationCross.value },
  ];
  const overview = kvTableSvg("Overview", overviewRows);
  const overviewPath = join(outDir, `${client.name} - Overview.png`);
  const overviewPng = svgToPng(overview.svg, { widthPx: overview.w * 2 });
  writeFileSync(overviewPath, overviewPng);
  console.log(`✓ ${overviewPath}  (${(overviewPng.length / 1024).toFixed(0)} KB)`);

  // Centers + Channels tables from the Data Pass (authoritative 3-state center
  // status and channel circuits from Kaycee's Notion library). Best-effort: a
  // Supabase/library hiccup must not lose the images already written above.
  try {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const dataPass = await buildDataPass({ supabase, client: { name: client.name }, chart: hdChart });
  const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : "");

  // Variables table: Variable | Color | Direction | Tone, parsed from the same
  // Data Pass variable headers the Foundation report uses.
  const varKeys = ["determination", "environment", "motivation", "perspective"] as const;
  const variableRows = varKeys
    .map((k) => parseVariableHeader(dataPass.variableHeaders[k]))
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => [p.variable, p.color, p.direction, p.tone]);
  const variablesTbl = gridTableSvg("Variables", ["Variable", "Color", "Direction", "Tone"], variableRows);
  const variablesPath = join(outDir, `${client.name} - Variables.png`);
  const variablesPng = svgToPng(variablesTbl.svg, { widthPx: variablesTbl.w * 2 });
  writeFileSync(variablesPath, variablesPng);
  console.log(`✓ ${variablesPath}  (${(variablesPng.length / 1024).toFixed(0)} KB)`);

  const statusByCenter = new Map(dataPass.centers.map((c) => [normCenter(c.name), c.status]));
  const centerRows = CENTER_ORDER.map((cn) => [
    cn === "G" ? "G (Identity)" : cn,
    CENTER_THEMES[cn],
    cap(statusByCenter.get(cn) || "open"),
  ]);
  const channelRows = dataPass.channels.map((ch) => {
    const [circuit, type] = (ch.circuit || "").split(":").map((x) => x.trim());
    return [`${ch.id} ${ch.name}`, circuit || "", type || ""];
  });
  const centersTbl = gridTableSvg("Centers", ["Center", "Theme", "Status"], centerRows);
  const channelsTbl = gridTableSvg("Channels", ["Name", "Circuit", "Type"], channelRows);
  const centersPath = join(outDir, `${client.name} - Centers.png`);
  const channelsPath = join(outDir, `${client.name} - Channels.png`);
  const centersPng = svgToPng(centersTbl.svg, { widthPx: centersTbl.w * 2 });
  const channelsPng = svgToPng(channelsTbl.svg, { widthPx: channelsTbl.w * 2 });
  writeFileSync(centersPath, centersPng);
  writeFileSync(channelsPath, channelsPng);
  console.log(`✓ ${centersPath}  (${(centersPng.length / 1024).toFixed(0)} KB)`);
  console.log(`✓ ${channelsPath}  (${(channelsPng.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    console.log(`  ⚠ Centers/Channels tables skipped (Data Pass unavailable): ${e instanceof Error ? e.message : e}`);
  }
}

main().catch((err) => {
  console.error("\n✗ error:", err);
  process.exit(1);
});
