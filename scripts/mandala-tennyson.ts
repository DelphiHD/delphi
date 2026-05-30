import { renderFullMandala } from "@/lib/render/mandala";
import type { MandalaChart, Activation, Planet } from "@/lib/render/mandala.types";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const API_KEY = process.env.MYBODYGRAPH_API_KEY!;
const HOST = "https://api.bodygraphchart.com";

const PLANET_KEY_MAP: Record<string, Planet> = {
  Sun: "sun", Earth: "earth", Moon: "moon",
  "North Node": "north-node", "South Node": "south-node",
  Mercury: "mercury", Mars: "mars", Venus: "venus",
  Jupiter: "jupiter", Saturn: "saturn",
  Uranus: "uranus", Neptune: "neptune", Pluto: "pluto",
};

function toActivations(side: "personality" | "design", planets: Record<string, any>): Activation[] {
  const out: Activation[] = [];
  for (const [k, p] of Object.entries(PLANET_KEY_MAP)) {
    const d = planets[k];
    if (d) out.push({ side, planet: p, gate: d.Gate, line: d.Line });
  }
  return out;
}

function parseCross(text: string) {
  const m = text.match(/\((\d+)\/(\d+)\s*\|\s*(\d+)\/(\d+)\)/);
  if (!m) throw new Error(`cannot parse cross: ${text}`);
  return { ps: +m[1], pe: +m[2], ds: +m[3], de: +m[4] };
}

function rasterize(svg: string, width: number, tag: string): Buffer {
  const svgPath = `${tmpdir()}/mandala-${tag}-${Date.now()}.svg`;
  writeFileSync(svgPath, svg);
  execFileSync("qlmanage", ["-t", "-s", String(width), "-o", tmpdir(), svgPath], { stdio: "ignore" });
  const pngPath = `${svgPath}.png`;
  const png = readFileSync(pngPath);
  unlinkSync(svgPath); unlinkSync(pngPath);
  return png;
}

(async () => {
  const url = new URL(`${HOST}/v221006/hd-data`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("date", "1993-01-06 07:51");
  url.searchParams.set("timezone", "America/Denver");
  url.searchParams.set("design", "delphi");
  const raw: any = await (await fetch(url)).json();
  const cross = parseCross(raw.Properties.IncarnationCross.option);
  const chart: MandalaChart = {
    clientName: "Tennyson",
    activations: [
      ...toActivations("personality", raw.Personality),
      ...toActivations("design", raw.Design),
    ],
    cross: { personalitySun: cross.ps, personalityEarth: cross.pe, designSun: cross.ds, designEarth: cross.de },
    bodygraphSvg: raw.SVG,
  };
  console.log(`${raw.Properties.Type.option}, ${raw.Properties.Profile.option}, ${raw.Properties.IncarnationCross.option}`);

  const outDir = "/Users/dorothygale/Desktop/Mandala Renderer Output/Tennyson";
  mkdirSync(outDir, { recursive: true });
  const svg = renderFullMandala(chart, { size: 1600 });
  writeFileSync(join(outDir, "tennyson-full.svg"), svg);
  writeFileSync(join(outDir, "tennyson-full.png"), rasterize(svg, 1600, "tennyson"));
  console.log(`wrote ${outDir}/tennyson-full.{svg,png}`);
})();
