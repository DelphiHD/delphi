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
const escXml = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Standalone planetary placement table (one side) as a brand-styled SVG. These
// are the columns that flank the bodygraph in the chart software; Kaycee wants
// them on their own for slides. Personality reads in charcoal, Design in the
// red the software uses for the design side.
function placementTableSvg(side: "Personality" | "Design", raw: any): string {
  const src = side === "Personality" ? raw.Personality : raw.Design;
  const rows = PLANET_ORDER
    .map((p) => {
      const d = src[p];
      if (!d) return null;
      const fix = /exalt/i.test(d.FixingState || "") ? " ▲" : /detriment/i.test(d.FixingState || "") ? " ▽" : "";
      return { planet: p, gl: `${d.Gate}.${d.Line}${fix}`, name: gateName(d.Gate) };
    })
    .filter(Boolean) as { planet: string; gl: string; name: string }[];
  const W = 660, mX = 30, rowH = 44, top = 132;
  const H = top + rows.length * rowH + 20;
  const accent = side === "Personality" ? "#333333" : "#B0453C";
  const purple = "#845095", gray = "#666666";
  const ff = `font-family="Montserrat, 'Helvetica Neue', Arial, sans-serif"`;
  const gateX = 330, nameX = 420;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  s += `<text x="${mX}" y="48" ${ff} font-size="30" font-weight="700" fill="${accent}">${side}</text>`;
  s += `<text x="${W - mX}" y="48" ${ff} font-size="15" fill="${gray}" text-anchor="end">${escXml(raw.Properties?.Type?.option)}</text>`;
  s += `<text x="${mX}" y="92" ${ff} font-size="15" font-weight="700" fill="${purple}">PLANET</text>`;
  s += `<text x="${gateX}" y="92" ${ff} font-size="15" font-weight="700" fill="${purple}">GATE</text>`;
  s += `<text x="${nameX}" y="92" ${ff} font-size="15" font-weight="700" fill="${purple}">NAME</text>`;
  s += `<line x1="${mX}" y1="104" x2="${W - mX}" y2="104" stroke="${purple}" stroke-width="1.5"/>`;
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    if (i % 2 === 1) s += `<rect x="${mX - 8}" y="${y - 28}" width="${W - 2 * mX + 16}" height="${rowH}" fill="#f6f2f7"/>`;
    s += `<text x="${mX}" y="${y}" ${ff} font-size="19" fill="${accent}">${escXml(r.planet)}</text>`;
    s += `<text x="${gateX}" y="${y}" ${ff} font-size="19" font-weight="600" fill="#222222">${escXml(r.gl)}</text>`;
    s += `<text x="${nameX}" y="${y}" ${ff} font-size="18" fill="${gray}">${escXml(r.name)}</text>`;
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
  const persTablePng = svgToPng(placementTableSvg("Personality", raw), { widthPx: 1320 });
  const desTablePng = svgToPng(placementTableSvg("Design", raw), { widthPx: 1320 });
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
