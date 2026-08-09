// Composite chart-page renderer for HD Reports.
//
// Builds the branded chart page Kaycee uses on the cover of every client
// deliverable: Delphi wordmark, title, client name, bodygraph (from
// mybodygraph's design=delphi SVG), planet tables flanking the body,
// variables arrows over the body, incarnation-cross caption beneath, a
// properties table, and the "know thyself" / delphihd.com footer.
//
// Layout matches the composite Kaycee downloads from bodygraph.com. We
// rebuild it ourselves because (a) that download is a manual step, and
// (b) the bodygraph.com endpoint isn't exposed via API.
//
// Pipeline: chart data + bodygraph SVG → composite SVG → PNG (via resvg)
// → embedded in the docx cover page.

import { Resvg } from "@resvg/resvg-js";
import type { Chart, PlanetActivation } from "@/lib/chart/types";
import type { DataPass } from "@/lib/chart/datapass";

// ─── Brand constants (mirror lib/render/docx.ts) ────────────────────────────
const PURPLE = "#845095";
const PURPLE_TINT = "#F0E6F2";       // subtle purple wash for the Design column
const GRAY_TINT  = "#F0F0F0";        // subtle gray wash for the Personality column
const GRAY_DARK  = "#333333";
const GRAY_MID   = "#999999";
const CHARCOAL   = "#A8A8A9";        // Kaycee's named secondary brand color
const BLACK      = "#000000";
// Side-coded colors. Design-side red matches the red used inside the
// Delphi bodygraph for design-side activations (channels, gate labels).
// Personality-side black is the brand-canonical pair color. Use these for
// any visual that distinguishes Design from Personality (variable arrows,
// activation labels, etc.). Do NOT use brand purple for design side.
const DESIGN_RED       = "#e06666";
const PERSONALITY_BLACK = "#000000";
// Brand body font. Kaycee uses Montserrat across all client-facing
// surfaces. Includes broad sans-serif fallbacks so resvg renders cleanly
// even on servers where Montserrat isn't installed.
const FONT_SERIF = "Montserrat, 'Helvetica Neue', Helvetica, Arial, sans-serif";

// Page canvas. Logo and "know thyself" tagline live in the docx first-page
// header/footer (separate from the composite). Caption block beneath the
// bodygraph is now just the birth line (Profile + Cross moved into the
// property table as fields). Wider canvas (W=920) so the 3-column property
// table has room for the long Incarnation Cross value without crunching
// against neighboring columns.
const W = 920;
const H = 980;

// Planet symbol per body name. Standard astrological glyphs; Uranus uses
// the variant the bodygraph community prefers.
const PLANET_SYMBOL: Record<string, string> = {
  "Sun":         "☉",
  "Earth":       "⊕",
  "North Node":  "☊",
  "South Node":  "☋",
  "Moon":        "☽",
  "Mercury":     "☿",
  "Venus":       "♀",
  "Mars":        "♂",
  "Jupiter":     "♃",
  "Saturn":      "♄",
  "Uranus":      "♅",
  "Neptune":     "♆",
  "Pluto":       "♇",
  "Chiron":      "⚷",
  "Lilith":      "⚸",
};

// The 13 planets we render on the cover (everything Ra includes per side).
const PLANETS_TO_RENDER: ReadonlyArray<string> = [
  "Sun","Earth","North Node","South Node","Moon","Mercury","Venus","Mars",
  "Jupiter","Saturn","Uranus","Neptune","Pluto",
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function activationByPlanet(rows: PlanetActivation[], planet: string): PlanetActivation | undefined {
  return rows.find((r) => r.planet === planet);
}

// Extract the inner content + viewBox of a standalone <svg> so we can nest
// it inside the composite. resvg handles nested <svg> elements with their
// own viewBox, so we just wrap the original content under a transform.
function unwrapSvg(svg: string): { innerXml: string; viewBox: string } {
  const vbMatch = svg.match(/viewbox=["']([^"']+)["']/i);
  const viewBox = vbMatch ? vbMatch[1] : "0 0 400 693";
  const open = svg.match(/<svg\b[^>]*>/i);
  const close = svg.lastIndexOf("</svg>");
  if (!open || close < 0) return { innerXml: svg, viewBox };
  const start = (open.index ?? 0) + open[0].length;
  return { innerXml: svg.slice(start, close), viewBox };
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function logoBlock(x: number, y: number): string {
  // "DELPHI" wordmark + "Human Design" beneath. No image asset needed; the
  // wordmark is the same brand styling used everywhere else.
  return `
    <g font-family="${FONT_SERIF}">
      <text x="${x}" y="${y}" font-size="26" font-weight="700" letter-spacing="3" fill="${PURPLE}">DELPHI</text>
      <text x="${x}" y="${y + 18}" font-size="11" font-weight="700" letter-spacing="1.5" fill="${GRAY_DARK}">Human Design</text>
    </g>`;
}

function titleBlock(clientName: string, reportTitle: string, yTop: number): string {
  // Per Kaycee: title in black, name in charcoal #a8a8a9.
  return `
    <g font-family="${FONT_SERIF}" text-anchor="middle">
      <text x="${W / 2}" y="${yTop}" font-size="24" font-weight="700" fill="${BLACK}">${esc(reportTitle)}</text>
      <text x="${W / 2}" y="${yTop + 38}" font-size="22" fill="${CHARCOAL}">${esc(clientName)}</text>
    </g>`;
}

interface PlanetRow {
  symbol: string;
  // Pure gate.line text (no fixing-state glyph). Renders right-aligned at a
  // fixed inner-edge so columns line up across all rows.
  label: string;
  // Optional fixing-state marker ("↑" / "↓" / ""). Renders in its OWN fixed
  // slot at the table's right edge, so its presence on some rows never
  // shifts the gate.line numbers in other rows.
  state: "" | "↑" | "↓";
}
function planetTable(
  args: { x: number; y: number; width: number; rowH: number; rows: PlanetRow[]; title: string; tint: string; titleColor: string },
): string {
  const { x, y, width, rowH, rows, title, tint, titleColor } = args;
  const padX = 10;
  const stateSlotW = 12;  // width reserved at right edge for the state arrow
  const numRightX = x + width - padX - stateSlotW;  // right edge of gate.line text
  const stateX    = x + width - padX;                // right edge of the arrow slot
  const titleH = 24;
  const totalH = titleH + rows.length * rowH + 6;
  // Background tint for the whole column.
  const bg = `<rect x="${x}" y="${y}" width="${width}" height="${totalH}" fill="${tint}" rx="3" />`;
  // Title CENTERED above the rows.
  const titleEl = `
    <text x="${x + width / 2}" y="${y + 17}" font-family="${FONT_SERIF}" font-size="13" font-weight="700" fill="${titleColor}" text-anchor="middle">${esc(title)}</text>`;
  // White divider above the first row to separate the title from the data.
  const titleDivider = `
    <line x1="${x + 4}" y1="${y + titleH}" x2="${x + width - 4}" y2="${y + titleH}" stroke="white" stroke-width="1.5"/>`;
  // Both Design and Personality use the SAME layout: symbol on left, number
  // right-aligned at a fixed inner X, state arrow in its own slot at the
  // far right. Splitting prevents the arrow's presence from shifting the
  // number's x-position (Kaycee v4 review: misalignment between rows with
  // and without fixing-state).
  const rowEls = rows.map((r, i) => {
    const rowTop = y + titleH + rowH * i;
    const textY = rowTop + rowH - 7;
    const divider = i < rows.length - 1
      ? `
    <line x1="${x + 4}" y1="${rowTop + rowH}" x2="${x + width - 4}" y2="${rowTop + rowH}" stroke="white" stroke-width="1.5"/>`
      : "";
    const stateEl = r.state
      ? `
    <text x="${stateX}" y="${textY}" font-family="${FONT_SERIF}" font-size="12" fill="${GRAY_DARK}" text-anchor="end">${esc(r.state)}</text>`
      : "";
    return `
    <text x="${x + padX}" y="${textY}" font-family="${FONT_SERIF}" font-size="13" fill="${GRAY_DARK}">${esc(r.symbol)}</text>
    <text x="${numRightX}" y="${textY}" font-family="${FONT_SERIF}" font-size="12" fill="${GRAY_DARK}" text-anchor="end">${esc(r.label)}</text>${stateEl}${divider}`;
  }).join("");
  return bg + titleEl + titleDivider + rowEls;
}

interface VarSpec { arrow: "left" | "right"; }
function variablesArrows(yCenter: number, design: { digestion: VarSpec; environment: VarSpec }, personality: { motivation: VarSpec; perspective: VarSpec }): string {
  // Two clusters: design arrows on the left of the bodygraph (red),
  // personality arrows on the right (dark gray). Each cluster has two
  // stacked arrows (one per variable). No numbers — just the arrows, big.
  // Design-side red matches the red used inside the Delphi bodygraph for
  // design-side activations (channels, gate labels). Purple is reserved
  // for headings + brand accents elsewhere.
  const ARROW_SIZE = 42;
  const ARROW_GAP = 14; // vertical gap between stacked arrows in a cluster
  const glyph = (dir: "left" | "right") => (dir === "left" ? "◂" : "▸");

  const leftCluster = (() => {
    const x = W / 2 - 75;
    return [design.digestion, design.environment].map((v, i) => {
      const ry = yCenter + i * (ARROW_SIZE + ARROW_GAP);
      return `
    <text x="${x}" y="${ry}" font-family="${FONT_SERIF}" font-size="${ARROW_SIZE}" fill="${DESIGN_RED}" text-anchor="end">${glyph(v.arrow)}</text>`;
    }).join("");
  })();
  const rightCluster = (() => {
    const x = W / 2 + 75;
    return [personality.motivation, personality.perspective].map((v, i) => {
      const ry = yCenter + i * (ARROW_SIZE + ARROW_GAP);
      return `
    <text x="${x}" y="${ry}" font-family="${FONT_SERIF}" font-size="${ARROW_SIZE}" fill="${PERSONALITY_BLACK}" text-anchor="start">${glyph(v.arrow)}</text>`;
    }).join("");
  })();
  return leftCluster + rightCluster;
}

// Each "row" can carry a single-line value (string) or a multi-line value
// (string[] — one entry per row). For multi-line, the label appears on the
// first line only; subsequent lines indent under the label column.
type PropRow = readonly [label: string, value: string | string[]];

// Word-wrap a long string at the last space at or before maxLen chars.
// Used so the long Incarnation Cross value ("Left Angle Cross of The
// Clarion (51/57 | 61/62)") doesn't overflow its property-table column
// or visually crowd into neighboring columns. Returns 1 or 2 lines.
function wrapValue(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  let breakAt = -1;
  for (let i = Math.min(maxLen, text.length - 1); i >= 0; i--) {
    if (text[i] === " ") { breakAt = i; break; }
  }
  if (breakAt === -1) return [text];
  return [text.slice(0, breakAt), text.slice(breakAt + 1)];
}

function propertyTable(rows: ReadonlyArray<PropRow>, x: number, y: number, width: number, rowH: number): string {
  // Reserve ~40% of the column for the label, leaving ~60% for the value.
  // Auto-scales when columns get narrower (3-column cover layout) or wider.
  const labelW = Math.max(70, Math.min(120, Math.round(width * 0.4)));
  // Rough chars-per-line that fits in the value area at 11pt Montserrat.
  // ~5.5 px per char average → maxChars = (width - labelW) / 5.5
  const valueW = width - labelW;
  const maxChars = Math.max(18, Math.floor(valueW / 5.5));
  let cursorY = y;
  const out: string[] = [];
  for (const [label, value] of rows) {
    const rawLines = Array.isArray(value) ? value : [value];
    // Expand any long single-line value into wrapped lines.
    const lines: string[] = [];
    for (const l of rawLines) {
      if (l && typeof l === "string" && l.length > maxChars) {
        lines.push(...wrapValue(l, maxChars));
      } else {
        lines.push(l || "—");
      }
    }
    lines.forEach((line, i) => {
      const textY = cursorY + rowH - 6;
      if (i === 0) {
        out.push(`
    <text x="${x}" y="${textY}" font-family="${FONT_SERIF}" font-size="10" font-weight="700" letter-spacing="0.5" fill="${PURPLE}">${esc(label.toUpperCase())}:</text>`);
      }
      out.push(`
    <text x="${x + labelW}" y="${textY}" font-family="${FONT_SERIF}" font-size="11" fill="${GRAY_DARK}">${esc(line)}</text>`);
      cursorY += rowH;
    });
  }
  return out.join("");
}

function footer(): string {
  const y = H - 30;
  return `
    <g font-family="${FONT_SERIF}" text-anchor="end">
      <text x="${W - 40}" y="${y}" font-size="20" letter-spacing="3" fill="${GRAY_DARK}">know thyself</text>
      <text x="${W - 40}" y="${y + 16}" font-size="9" fill="${GRAY_MID}">www.delphihd.com</text>
    </g>`;
}

// ─── Main composer ──────────────────────────────────────────────────────────

export interface CompositeArgs {
  clientName: string;
  reportTitle: string; // e.g. "Human Design Foundations Report"
  chart: Chart;
  bodygraphSvg: string; // the design=delphi SVG from mybodygraph
  // The Chart type collapses undefined and open into a single
  // consciousness === "open" value, so without the DataPass we can't tell
  // which non-defined centers are truly empty (open) vs. carry hanging
  // gates (undefined). The DataPass has c.status per center. When present,
  // the composite splits centers correctly. When absent, falls back to
  // defined-vs-not-defined only and shows everything-not-defined as "Open".
  dataPass?: DataPass;
}

export function buildCompositeChartSvg(args: CompositeArgs): string {
  const { clientName, reportTitle, chart, bodygraphSvg } = args;

  // ── Planet rows ──
  // Fixing-state marker: ↑ exalted, ↓ detriment, "" neutral. Lives in a
  // separate column slot so gate.line numbers stay aligned across rows.
  const stateGlyph = (s: PlanetActivation["fixingState"]): "" | "↑" | "↓" =>
    s === "Exalted" ? "↑" : s === "Detriment" ? "↓" : "";

  const designRows: PlanetRow[] = PLANETS_TO_RENDER.map((p) => {
    const a = activationByPlanet(chart.activations.design, p);
    return {
      symbol: PLANET_SYMBOL[p] ?? "",
      label: a ? `${a.gate}.${a.line}` : "—",
      state: a ? stateGlyph(a.fixingState) : "",
    };
  });
  const personalityRows: PlanetRow[] = PLANETS_TO_RENDER.map((p) => {
    const a = activationByPlanet(chart.activations.personality, p);
    return {
      symbol: PLANET_SYMBOL[p] ?? "",
      label: a ? `${a.gate}.${a.line}` : "—",
      state: a ? stateGlyph(a.fixingState) : "",
    };
  });

  // ── Variables ──
  // Just the four arrow directions — color/tone numbers are not surfaced
  // on the cover. They live in the Variables section of the report body.
  const vars = {
    design: {
      digestion:   { arrow: chart.variables.determination.arrow },
      environment: { arrow: chart.variables.environment.arrow   },
    },
    personality: {
      motivation:  { arrow: chart.variables.motivation.arrow    },
      perspective: { arrow: chart.variables.perspective.arrow   },
    },
  };

  // ── Centers summary for the properties table ──
  // Use the DataPass (when present) so undefined vs open is correct.
  // Otherwise fall back to defined-vs-not-defined — better than miscategorizing.
  const defined: string[] = [];
  const undefinedList: string[] = [];
  const openList: string[] = [];
  if (args.dataPass) {
    for (const c of args.dataPass.centers) {
      const label = titleCaseCenter(c.name);
      if (c.status === "defined") defined.push(label);
      else if (c.status === "undefined") undefinedList.push(label);
      else openList.push(label);
    }
  } else {
    for (const c of chart.centers) {
      const label = titleCaseCenter(c.name);
      if (c.defined) defined.push(label);
      else openList.push(label); // conservative: lump non-defined into Open
    }
  }
  const channelList = chart.channels.map((c) => c.id);

  // Three-column property table on the cover. Profile shows the FULL line
  // names ("5/1 The Heretic Investigator"). Incarnation Cross is its own
  // field directly under Profile. These used to be standalone caption
  // lines below the bodygraph; folding them into the property table makes
  // the composite shorter and prevents it from running off the page.
  const leftProps: ReadonlyArray<PropRow> = [
    ["Type", chart.type.value],
    ["Profile", formatProfileLine(chart)],
    ["Cross", chart.incarnationCross.value],
    ["Authority", chart.authority.value],
    ["Strategy", chart.strategy.value],
    ["Not-Self", chart.notSelfTheme.value],
  ];
  const middleProps: ReadonlyArray<PropRow> = [
    ["Definition", chart.definition.value],
    ["Defined", defined.length ? defined : ["—"]],
    ["Undefined", undefinedList.length ? undefinedList : ["—"]],
    ["Open", openList.length ? openList : ["—"]],
  ];
  const rightProps: ReadonlyArray<PropRow> = [
    ["Channels", channelList.length ? channelList : ["—"]],
  ];

  // ── Bodygraph (centered, native 400x693 aspect preserved) ──
  // With narrower planet tables we can give the bodygraph a bit more room.
  const bgW = 300;
  const bgH = Math.round(bgW * (693 / 400)); // = 520
  const bgX = (W - bgW) / 2;
  // No logo zone at the top anymore (it moved to docx header) — title and
  // tables shift up accordingly.
  const bgY = 160;
  const { innerXml, viewBox } = unwrapSvg(bodygraphSvg);

  // ── Layout coordinates ──
  const titleTopY = 60;
  const tableY = 140;
  const tableW = 95;  // narrower per Kaycee's review
  const rowH = 24;

  const crossY = bgY + bgH + 30;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="white"/>

  ${titleBlock(clientName, reportTitle, titleTopY)}

  ${planetTable({
    x: 30, y: tableY, width: tableW, rowH,
    rows: designRows, title: "Design", tint: PURPLE_TINT, titleColor: PURPLE,
  })}
  ${planetTable({
    x: W - 30 - tableW, y: tableY, width: tableW, rowH,
    rows: personalityRows, title: "Personality", tint: GRAY_TINT, titleColor: GRAY_DARK,
  })}

  ${variablesArrows(bgY - 10, vars.design, vars.personality)}

  <!-- bodygraph -->
  <svg x="${bgX}" y="${bgY}" width="${bgW}" height="${bgH}" viewBox="${viewBox}">
    ${innerXml}
  </svg>

  <!-- Birth line only beneath the bodygraph. Profile + Cross live in the
       property table below as proper fields (kills two duplicate caption
       lines that were making the composite too tall). -->
  <text x="${W / 2}" y="${crossY}" font-family="${FONT_SERIF}" font-size="11" fill="${CHARCOAL}" text-anchor="middle">${esc(formatBirthLine(chart))}</text>

  <!-- 3-column property table. Widths split the canvas evenly with small
       padding on each side and tiny gaps between columns. Each column is
       wide enough that long values (Incarnation Cross) wrap to 2 lines
       inside the column rather than spilling into neighbors. -->
  ${(() => {
    const pad = 30;
    const gap = 10;
    const colW = Math.floor((W - 2 * pad - 2 * gap) / 3);
    return [
      propertyTable(leftProps,   pad,                          crossY + 30, colW, 24),
      propertyTable(middleProps, pad + colW + gap,             crossY + 30, colW, 24),
      propertyTable(rightProps,  pad + 2 * (colW + gap),       crossY + 30, colW, 24),
    ].join("\n");
  })()}
</svg>`;
}

// Profile line: e.g., "5/1 The Heretic Investigator". Reads the profile
// number from the chart and looks up the canonical HD line names.
function formatProfileLine(chart: Chart): string {
  const lineNames: Record<number, string> = {
    1: "Investigator",
    2: "Hermit",
    3: "Martyr",
    4: "Opportunist",
    5: "Heretic",
    6: "Role Model",
  };
  const profile = chart.profile.value.trim();          // e.g. "5 / 1" or "5/1"
  const m = profile.match(/(\d)\s*\/\s*(\d)/);
  if (!m) return profile;
  const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
  const labelA = lineNames[a], labelB = lineNames[b];
  if (!labelA || !labelB) return profile;
  return `${a}/${b} The ${labelA} ${labelB}`;
}

// Compose the birth-info line shown beneath the bodygraph in the composite.
// Format: "April 8, 1984 · 7:15 AM · Bountiful, Utah, United States"
// Replaces the previous incarnation-cross caption per Kaycee's review (the
// cross is part of the Planetary Overview's scope, not the cover page).
function formatBirthLine(chart: Chart): string {
  // chart.birth.localDate is an ISO-8601 string like "1984-04-08T07:15:00-07:00".
  // Parse out the date and time portions directly from the string to avoid
  // any Date-object timezone conversion shenanigans.
  const iso = chart.birth.localDate;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  let dateStr = "", timeStr = "";
  if (m) {
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const yyyy = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const dd = parseInt(m[3], 10);
    let hh = parseInt(m[4], 10);
    const mins = m[5];
    const ampm = hh >= 12 ? "PM" : "AM";
    hh = hh % 12;
    if (hh === 0) hh = 12;
    dateStr = `${months[mm - 1]} ${dd}, ${yyyy}`;
    timeStr = `${hh}:${mins} ${ampm}`;
  }
  const place = chart.birth.locationQuery ?? "";
  const parts = [dateStr, timeStr, place].filter(Boolean);
  return parts.join("  ·  ");
}

function titleCaseCenter(name: string): string {
  return name.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

// Render the composite SVG to a PNG buffer suitable for embedding in a docx.
// We render at 2x the canvas pixel size so the image stays crisp on retina
// displays and on print.
export function renderCompositeChartPng(args: CompositeArgs, opts: { scale?: number } = {}): Buffer {
  const svg = buildCompositeChartSvg(args);
  const scale = opts.scale ?? 2;
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W * scale },
    background: "rgba(255,255,255,1)",
    font: {
      // Try to use Georgia if installed; resvg falls back to a default sans
      // if not. On macOS Georgia is system-installed; on Linux servers this
      // may need explicit font loading later.
      loadSystemFonts: true,
    },
  });
  return resvg.render().asPng();
}
