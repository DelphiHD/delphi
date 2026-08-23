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
}

main().catch((err) => {
  console.error("\n✗ error:", err);
  process.exit(1);
});
