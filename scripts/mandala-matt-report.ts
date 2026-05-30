import { renderFullMandala, renderCrossMandala } from "@/lib/render/mandala";
import type { MandalaChart, Activation, Planet } from "@/lib/render/mandala.types";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";

/** Rasterize via macOS qlmanage. Matches the renderer's reference output
 *  (resvg/sharp have textPath and gradient-opacity edge cases). */
function rasterize(svg: string, width: number, tag: string): Buffer {
  const svgPath = `${tmpdir()}/mandala-${tag}-${Date.now()}.svg`;
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
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  HeadingLevel,
  PageBreak,
  PageOrientation,
} from "docx";

const API_KEY = process.env.MYBODYGRAPH_API_KEY!;
const HOST = "https://api.bodygraphchart.com";

const MATT = {
  slug: "matt",
  name: "Matt Hollingshead",
  birthDate: "1984-04-08",
  birthTime: "07:15",
  birthPlace: "Bountiful, Utah, United States",
};

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

async function fetchChart(): Promise<any> {
  const tz = await lookupTimezone(MATT.birthPlace);
  const url = new URL(`${HOST}/v221006/hd-data`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("date", `${MATT.birthDate} ${MATT.birthTime}`);
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

function parseCross(text: string) {
  const m = text.match(/\((\d+)\/(\d+)\s*\|\s*(\d+)\/(\d+)\)/);
  if (!m) throw new Error(`cannot parse cross: ${text}`);
  return { ps: +m[1], pe: +m[2], ds: +m[3], de: +m[4] };
}

// Brand
const PURPLE = "845095";
const FONT = "Georgia";

function h1Centered(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 240 },
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, font: FONT, size: 36, bold: true, color: PURPLE })],
  });
}
function h2(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 360, after: 200 },
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: PURPLE })],
  });
}
function p(text: string, opts: { center?: boolean; italic?: boolean } = {}): Paragraph {
  return new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: 200, line: 276 },
    children: [new TextRun({ text, font: FONT, size: 22, italic: opts.italic })],
  });
}

(async () => {
  const outDir = "/Users/dorothygale/Desktop/Mandala Renderer Output/Matt Report";
  mkdirSync(outDir, { recursive: true });

  console.log(`Fetching Matt's chart...`);
  const raw = await fetchChart();
  const cross = parseCross(raw.Properties.IncarnationCross.option);
  const chart: MandalaChart = {
    clientName: MATT.name,
    activations: [
      ...toActivations("personality", raw.Personality),
      ...toActivations("design", raw.Design),
    ],
    cross: {
      personalitySun: cross.ps,
      personalityEarth: cross.pe,
      designSun: cross.ds,
      designEarth: cross.de,
    },
    bodygraphSvg: raw.SVG,
  };
  console.log(`${raw.Properties.Type.option}, ${raw.Properties.Profile.option}, ${raw.Properties.IncarnationCross.option}`);

  console.log(`Rendering mandalas...`);
  const fullSvg = renderFullMandala(chart, { size: 1600 });
  const crossSvg = renderCrossMandala(chart, { size: 1600 });
  writeFileSync(join(outDir, "matt-full.svg"), fullSvg);
  writeFileSync(join(outDir, "matt-cross.svg"), crossSvg);

  console.log(`Rasterizing to PNG for docx (qlmanage)...`);
  const fullPng = rasterize(fullSvg, 1600, "full");
  const crossPng = rasterize(crossSvg, 1600, "cross");
  writeFileSync(join(outDir, "matt-full.png"), fullPng);
  writeFileSync(join(outDir, "matt-cross.png"), crossPng);

  console.log(`Building docx...`);
  // US Letter: 8.5" × 11" = 12240 × 15840 twips. 1" margins all sides.
  // Mandala image: 6.5" square = 9360 EMU... docx uses pixels here.
  const MANDALA_PX = 540; // ~5.6" at docx default 96dpi
  const doc = new Document({
    creator: "Delphi HD",
    title: `${MATT.name} - Planetary Overview (Mandala Preview)`,
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          // Cover page
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 480, after: 240 },
            children: [
              new TextRun({ text: MATT.name, font: FONT, size: 44, bold: true, color: PURPLE }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 480 },
            children: [
              new TextRun({ text: "Planetary Overview", font: FONT, size: 28, italic: true, color: "555555" }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: fullPng,
                transformation: { width: MANDALA_PX, height: MANDALA_PX },
                type: "png",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 480 },
            children: [
              new TextRun({ text: `${raw.Properties.Type.option}  ·  ${raw.Properties.Profile.option}  ·  ${raw.Properties.IncarnationCross.option}`,
                font: FONT, size: 20, color: "555555" }),
            ],
          }),
          // Cross section opener
          new Paragraph({ children: [new PageBreak()] }),
          h1Centered("Your Incarnation Cross"),
          p(raw.Properties.IncarnationCross.option, { center: true, italic: true }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 240 },
            children: [
              new ImageRun({
                data: crossPng,
                transformation: { width: MANDALA_PX, height: MANDALA_PX },
                type: "png",
              }),
            ],
          }),
          p(`The four gates of your Incarnation Cross — ${cross.ps}, ${cross.pe}, ${cross.ds}, ${cross.de} — are highlighted on the wheel above. They are the load-bearing thread of your design, the architecture your life is built to express. (Full prose would follow in the production report.)`),
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  const docxPath = join(outDir, `${MATT.name} - Planetary Overview (Mandala Preview).docx`);
  writeFileSync(docxPath, buf);
  console.log(`\nWrote: ${docxPath}`);
})();
