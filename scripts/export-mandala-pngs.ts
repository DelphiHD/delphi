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
import { gateName } from "@/lib/hd/gate-names";
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
  Uranus: "♅", Neptune: "♆", Pluto: "♇",
};
const escXml = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Standalone planetary placement table (one side) as a brand-styled SVG. These
// are the columns that flank the bodygraph in the chart software; Kaycee wants
// them on their own for slides. Personality reads in charcoal, Design in the
// red the software uses for the design side.
function placementTableSvg(side: "Personality" | "Design", raw: any, subtitle: string): { svg: string; w: number } {
  const src = side === "Personality" ? raw.Personality : raw.Design;
  const rows = PLANET_ORDER
    .map((p) => {
      const d = src[p];
      if (!d) return null;
      const fix = /exalt/i.test(d.FixingState || "") ? "▲" : /detriment/i.test(d.FixingState || "") ? "▽" : "";
      return { planet: p, glyph: PLANET_GLYPHS[p] || "", gl: `${d.Gate}.${d.Line}`, fix, name: gateName(d.Gate) };
    })
    .filter(Boolean) as { planet: string; glyph: string; gl: string; fix: string; name: string }[];
  // Column x-positions, tuned so text just fits. Width flexes to the longest
  // gate name (or the birth/design subtitle) so nothing clips or leaves a gutter.
  const mX = 22, glyphX = 22, planetX = 50, gateX = 196, nameX = 292, rowH = 44, top = 150;
  const longestName = Math.max(4, ...rows.map((r) => r.name.length));
  const W = Math.max(430, Math.ceil(nameX + longestName * 9.7 + mX), Math.ceil(2 * mX + subtitle.length * 7.3));
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
  s += `<text x="${mX}" y="44" ${ff} font-size="30" font-weight="700" fill="${accent}">${side}</text>`;
  s += `<text x="${mX}" y="72" ${ff} font-size="15" fill="${subCol}">${escXml(subtitle)}</text>`;
  s += `<text x="${mX}" y="110" ${ff} font-size="14" font-weight="700" fill="${headerCol}">PLANET</text>`;
  s += `<text x="${gateX}" y="110" ${ff} font-size="14" font-weight="700" fill="${headerCol}">GATE</text>`;
  s += `<text x="${nameX}" y="110" ${ff} font-size="14" font-weight="700" fill="${headerCol}">NAME</text>`;
  s += `<line x1="${mX}" y1="122" x2="${W - mX}" y2="122" stroke="${headerCol}" stroke-width="1.5"/>`;
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    if (i % 2 === 1) s += `<rect x="${mX - 8}" y="${y - 28}" width="${W - 2 * mX + 16}" height="${rowH}" fill="#f6f2f7"/>`;
    s += `<text x="${glyphX}" y="${y}" ${gf} font-size="19" fill="${accent}">${escXml(r.glyph)}</text>`;
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
  return { svg: s, w: W };
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
  // Standalone Bodygraph chart image (the Delphi-styled SVG mybodygraph
  // returns), rasterized on its own for slides and handouts. Use resvg
  // (fit-to-width, preserves the full portrait height) NOT qlmanage, which
  // thumbnails the tall bodygraph to a square and crops it to just the head.
  const bodygraphPng: Buffer | null = raw.SVG ? svgToPng(raw.SVG, { widthPx: 1200 }) : null;

  const outDir = clientOutputDir(client);
  mkdirSync(outDir, { recursive: true });

  const fullPath = join(outDir, `${client.name} - Full Mandala.png`);
  const crossPath = join(outDir, `${client.name} - Cross Mandala.png`);
  writeFileSync(fullPath, fullPng);
  writeFileSync(crossPath, crossPng);

  console.log("");
  if (bodygraphPng) {
    const bodygraphPath = join(outDir, `${client.name} - Bodygraph.png`);
    writeFileSync(bodygraphPath, bodygraphPng);
    console.log(`✓ ${bodygraphPath}  (${(bodygraphPng.length / 1024).toFixed(0)} KB)`);
  } else {
    console.log(`  ⚠ no bodygraph SVG returned by mybodygraph; skipped Bodygraph.png`);
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
  const pers = placementTableSvg("Personality", raw, persSub);
  const des = placementTableSvg("Design", raw, desSub);
  const persTablePng = svgToPng(pers.svg, { widthPx: pers.w * 2 });
  const desTablePng = svgToPng(des.svg, { widthPx: des.w * 2 });
  const persTablePath = join(outDir, `${client.name} - Personality Placements.png`);
  const desTablePath = join(outDir, `${client.name} - Design Placements.png`);
  writeFileSync(persTablePath, persTablePng);
  writeFileSync(desTablePath, desTablePng);
  console.log(`✓ ${persTablePath}  (${(persTablePng.length / 1024).toFixed(0)} KB)`);
  console.log(`✓ ${desTablePath}  (${(desTablePng.length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error("\n✗ error:", err);
  process.exit(1);
});
