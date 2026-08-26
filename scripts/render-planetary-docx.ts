// Render a generated Planetary Overview markdown file as a brand-styled .docx
// with mandala images, placement tables, and per-H2 hexagram images.
//
// Brand canonicals (per ~/.claude/projects/.../memory/brand_delphi.md, updated 2026-05-29):
//   - Font: MONTSERRAT throughout (changed from Georgia per Kaycee PO v1 feedback)
//   - Body text: JUSTIFIED alignment (changed from left-aligned)
//   - Purple: #845095 (H1, H2)
//   - H3 gray: #333333
//   - Header/footer gray: #999999
//   - Astrological glyphs: ▲ exalted, ▽ detriment
//   - Hexagram images: ~/Desktop/Delphi Brand Assets/sections/hexagrams/<gate>.<line>.png
//
// Per-section docx behavior:
//   - Cover page: client name, "Planetary Overview", Full Planetary Mandala, type/profile/cross summary
//   - "[[PERSONALITY_PLACEMENTS_TABLE]]" marker → rendered as a 4-column table from chart data
//   - "[[DESIGN_PLACEMENTS_TABLE]]" marker → same
//   - "# Full Incarnation Cross Synthesis" H1 → page break + H1 + Cross Mandala image
//   - Each "## P-Planet | ..." or "## D-Planet | ..." H2 → H2 + left-aligned hexagram image with text wrap below
//   - Page header: "{Client Name}  |  Planetary Overview" right-aligned italic gray
//   - Page footer: centered page number
//
// Usage:
//   npx tsx scripts/render-planetary-docx.ts <slug>

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { renderFullMandala, renderCrossMandala } from "@/lib/render/mandala";
import type { MandalaChart, Activation, Planet } from "@/lib/render/mandala.types";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel,
  PageBreak, PageOrientation, Header, Footer, PageNumber,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  HorizontalPositionRelativeFrom, HorizontalPositionAlign,
  VerticalPositionRelativeFrom, VerticalPositionAlign,
  TextWrappingType, TextWrappingSide,
} from "docx";

const API_KEY = process.env.MYBODYGRAPH_API_KEY!;
const HOST = "https://api.bodygraphchart.com";
const HEXAGRAM_DIR = "/Users/dorothygale/Desktop/Delphi Brand Assets/sections/hexagrams";
const BRAND_DIR = "/Users/dorothygale/Desktop/Delphi Brand Assets/brand";
const LOGO_DELPHI_PATH = join(BRAND_DIR, "Delphi.png");
const LOGO_KNOWTHYSELF_PATH = join(BRAND_DIR, "knowthyself.png");

// Canonical HD profile names. 1=Investigator, 2=Hermit, 3=Martyr,
// 4=Opportunist, 5=Heretic, 6=Role Model. Profile is rendered as
// "<P>/<D> <Personality-line-name> <Design-line-name>" — e.g. "5/1 Heretic
// Investigator" — on the cover. Mirrors profileSpelledOut() in
// lib/report/planetary.ts; kept local to avoid a cross-file import for
// a tiny lookup.
const PROFILE_LINE_NAMES: Record<number, string> = {
  1: "Investigator",
  2: "Hermit",
  3: "Martyr",
  4: "Opportunist",
  5: "Heretic",
  6: "Role Model",
};

function profileSpelledOut(profile: string): string {
  const m = (profile || "").trim().match(/^([1-6])\s*\/\s*([1-6])$/);
  if (!m) return profile;
  const p = parseInt(m[1], 10);
  const d = parseInt(m[2], 10);
  return `${p}/${d} ${PROFILE_LINE_NAMES[p]} ${PROFILE_LINE_NAMES[d]}`;
}

import { CLIENTS, clientFromSlug, clientOutputDir, type ClientBrief, placeForLookup } from "./client-roster";

const PLANET_KEY_MAP: Record<string, Planet> = {
  Sun: "sun", Earth: "earth", Moon: "moon",
  "North Node": "north-node", "South Node": "south-node",
  Mercury: "mercury", Mars: "mars", Venus: "venus",
  Jupiter: "jupiter", Saturn: "saturn",
  Uranus: "uranus", Neptune: "neptune", Pluto: "pluto",
};

// Planet glyphs for the placement tables
const PLANET_GLYPHS: Record<string, string> = {
  "Sun": "☉", "Earth": "⊕", "Moon": "☽", "Mercury": "☿", "Venus": "♀",
  "Mars": "♂", "Jupiter": "♃", "Saturn": "♄", "Uranus": "♅",
  "Neptune": "♆", "Pluto": "♇", "North Node": "☊", "South Node": "☋", "Chiron": "⚷",
};

// Brand
const PURPLE = "845095";
const H3_GRAY = "333333";
const HEADER_GRAY = "999999";
const TABLE_BORDER = "CCCCCC";
const FONT = "Montserrat";

const BODY_SIZE = 22;     // 11pt
const H1_SIZE = 32;       // 16pt
const H2_SIZE = 26;       // 13pt
const H3_SIZE = 22;       // 11pt
const META_SIZE = 18;     // 9pt
const TABLE_HEADER_SIZE = 18;
const TABLE_BODY_SIZE = 18;

// ─────────────────────────────────────────────────────────────────────────────
// Rasterize SVG via qlmanage
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Chart fetching (same as generate-report.ts)
// ─────────────────────────────────────────────────────────────────────────────

async function lookupTimezone(query: string): Promise<string> {
  const url = new URL(`${HOST}/v210502/locations`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("query", query);
  const res = await fetch(url);
  const data = await res.json() as Array<{ value: string; timezone: string }>;
  return data[0].timezone;
}

async function fetchChart(c: ClientBrief): Promise<any> {
  const tz = await lookupTimezone(placeForLookup(c));
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

function parseCross(text: string) {
  const m = text.match(/\((\d+)\/(\d+)\s*\|\s*(\d+)\/(\d+)\)/);
  if (!m) throw new Error(`cannot parse cross from "${text}"`);
  return { ps: +m[1], pe: +m[2], ds: +m[3], de: +m[4] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline markdown → TextRun[] (bold, italic)
// ─────────────────────────────────────────────────────────────────────────────

function parseInline(text: string, opts: { size?: number; color?: string; bold?: boolean } = {}): TextRun[] {
  const size = opts.size ?? BODY_SIZE;
  const color = opts.color;
  const baseBold = opts.bold ?? false;
  const runs: TextRun[] = [];
  let i = 0;
  let bold = baseBold, italic = false;
  let buf = "";
  const flush = () => {
    if (buf) runs.push(new TextRun({ text: buf, font: FONT, size, bold, italic, color }));
    buf = "";
  };
  while (i < text.length) {
    if (text.slice(i, i + 3) === "***") { flush(); bold = !bold; italic = !italic; i += 3; continue; }
    if (text.slice(i, i + 2) === "**") { flush(); bold = !bold; i += 2; continue; }
    if (text[i] === "*" && (i === 0 || text[i - 1] !== "\\")) { flush(); italic = !italic; i += 1; continue; }
    buf += text[i];
    i += 1;
  }
  flush();
  if (runs.length === 0) runs.push(new TextRun({ text: " ", font: FONT, size, color }));
  return runs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paragraph builders — Montserrat, justified by default
// ─────────────────────────────────────────────────────────────────────────────

// H1 renders ALL CAPS with a thin purple horizontal divider underneath, and
// is set to keepNext so it never orphans at the bottom of a page above
// its body. Kaycee's v5 PDF edits established this style as the
// standardized section break across all reports.
function makeH1(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 360, after: 0 },
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 8, color: PURPLE, space: 4 },
    },
    children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: H1_SIZE, bold: true, color: PURPLE })],
  });
}

function makeH2(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    children: [new TextRun({ text, font: FONT, size: H2_SIZE, bold: true, color: PURPLE })],
  });
}

// Two-line placement H2: primary line (purple bold, same size as makeH2,
// "P-Sun | 51.5: The Arousing, Symmetry | Exalted") plus an italicized
// gray subtitle (smaller, "Heart | Initiation | Channel of Initiation").
// Both are keepNext so the header pair stays with the first body paragraph.
function makeH2PlacementPrimary(text: string): Paragraph {
  return new Paragraph({
    // Zero after-spacing so the subtitle paragraph sits flush against the
    // primary, matching Kaycee's PDF.
    spacing: { before: 280, after: 0 },
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    children: [new TextRun({ text, font: FONT, size: H2_SIZE, bold: true, color: PURPLE })],
  });
}

function makeH2PlacementSubtitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 120 },
    keepNext: true,
    children: [new TextRun({ text, font: FONT, size: H3_SIZE, italics: true, color: HEADER_GRAY })],
  });
}

function makeH3(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 160 },
    children: [new TextRun({ text, font: FONT, size: H3_SIZE, bold: true, color: H3_GRAY })],
  });
}

function makeParagraph(text: string, opts: { center?: boolean; italic?: boolean; justified?: boolean } = {}): Paragraph {
  const alignment = opts.center ? AlignmentType.CENTER : (opts.justified !== false ? AlignmentType.JUSTIFIED : AlignmentType.LEFT);
  return new Paragraph({
    alignment,
    spacing: { after: 200, line: 276 },
    children: parseInline(text),
  });
}

// docx@9.7.1 has a bug where every Drawing's <wp:docPr id> defaults to 1, which
// Word rejects as a malformed document. We assign a unique id per ImageRun.
let _drawingIdCounter = 0;
const nextDrawingId = () => String(++_drawingIdCounter);

function makeMandalaImage(png: Buffer, px: number, name: string = "mandala"): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 240 },
    children: [new ImageRun({
      data: png,
      transformation: { width: px, height: px },
      type: "png",
      altText: { name, description: name, title: name, id: nextDrawingId() },
    })],
  });
}

/**
 * A paragraph containing a left-aligned floating hexagram image with text wrap.
 * The text content of the paragraph follows the image and wraps to the right.
 */
function makeHexagramParagraph(hexPng: Buffer, hexPx: number, followingText: string, name: string = "hexagram"): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 200, line: 276 },
    children: [
      new ImageRun({
        data: hexPng,
        transformation: { width: hexPx, height: hexPx },
        type: "png",
        altText: { name, description: name, title: name, id: nextDrawingId() },
        floating: {
          horizontalPosition: {
            relative: HorizontalPositionRelativeFrom.MARGIN,
            align: HorizontalPositionAlign.LEFT,
          },
          verticalPosition: {
            relative: VerticalPositionRelativeFrom.PARAGRAPH,
            offset: 0,
          },
          wrap: {
            type: TextWrappingType.SQUARE,
            side: TextWrappingSide.RIGHT,
          },
          margins: { top: 80000, bottom: 80000, left: 0, right: 200000 },
        },
      }),
      ...parseInline(followingText),
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Placement table builder
// ─────────────────────────────────────────────────────────────────────────────

interface PlacementRow {
  planet: string;
  gate: number;
  line: number;
  gateName?: string;
  lineName?: string;
  fixation?: "▲" | "▽" | "";
  description?: string;
}

// Column widths in DXA (twips). 6.5" usable page = 9360 twips total.
// Planet (16%) | Gate (10%) | Name (28%) | Description (46%)
const TABLE_COL_WIDTHS = [1500, 940, 2620, 4300];

// IMPORTANT: takes Paragraph[] always. Callers must wrap TextRuns in a Paragraph.
// Previously this attempted auto-detection of TextRun[] vs Paragraph[] which
// produced nested <w:p> inside <w:p> for Paragraph[] inputs — Word rejects that.
function tableCell(paragraphs: Paragraph[], opts: { widthIdx?: number; background?: string } = {}): TableCell {
  return new TableCell({
    children: paragraphs,
    width: opts.widthIdx !== undefined ? { size: TABLE_COL_WIDTHS[opts.widthIdx], type: WidthType.DXA } : undefined,
    shading: opts.background ? { type: ShadingType.SOLID, color: opts.background, fill: opts.background } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  });
}

// Helper: wrap TextRuns into a single Paragraph for use in a table cell.
function cellPara(runs: TextRun[]): Paragraph {
  return new Paragraph({ children: runs, spacing: { before: 40, after: 40 } });
}

function buildPlacementsTable(side: "Personality" | "Design", rows: PlacementRow[]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      tableCell([cellPara([new TextRun({ text: "Planet", font: FONT, size: TABLE_HEADER_SIZE, bold: true, color: PURPLE })])], { widthIdx: 0 }),
      tableCell([cellPara([new TextRun({ text: "Gate", font: FONT, size: TABLE_HEADER_SIZE, bold: true, color: PURPLE })])], { widthIdx: 1 }),
      tableCell([cellPara([new TextRun({ text: "Name", font: FONT, size: TABLE_HEADER_SIZE, bold: true, color: PURPLE })])], { widthIdx: 2 }),
      tableCell([cellPara([new TextRun({ text: "Description", font: FONT, size: TABLE_HEADER_SIZE, bold: true, color: PURPLE })])], { widthIdx: 3 }),
    ],
  });

  const bodyRows = rows.map((r) => {
    const glyph = PLANET_GLYPHS[r.planet] || "";
    const planetCellRuns = [
      new TextRun({ text: glyph ? `${glyph}  ` : "", font: FONT, size: TABLE_BODY_SIZE, color: H3_GRAY }),
      new TextRun({ text: r.planet, font: FONT, size: TABLE_BODY_SIZE, color: H3_GRAY }),
    ];
    // Gate column: gate.line on the first line; fixation glyph (▲/▽) on a
    // second line beneath it. Matches Kaycee's v5 PDF format.
    const gateParagraphs: Paragraph[] = [
      new Paragraph({ spacing: { before: 40, after: 0 }, children: [
        new TextRun({ text: `${r.gate}.${r.line}`, font: FONT, size: TABLE_BODY_SIZE, color: H3_GRAY }),
      ]}),
    ];
    if (r.fixation) {
      gateParagraphs.push(new Paragraph({ spacing: { before: 0, after: 40 }, children: [
        new TextRun({ text: r.fixation, font: FONT, size: TABLE_BODY_SIZE, color: H3_GRAY }),
      ]}));
    }
    // Name column: gate name + line name on two lines
    const nameParagraphs = [
      new Paragraph({ spacing: { before: 40, after: 0 }, children: [
        new TextRun({ text: r.gateName || `Gate ${r.gate}`, font: FONT, size: TABLE_BODY_SIZE, color: H3_GRAY }),
      ]}),
      new Paragraph({ spacing: { before: 0, after: 40 }, children: [
        new TextRun({ text: r.lineName || `Line ${r.line}`, font: FONT, size: TABLE_BODY_SIZE, italics: true, color: HEADER_GRAY }),
      ]}),
    ];
    // Description column: 1-2 sentences extracted from the placement's body prose
    const descParagraphs = [cellPara([
      new TextRun({ text: r.description || "", font: FONT, size: TABLE_BODY_SIZE, color: H3_GRAY }),
    ])];
    return new TableRow({
      children: [
        tableCell([cellPara(planetCellRuns)], { widthIdx: 0 }),
        tableCell(gateParagraphs, { widthIdx: 1 }),
        tableCell(nameParagraphs, { widthIdx: 2 }),
        tableCell(descParagraphs, { widthIdx: 3 }),
      ],
    });
  });

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: TABLE_COL_WIDTHS,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER },
      left: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER },
      right: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER },
    },
    rows: [headerRow, ...bodyRows],
  });
}

/**
 * Pull placement rows from chart data. Personality and Design come from the
 * same mybodygraph response (raw.Personality / raw.Design).
 */
function placementRowsFromChart(raw: any, side: "Personality" | "Design"): PlacementRow[] {
  const order = ["Sun", "Earth", "North Node", "South Node", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
  const block = side === "Personality" ? raw.Personality : raw.Design;
  return order.flatMap((planet): PlacementRow[] => {
    const d = block?.[planet];
    if (!d) return [];
    return [{
      planet,
      gate: d.Gate,
      line: d.Line,
      gateName: d.GateName || undefined,
      lineName: d.LineName || undefined,
    }];
  });
}

/**
 * Parse the report markdown for per-placement metadata that the chart data
 * doesn't carry: fixation glyph (▲/▽) from the H2 header, and a 1-2 sentence
 * description extracted from the first body paragraph below the H2.
 *
 * Returns a map keyed by "${side}-${planet}", e.g. "P-Sun", "D-North Node".
 */
function parsePlacementsFromMarkdown(md: string): Record<string, { gateName: string; lineName: string; fixation: "▲" | "▽" | ""; description: string }> {
  const result: Record<string, { gateName: string; lineName: string; fixation: "▲" | "▽" | ""; description: string }> = {};
  const lines = md.split("\n");

  for (let i = 0; i < lines.length; i++) {
    // Match "## P-Sun | 51.5: The Arousing, Symmetry ▲ | <rest>" or with multi-word planet
    const m = lines[i].match(/^##\s+([PD])-(.+?)\s*\|\s*(\d+)\.(\d+):\s*([^,|]+?),\s*([^|]+?)\s*\|/);
    if (!m) continue;
    const [, side, planet, , , gateName, lineNameWithGlyph] = m;
    let lineName = lineNameWithGlyph.trim();
    let fixation: "▲" | "▽" | "" = "";
    if (lineName.endsWith("▲")) { fixation = "▲"; lineName = lineName.slice(0, -1).trim(); }
    else if (lineName.endsWith("▽")) { fixation = "▽"; lineName = lineName.slice(0, -1).trim(); }

    // Look for the TLDR synthesis line — the LLM emits "> TLDR: <text>" right
    // after the H2 (possibly after blank lines). Walk forward and find it.
    // Fall back to the first body sentence ONLY if no TLDR is present.
    let description = "";
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j += 1;
    // First non-blank line should be the TLDR blockquote if the LLM followed instructions.
    const tldrMatch = j < lines.length ? lines[j].match(/^>\s*TLDR:\s*(.+)$/i) : null;
    if (tldrMatch) {
      description = tldrMatch[1].trim();
      // Strip trailing markdown artifacts
      description = description.replace(/\s+/g, " ").trim();
    } else {
      // Fallback: scan body for first sentence. Warn so we notice the LLM skipped TLDR.
      console.warn(`  [warn] no "> TLDR:" line under ## ${side}-${planet.trim()} — falling back to first body sentence`);
      const bodyLines: string[] = [];
      let k = j;
      while (k < lines.length) {
        const nxt = lines[k].trim();
        if (nxt === "" && bodyLines.length > 0) break;
        if (/^#{1,3}\s+/.test(nxt)) break;
        if (nxt !== "") bodyLines.push(nxt);
        k += 1;
      }
      const body = bodyLines.join(" ").replace(/\s+/g, " ").trim();
      const sentences = body.match(/[^.!?]+[.!?]+/g) || [body];
      description = (sentences[0] || "").trim();
      if (description.length < 120 && sentences[1]) {
        description = (description + " " + sentences[1]).trim();
      }
    }
    if (description.length > 280) description = description.slice(0, 277).trimEnd() + "...";

    const key = `${side}-${planet.trim()}`;
    result[key] = { gateName: gateName.trim(), lineName, fixation, description };
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hexagram-image loader (left-aligned with text wrap)
// ─────────────────────────────────────────────────────────────────────────────

function loadHexagramImage(gate: number, line: number): Buffer | null {
  const path = join(HEXAGRAM_DIR, `${gate}.${line}.png`);
  if (!existsSync(path)) return null;
  return readFileSync(path);
}

/**
 * Parse an H2 placement header like "P-Sun | 51.5: The Arousing, Symmetry ▲ | Heart | Initiation | Channel of X"
 * and pull (gate, line). Returns null if the header doesn't match.
 */
function parseH2PlacementHeader(text: string): { gate: number; line: number } | null {
  // Look for "Gate.Line" pattern after the first pipe
  const m = text.match(/\|\s*(\d+)\.(\d+)\s*:/);
  if (!m) return null;
  return { gate: parseInt(m[1], 10), line: parseInt(m[2], 10) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown → docx blocks
// ─────────────────────────────────────────────────────────────────────────────

type DocChild = Paragraph | Table;

interface RenderContext {
  raw: any;
  crossPng: Buffer;
  mandalaPx: number;
  hexPx: number;
  placementMeta: Record<string, { gateName: string; lineName: string; fixation: "▲" | "▽" | ""; description: string }>;
}

function markdownToBlocks(markdown: string, ctx: RenderContext): DocChild[] {
  const lines = markdown.split("\n");
  const out: DocChild[] = [];
  let skipUntilDivider = true;
  // When a placement H2 is encountered, the hexagram image is NOT emitted as
  // its own paragraph. Instead it's deferred and attached as a floating
  // anchor to the FIRST body paragraph that follows the H2/subtitle/TLDR.
  // Word's text-wrap then flows the paragraph (and continues into
  // subsequent paragraphs) around the image to the right.
  let pendingHexImage: Buffer | null = null;

  function emitTableSection(side: "Personality" | "Design") {
    const chartRows = placementRowsFromChart(ctx.raw, side);
    const sideLetter = side === "Personality" ? "P" : "D";
    // Merge chart rows with markdown-parsed metadata (fixation, description, and
    // the more reader-friendly gate/line names from the LLM-generated headers).
    const rows: PlacementRow[] = chartRows.map((r) => {
      const meta = ctx.placementMeta[`${sideLetter}-${r.planet}`];
      return {
        ...r,
        gateName: meta?.gateName || r.gateName,
        lineName: meta?.lineName || r.lineName,
        fixation: meta?.fixation || "",
        description: meta?.description || "",
      };
    });
    // Each placement table starts on its own page.
    out.push(new Paragraph({ children: [new PageBreak()] }));
    out.push(makeH1(`${side} Placements`));
    out.push(buildPlacementsTable(side, rows));
  }

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, "");

    if (skipUntilDivider) {
      if (/^---\s*$/.test(line)) { skipUntilDivider = false; i += 1; continue; }
      i += 1;
      continue;
    }

    // Table markers — quick-reference placement tables (text-only, no images in cells).
    if (/\[\[PERSONALITY_PLACEMENTS_TABLE\]\]/.test(line)) {
      emitTableSection("Personality");
      i += 1;
      continue;
    }
    if (/\[\[DESIGN_PLACEMENTS_TABLE\]\]/.test(line)) {
      emitTableSection("Design");
      i += 1;
      continue;
    }

    // H1 headings
    if (/^#\s+/.test(line)) {
      const text = line.replace(/^#\s+/, "").trim();

      // Skip empty H1 stubs for the table sections (the prompt outputs the H1
      // followed by just the table marker on the next line; we render the
      // table when we hit the marker, so the H1 here for the table sections
      // is redundant. But we render H1 for everything; the table emits its
      // own H1 above. So if we see "Personality Placements Table" or
      // "Design Placements Table", skip — table emit handles it.
      if (/^(personality|design)\s+placements?\s+table\s*$/i.test(text)) {
        i += 1;
        continue;
      }

      // Incarnation Cross H1 triggers a page break + cross mandala inserted
      // right after H1.
      //
      // v3 H1 was the literal "# Full Incarnation Cross Synthesis". v4 uses
      // the cross's thematic name itself as the H1, with a pipe-delimited
      // gate parenthetical at the end:
      //   "# The Left Angle Cross of The Clarion | (51/57 | 61/62)"
      // The renderer detects the v4 form via the "(N/N | N/N)" parenthetical
      // pattern. Both forms continue to be supported so v3 markdown still
      // renders.
      if (
        /^full incarnation cross synthesis\s*$/i.test(text) ||
        /\(\s*\d+\s*\/\s*\d+\s*\|\s*\d+\s*\/\s*\d+\s*\)/.test(text)
      ) {
        out.push(new Paragraph({ children: [new PageBreak()] }));
        out.push(makeH1(text));
        out.push(makeMandalaImage(ctx.crossPng, ctx.mandalaPx, "cross-mandala"));
        i += 1;
        continue;
      }

      out.push(makeH1(text));
      i += 1;
      continue;
    }

    if (/^##\s+/.test(line)) {
      const text = line.replace(/^##\s+/, "").trim();
      const place = parseH2PlacementHeader(text);

      if (place) {
        // Placement H2: two-line styled header. Split on pipes:
        //   parts[0] = "P-Sun"
        //   parts[1] = "51.5: The Arousing, Symmetry ▲"
        //   parts[2+] = center | quarter | channel
        // Primary line uses parts[0..2] as a Heading-2 styled run; subtitle
        // uses parts[2+] joined as an italic gray subtitle paragraph.
        const segments = text.split("|").map((s) => s.trim()).filter((s) => s.length > 0);
        if (segments.length >= 3) {
          const primary = `${segments[0]} | ${segments[1]}`;
          const subtitle = segments.slice(2).join(" | ");
          out.push(makeH2PlacementPrimary(primary));
          out.push(makeH2PlacementSubtitle(subtitle));
        } else {
          // Defensive: malformed header (fewer than 3 pipe segments).
          // Emit the whole line as the primary; no subtitle.
          out.push(makeH2PlacementPrimary(text));
        }

        // Defer the hexagram image so it floats next to the FIRST body
        // paragraph, not below the H2.
        pendingHexImage = loadHexagramImage(place.gate, place.line);
      } else {
        // Non-placement H2 (synthesis, timeline beat, conjunction, etc.).
        out.push(makeH2(text));
      }

      i += 1;
      continue;
    }

    if (/^###\s+/.test(line)) {
      const text = line.replace(/^###\s+/, "").trim();
      out.push(makeH3(text));
      i += 1;
      continue;
    }

    if (/^---\s*$/.test(line)) {
      i += 1;
      continue;
    }

    if (line === "") {
      i += 1;
      continue;
    }

    // Skip the TLDR blockquote line — it's surfaced in the placement table only,
    // not in the body prose. Drop it so the body reads cleanly.
    if (/^>\s*TLDR:/i.test(line)) {
      i += 1;
      continue;
    }

    // Regular paragraph: collect until next blank line / heading / marker
    const buf: string[] = [line];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j].replace(/\s+$/, "");
      if (next === "" || /^#{1,3}\s+/.test(next) || /^---\s*$/.test(next) || /\[\[[A-Z_]+_TABLE\]\]/.test(next)) break;
      buf.push(next);
      j += 1;
    }
    const paragraphText = buf.join(" ");
    if (pendingHexImage) {
      // Anchor the floating hexagram image to this paragraph. Word's
      // wrapSquare will flow this paragraph's text to the right of the
      // image and continue wrapping subsequent paragraphs until the
      // image height is exhausted.
      out.push(makeHexagramParagraph(pendingHexImage, ctx.hexPx, paragraphText, "hexagram"));
      pendingHexImage = null;
    } else {
      out.push(makeParagraph(paragraphText, { justified: true }));
    }
    i = j;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const slug = process.argv[2];
  if (!slug || !CLIENTS[slug]) {
    console.error(`usage: npx tsx scripts/render-planetary-docx.ts <client-slug>`);
    console.error(`available slugs: ${Object.keys(CLIENTS).join(", ")}`);
    process.exit(1);
  }
  const client = CLIENTS[slug];

  const reportPath = `.cache/reports/${slug}-planetary.md`;
  if (!existsSync(reportPath)) {
    console.error(`no generated report at ${reportPath}`);
    console.error(`generate with: npx tsx scripts/generate-report.ts ${slug} planetary`);
    process.exit(1);
  }

  console.log(`\n=== Rendering ${client.name}'s Planetary Overview as docx ===\n`);
  console.log(`Reading markdown: ${reportPath}`);
  const markdown = readFileSync(reportPath, "utf8");

  console.log(`Fetching chart for mandala + table rendering...`);
  const raw = await fetchChart(client);
  const cross = parseCross(raw.Properties.IncarnationCross.option);
  const chart: MandalaChart = {
    clientName: client.name,
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
  console.log(`  ${raw.Properties.Type.option}, ${raw.Properties.Profile.option}, ${raw.Properties.IncarnationCross.option}`);

  console.log(`Rendering mandalas...`);
  const fullSvg = renderFullMandala(chart, { size: 1600 });
  const crossSvg = renderCrossMandala(chart, { size: 1600 });
  const fullPng = rasterize(fullSvg, 1600, "full");
  const crossPng = rasterize(crossSvg, 1600, "cross");

  const MANDALA_PX = 540;  // ~5.6" at 96dpi
  const HEX_PX = 110;       // ~1.15" — small enough to wrap text comfortably

  console.log(`Parsing markdown and assembling docx with hexagram images...`);
  const placementMeta = parsePlacementsFromMarkdown(markdown);
  const bodyBlocks = markdownToBlocks(markdown, {
    raw, crossPng, mandalaPx: MANDALA_PX, hexPx: HEX_PX, placementMeta,
  });

  // Default running header for pages 2+ — non-italic gray text on the right
  // edge, with the website appended. v6 dropped italics per Kaycee's PDF.
  const pageHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: `${client.name}  |  Planetary Overview  |  www.delphihd.com`, font: FONT, size: META_SIZE, color: HEADER_GRAY }),
        ],
      }),
    ],
  });

  const pageFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: META_SIZE, color: HEADER_GRAY }),
        ],
      }),
    ],
  });

  // Cover page (page 1) gets its own first-page header + footer carrying the
  // brand logos: Delphi top-left, Know Thyself bottom-right. The cover does
  // NOT show the running text header or the page number.
  const delphiLogoPng = readFileSync(LOGO_DELPHI_PATH);
  const knowthyselfLogoPng = readFileSync(LOGO_KNOWTHYSELF_PATH);

  const coverHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new ImageRun({
          data: delphiLogoPng,
          // Delphi.png aspect ratio is 2:1 (6250x3125). Render ~110pt wide.
          transformation: { width: 110, height: 55 },
          type: "png",
          altText: { name: "Delphi Human Design", description: "Delphi Human Design logo", title: "Delphi", id: nextDrawingId() },
        })],
      }),
    ],
  });

  const coverFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new ImageRun({
          data: knowthyselfLogoPng,
          // knowthyself.png aspect ratio is 4:1 (3250x813). Render ~110pt wide.
          transformation: { width: 110, height: 28 },
          type: "png",
          altText: { name: "know thyself", description: "know thyself", title: "know thyself", id: nextDrawingId() },
        })],
      }),
    ],
  });

  // Cover body: client name (large purple bold), "Planetary Overview Report"
  // (italic gray smaller), full mandala centered, then Type / Profile spelled
  // out / Cross with parenthetical on three lines below.
  const profileLineText = profileSpelledOut(raw.Properties.Profile.option);
  const coverParas: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 120 },
      children: [new TextRun({ text: client.name, font: FONT, size: 44, bold: true, color: PURPLE })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 },
      children: [new TextRun({ text: "Planetary Overview Report", font: FONT, size: 28, italics: true, color: H3_GRAY })],
    }),
    makeMandalaImage(fullPng, MANDALA_PX, "full-mandala"),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 60 },
      children: [new TextRun({ text: raw.Properties.Type.option, font: FONT, size: 22, color: H3_GRAY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: profileLineText, font: FONT, size: 22, color: H3_GRAY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: raw.Properties.IncarnationCross.option, font: FONT, size: 22, color: H3_GRAY })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  const doc = new Document({
    creator: "Delphi HD",
    title: `${client.name} — Planetary Overview`,
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
          // titlePage flag enables the first-page header/footer override; the
          // cover gets logos, pages 2+ get the running text header.
          titlePage: true,
        },
        headers: { default: pageHeader, first: coverHeader },
        footers: { default: pageFooter, first: coverFooter },
        children: [...coverParas, ...bodyBlocks],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  const outDir = clientOutputDir(client);
  mkdirSync(outDir, { recursive: true });

  // Auto-bump version suffix. Scan outDir for existing
  // "<Name> - Planetary Overview - v<N>.docx" files and write v<N+1>.
  const docxPrefix = `${client.name} - Planetary Overview - v`;
  let nextV = 1;
  for (const f of readdirSync(outDir)) {
    if (!f.startsWith(docxPrefix) || !f.endsWith(".docx")) continue;
    const m = f.slice(docxPrefix.length, -5).match(/^(\d+)/);
    if (m) nextV = Math.max(nextV, parseInt(m[1], 10) + 1);
  }
  const outPath = join(outDir, `${docxPrefix}${nextV}.docx`);
  writeFileSync(outPath, buf);

  const sizeKB = Math.round(buf.length / 1024);
  console.log(`\n✓ Wrote: ${outPath}`);
  console.log(`  ${sizeKB} KB,  ${bodyBlocks.length} body blocks,  Full Mandala (cover) + Personality Table + Design Table + Cross Mandala (in synthesis) + per-H2 hexagram images`);
}

main().catch((e) => { console.error(e); process.exit(1); });
