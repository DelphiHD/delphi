/**
 * Educational diagram: the nine centers — name + function — and how energy
 * moves through the channels to the Throat, colored by circuitry.
 *
 * Everything factual comes from Kaycee's own synced library (.cache/chunks.json):
 *   - each center's Type ("Pressure", "Motor", "Awareness", "Identity",
 *     "Manifestation") from the HD Centers database
 *   - each channel's Circuit from the HD Channels database, back-filled from the
 *     HD Circuits database where the channel row leaves it blank
 * The bodygraph itself is the branded design=delphi SVG, blanked of all
 * activations so it reads as a teaching template rather than someone's chart.
 *
 * Flow direction rule (deterministic, no guessing): the Throat is the only
 * center that manifests, so every channel points at the endpoint that is closer
 * to the Throat, measured in hops across the 36-channel graph. Where both ends
 * are the same number of hops away, the lower center on the page feeds the
 * higher one. See FLOW_OVERRIDE below to correct any single channel by hand.
 *
 * Outputs (~/Desktop/Mandala Renderer Output/Educational/):
 *   Bodygraph - Energy Flow.html        interactive: circuit toggles, motion, skins
 *   Bodygraph - Energy Flow (Night).png/.svg
 *   Bodygraph - Energy Flow (Paper).png/.svg
 *
 * Zero LLM cost. One mybodygraph call the first time (the blank template is
 * then cached at .cache/blank-bodygraph.svg); ENERGY_REFETCH=1 to refresh it.
 *
 * Run:  npx tsx scripts/energy-flow-diagram.ts            # the teaching diagram
 *       npx tsx scripts/energy-flow-diagram.ts bryan      # that client's own chart
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CHANNELS } from "@/lib/hd/channels";
import { centerOf, type Center } from "@/lib/hd/gate-center";
import { longitudeOf, GATE_RANGES, GATE_ARC_DEGREES, LINE_ARC_DEGREES } from "@/lib/hd/gate-longitude";
import type { CenterName } from "@/lib/chart/types";
import { gateName } from "@/lib/hd/gate-names";
import { loadLibraryNames } from "@/lib/hd/library-names";
import { renderFullMandala } from "@/lib/render/mandala";
import { getAstro, type AstroChart } from "@/lib/astro";
import { renderWheel } from "./astro-wheel";
import type { ChartSide, Planet } from "@/lib/render/mandala.types";
import { getChart, getTimezoneForLocation } from "@/lib/mybodygraph";
import { CLIENTS, clientFromSlug, clientOutputDir, type ClientBrief, placeForLookup } from "./client-roster";
import { loadDayRead, type DayRead } from "@/lib/transit/reads";
import { castSkyAt } from "@/lib/transit/sky";

// ── palettes ────────────────────────────────────────────────────────────────
// Circuit colors: saturated, they carry the moving light.
const CIRCUITS = [
  { id: "ind-knowing",  name: "Individual: Knowing",                group: "Individual",  color: "#a259ff" },
  { id: "ind-centering",name: "Individual: Centering",              group: "Individual",  color: "#ff5fa2" },
  { id: "col-logic",    name: "Collective: Understanding (Logic)",  group: "Collective",  color: "#29a3ff" },
  { id: "col-abstract", name: "Collective: Sensing (Abstract)",     group: "Collective",  color: "#17c9c0" },
  { id: "tri-ego",      name: "Tribal: Ego",                        group: "Tribal",      color: "#ff9f1c" },
  { id: "tri-defense",  name: "Tribal: Defense",                    group: "Tribal",      color: "#ef4b4b" },
  { id: "integration",  name: "Integration",                        group: "Integration", color: "#7ee787" },
] as const;
type CircuitId = (typeof CIRCUITS)[number]["id"];

// Center function colors: pastel, they only tint the center and label chip.
const FUNCTIONS: Record<string, string> = {
  Pressure: "#cbb8f0",
  Motor: "#f3a9a2",
  Awareness: "#a5dbe6",
  Identity: "#f0dca6",
  Manifestation: "#e7bff0",
};
const FUNCTION_ORDER = ["Pressure", "Motor", "Awareness", "Identity", "Manifestation"];

// Per-channel direction override, e.g. { "26-44": 44 } to make gate 44's end the
// source. Empty by default; the rule in the header decides everything.
const FLOW_OVERRIDE: Record<string, number> = {};

const CENTER_SVG_ID: Record<Center, string> = {
  head: "head-center",
  ajna: "ajna-center",
  throat: "throat-center",
  g: "g-center",
  heart: "heart-center",
  spleen: "splenic-center",
  sacral: "sacral-center",
  "solar-plexus": "solar-plexus-center",
  root: "root-center",
};

// Center -> the page title Kaycee uses in her HD Centers database.
const CENTER_LIB_TITLE: Record<Center, string> = {
  head: "Head",
  ajna: "Ajna",
  throat: "Throat",
  g: "G (Identity)",
  heart: "Ego (Heart, Will)",
  spleen: "Spleen",
  sacral: "Sacral",
  "solar-plexus": "Solar Plexus (Emotional)",
  root: "Root",
};

// Short display name for the label card (her library title, tightened).
const CENTER_DISPLAY: Record<Center, string> = {
  head: "Head",
  ajna: "Ajna",
  throat: "Throat",
  g: "G / Identity",
  heart: "Ego / Heart",
  spleen: "Spleen",
  sacral: "Sacral",
  "solar-plexus": "Solar Plexus",
  root: "Root",
};

// Which side of the bodygraph each label card sits on.
const LABEL_SIDE: Record<Center, "L" | "R"> = {
  head: "L", ajna: "R", throat: "L", g: "R", spleen: "L",
  heart: "R", sacral: "L", "solar-plexus": "R", root: "L",
};

// ── skins ───────────────────────────────────────────────────────────────────
interface Skin {
  id: string;
  bg: string;          // page / canvas background
  ink: string;         // gate numbers + body text
  muted: string;       // secondary text
  tube: string;        // empty channel interior
  border: string;      // channel + center outlines
  faintBorder: string; // the undefined skeleton behind a real chart
  centerFill: string;  // base center fill, tinted by function on top
  tintAlpha: number;   // how strongly the function color tints a center
  card: string;        // label card background
  cardEdge: string;
}
const PAPER: Skin = {
  id: "paper", bg: "#ffffff", ink: "#1c1a2e", muted: "#6b6790",
  tube: "#f4f2fa", border: "#b8b4d0", centerFill: "#ffffff", tintAlpha: 0.42,
  faintBorder: "#dcd8ea",
  card: "rgba(132,80,149,.06)", cardEdge: "rgba(132,80,149,.22)",
};

// Planetary placement columns, in the order Kaycee's standalone placement
// images use (scripts/export-mandala-pngs.ts). Same order, same glyphs, so the
// tables in here read as the ones she already hands out.
const PLANET_ROWS = [
  "Sun", "Earth", "Moon", "North Node", "South Node", "Mercury", "Venus",
  "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
] as const;
const PLANET_GLYPHS: Record<string, string> = {
  Sun: "\u2609", Earth: "\u2295", Moon: "\u263D", "North Node": "\u260A", "South Node": "\u260B",
  Mercury: "\u263F", Venus: "\u2640", Mars: "\u2642", Jupiter: "\u2643", Saturn: "\u2644",
  Uranus: "", Neptune: "\u2646", Pluto: "\u2647",
};
const PROFILE_LINES: Record<number, string> = {
  1: "Investigator", 2: "Hermit", 3: "Martyr", 4: "Opportunist", 5: "Heretic", 6: "Role Model",
};
const planetId = (p: string) => p.toLowerCase().replace(/\s+/g, "-");
/** Display name -> the mandala renderer's planet key. */
const MANDALA_PLANET: Record<string, Planet> = {
  Sun: "sun", Earth: "earth", Moon: "moon", "North Node": "north-node",
  "South Node": "south-node", Mercury: "mercury", Venus: "venus", Mars: "mars",
  Jupiter: "jupiter", Saturn: "saturn", Uranus: "uranus", Neptune: "neptune",
  Pluto: "pluto",
};
const DESIGN_RED = "#e06666";
// Solid highlight gold. Kaycee's pick, and the same gold the transit overlay
// uses for client placements, so a lit channel and a client transit read alike.
const HL_GOLD = "#f1c232";

// Kaycee's booking page. Client charts link straight to the individual sessions
// so anyone holding a chart can book without going back through her. Drop-In is
// hidden from the public page on purpose and stays reachable by direct link:
// whoever is holding a chart is already a client, which is who it is for.
const BOOKING_URL = "https://cal.com/DelphiHumanDesign";
const BOOKING_SESSIONS = [
  { slug: "foundation-session", name: "Foundation Session", meta: "2 hr &middot; $200" },
  { slug: "relationship-session", name: "Relationship Session", meta: "2 hr &middot; $300" },
  { slug: "drop-in", name: "Drop-In", meta: "30 min &middot; $50" },
];

const TABLE_W = 132, TABLE_GAP = 22;
const TUBE = 8.7;                       // channel width in the delphi design

// ── canvas layout ──────────────────────────────────────────────────────────
// Two compositions off the same geometry: the teaching diagram keeps its center
// labels and legend, a client chart drops them, runs the bodygraph much larger
// and flanks it with the placement columns.
const BG_W = 400, BG_H = 693;          // the delphi SVG's own viewBox

interface Layout {
  sc: number; tx: number; ty: number; coreW: number; h: number;
  labels: boolean; tables: boolean;
}
function layoutFor(client: boolean, legend: boolean): Layout {
  if (client) {
    const sc = 1.36;
    return { sc, tx: 62, ty: 84, coreW: BG_W * sc + 124, h: 84 + BG_H * sc + (legend ? 190 : 34),
      labels: false, tables: true };
  }
  const sc = 1.06;
  return { sc, tx: 392, ty: 128, coreW: 1180, h: legend ? 1064 : 894, labels: true, tables: false };
}

let LY: Layout = layoutFor(false, true);
let OX = 0;                             // left offset once the tables are in
const toCanvasX = (x: number) => OX + LY.tx + x * LY.sc;
const toCanvasY = (y: number) => LY.ty + y * LY.sc;

// ── tiny SVG geometry (rect / polygon / path bounding boxes) ────────────────
interface BBox { x1: number; y1: number; x2: number; y2: number }
const bboxOfPoints = (pts: [number, number][]): BBox => ({
  x1: Math.min(...pts.map((p) => p[0])), y1: Math.min(...pts.map((p) => p[1])),
  x2: Math.max(...pts.map((p) => p[0])), y2: Math.max(...pts.map((p) => p[1])),
});
const cx = (b: BBox) => (b.x1 + b.x2) / 2;
const cy = (b: BBox) => (b.y1 + b.y2) / 2;

/** Every absolute point a path visits (endpoints and control points). Good
 *  enough for a bounding box; these are straight-edged bodygraph legs. */
function pathPoints(d: string): [number, number][] {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const pts: [number, number][] = [];
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0;
  const num = () => Number(toks[i++]);
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) { cmd = toks[i++]; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === "Z") { x = sx; y = sy; continue; }
    if (C === "M" || C === "L" || C === "T") {
      const nx = num(), ny = num();
      x = rel ? x + nx : nx; y = rel ? y + ny : ny;
      if (C === "M") { sx = x; sy = y; if (cmd === "M") cmd = "L"; else cmd = "l"; }
      pts.push([x, y]);
    } else if (C === "H") { const nx = num(); x = rel ? x + nx : nx; pts.push([x, y]); }
    else if (C === "V") { const ny = num(); y = rel ? y + ny : ny; pts.push([x, y]); }
    else if (C === "C" || C === "S" || C === "Q" || C === "A") {
      const n = C === "C" ? 6 : C === "S" || C === "Q" ? 4 : 7;
      const v: number[] = [];
      for (let k = 0; k < n; k++) v.push(num());
      if (C === "A") { x = rel ? x + v[5] : v[5]; y = rel ? y + v[6] : v[6]; pts.push([x, y]); }
      else {
        for (let k = 0; k + 1 < v.length; k += 2) {
          const px = rel ? x + v[k] : v[k], py = rel ? y + v[k + 1] : v[k + 1];
          pts.push([px, py]);
        }
        x = rel ? x + v[n - 2] : v[n - 2]; y = rel ? y + v[n - 1] : v[n - 1];
      }
    } else { i++; }
  }
  return pts;
}

interface El { tag: string; attrs: string; raw: string }
function bboxOfEl(el: El): BBox {
  const at = (n: string) => {
    const m = el.attrs.match(new RegExp(`\\b${n}="([^"]*)"`));
    return m ? m[1] : "";
  };
  if (el.tag === "rect") {
    const x = +at("x"), y = +at("y"), w = +at("width"), h = +at("height");
    return { x1: x, y1: y, x2: x + w, y2: y + h };
  }
  if (el.tag === "polygon" || el.tag === "polyline") {
    const n = (at("points").match(/-?\d*\.?\d+/g) ?? []).map(Number);
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
    return bboxOfPoints(pts);
  }
  return bboxOfPoints(pathPoints(at("d")));
}

/** Re-emit a shape with our own presentation attributes and no id. */
function reshape(el: El, extra: string): string {
  const keep = ["d", "points", "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r"];
  const kept = keep
    .map((n) => {
      const m = el.attrs.match(new RegExp(`\\b${n}="([^"]*)"`));
      return m ? `${n}="${m[1]}"` : "";
    })
    .filter(Boolean)
    .join(" ");
  return `<${el.tag} ${kept} ${extra}></${el.tag}>`;
}

/** The substring of a <g id="..."> ... matching </g>. */
function groupBody(svg: string, id: string): string | null {
  const open = svg.indexOf(`<g id="${id}"`);
  if (open < 0) return null;
  const start = svg.indexOf(">", open) + 1;
  let depth = 1, i = start;
  const re = /<g\b|<\/g>/g;
  re.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    depth += m[0] === "</g>" ? -1 : 1;
    if (depth === 0) { i = m.index; break; }
  }
  return svg.slice(start, i);
}

function elementsIn(body: string, idPrefix: string): Map<string, El> {
  const out = new Map<string, El>();
  const re = new RegExp(`<(rect|polygon|polyline|path)\\s+id="(${idPrefix}[\\d-]*)"([^>]*)>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (!out.has(m[2])) out.set(m[2], { tag: m[1], attrs: m[3], raw: m[0] });
  }
  return out;
}

// ── the branded blank bodygraph ─────────────────────────────────────────────
const BLANK_CACHE = ".cache/blank-bodygraph.svg";

async function blankBodygraph(): Promise<string> {
  if (existsSync(BLANK_CACHE) && !process.env.ENERGY_REFETCH) {
    return readFileSync(BLANK_CACHE, "utf8");
  }
  // Any moment works: every activation is stripped below. Fixed so reruns are
  // byte-identical.
  const chart = await getChart({
    birthDate: "2000-01-01", birthTime: "12:00", timezone: "UTC",
    latitude: 0, longitude: 0, brandedSvg: true,
  });
  const svg = chart.bodygraphSvg ?? chart.chartImageSvg;
  if (!svg || !svg.includes("<svg")) {
    throw new Error("mybodygraph returned no branded SVG (design=delphi). Cannot build the diagram.");
  }
  mkdirSync(".cache", { recursive: true });
  writeFileSync(BLANK_CACHE, svg);
  return svg;
}

/** Inner markup of the fetched SVG, with every personal activation removed. */
function neutralize(svg: string, skin: Skin, faint = false, active?: Set<number>): string {
  let s = svg.replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  // activated gate legs (both sides) -> empty
  s = s.replace(/(id="(?:personality|design)-[\d-]+"[^>]*?)fill="[^"]*"/g, '$1fill="none"');
  // gate-number highlight discs -> gone
  s = s.replace(/(<path id="_\d+"[^>]*?)fill="[^"]*"/g, '$1fill="none"');
  // channel interiors + outlines + gate numbers -> skin colors
  s = s.replace(/(<path id="channel-back"[^>]*?)fill="[^"]*"/, `$1class="tube" fill="${skin.tube}"`);
  s = s.replace(/(<path id="ChannelBorders"[^>]*?)stroke="[^"]*"/,
    `$1class="edge" stroke="${faint ? skin.faintBorder : skin.border}"`);
  // gate numbers: an activated gate reads in brand purple and bold, the rest
  // step back so the activations carry the eye
  const activeCol = skin.id === "night" ? mix("#845095", "#ffffff", 0.5) : "#845095";
  s = s.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/g, (_m, attrs: string, inner: string) => {
    const n = Number((inner.replace(/<[^>]*>/g, "").match(/\d+/) ?? [])[0]);
    const on = !!active && !!n && active.has(n);
    const rest = attrs.replace(/\s(?:fill|font-weight|class)="[^"]*"/g, "");
    const col = on ? activeCol : active ? skin.muted : skin.ink;
    return `<text${rest} class="gnum${on ? " act" : ""}"${n ? ` data-gate="${n}"` : ""} ` +
      `fill="${col}"${on ? ' font-weight="600"' : ""}>${inner}</text>`;
  });
  s = s.replace(/font-family:\s*[^;"]+/g, "font-family: Montserrat, system-ui, sans-serif");
  return s;
}

/** The chart as mybodygraph draws it, untouched: personality legs black,
 *  design legs red, defined centers in their own colors. Only the hooks the
 *  page needs are added, so the traditional view stays traditional. */
function tagChart(svg: string): string {
  let s = svg;
  s = s.replace(/font-family:\s*[^;"]+/g, "font-family: Montserrat, system-ui, sans-serif");
  for (const [center, id] of Object.entries(CENTER_SVG_ID) as [Center, string][]) {
    const m = s.match(new RegExp(`<path id="${id}"[^>]*?fill="([^"]*)"`));
    const own = m?.[1] ?? "#ffffff";
    s = s.replace(new RegExp(`<path id="${id}"`),
      `<path class="cshape" data-center="${center}" data-on="${own}" data-off="#ffffff" id="${id}"`);
  }
  // The design encodes the side in the fill, not the id: black is Personality,
  // red is Design, and a gate held on both sides gets the black leg with the
  // red one laid over half of it. Tag them so the toggles can act on a side.
  // `personality-N` is the full-width leg; `design-N` is a half-width overlay
  // drawn on top of it. Only the full one gets the highlight glow, otherwise the
  // overlay's inner edge glows too and reads as a line down the channel.
  s = s.replace(
    /<(rect|polygon|polyline|path)\s+id="(personality|design)-(\d+)[\d-]*"([^>]*?)fill="(#000000|#e06666)"/g,
    (_m, tag: string, which: string, gate: string, rest: string, fill: string) =>
      `<${tag} class="pleg" data-gate="${gate}"${which === "personality" ? ' data-full="1"' : ""} ` +
      `data-fill="${fill === "#e06666" ? "red" : "black"}"${rest}fill="${fill}"`,
  );
  // each channel's own group, so a highlight can outline both legs as one shape
  // rather than stroking each and drawing a seam where they meet
  s = s.replace(/<g id="(_[\d][\d\-]*(?:-G)?)"/g, (m, id: string) => {
    const nums = (id.match(/\d+/g) ?? []).map(Number);
    if (nums.length !== 2) return m;
    return `<g class="chgrp" data-ch="${pairKey(nums[0], nums[1])}" id="${id}"`;
  });

  // the filled disc behind an activated gate number
  s = s.replace(/<path id="_(\d+)"([^>]*?)fill="#000000"/g,
    (_m, gate: string, rest: string) => `<path class="gdisc" data-gate="${gate}"${rest}fill="#000000"`);
  // the gate numbers themselves, so a number can drop back to dark when its
  // disc is hidden
  s = s.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/g, (_m, attrs: string, inner: string) => {
    const n = (inner.replace(/<[^>]*>/g, "").match(/\d+/) ?? [])[0];
    return `<text${attrs} class="pnum"${n ? ` data-gate="${n}"` : ""}>${inner}</text>`;
  });
  return s;
}

/** The tagged chart without its wrapper, for dropping into the canvas.
 *
 *  Bridge gates get their legs tagged on the way through. A bridge gate is one
 *  the client does NOT carry, so the design leaves its leg unfilled and there is
 *  nothing on the chart to point at. Tagging it means the Bridge gates toggle
 *  can draw the missing half, and the whole channel becomes visible: their leg
 *  in its own colour, the gate they lack in bridge pink. */
/** Tag the legs of gates the client does not carry but which would bridge their
 *  split, so the Bridge gates toggle has something to paint. Shared by the
 *  traditional chart and the small bodygraph at the centre of the mandala. */
function bridgeLegs(tagged: string, bridgeGates: number[]): string {
  let s = tagged;
  for (const g of new Set(bridgeGates)) {
    s = s.replace(new RegExp(`(<text[^>]*class="pnum)(" data-gate="${g}")`),
      (_m, a: string, b: string) => `${a} bnum${b}`);
    s = s.replace(new RegExp(`(<[a-z]+ id="personality-${g}"[^>]*?)fill="[^"]*"`),
      (_m, head: string) => `${head.replace('id="', 'class="bleg" data-gate="' + g + '" id="')}fill="none"`);
  }
  return s;
}

function plainInner(svg: string, bridgeGates: number[] = []): string {
  const s = bridgeLegs(tagChart(svg), bridgeGates);
  return s.replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
}

/** Center shapes: skin fill blended with the center's function color, neutral
 *  rim. Centers that do two jobs (Root, Solar Plexus) carry both tints. Each
 *  shape also carries its defined and open looks, so the page can switch a
 *  center as the visible definition changes. */
function paintCenters(
  inner: string, skin: Skin, fn: Record<Center, string[]>, defined?: Set<Center>,
): string {
  let s = inner;
  const grads: string[] = [];
  for (const [center, id] of Object.entries(CENTER_SVG_ID) as [Center, string][]) {
    const tints = fn[center].map((f) => mix(skin.centerFill, FUNCTIONS[f], skin.tintAlpha));
    let onFill = tints[0];
    if (tints.length > 1) {
      const gid = `fn-${center}-${skin.id}`;
      grads.push(
        `<linearGradient id="${gid}" x1="0" y1="0" x2="0.85" y2="1">` +
        tints.map((t, i) => `<stop offset="${Math.round((i / (tints.length - 1)) * 100)}%" stop-color="${t}"></stop>`).join("") +
        `</linearGradient>`,
      );
      onFill = `url(#${gid})`;
    }
    const isOpen = defined ? !defined.has(center) : false;
    const tag = s.match(new RegExp(`<path id="${id}"[^>]*>`));
    if (!tag) throw new Error(`branded SVG has no ${id} shape to paint`);
    const cleaned = tag[0]
      .replace(/\s(?:fill|stroke|stroke-width|fill-opacity|class)="[^"]*"/g, "")
      .replace(/>$/, ` class="cshape${isOpen ? " open" : ""}" data-center="${center}" ` +
        `data-on="${onFill}" data-off="${skin.centerFill}" data-dash="3 3" ` +
        `fill="${isOpen ? skin.centerFill : onFill}" stroke="${skin.border}" stroke-width="1.1"` +
        `${isOpen ? ' stroke-dasharray="3 3"' : ""}>`);
    s = s.replace(tag[0], cleaned);
  }
  return `<defs>${grads.join("")}</defs>${s}`;
}

// ── the day's read, lifted from Kaycee's own transit report ─────────────────
// The morning report already writes a grounded paragraph for every person on
// the roster, followed by the exact completions driving it. Rather than
// generating anything new (which would cost a Claude call per view and say
// something different from what she read at breakfast), the chart page quotes
// that report. The completions list is what makes hovering the prose reliable:
// it names the gates and channels the paragraph is about, so nothing has to be
// guessed out of free text.

/** The sky for one date, cached on disk. A past moment never changes, so it is
 *  cast once and reused for every client and every rebuild after. Kaycee's plan
 *  has unlimited charts, so this is about speed, not money. */
async function skyForDate(date: string, time: string): Promise<{ planet: string; gate: number; line: number; fixingState: string }[]> {
  const dir = join(".cache", "transits");
  const file = join(dir, `sky-${date}-${time.replace(":", "")}.json`);
  if (existsSync(file)) {
    try { return JSON.parse(readFileSync(file, "utf8")); } catch { /* fall through and re-cast */ }
  }
  const moment = await castSkyAt(date, time, "UTC");
  const out = moment.positions.map((p) => ({
    planet: p.planet, gate: p.gate, line: p.line, fixingState: p.fixingState,
  }));
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(out));
  return out;
}

const shiftDate = (date: string, days: number) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// ── transit overlay ─────────────────────────────────────────────────────────
// Kaycee's colours: the client in island teal, today's sky in neutral
// charcoal. Charcoal rather than a colour on purpose: the two awareness
// centres are purple, so indigo and magenta discs sink into them, and the warm
// end is already spoken for by the design red in the columns. Neutral dark is
// the only family free on this chart, and "the weather" should not look like a
// second identity anyway. Gold stays reserved for highlights, so nothing on the chart is
// permanently wearing the colour that means "you are pointing at this".
// Because every
// gate's leg is its own shape, a channel that one of each completes comes out
// two-toned on its own, which is the point: you can see it is a temporary
// bridge rather than part of their design.
const CLIENT_TINT = "#0d9488";
const TRANSIT_INK = "#2b2b33";

// What the Delphi design fills a DEFINED centre with. Harvested from the
// roster's own charts rather than guessed: pressure and motor centres grey,
// awareness centres purple, throat and G yellow. Needed because a transit can
// define a centre that is open in the client's chart, and the client's own SVG
// only knows the colour of the centres they already have.
const DEFINED_CENTER_FILL: Record<Center, string> = {
  head: "#bcbcbc", ajna: "#a86bbd", throat: "#fbf7b2", g: "#fbf7b2",
  heart: "#bcbcbc", "solar-plexus": "#a86bbd", sacral: "#bcbcbc",
  spleen: "#a86bbd", root: "#bcbcbc",
};

/** The client's chart with a moment's sky laid over it. */
function transitInner(
  raw: string,
  natal: Set<number>,
  transit: Set<number>,
  definedNow: Set<Center>,
): string {
  let s = tagChart(raw);

  // 1. the client's own legs and discs turn gold, keeping exactly the legs the
  //    design drew: recolour what is already filled, never add a leg, or we
  //    would invent an activation they do not have.
  s = s.replace(/(<[a-z]+ class="pleg" data-gate="\d+"[^>]*?)fill="(?:#000000|#e06666)"/g,
    (_m, head: string) => `${head}fill="${CLIENT_TINT}"`);
  s = s.replace(/(<path class="gdisc" data-gate="\d+"[^>]*?)fill="#000000"/g,
    (_m, head: string) => `${head}fill="${CLIENT_TINT}"`);

  // 2. the sky's own gates. A transit is a single activation, so it takes the
  //    full-width personality leg. Gates the client already carries stay gold:
  //    the transit is reinforcing something of theirs, not adding to it.
  // Tag every gate the client does not carry, not just today's, so the page can
  // repaint itself for any date the picker asks for.
  const paintable = new Set<number>();
  for (let g = 1; g <= 64; g++) if (!natal.has(g)) paintable.add(g);
  for (const g of paintable) {
    const lit = transit.has(g);
    // The design writes "empty" three different ways: none, #ffffff and
    // rgba(0, 0, 0, 0). These gates are unactivated in the client's chart by
    // definition, so replace whatever fill is there rather than matching one
    // spelling of nothing.
    const fill = lit ? TRANSIT_INK : "none";
    s = s.replace(new RegExp(`(<[a-z]+ id="personality-${g}"[^>]*?)fill="[^"]*"`),
      (_m, head: string) => `${head.replace('id="', 'class="tleg" data-gate="' + g + '" id="')}fill="${fill}"`);
    s = s.replace(new RegExp(`(<path id="_${g}"[^>]*?)fill="[^"]*"`),
      (_m, head: string) => `${head.replace('id="', 'class="tdisc" data-gate="' + g + '" id="')}fill="${fill}"`);
  }

  // The gate number has to flip with the disc under it. The design writes white
  // numbers on its black discs; white on gold is about 2:1 and unreadable, and
  // the transit's own gates start as dark numbers on nothing.
  const setNum = (gate: number, col: string) => {
    s = s.replace(new RegExp(`(<text[^>]*?)fill="[^"]*"([^>]*class="pnum)("\\s+data-gate="${gate}")`),
      (_m, a: string, b: string, c: string) => `${a}fill="${col}"${b} on-disc${c}`);
  };
  // Every disc on this view is dark, teal or charcoal, so every number sitting
  // on one is white. A gate with no disc under it keeps its ordinary dark
  // number: the date picker adds and removes the class as days change.
  for (const g of natal) setNum(g, "#ffffff");
  for (const g of transit) if (!natal.has(g)) setNum(g, "#ffffff");

  // 3. a centre defined only by a transit-completed channel has to show as
  //    defined, or the chart says the opposite of what the overlay means
  // Each centre keeps the fill it wears when open, so stepping to a date where
  // nothing completes there can put it back. Captured before anything is
  // repainted, or "open" would just mean "however today happened to look".
  for (const center of Object.keys(CENTER_SVG_ID) as Center[]) {
    s = s.replace(new RegExp(`(<path class="cshape" data-center="${center}"[^>]*?)fill="([^"]*)"`),
      (_m, head: string, open: string) =>
        `${head}data-openfill="${open}" data-litfill="${DEFINED_CENTER_FILL[center]}" ` +
        `fill="${definedNow.has(center) ? DEFINED_CENTER_FILL[center] : open}"`);
  }
  return s.replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
}

// ── color helpers ───────────────────────────────────────────────────────────
function hexToRgb(h: string): [number, number, number] {
  const m = h.replace("#", "");
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
const hx = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
function mix(a: string, b: string, amt: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `#${hx(A[0] + (B[0] - A[0]) * amt)}${hx(A[1] + (B[1] - A[1]) * amt)}${hx(A[2] + (B[2] - A[2]) * amt)}`;
}

// ── a real chart, when one is asked for ────────────────────────────────────
/** The chart API names the emotional center "solar plexus"; our gate map keys
 *  it "solar-plexus". Mapping explicitly, because a silent miss here would draw
 *  a defined center as open. */
const CENTER_FROM_API: Record<CenterName, Center> = {
  head: "head", ajna: "ajna", throat: "throat", g: "g", heart: "heart",
  "solar plexus": "solar-plexus", sacral: "sacral", spleen: "spleen", root: "root",
};

interface ClientCtx {
  slug: string;
  name: string;
  svg: string;                  // their branded SVG, activations and all
  channels: Set<string>;        // defined channels, "low-high"
  centers: Set<Center>;         // defined centers
  gates: Set<number>;           // every activated gate, for hanging legs
  meta: { label: string; value: string }[];
  report: ReportText;
  variables: { key: string; label: string; arrow: "left" | "right"; theme: string; side: "design" | "personality" }[];
  acts: { side: "personality" | "design"; planet: string; gate: number; line: number; fix: string;
    color: number; tone: number; base: number }[];
  subtitle: { personality: string[]; design: string[] };
  outDir: string;
}

/** "2 / 4" -> "2 / 4 Hermit Opportunist", the way Kaycee names it. */
function profileWithLines(value: string): string {
  const lines = (value.match(/\d/g) ?? []).map(Number).map((n) => PROFILE_LINES[n]).filter(Boolean);
  return `${value} ${lines.join(" ")}`.trim();
}

async function loadClient(brief: ClientBrief): Promise<ClientCtx> {
  const tz = await getTimezoneForLocation(placeForLookup(brief));
  const chart = await getChart({
    birthDate: brief.birthDate, birthTime: brief.birthTime, timezone: tz,
    locationQuery: placeForLookup(brief), brandedSvg: true,
  });
  const svg = chart.bodygraphSvg ?? chart.chartImageSvg;
  if (!svg || !svg.includes("<svg")) {
    throw new Error(`mybodygraph returned no branded SVG for ${brief.name}.`);
  }
  // built from the 13-planet set below, not the raw response: Chiron and Lilith
  // are not part of the placements Kaycee works from, so they must not light a
  // gate or hang a leg
  // birth reads in its own local time, everything else in UTC
  const fmt = (iso: string, zone: string, withPlace: boolean): string[] => {
    const d = new Date(iso);
    const day = new Intl.DateTimeFormat("en-US",
      { timeZone: zone, month: "long", day: "numeric", year: "numeric" }).format(d);
    const time = new Intl.DateTimeFormat("en-US",
      { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
    const label = zone === "UTC"
      ? "UTC"
      : (new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
          .formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "");
    const lines = [`${day}  \u00b7  ${time}${label ? ` ${label}` : ""}`];
    if (withPlace && brief.birthPlace) lines.push(brief.birthPlace);
    return lines;
  };
  // Chiron and Lilith come back from the API but are not part of the placement
  // columns Kaycee uses, so they never reach the tables or the bodygraph marks
  const acts = (["personality", "design"] as const).flatMap((side) =>
    chart.activations[side].filter((a) => (PLANET_ROWS as readonly string[]).includes(a.planet)).map((a) => ({
      side,
      planet: a.planet as string,
      gate: a.gate,
      line: a.line,
      fix: /exalt/i.test(a.fixingState ?? "") ? "\u25B2"
        : /detriment/i.test(a.fixingState ?? "") ? "\u25BD" : "",
      // colour, tone and base pin the longitude to about 0.0007 degrees, which
      // is what settles the twelve gate-lines that straddle a sign boundary
      color: a.color ?? 1, tone: a.tone ?? 1, base: a.base ?? 1,
    })),
  );

  const gates = new Set<number>(acts.map((a) => a.gate));

  return {
    slug: brief.slug,
    name: brief.name,
    svg,
    acts,
    subtitle: {
      personality: fmt(chart.birth.utcDate, tz, true),
      design: fmt(chart.birth.designUtcDate, "UTC", false),
    },
    channels: new Set(chart.channels.map((c) => pairKey(c.gates[0], c.gates[1]))),
    centers: new Set(
      chart.centers.filter((c) => c.defined).map((c) => CENTER_FROM_API[c.name]),
    ),
    gates,
    report: loadReports(brief.slug, brief.name, clientOutputDir(brief), {
      signature: chart.signature.value, notSelf: chart.notSelfTheme.value,
    }),
    // the four PHS arrows, in the clusters the report cover uses: Design red on
    // the left, Personality black on the right
    variables: [
      { key: "determination", label: "Determination", side: "design",
        arrow: chart.variables.determination.arrow, theme: chart.variables.determination.theme },
      { key: "environment", label: "Environment", side: "design",
        arrow: chart.variables.environment.arrow, theme: chart.variables.environment.theme },
      { key: "motivation", label: "Motivation", side: "personality",
        arrow: chart.variables.motivation.arrow, theme: chart.variables.motivation.theme },
      { key: "perspective", label: "Perspective", side: "personality",
        arrow: chart.variables.perspective.arrow, theme: chart.variables.perspective.theme },
    ],
    meta: [
      { label: "Profile", value: profileWithLines(chart.profile.value) },
      { label: "Type", value: chart.type.value },
      { label: "Strategy", value: chart.strategy.value },
      { label: "Authority", value: chart.authority.value },
      { label: "Definition", value: chart.definition.value },
      { label: "Frequencies", value: `${chart.signature.value} / ${chart.notSelfTheme.value}` },
      { label: "Incarnation Cross", value: chart.incarnationCross.value },
    ],
    outDir: clientOutputDir(brief),
  };
}

// ── his own reports ────────────────────────────────────────────────────────
// The Foundation and Planetary Overview markdown are already on disk from the
// report run. Same files and same section shapes the interactive chart reads,
// so a popup here says exactly what his report says.

function reportPath(slug: string, name: string, outDir: string, kind: "foundation" | "planetary"): string | null {
  const candidates: string[] = [];
  for (const sl of [slug, name.toLowerCase().replace(/[^a-z0-9]+/g, "-")]) {
    const p = `.cache/reports/${sl}-${kind}.md`;
    if (existsSync(p)) candidates.push(p);
  }
  // reports also live in the client's own folder, versioned by hand
  // ("Max Jones - Foundation - v2.md"), so take the most recent one
  const want = kind === "foundation" ? /foundation/i : /planetary/i;
  if (existsSync(outDir)) {
    for (const f of readdirSync(outDir)) {
      if (f.endsWith(".md") && want.test(f)) candidates.push(join(outDir, f));
    }
  }
  if (!candidates.length) return null;
  return candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

/** Paragraphs under a report section, stopping at the next heading or rule. */
function sectionParas(lines: string[], start: number): string[] {
  const paras: string[] = [];
  const stop = (l: string) => /^#/.test(l) || /^---/.test(l.trim()) || /^[-*]\s+\*\*Gate/.test(l.trim());
  let j = start;
  while (j < lines.length && !stop(lines[j])) {
    while (j < lines.length && lines[j].trim() === "") j++;
    if (j < lines.length && stop(lines[j])) break;
    const buf: string[] = [];
    while (j < lines.length && lines[j].trim() !== "" && !stop(lines[j])) { buf.push(lines[j].trim()); j++; }
    if (buf.length) paras.push(buf.join(" "));
  }
  return paras;
}

const cleanProse = (paras: string[]): string =>
  paras
    .map((t) => t.replace(/^\s*>\s*/, "").replace(/^TLDR:?\s*/i, "").replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .join("\n\n");

interface ReportText {
  centers: Record<string, string>;    // center id -> prose
  channels: Record<string, string>;   // "low-high" -> prose
  gates: Record<string, string>;      // "personality|Sun" -> prose
  props: Record<string, string>;      // "profile" | "type" | ... -> prose
  cycles: { label: string; date: string; status: string; text: string }[];
}

/** Reports name the centers differently from run to run ("Heart", "Ego (Heart,
 *  Will)", "G", "G (Identity)"), so match on the words rather than a fixed key. */
function centerFromHeading(label: string): Center | null {
  const t = label.trim().toLowerCase();
  if (/^head\b/.test(t)) return "head";
  if (/^ajna\b/.test(t)) return "ajna";
  if (/^throat\b/.test(t)) return "throat";
  if (/^g\b/.test(t) || t.startsWith("g (")) return "g";
  if (/ego|heart|will/.test(t)) return "heart";
  if (/solar|emotional/.test(t)) return "solar-plexus";
  if (/sacral/.test(t)) return "sacral";
  if (/spleen|splenic/.test(t)) return "spleen";
  if (/root/.test(t)) return "root";
  return null;
}

function loadReports(
  slug: string, name: string, outDir: string, freq: { signature: string; notSelf: string },
): ReportText {
  const out: ReportText = { centers: {}, channels: {}, gates: {}, props: {}, cycles: [] };

  const foundation = reportPath(slug, name, outDir, "foundation");
  if (foundation) {
    const lines = readFileSync(foundation, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const c = lines[i].match(/^###\s+(.+?)\s+\|\s+.+?\s+\|\s+(Defined|Undefined|Open)\s*$/);
      if (c) {
        const center = centerFromHeading(c[1]);
        if (center) {
          out.centers[center] = cleanProse(sectionParas(lines, i + 1));
          continue;
        }
      }
      const ch = lines[i].match(/^##\s+\((\d+)\s*-\s*(\d+)\)/);
      if (ch) { out.channels[pairKey(+ch[1], +ch[2])] = cleanProse(sectionParas(lines, i + 1)); continue; }
      // the four variables, e.g. "## Digestion - Color 6: Light | Left Active..."
      // the signature / not-self pair, wherever the report keeps it
      // (Bryan's sits as "## Satisfaction and Frustration" under Strategy)
      const fh = lines[i].match(/^#{2,3}\s+(.+?)\s*$/);
      if (fh && !out.props.frequencies) {
        const t = fh[1].toLowerCase();
        const sig = freq.signature.toLowerCase(), ns = freq.notSelf.toLowerCase();
        if (sig && ns && t.includes(sig) && t.includes(ns)) {
          out.props.frequencies = ["\u00a7" + fh[1].trim(), cleanProse(sectionParas(lines, i + 1))]
            .filter(Boolean).join("\n\n");
        }
      }
      const v = lines[i].match(/^##\s+(Digestion|Environment|Motivation|Perspective)\s+-\s+(.+?)\s*$/);
      if (v) {
        const key = v[1] === "Digestion" ? "determination" : v[1].toLowerCase();
        out.props[`var-${key}`] = ["\u00a7" + v[2].trim(), cleanProse(sectionParas(lines, i + 1))]
          .filter(Boolean).join("\n\n");
      }
    }
  }

  // The property sections are titled differently from run to run: "# Your
  // Profile" or "# Your Profile: 5/1 The Heretic Investigator", Type, Strategy
  // and Authority sometimes merged under one heading with their own subheads.
  // Match on the words, and let a subhead claim its own property.
  if (foundation) {
    const lines = readFileSync(foundation, "utf8").split("\n");
    const keysIn = (title: string): string[] => {
      const t = title.toLowerCase();
      if (/\bcenters?\b|\bchannels?\b|variables|timeline|how to use/.test(t)) return [];
      const found: string[] = [];
      if (/\bprofile\b/.test(t)) found.push("profile");
      if (/\btype\b/.test(t)) found.push("type");
      if (/\bstrategy\b/.test(t)) found.push("strategy");
      if (/\bauthority\b/.test(t)) found.push("authority");
      if (/\bdefinition\b/.test(t)) found.push("definition");
      if (/\bcross\b/.test(t)) found.push("cross");
      return found;
    };
    let h1Keys: string[] = [];
    let subKeys: string[] = [];
    let h1Buf: string[] = [];
    let subBuf: string[] = [];
    const put = (keys: string[], buf: string[], overwrite: boolean) => {
      if (!keys.length || !buf.length) return;
      for (const k of keys) if (overwrite || !out.props[k]) out.props[k] = buf.join("\n\n");
    };
    const flushSub = () => { put(subKeys, subBuf, true); subKeys = []; subBuf = []; };
    const flushH1 = () => { flushSub(); put(h1Keys, h1Buf, false); h1Keys = []; h1Buf = []; };
    for (const raw of lines) {
      const h1 = raw.match(/^#\s+(.+?)\s*$/);
      if (h1) { flushH1(); h1Keys = keysIn(h1[1]); continue; }
      if (!h1Keys.length) continue;
      const sub = raw.match(/^#{2,3}\s+(.+?)\s*$/);
      if (sub) {
        flushSub();
        const own = keysIn(sub[1]);
        // a subhead only claims a property when it names just that one
        if (own.length === 1 && h1Keys.length > 1) { subKeys = own; subBuf = ["\u00a7" + sub[1].trim()]; }
        else h1Buf.push("\u00a7" + sub[1].trim());
        continue;
      }
      const t = raw.replace(/^\s*>\s*/, "").replace(/\*\*/g, "").trim();
      if (!t || /^-{3,}$/.test(t)) continue;
      const line = t.replace(/^TLDR:?\s*/i, "");
      if (subKeys.length) subBuf.push(line); else h1Buf.push(line);
    }
    flushH1();
  }

  const planetary = reportPath(slug, name, outDir, "planetary");
  if (planetary) {
    const lines = readFileSync(planetary, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^##\s+(P|D)-(.+?)\s+\|\s+\d+\.\d+:/);
      if (!m) continue;
      const side = m[1] === "P" ? "personality" : "design";
      out.gates[`${side}|${m[2].trim()}`] = cleanProse(sectionParas(lines, i + 1));
    }
    // the cross also has its own chapter here, with the profile-on-cross piece
    // the Foundation report does not always carry
    const crossParts: string[] = [];
    let inCross = false;
    for (const raw of lines) {
      const h1 = raw.match(/^#\s+(.+?)\s*$/);
      if (h1) { inCross = /\bcross\b/i.test(h1[1]); continue; }
      if (!inCross) continue;
      const sub = raw.match(/^#{2,3}\s+(.+?)\s*$/);
      if (sub) { crossParts.push("\u00a7" + sub[1].trim()); continue; }
      const t = raw.replace(/^\s*>\s*/, "").replace(/\*\*/g, "").trim();
      if (t && !/^-{3,}$/.test(t)) crossParts.push(t.replace(/^TLDR:?\s*/i, ""));
    }
    if (crossParts.length) {
      out.props.cross = [out.props.cross, crossParts.join("\n\n")].filter(Boolean).join("\n\n");
    }
  }

  // the life cycles, from the report's own timeline chapter
  if (foundation) {
    const lines = readFileSync(foundation, "utf8").split("\n");
    let inTimeline = false;
    for (let i = 0; i < lines.length; i++) {
      const h1 = lines[i].match(/^#\s+(.+?)\s*$/);
      if (h1) { inTimeline = /timeline|cycles?/i.test(h1[1]); continue; }
      if (!inTimeline) continue;
      const m = lines[i].match(/^##\s+(.+?):\s*(.+?)\s*\|\s*(.+?)\s*$/);
      if (m) {
        out.cycles.push({
          label: m[1].trim(), date: m[2].trim(), status: m[3].trim(),
          text: cleanProse(sectionParas(lines, i + 1)),
        });
      }
    }
  }

  // the profile popup opens at the lines themselves; the how-a-profile-works
  // preamble is not what Kaycee needs in front of a client
  if (out.props.profile) {
    const paras = out.props.profile.split("\n\n");
    const first = paras.findIndex((t) => t.startsWith("\u00a7") && /\bline\b/i.test(t));
    if (first > 0) out.props.profile = paras.slice(first).join("\n\n");
  }
  return out;
}

// ── Kaycee's library ────────────────────────────────────────────────────────
interface Chunk {
  source_kind?: string;
  title?: string;
  body?: string;
  metadata?: Record<string, string>;
}
function loadChunks(path = ".cache/chunks.json"): Chunk[] {
  if (!existsSync(path)) throw new Error(`${path} not found — run the Notion sync first.`);
  const d = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(d) ? d : (d.chunks ?? []);
}

function centerFunctions(chunks: Chunk[]): Record<Center, string[]> {
  const byTitle = new Map<string, Chunk>();
  for (const c of chunks) if (c.source_kind === "center") byTitle.set((c.title ?? "").trim(), c);
  const out = {} as Record<Center, string[]>;
  for (const [center, title] of Object.entries(CENTER_LIB_TITLE) as [Center, string][]) {
    const row = byTitle.get(title);
    const type = row?.metadata?.Type;
    if (!type) throw new Error(`HD Centers: no Type for "${title}" — cannot label its function.`);
    const parts = type.split(",").map((t) => t.trim()).filter(Boolean);
    for (const p of parts) if (!FUNCTIONS[p]) throw new Error(`Unknown center function "${p}" on ${title}.`);
    out[center] = parts;
  }
  return out;
}

/** Defined, undefined and open are three different things in Human Design, not
 *  two: undefined means the centre carries an activated gate but no completed
 *  channel, open means it carries nothing at all. Kaycee writes all three. */
interface CenterStates { theme: string; defined: string; undefined: string; open: string }

interface GateMeta { name: string; keynote: string; func: string; circuit: string; quarter: string }
/** Per-gate detail from her HD Gates database, for the gate popups. */
function gateMeta(chunks: Chunk[]): Record<number, GateMeta> {
  const out: Record<number, GateMeta> = {};
  for (const c of chunks) {
    if (c.source_kind !== "gate") continue;
    const m = c.metadata ?? {};
    const n = Number(m["Gate #"] ?? (c.title ?? "").match(/\d+/)?.[0]);
    if (!n) continue;
    out[n] = {
      name: (m["Gate Name"] ?? c.title ?? "").replace(/^\d+:\s*/, "").trim(),
      keynote: (m.Keynote ?? "").trim(),
      func: (m["Function - DBHD - The 9 Centers"] ?? "").split("\n")[0].trim(),
      circuit: (m["Human Design Circuits"] ?? "").trim(),
      quarter: (m.Quarter ?? m["HD Quarters"] ?? "").replace(/^\d+:\s*/, "").trim(),
    };
  }
  return out;
}

/** The three states of a centre in Kaycee's own words. Her HD Centers database
 *  carries both her fields and the Definitive Book's: the DBHD ones open with an
 *  all-caps banner and a population percentage and are written about a reader in
 *  the third person, hers are written to the person holding the chart. The chart
 *  is a client-facing document, so it uses hers. */
/** The opening n sentences of a passage, for somewhere too small to hold it all. */
function firstSentences(text: string, n: number): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  const m = clean.match(new RegExp(`^(?:[^.!?]+[.!?]+){1,${n}}`));
  return (m ? m[0] : clean).trim();
}

function centerStates(chunks: Chunk[]): Record<Center, CenterStates> {
  const byTitle = new Map<string, Chunk>();
  for (const c of chunks) if (c.source_kind === "center") byTitle.set((c.title ?? "").trim(), c);
  const out = {} as Record<Center, CenterStates>;
  for (const [center, title] of Object.entries(CENTER_LIB_TITLE) as [Center, string][]) {
    const m = byTitle.get(title)?.metadata ?? {};
    const field = (key: string) => {
      const t = (m[key] ?? "").trim();
      if (!t) throw new Error(`HD Centers: "${title}" has no ${key}. The chart has nothing to say about that state.`);
      return t;
    };
    out[center] = {
      theme: (m["Not Self Themes"] ?? "").trim(),
      defined: field("Delphi Defined Basic"),
      undefined: field("Delphi Undefined Basic"),
      open: field("Delphi Open Basic"),
    };
  }
  return out;
}

/** The tropical sign a placement falls in. The Rave wheel is fixed against the
 *  ecliptic, so a gate and line already name a longitude, and the sign is that
 *  longitude in thirty degree slices from 0 Aries. Checked against the Black
 *  Book anchor: gate 41 line 1 sits at 2 Aquarius. */
const ZODIAC = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"] as const;
const ZODIAC_GLYPH: Record<string, string> = {
  Aries: "\u2648", Taurus: "\u2649", Gemini: "\u264A", Cancer: "\u264B",
  Leo: "\u264C", Virgo: "\u264D", Libra: "\u264E", Scorpio: "\u264F",
  Sagittarius: "\u2650", Capricorn: "\u2651", Aquarius: "\u2652", Pisces: "\u2653",
};
function signOf(gate: number, line: number, color = 1, tone = 1, base = 1) {
  const lon = longitudeOf(gate, line, color, tone, base);
  const norm = ((lon % 360) + 360) % 360;
  return { sign: ZODIAC[Math.floor(norm / 30)], degree: norm % 30, longitude: norm };
}

/** Sign is decided by where the planet actually is, not by which gate it is in.
 *  A gate spans 5.625 degrees so twelve gates cross a sign boundary, but at line
 *  level only twelve of the 384 gate-lines do, and the full fixing settles even
 *  those. Splitting a whole transitional gate in half was tried and was wrong in
 *  every case: the boundary falls at 0.98, 0.31 or 0.64 of the way through, never
 *  the middle, so Saturn at 50.2 came out half Scorpio when it is plainly Libra.
 *
 *  ON_BOUNDARY_LINES is kept only to note which placements sit on a boundary at
 *  all, since Kaycee reads that off the mandala. */
const SIGN_AT = (lon: number) => ZODIAC[Math.floor(((((lon % 360) + 360) % 360)) / 30)];
const SIGNS_BY_GATE: Record<number, string[]> = Object.fromEntries(
  GATE_RANGES.map((r) => {
    const first = SIGN_AT(r.start);
    const last = SIGN_AT(r.start + GATE_ARC_DEGREES - 1e-6);
    return [r.gate, first === last ? [first] : [first, last]];
  }),
);
/** The gate.line pairs whose 0.9375 degrees cross a boundary: twelve of 384. */
function lineOnBoundary(gate: number, line: number): string[] | null {
  const r = GATE_RANGES.find((x) => x.gate === gate);
  if (!r) return null;
  const a = r.start + (line - 1) * LINE_ARC_DEGREES;
  const b = a + LINE_ARC_DEGREES - 1e-9;
  return SIGN_AT(a) === SIGN_AT(b) ? null : [SIGN_AT(a), SIGN_AT(b)];
}

/** One or two sentences for the pills in a card: circuits and channel types from
 *  her library, the defined / open states from HD Centers, quarters too once the
 *  HD Quarters database is synced (it is not yet, so those simply have none). */
function tagInfo(chunks: Chunk[]): Record<string, string> {
  const out: Record<string, string> = {};
  const twoSentences = (t: string) => {
    const clean = t.replace(/\s+/g, " ").trim();
    const m = clean.match(/^(?:[^.!?]+[.!?]+){1,2}/);
    return (m ? m[0] : clean.slice(0, 220)).trim();
  };
  const put = (key: string, text: string) => {
    const t = twoSentences(text ?? "");
    if (key && t) out[key.trim().toLowerCase()] = t;
  };
  for (const c of chunks) {
    const m = c.metadata ?? {};
    const name = (m.Name ?? c.title ?? "").trim();
    if (c.source_kind === "circuit") put(name, m.Description ?? "");
    if (c.source_kind === "channel_type") put(name, m.Description ?? "");
    if (c.source_kind === "quarter") put(`quarter of ${name.replace(/^\d+:\s*/, "")}`, m.Description ?? c.body ?? "");
  }
  // Stopgap: the HD Quarters database is ticked for sync but does not reach the
  // library yet (its table sits a page deeper than the sync looks). These are
  // Kaycee's own Theme and Quarter Description, read straight off that database
  // on 2026-08-24, so the pills read correctly meanwhile. The loop above wins
  // the moment quarters do come through the sync.
  const QUARTERS_STOPGAP: Record<string, string> = {
    "quarter of initiation":
      "Purpose fulfilled through Mind. In the First Quarter the witness returns to earth, bringing renewal to the evolution of consciousness on the mental plane: thinking, educating, conceptualizing, explaining and sharing what it means to be alive in a Form.",
    "quarter of civilization":
      "Purpose fulfilled through Form. The Second Quarter concretizes the mind's initiated concepts into form, building the structures, communities and civilizations that support the body so everyone can develop and thrive.",
    "quarter of duality":
      "Purpose fulfilled through Bonding. The Third Quarter is the most intimately human of the four, where we cross the barrier of our separateness and address our need for the other, and the two become one.",
    "quarter of mutation":
      "Purpose fulfilled through Transformation. In the Fourth Quarter an authentic life is brought to completion and assessed for meaning; what survives is carried forward as truths for the next generation.",
  };
  for (const [k, v] of Object.entries(QUARTERS_STOPGAP)) if (!out[k]) out[k] = v;

  // No generic tooltip for the Defined / Undefined / Open pills. It used to be
  // the Definitive Book's text taken off whichever centre the library happened
  // to list first, which meant the Throat's "Defined" pill explained the Root.
  // Each centre's card now carries Kaycee's own text for the state it is in.
  return out;
}

function centerBiology(chunks: Chunk[]): Record<Center, string> {
  const byTitle = new Map<string, Chunk>();
  for (const c of chunks) if (c.source_kind === "center") byTitle.set((c.title ?? "").trim(), c);
  const out = {} as Record<Center, string>;
  for (const [center, title] of Object.entries(CENTER_LIB_TITLE) as [Center, string][]) {
    out[center] = (byTitle.get(title)?.metadata?.Biology ?? "").trim();
  }
  return out;
}

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** channel -> { circuit id, her channel name, her keynote }, from HD Channels,
 *  back-filled from the HD Circuits database where a row leaves Circuit blank. */
interface ChannelMeta { circuit: CircuitId; name: string; keynote: string; type: string }
function channelCircuits(chunks: Chunk[]): Map<string, ChannelMeta> {
  const byName = new Map<string, CircuitId>();
  for (const c of CIRCUITS) byName.set(c.name.toLowerCase(), c.id);
  const resolve = (raw: string | undefined): CircuitId | null => {
    const id = byName.get((raw ?? "").trim().toLowerCase());
    return id ?? null;
  };

  // reverse direction: each circuit page lists its channels
  const fromCircuitDb = new Map<string, CircuitId>();
  for (const c of chunks) {
    if (c.source_kind !== "circuit") continue;
    const id = resolve(c.metadata?.Name ?? c.title);
    if (!id) continue;
    for (const m of (c.metadata?.["Human Design Channels"] ?? "").matchAll(/(\d{1,2})\s*-\s*(\d{1,2})/g)) {
      fromCircuitDb.set(pairKey(+m[1], +m[2]), id);
    }
  }

  const out = new Map<string, ChannelMeta>();
  for (const c of chunks) {
    if (c.source_kind !== "channel") continue;
    const name = (c.metadata?.Name ?? c.title ?? "").trim();
    const m = name.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
    if (!m) continue;
    const key = pairKey(+m[1], +m[2]);
    const circuit = resolve(c.metadata?.Circuit) ?? fromCircuitDb.get(key) ?? null;
    if (!circuit) throw new Error(`No circuit for channel ${key} ("${name}") in the library.`);
    out.set(key, {
      circuit, name,
      keynote: (c.metadata?.Keynote ?? "").trim(),
      type: (c.metadata?.["Channel Type"] ?? c.metadata?.Type ?? "").trim(),
    });
  }
  for (const ch of CHANNELS) {
    const key = pairKey(ch.gates[0], ch.gates[1]);
    if (!out.has(key)) {
      const circuit = fromCircuitDb.get(key);
      if (!circuit) throw new Error(`Channel ${key} is missing from the synced HD Channels database.`);
      out.set(key, { circuit, name: `${key}: The Channel of ${ch.name}`, keynote: "", type: "" });
    }
  }
  return out;
}

// ── channel geometry, pulled straight out of the branded SVG ────────────────
interface HalfGeom {
  gate: number;
  el: El;
  box: BBox;
  /** unit vector pointing the way the light travels through this half */
  ux: number; uy: number;
  /** how far the light travels along that axis */
  len: number;
  /** rotation (degrees) of the axis, for the sweeping band */
  deg: number;
  /** midpoint of the half, the band's pivot */
  mx: number; my: number;
  /** a few legs in the integration cluster are drawn once but belong to two
   *  channels; those share the tube as parallel stripes */
  stripe: number; stripes: number;
}
interface ChannelGeom {
  key: string;
  gates: [number, number];
  circuit: CircuitId;
  name: string;
  keynote: string;
  type: string;
  source: Center;
  target: Center;
  srcGate: number;
  tgtGate: number;
  slot: number;          // cascade position (0 = furthest from the Throat)
  halves: HalfGeom[];    // [source half, target half]; a few are one piece
  arrow: { x: number; y: number; ux: number; uy: number };
}

/** Every point a shape is built from. */
function shapePoints(el: El): [number, number][] {
  const at = (n: string) => el.attrs.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1] ?? "";
  if (el.tag === "rect") {
    const x = +at("x"), y = +at("y"), w = +at("width"), h = +at("height");
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  }
  if (el.tag === "polygon" || el.tag === "polyline") {
    const n = (at("points").match(/-?\d*\.?\d+/g) ?? []).map(Number);
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
    return pts;
  }
  return pathPoints(at("d"));
}

/** A channel leg is a long thin shape, so its principal axis is the direction
 *  energy travels through it. Straight legs and the diagonal ones in the
 *  integration cluster both come out right, which bounding boxes alone did not.
 *  `toward` only fixes the sign: which end is upstream. */
function halfGeom(gate: number, el: El, box: BBox, toward: [number, number]): HalfGeom {
  const pts = shapePoints(el);
  const n = pts.length || 1;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [px, py] of pts) {
    sxx += (px - mx) ** 2; syy += (py - my) ** 2; sxy += (px - mx) * (py - my);
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ux = Math.cos(theta), uy = Math.sin(theta);
  if (ux * toward[0] + uy * toward[1] < 0) { ux = -ux; uy = -uy; }

  const proj = pts.map(([px, py]) => (px - mx) * ux + (py - my) * uy);
  const len = pts.length ? Math.max(...proj) - Math.min(...proj) : 0;
  return {
    gate, el, box, ux, uy, len,
    deg: (Math.atan2(uy, ux) * 180) / Math.PI,
    mx, my, stripe: 0, stripes: 1,
  };
}

/** Every <g> in the branded SVG that could hold a leg for a given channel, most
 *  specific first. Most channels have their own two-gate group; the integration
 *  cluster shares a four-gate group for the pieces it does not draw separately. */
function channelGroupFinder(svg: string): (a: number, b: number) => string[] {
  const groups: { id: string; nums: number[] }[] = [];
  for (const m of svg.matchAll(/<g id="(_[\d][\d\-]*(?:-G)?)"/g)) {
    groups.push({ id: m[1], nums: (m[1].match(/\d+/g) ?? []).map(Number) });
  }
  return (a, b) =>
    groups
      .filter((g) => g.nums.includes(a) && g.nums.includes(b))
      .sort((x, y) => x.nums.length - y.nums.length)
      .map((g) => g.id);
}

/** The leg shape gate N owns for this channel. The design draws a separate
 *  variant per active-channel combination, so take the most specific group that
 *  has one; the integration cluster falls through to the four-gate group. */
function legFor(svg: string, groupIds: string[], gate: number): El | null {
  for (const gid of groupIds) {
    const body = groupBody(svg, gid);
    if (!body) continue;
    const els = elementsIn(body, "personality-");
    const exact = els.get(`personality-${gate}`);
    if (exact) return exact;
    for (const [id, el] of els) if (new RegExp(`^personality-${gate}(-|$)`).test(id)) return el;
  }
  return null;
}

/** Direction of flow and the cascade schedule, from the channel graph. */
function flowModel(circuits: Map<string, ChannelMeta>, centerY: Record<Center, number>) {
  const edges = CHANNELS.map((c) => ({
    key: pairKey(c.gates[0], c.gates[1]),
    gates: c.gates as [number, number],
    ca: centerOf(c.gates[0]),
    cb: centerOf(c.gates[1]),
  }));

  // hops from each center to the Throat across the whole 36-channel graph
  const adj = new Map<Center, Center[]>();
  for (const e of edges) {
    (adj.get(e.ca) ?? adj.set(e.ca, []).get(e.ca)!).push(e.cb);
    (adj.get(e.cb) ?? adj.set(e.cb, []).get(e.cb)!).push(e.ca);
  }
  const dist = new Map<Center, number>([["throat", 0]]);
  let frontier: Center[] = ["throat"];
  while (frontier.length) {
    const next: Center[] = [];
    for (const c of frontier) {
      for (const n of adj.get(c) ?? []) {
        if (!dist.has(n)) { dist.set(n, dist.get(c)! + 1); next.push(n); }
      }
    }
    frontier = next;
  }

  // direction: toward the Throat; ties go from the lower center to the higher
  const dir = new Map<string, { source: Center; target: Center; srcGate: number; tgtGate: number }>();
  for (const e of edges) {
    const [ga, gb] = e.gates;
    let srcGate: number;
    const forced = FLOW_OVERRIDE[e.key];
    if (forced === ga || forced === gb) srcGate = forced;
    else {
      const da = dist.get(e.ca)!, db = dist.get(e.cb)!;
      if (da !== db) srcGate = da > db ? ga : gb;
      else srcGate = centerY[e.ca] > centerY[e.cb] ? ga : gb;
    }
    const tgtGate = srcGate === ga ? gb : ga;
    dir.set(e.key, { source: centerOf(srcGate), target: centerOf(tgtGate), srcGate, tgtGate });
  }

  // longest run of hops from a center down to the Throat, following the arrows
  const outFrom = new Map<Center, Center[]>();
  for (const e of edges) {
    const d = dir.get(e.key)!;
    (outFrom.get(d.source) ?? outFrom.set(d.source, []).get(d.source)!).push(d.target);
  }
  const depthMemo = new Map<Center, number>();
  const depth = (c: Center): number => {
    if (c === "throat") return 0;
    const hit = depthMemo.get(c);
    if (hit !== undefined) return hit;
    depthMemo.set(c, 0); // guard against any unexpected cycle
    const d = Math.max(0, ...(outFrom.get(c) ?? []).map((n) => 1 + depth(n)));
    depthMemo.set(c, d);
    return d;
  };
  const maxDepth = Math.max(...(Object.keys(CENTER_SVG_ID) as Center[]).map(depth));

  return { dir, slotOf: (source: Center) => (maxDepth - depth(source)) * 2, slots: maxDepth * 2 + 2 };
}

function buildChannels(
  svg: string,
  circuits: Map<string, ChannelMeta>,
  centerBox: Record<Center, BBox>,
): { channels: ChannelGeom[]; slots: number } {
  const groupFor = channelGroupFinder(svg);
  const centerY = Object.fromEntries(
    (Object.keys(centerBox) as Center[]).map((c) => [c, cy(centerBox[c])]),
  ) as Record<Center, number>;
  const { dir, slotOf, slots } = flowModel(circuits, centerY);

  const channels: ChannelGeom[] = [];
  for (const ch of CHANNELS) {
    const key = pairKey(ch.gates[0], ch.gates[1]);
    const gids = groupFor(ch.gates[0], ch.gates[1]);
    if (!gids.length) throw new Error(`branded SVG has no group for channel ${key}`);
    const d = dir.get(key)!;
    const meta = circuits.get(key)!;

    const found = [d.srcGate, d.tgtGate]
      .map((g) => ({ gate: g, el: legFor(svg, gids, g) }))
      .filter((l): l is { gate: number; el: El } => l.el !== null)
      .map((l) => ({ ...l, box: bboxOfEl(l.el) }));
    if (!found.length) throw new Error(`no leg shapes at all for channel ${key}`);

    // sign each leg off the centers it joins: the upstream leg leads away from
    // its own center, the downstream leg points into the one it feeds
    const src = [cx(centerBox[d.source]), cy(centerBox[d.source])] as [number, number];
    const tgt = [cx(centerBox[d.target]), cy(centerBox[d.target])] as [number, number];
    const halves: HalfGeom[] = found.length === 2
      ? found.map((leg, i) => halfGeom(leg.gate, leg.el, leg.box,
          i === 0
            ? [cx(leg.box) - src[0], cy(leg.box) - src[1]]
            : [tgt[0] - cx(leg.box), tgt[1] - cy(leg.box)]))
      : [halfGeom(found[0].gate, found[0].el, found[0].box, [tgt[0] - src[0], tgt[1] - src[1]])];

    // the arrowhead rides the middle of the channel: for a two-leg channel that
    // is where the legs meet, upstream end of the downstream leg
    const t = halves[halves.length - 1];
    const back = halves.length === 2 ? t.len * 0.5 : 0;
    const ax = t.mx - t.ux * back, ay = t.my - t.uy * back;
    channels.push({
      key, gates: ch.gates as [number, number], circuit: meta.circuit, name: meta.name,
      keynote: meta.keynote, type: meta.type,
      source: d.source, target: d.target, srcGate: d.srcGate, tgtGate: d.tgtGate,
      slot: slotOf(d.source), halves: halves as HalfGeom[], arrow: { x: ax, y: ay, ux: t.ux, uy: t.uy },
    });
  }
  // a leg drawn once but shared by two channels (gate 20 in the integration
  // cluster) becomes parallel stripes so both circuits stay readable
  const usage = new Map<string, HalfGeom[]>();
  for (const ch of channels) {
    for (const h of ch.halves) {
      const k = shapeKey(h.el);
      (usage.get(k) ?? usage.set(k, []).get(k)!).push(h);
    }
  }
  for (const [, list] of usage) {
    if (list.length < 2) continue;
    list.forEach((h, i) => { h.stripe = i; h.stripes = list.length; });
  }
  // arrows sit on their own stripe
  for (const ch of channels) {
    const t = ch.halves[ch.halves.length - 1];
    const off = ((t.stripe + 0.5) / t.stripes - 0.5) * TUBE;
    ch.arrow = { x: ch.arrow.x - t.uy * off, y: ch.arrow.y + t.ux * off, ux: t.ux, uy: t.uy };
  }

  // sanity: every arrow must point at the center it feeds, or the geometry
  // guesswork above has drifted and the picture would teach the wrong thing
  for (const ch of channels) {
    const tb = centerBox[ch.target];
    const dot = ch.arrow.ux * (cx(tb) - ch.arrow.x) + ch.arrow.uy * (cy(tb) - ch.arrow.y);
    if (dot <= 0) {
      throw new Error(
        `arrow on ${ch.name} points away from the ${ch.target} center (dot ${dot.toFixed(1)})`,
      );
    }
  }

  return { channels, slots };
}

/** Identity of a shape, so two channels reusing one leg can be detected. */
function shapeKey(el: El): string {
  return el.tag + "|" + (el.attrs.match(/\b(?:d|points|x)="([^"]*)"/)?.[1] ?? el.attrs);
}

// ── brand marks ─────────────────────────────────────────────────────────────
const BRAND_DIR = join(process.env.HOME ?? "", "Desktop", "Delphi Brand Assets", "brand");

/** An SVG from the brand folder as a data URI, or "" if it is not there. */
function brandMark(file: string): string {
  const path = join(BRAND_DIR, file);
  if (!existsSync(path)) {
    console.warn(`  (brand mark missing: ${file})`);
    return "";
  }
  return `data:image/svg+xml;base64,${readFileSync(path).toString("base64")}`;
}

// The Delphi D as the browser tab icon. The brand file is a 750x750 canvas with
// the letter sitting off-centre on a white background that overruns the canvas,
// which at 16px would render as a speck in a white field. So: lift the glyph out
// and re-mount it on a square cropped to the letter, with a white rounded plate
// behind it so it stays legible on a dark tab strip as well as a light one. The
// crop is measured from this specific file; if the logo is ever redrawn, the
// icon needs re-measuring, and the fallback below keeps it merely ugly, never
// broken.
const FAVICON_BOX = "112 95 556 556";

function favicon(): string {
  const path = join(BRAND_DIR, "Delphi Small Logo.svg");
  if (!existsSync(path)) {
    console.warn("  (brand mark missing: Delphi Small Logo.svg)");
    return "";
  }
  const src = readFileSync(path, "utf8");
  const glyph = /<path[^>]*\sd="([^"]+)"/.exec(src)?.[1];
  const svg = glyph
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${FAVICON_BOX}">` +
      `<rect x="112" y="95" width="556" height="556" rx="98" fill="#ffffff"/>` +
      `<g transform="translate(140,0)"><g transform="translate(4.588807,587.006321)">` +
      `<path fill="#845095" d="${glyph}"/></g></g></svg>`
    : src;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// ── brand font (Montserrat), cached locally so reruns are offline ───────────
const FONT_DIR = ".cache/fonts";
const FONT_WEIGHTS = [400, 600];

async function montserrat(): Promise<Map<number, Buffer>> {
  const out = new Map<number, Buffer>();
  mkdirSync(FONT_DIR, { recursive: true });
  const missing = FONT_WEIGHTS.filter((w) => !existsSync(join(FONT_DIR, `Montserrat-${w}.ttf`)));
  if (missing.length) {
    try {
      const css = await (await fetch(
        `https://fonts.googleapis.com/css2?family=Montserrat:wght@${FONT_WEIGHTS.join(";")}`,
        { headers: { "User-Agent": "Mozilla/4.0" } },   // old UA => .ttf instead of .woff2
      )).text();
      const blocks = css.split("@font-face");
      for (const w of FONT_WEIGHTS) {
        const block = blocks.find((b) => b.includes(`font-weight: ${w}`));
        const url = block?.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
        if (!url) continue;
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        writeFileSync(join(FONT_DIR, `Montserrat-${w}.ttf`), buf);
      }
    } catch {
      console.warn("  (could not fetch Montserrat; falling back to system fonts)");
    }
  }
  for (const w of FONT_WEIGHTS) {
    const p = join(FONT_DIR, `Montserrat-${w}.ttf`);
    if (existsSync(p)) out.set(w, readFileSync(p));
  }
  return out;
}

// ── canvas ──────────────────────────────────────────────────────────────────
const FONT_STACK = "Montserrat, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r2 = (n: number) => Math.round(n * 100) / 100;

interface SceneData {
  /** natal astrology, present only on a client chart */
  astro?: AstroChart;
  client?: ClientCtx;                       // set when rendering a real chart
  inner: Record<string, string>;            // skin id -> neutralized bodygraph markup
  plain?: string;                           // the chart as the design draws it
  transit?: string;                         // the same chart with today's sky over it
  sky?: { date: string; time: string; positions: { planet: string; gate: number; line: number; fixingState: string }[] };
  read?: DayRead;
  channels: ChannelGeom[];
  slots: number;
  centerBox: Record<Center, BBox>;
  fn: Record<Center, string[]>;
  biology: Record<Center, string>;
  tagInfo: Record<string, string>;
  gateInfo: Record<number, GateMeta>;
  states: Record<Center, CenterStates>;
  lineName: (g: number, l: number) => string;
  anchors: Record<number, { x: number; y: number }>;
}

interface LabelSpot { x: number; y: number; side: "L" | "R"; ax: number; ay: number }

function placeLabels(centerBox: Record<Center, BBox>, maxY: number): Record<Center, LabelSpot> {
  const out = {} as Record<Center, LabelSpot>;
  for (const side of ["L", "R"] as const) {
    const list = (Object.keys(CENTER_SVG_ID) as Center[])
      .filter((c) => LABEL_SIDE[c] === side)
      .sort((a, b) => cy(centerBox[a]) - cy(centerBox[b]));
    let last = -Infinity;
    for (const c of list) {
      const y = Math.min(Math.max(toCanvasY(cy(centerBox[c])), last + 84), maxY);
      last = y;
      out[c] = {
        x: side === "L" ? OX + LY.tx - 48 : OX + LY.tx + BG_W * LY.sc + 48,
        y,
        side,
        ax: side === "L" ? toCanvasX(centerBox[c].x1) : toCanvasX(centerBox[c].x2),
        ay: toCanvasY(cy(centerBox[c])),
      };
    }
  }
  return out;
}

function labelCard(center: Center, spot: LabelSpot, fns: string[], skin: Skin, isOpen: boolean): string {
  const anchor = spot.side === "L" ? "end" : "start";
  const dir = spot.side === "L" ? -1 : 1;
  const name = CENTER_DISPLAY[center].toUpperCase();
  // function chips, laid out away from the bodygraph
  let cxp = 0;
  const order = spot.side === "L" ? [...fns].reverse() : fns;
  const chips = order.map((f) => {
    const w = 15 + f.length * 7.2;
    const x = spot.side === "L" ? -(cxp + w) : cxp;
    cxp += w + 7;
    // filled chip = this center is defined; outlined chip = open in this chart
    const box = isOpen
      ? `fill="none" stroke="${FUNCTIONS[f]}" stroke-width="1" stroke-opacity=".8"`
      : `fill="${FUNCTIONS[f]}" fill-opacity="${skin.id === "night" ? 0.85 : 0.55}"`;
    return (
      `<g class="chip"><rect x="${r2(x)}" y="6" rx="8" height="17" width="${r2(w)}" ${box}></rect>` +
      `<text x="${r2(x + w / 2)}" y="18.5" text-anchor="middle" font-size="10" ` +
      `letter-spacing=".06em" font-weight="600" ` +
      `fill="${isOpen ? skin.muted : "#231f33"}">${esc(f.toUpperCase())}</text></g>`
    );
  }).join("");

  const elbow = spot.x + dir * 14;
  const leader =
    `<path class="leader" d="M ${r2(spot.x + dir * 6)},${r2(spot.y)} L ${r2(elbow)},${r2(spot.y)} ` +
    `L ${r2(spot.ax - dir * 6)},${r2(spot.ay)}" fill="none" stroke="${skin.border}" ` +
    `stroke-width="1" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 3"></path>` +
    `<circle cx="${r2(spot.ax - dir * 6)}" cy="${r2(spot.ay)}" r="2.2" fill="${skin.border}"></circle>`;

  return (
    `${leader}<g class="clabel" data-center="${center}" transform="translate(${r2(spot.x)},${r2(spot.y)})">` +
    `<text x="0" y="-4" text-anchor="${anchor}" font-size="15.5" font-weight="600" ` +
    `letter-spacing=".1em" fill="${skin.ink}">${esc(name)}</text>${chips}</g>`
  );
}

function legendBlock(x: number, y: number, skin: Skin, stack = false): string {
  const head = (t: string, lx: number, ly: number) =>
    `<text x="${lx}" y="${ly}" font-size="10" font-weight="600" letter-spacing=".18em" ` +
    `fill="${skin.muted}">${esc(t)}</text>`;
  let s = head("CENTER FUNCTION", x, y);
  let cxp = x;
  for (const f of FUNCTION_ORDER) {
    const w = 15 + f.length * 7.2;
    s += `<rect x="${r2(cxp)}" y="${y + 10}" rx="8" width="${r2(w)}" height="17" fill="${FUNCTIONS[f]}" ` +
      `fill-opacity="${skin.id === "night" ? 0.85 : 0.55}"></rect>` +
      `<text x="${r2(cxp + w / 2)}" y="${y + 22.5}" text-anchor="middle" font-size="10" ` +
      `font-weight="600" letter-spacing=".06em" fill="#231f33">${esc(f.toUpperCase())}</text>`;
    cxp += w + 8;
  }
  const x2 = stack ? x : x + 560;
  const y2 = stack ? y + 48 : y;
  s += head("CIRCUITRY", x2, y2);
  CIRCUITS.forEach((c, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const lx = x2 + col * 250, ly = y2 + 14 + row * 19;
    s += `<rect x="${lx}" y="${ly - 8}" width="22" height="4" rx="2" fill="${c.color}"></rect>` +
      `<text x="${lx + 30}" y="${ly - 2}" font-size="11" fill="${skin.ink}">${esc(c.name)}</text>`;
  });
  return s;
}

/** The Herschel Uranus symbol, drawn rather than typed: that codepoint is not
 *  in the fonts resvg can reach, so it rasterizes as tofu. Same drawing as the
 *  standalone placement images. */
function uranusGlyph(x: number, y: number, color: string, scale = 1): string {
  const c = x + 5 * scale;
  return `<g stroke="${color}" stroke-width="1.4" fill="none" stroke-linecap="round">` +
    `<line x1="${c - 4.4}" y1="${y - 10.5}" x2="${c - 4.4}" y2="${y - 2.2}"></line>` +
    `<line x1="${c + 4.4}" y1="${y - 10.5}" x2="${c + 4.4}" y2="${y - 2.2}"></line>` +
    `<line x1="${c - 4.4}" y1="${y - 6.4}" x2="${c + 4.4}" y2="${y - 6.4}"></line>` +
    `<line x1="${c}" y1="${y - 6.4}" x2="${c}" y2="${y - 0.8}"></line>` +
    `<circle cx="${c}" cy="${y + 1}" r="1.7" fill="${color}" stroke="none"></circle></g>`;
}

/** Placement column, pared to glyph and gate.line. The planet name and gate
 *  name live in the hover tip and the click card instead. Design red on the
 *  left, Personality on the right, same order as her placement images. */
function placementTable(
  side: "Personality" | "Design", client: ClientCtx, skin: Skin, x: number, y: number,
): string {
  const isDesign = side === "Design";
  const key = isDesign ? "design" : "personality";
  const accent = isDesign ? DESIGN_RED : skin.ink;
  const headCol = isDesign ? DESIGN_RED : "#845095";
  const zebra = skin.id === "night" ? "rgba(255,255,255,.045)" : "#f6f2f7";
  const subs = isDesign ? client.subtitle.design : client.subtitle.personality;

  const glyphX = 14, gateX = 52, rowH = 30;
  const byPlanet = new Map(client.acts.filter((a) => a.side === key).map((a) => [a.planet, a]));

  let s = `<g class="ptable" data-side="${key}" transform="translate(${x},${y})">`;
  s += `<text x="${TABLE_W / 2}" y="0" text-anchor="middle" font-size="13" font-weight="600" ` +
    `letter-spacing=".16em" fill="${accent}">${side.toUpperCase()}</text>`;
  subs.forEach((line, i) => {
    s += `<text x="${TABLE_W / 2}" y="${17 + i * 13}" text-anchor="middle" font-size="8.5" ` +
      `fill="${skin.muted}">${esc(line)}</text>`;
  });
  const headY = 24 + subs.length * 13;
  s += `<line x1="6" y1="${headY}" x2="${TABLE_W - 6}" y2="${headY}" stroke="${headCol}" stroke-width="1.2"></line>`;

  PLANET_ROWS.forEach((planet, i) => {
    const a = byPlanet.get(planet);
    if (!a) return;
    const ry = headY + 28 + i * rowH;
    s += `<g class="prow" data-planet="${planetId(planet)}" data-side="${key}" ` +
      `data-gate="${a.gate}" data-line="${a.line}">`;
    s += `<rect x="2" y="${ry - 19}" width="${TABLE_W - 4}" height="${rowH}" rx="7" ` +
      `fill="${i % 2 === 1 ? zebra : "transparent"}"></rect>`;
    s += planet === "Uranus"
      ? uranusGlyph(glyphX, ry, accent, 1.15)
      : `<text x="${glyphX}" y="${ry}" font-size="17" fill="${accent}">${esc(PLANET_GLYPHS[planet])}</text>`;
    s += `<text x="${gateX}" y="${ry}" font-size="15" font-weight="600" fill="${accent}">${a.gate}.${a.line}</text>`;
    if (a.fix) {
      s += `<text x="${gateX + 36}" y="${ry}" font-size="12" fill="${accent}">${a.fix}</text>`;
    }
    s += `</g>`;
  });
  return s + `</g>`;
}

/** The transit view's own columns, as Kaycee laid them out: the client's two
 *  sides folded into one on the left with the planet glyph between the two
 *  numbers, and the sky on the right with its glyph on the outside. One row per
 *  planet, so the eye can run straight across from their placement to today's. */
function mergedClientTable(client: ClientCtx, skin: Skin, x: number, y: number): string {
  const zebra = skin.id === "night" ? "rgba(255,255,255,.045)" : "#f6f2f7";
  const rowH = 30, W = TABLE_W + 18;
  const byP = new Map(client.acts.filter((a) => a.side === "personality").map((a) => [a.planet, a]));
  const byD = new Map(client.acts.filter((a) => a.side === "design").map((a) => [a.planet, a]));
  let s = `<g class="ptable" data-side="merged" transform="translate(${x},${y})">`;
  s += `<text x="${W / 2}" y="0" text-anchor="middle" font-size="12" font-weight="600" ` +
    `letter-spacing=".16em" fill="${CLIENT_TINT}">${esc(client.name.toUpperCase())}</text>`;
  const headY = 18;
  s += `<line x1="6" y1="${headY}" x2="${W - 6}" y2="${headY}" stroke="${CLIENT_TINT}" stroke-width="1.6"></line>`;
  PLANET_ROWS.forEach((planet, i) => {
    const d = byD.get(planet), pp = byP.get(planet);
    if (!d && !pp) return;
    const ry = headY + 28 + i * rowH;
    s += `<g class="prow" data-planet="${planetId(planet)}" data-side="merged"` +
      `${pp ? ` data-gate="${pp.gate}" data-line="${pp.line}"` : ""}>`;
    s += `<rect x="2" y="${ry - 19}" width="${W - 4}" height="${rowH}" rx="7" ` +
      `fill="${i % 2 === 1 ? zebra : "transparent"}"></rect>`;
    if (d) s += `<text x="${W / 2 - 22}" y="${ry}" text-anchor="end" font-size="14" font-weight="600" ` +
      `fill="${DESIGN_RED}">${d.gate}.${d.line}</text>`;
    s += planet === "Uranus"
      ? uranusGlyph(W / 2 - 8, ry, skin.ink, 1.05)
      : `<text x="${W / 2}" y="${ry}" text-anchor="middle" font-size="16" fill="${skin.ink}">${esc(PLANET_GLYPHS[planet])}</text>`;
    if (pp) s += `<text x="${W / 2 + 22}" y="${ry}" font-size="14" font-weight="600" ` +
      `fill="${skin.ink}">${pp.gate}.${pp.line}</text>`;
    s += `</g>`;
  });
  return s + `</g>`;
}

/** "2026-08-26" reads as a serial number. Which day the column is showing is
 *  the one thing a client has to be able to see at a glance, so it is spelled. */
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[m - 1]} ${d}, ${y}`;
}

/** Today's sky, one row per body, glyph on the outside edge. Carries the same
 *  exaltation and detriment marks the client's own columns do. */
function transitTable(sky: NonNullable<SceneData["sky"]>, skin: Skin, x: number, y: number): string {
  const zebra = skin.id === "night" ? "rgba(255,255,255,.045)" : "#f6f2f7";
  const rowH = 30, W = TABLE_W;
  const byPlanet = new Map(sky.positions.map((p) => [p.planet, p]));
  const fixMark = (f: string) => (f === "Exalted" ? "\u25B2" : f === "Detriment" ? "\u25BC" : "");
  let s = `<g class="ptable" data-side="transit" transform="translate(${x},${y})">`;
  s += `<text x="${W / 2}" y="0" text-anchor="middle" font-size="12" font-weight="600" ` +
    `letter-spacing=".16em" fill="${TRANSIT_INK}">TRANSIT</text>`;
  s += `<text class="tdate" x="${W / 2}" y="17" text-anchor="middle" font-size="13" ` +
    `font-weight="700" fill="${TRANSIT_INK}">${esc(shortDate(sky.date))}</text>`;
  s += `<text class="ttime" x="${W / 2}" y="29" text-anchor="middle" font-size="10.5" ` +
    `font-weight="600" fill="${TRANSIT_INK}" opacity=".72">${esc(sky.time)} UTC</text>`;
  const headY = 36;
  s += `<line x1="6" y1="${headY}" x2="${W - 6}" y2="${headY}" stroke="${TRANSIT_INK}" stroke-width="1.6"></line>`;
  PLANET_ROWS.forEach((planet, i) => {
    const a = byPlanet.get(planet);
    if (!a) return;
    const ry = headY + 28 + i * rowH;
    s += `<g class="trow" data-planet="${esc(planet)}" data-gate="${a.gate}" data-line="${a.line}">`;
    s += `<rect x="2" y="${ry - 19}" width="${W - 4}" height="${rowH}" rx="7" ` +
      `fill="${i % 2 === 1 ? zebra : "transparent"}"></rect>`;
    s += `<text class="tfx" data-planet="${esc(planet)}" x="12" y="${ry}" font-size="11" ` +
      `fill="${TRANSIT_INK}">${fixMark(a.fixingState)}</text>`;
    s += `<text class="tgl" data-planet="${esc(planet)}" x="30" y="${ry}" font-size="15" ` +
      `font-weight="600" fill="${TRANSIT_INK}">${a.gate}.${a.line}</text>`;
    s += planet === "Uranus"
      ? uranusGlyph(W - 26, ry, TRANSIT_INK, 1.15)
      : `<text x="${W - 18}" y="${ry}" font-size="17" fill="${TRANSIT_INK}">${esc(PLANET_GLYPHS[planet])}</text>`;
    s += `</g>`;
  });
  return s + `</g>`;
}

/** The four PHS variable arrows around the head, same placement, size and
 *  colors as the standalone bodygraph image Kaycee already hands out
 *  (scripts/export-mandala-pngs.ts): Design red on the left, Personality black
 *  on the right, Determination above Environment, Motivation above Perspective. */
function variableArrows(d: SceneData): string {
  if (!d.client) return "";
  const spots: Record<string, [number, number]> = {
    determination: [70, 72], environment: [70, 112],
    motivation: [330, 72], perspective: [330, 112],
  };
  const size = 13;
  return `<g class="varrows">` + d.client.variables.map((v) => {
    const [x, y] = spots[v.key];
    const color = v.side === "design" ? DESIGN_RED : "#333333";
    const pts = v.arrow === "left"
      ? `${x + size},${y - size} ${x + size},${y + size} ${x - size},${y}`
      : `${x - size},${y - size} ${x - size},${y + size} ${x + size},${y}`;
    return `<polygon class="varrow" data-var="${v.key}" data-label="${esc(v.label)}" ` +
      `data-theme="${esc(v.theme)}" data-arrow="${v.arrow}" points="${pts}" fill="${color}"></polygon>`;
  }).join("") + `</g>`;
}

/** One invisible ring per activated gate, lit when its placement row is hovered
 *  and clickable for the gate's own description. No glyphs on the chart itself:
 *  the columns carry the placements, this only points at them. */
/** All gold: a translucent core and one bright ring, separated from whatever is
 *  underneath by a glow rather than a second color (gold over purple went brown). */
function goldRing(x: number, y: number, r: number): string {
  return `<circle class="hl-fill" cx="${r2(x)}" cy="${r2(y)}" r="${r2(r - 0.5)}" fill="#ffcc00" opacity=".28"></circle>` +
    `<circle class="hl-ring" cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="none" stroke="#ffcc00" stroke-width="3"></circle>`;
}

/** Islands of definition, and the gates that would join them. Both are plain
 *  graph facts: islands are the connected components of the defined centers,
 *  and a bridge is a gate that would complete a channel between two different
 *  islands. Never a guess. */
function definitionMap(d: SceneData): {
  islands: Center[][];
  bridges: { gate: number; key: string; partner: number }[];
} {
  if (!d.client) return { islands: [], bridges: [] };
  const defined = d.client.channels;
  const adj = new Map<Center, Set<Center>>();
  for (const c of d.client.centers) adj.set(c, new Set());
  for (const ch of d.channels) {
    if (!defined.has(ch.key)) continue;
    const a = centerOf(ch.gates[0]), b = centerOf(ch.gates[1]);
    adj.get(a)?.add(b);
    adj.get(b)?.add(a);
  }
  const seen = new Set<Center>();
  const islands: Center[][] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const group: Center[] = [];
    const stack: Center[] = [start];
    seen.add(start);
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      for (const n of adj.get(cur) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
    islands.push(group);
  }
  const islandOf = new Map<Center, number>();
  islands.forEach((g, i) => g.forEach((c) => islandOf.set(c, i)));

  const bridges: { gate: number; key: string; partner: number }[] = [];
  for (const ch of d.channels) {
    if (defined.has(ch.key)) continue;
    const [g1, g2] = ch.gates;
    const have1 = d.client.gates.has(g1), have2 = d.client.gates.has(g2);
    if (have1 === have2) continue;                    // needs exactly one side present
    const mine = have1 ? g1 : g2, missing = have1 ? g2 : g1;
    const i1 = islandOf.get(centerOf(mine)), i2 = islandOf.get(centerOf(missing));
    if (i1 === undefined || i2 === undefined || i1 === i2) continue;
    bridges.push({ gate: missing, key: ch.key, partner: mine });
  }
  return { islands, bridges };
}

function gateHalos(d: SceneData, skin: Skin): string {
  if (!d.client) return "";
  const gates = [...new Set(d.client.acts.map((a) => a.gate))];
  const bridges = definitionMap(d).bridges;
  const bridgeRings = [...new Set(bridges.map((b) => b.gate))].map((g) => {
    const a = d.anchors[g];
    if (!a) return "";
    const x = toCanvasX(a.x + 4.5), y = toCanvasY(a.y - 3.5);
    // One solid pink disc carrying its own number. The disc is drawn over the
    // chart, so the gate's own number would sit underneath it: it is hidden
    // while bridges are on and this one takes its place.
    return `<g class="bridge" data-gate="${g}">` +
      `<circle cx="${r2(x)}" cy="${r2(y)}" r="11" fill="#d24dff"></circle>` +
      `<text x="${r2(x)}" y="${r2(y + 3.9)}" text-anchor="middle" font-size="11" ` +
      `font-weight="600" fill="#ffffff">${g}</text></g>`;
  }).join("");
  return `<g class="bridges">${bridgeRings}</g><g class="halos">` + gates.map((g) => {
    const a = d.anchors[g];
    if (!a) return "";
    const x = toCanvasX(a.x + 4.5), y = toCanvasY(a.y - 3.5);
    return `<g class="halo" data-gate="${g}">` + goldRing(x, y, 11) +
      `<circle cx="${r2(x)}" cy="${r2(y)}" r="12" fill="transparent"></circle></g>`;
  }).join("") + `</g>`;
}

function buildCanvas(
  skin: Skin, d: SceneData, opts: { animate: boolean; legend: boolean; plain?: boolean; transit?: boolean },
): string {
  LY = layoutFor(!!d.client, opts.legend);
  const H = LY.h;
  OX = LY.tables ? TABLE_W + TABLE_GAP : 0;
  const tableMarkup = d.client
    ? (opts.transit && d.sky
        ? mergedClientTable(d.client, skin, 4, 96) +
          transitTable(d.sky, skin, OX + LY.coreW + TABLE_GAP - 10, 96)
        : placementTable("Design", d.client, skin, 12, 96) +
          placementTable("Personality", d.client, skin, OX + LY.coreW + TABLE_GAP - 10, 96))
    : "";
  const spots = placeLabels(d.centerBox, H - (opts.legend ? 190 : 40));

  // the light band: brighter than the channel on a dark ground, deeper on paper
  const grads = CIRCUITS.map((c) => {
    const hot = skin.id === "night" ? mix(c.color, "#ffffff", 0.45) : mix(c.color, "#2a1f33", 0.12);
    return (
      `<linearGradient id="beam-${c.id}-${skin.id}" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0%" stop-color="${c.color}" stop-opacity="0"></stop>` +
      `<stop offset="45%" stop-color="${hot}" stop-opacity=".95"></stop>` +
      `<stop offset="55%" stop-color="${hot}" stop-opacity=".95"></stop>` +
      `<stop offset="100%" stop-color="${c.color}" stop-opacity="0"></stop></linearGradient>`
    );
  }).join("");

  const fillOpacity = d.client
    ? (skin.id === "night" ? 0.7 : 0.66)
    : (skin.id === "night" ? 0.34 : 0.42);

  /** A band running the length of a leg, rotated onto its axis. Used both for
   *  the flat channel color (when a leg is shared) and the moving light. */
  const band = (h: HalfGeom, attrs: string, moving: boolean, extra = ""): string => {
    const full = Math.hypot(h.box.x2 - h.box.x1, h.box.y2 - h.box.y1) + 4;
    const height = h.stripes === 1 ? full : TUBE / h.stripes;
    const y = h.stripes === 1
      ? h.my - height / 2
      : h.my - TUBE / 2 + h.stripe * height;
    const w = moving ? 20 : h.len * 2;
    return (
      `<g transform="rotate(${r2(h.deg)} ${r2(h.mx)} ${r2(h.my)})">` +
      `<rect x="${r2(h.mx - w / 2)}" y="${r2(y)}" width="${r2(w)}" height="${r2(height)}" ` +
      `${attrs}${extra}></rect></g>`
    );
  };

  // in the plain view the channels are only hit areas: the design has already
  // colored them the traditional way
  const flows = d.channels.map((ch) => {
    const color = CIRCUITS.find((c) => c.id === ch.circuit)!.color;
    if (opts.plain) {
      const shapes = ch.halves.map((h) => reshape(h.el, `fill="transparent"`)).join("");
      return `<g class="ch" data-ch="${ch.key}" data-circuit="${ch.circuit}">${shapes}</g>`;
    }
    const parts: string[] = [];
    const live = !d.client || d.client.channels.has(ch.key);

    // an activated gate whose partner never showed up: draw the leg alone, dim,
    // no arrow and no light, because nothing flows through half a channel
    if (!live) {
      const hang = ch.halves.filter((h) => d.client!.gates.has(h.gate));
      if (!hang.length) return "";
      const shapes = hang.map((h, i) => {
        const cid = `hp-${ch.key}-${i}-${skin.id}`;
        const body = h.stripes === 1
          ? reshape(h.el, `fill="${color}" fill-opacity="0.3"`)
          : `<clipPath id="${cid}">${reshape(h.el, "")}</clipPath><g clip-path="url(#${cid})">` +
            band(h, `fill="${color}" fill-opacity="0.3"`, false) + `</g>`;
        return `<g class="leg" data-gate="${h.gate}">${body}</g>`;
      }).join("");
      return `<g class="ch hang" data-ch="${ch.key}" data-circuit="${ch.circuit}">${shapes}</g>`;
    }

    ch.halves.forEach((h, i) => {
      const cid = `cp-${ch.key}-${i}-${skin.id}`;
      const clipped = h.stripes > 1 || opts.animate;
      const leg: string[] = [];
      if (clipped) leg.push(`<clipPath id="${cid}">${reshape(h.el, "")}</clipPath>`);

      if (h.stripes === 1) {
        leg.push(reshape(h.el, `fill="${color}" fill-opacity="${fillOpacity}"`));
      } else {
        leg.push(`<g clip-path="url(#${cid})">` +
          band(h, `fill="${color}" fill-opacity="${fillOpacity}"`, false) + `</g>`);
      }

      if (opts.animate) {
        const travel = h.len / 2 + 20;
        const slot = ch.slot + i;
        leg.push(`<g clip-path="url(#${cid})">` +
          band(h, `class="beam" fill="url(#beam-${ch.circuit}-${skin.id})"`, true,
            ` style="--L:${r2(travel)};animation-delay:calc(var(--period) * -${r2(slot / d.slots)})"`) +
          `</g>`);
      }
      parts.push(`<g class="leg" data-gate="${h.gate}">${leg.join("")}</g>`);
    });

    const a = ch.arrow;
    const nx = -a.uy, ny = a.ux;
    const tip = [a.x + a.ux * 5.2, a.y + a.uy * 5.2];
    const b1 = [a.x - a.ux * 3.4 + nx * 4.1, a.y - a.uy * 3.4 + ny * 4.1];
    const b2 = [a.x - a.ux * 3.4 - nx * 4.1, a.y - a.uy * 3.4 - ny * 4.1];
    parts.push(
      `<polygon class="arrow" data-g1="${ch.srcGate}" data-g2="${ch.tgtGate}" ` +
      `points="${tip.map(r2).join(",")} ${b1.map(r2).join(",")} ${b2.map(r2).join(",")}" ` +
      `fill="${skin.id === "night" ? mix(color, "#ffffff", 0.35) : mix(color, "#2a1f33", 0.28)}"></polygon>`,
    );

    return `<g class="ch" data-ch="${ch.key}" data-circuit="${ch.circuit}">${parts.join("")}</g>`;
  }).join("");

  const labels = LY.labels
    ? (Object.keys(CENTER_SVG_ID) as Center[])
        .map((c) => labelCard(c, spots[c], d.fn[c], skin, false))
        .join("")
    : "";

  const W = LY.coreW + (LY.tables ? 2 * (TABLE_W + TABLE_GAP) : 0);
  const header = d.client
    ? `<text x="${r2(OX + LY.coreW / 2)}" y="58" text-anchor="middle" font-size="27" font-weight="600" ` +
      `letter-spacing=".02em" fill="${skin.ink}">${esc(d.client.name)}</text>`
    : `<text x="${OX + 52}" y="60" font-size="25" font-weight="600" letter-spacing=".02em" ` +
      `fill="${skin.ink}">The Nine Centers and the Flow to the Throat</text>` +
      `<text x="${OX + 52}" y="86" font-size="13" fill="${skin.muted}">` +
      `Every channel carries its energy toward the Throat, the only center that can manifest. ` +
      `Color shows which circuit the channel belongs to.</text>`;
  return (
    `<svg class="canvas${opts.plain ? " plain" : ""}${opts.transit ? " transit" : ""}" data-skin="${opts.transit ? "transit" : opts.plain ? "plain" : skin.id}" viewBox="0 0 ${r2(W)} ${r2(H)}" ` +
    `data-vb-wide="0 0 ${r2(W)} ${r2(H)}" data-vb-core="${r2(OX)} 0 ${r2(LY.coreW)} ${r2(H)}" ` +
    `xmlns="http://www.w3.org/2000/svg" font-family="${FONT_STACK}">` +
    `<rect x="0" y="0" width="${r2(W)}" height="${r2(H)}" fill="${skin.bg}"></rect>` +
    `<defs>${grads}</defs>` +
    header +
    tableMarkup +
    `<g class="labels">${labels}</g>` +
    `<g transform="translate(${OX + LY.tx},${LY.ty}) scale(${LY.sc})">${opts.transit ? d.transit : opts.plain ? d.plain : d.inner[skin.id]}<g class="flows">${flows}</g>${variableArrows(d)}</g>` +
    gateHalos(d, skin) +
    (opts.legend ? `<g class="legend">${legendBlock(OX + 30, H - (d.client ? 170 : 96), skin, !!d.client)}</g>` : "") +
    `</svg>`
  );
}

/** The branded mandala with this chart's placements, for the Mandala view.
 *  Rendered by lib/render/mandala.ts, the same wheel the reports use, so the
 *  two never drift apart. Planet toggles reach it through data-planet. */
function mandalaView(d: SceneData): string {
  if (!d.client) return "";
  const acts = d.client.acts
    .filter((a) => MANDALA_PLANET[a.planet])
    .map((a) => ({
      side: a.side as ChartSide,
      planet: MANDALA_PLANET[a.planet],
      gate: a.gate,
      line: a.line,
    }));
  const pick = (side: "personality" | "design", planet: string) =>
    d.client!.acts.find((a) => a.side === side && a.planet === planet)?.gate ?? 0;
  const svg = renderFullMandala(
    {
      clientName: d.client.name,
      activations: acts,
      cross: {
        personalitySun: pick("personality", "Sun"),
        personalityEarth: pick("personality", "Earth"),
        designSun: pick("design", "Sun"),
        designEarth: pick("design", "Earth"),
      },
      bodygraphSvg: bridgeLegs(tagChart(d.client.svg), definitionMap(d).bridges.map((b) => b.gate)),
    },
    { size: 1200, glyphScale: 1.8 },
  );
  // The renderer drops the bodygraph into the hub as a nested SVG, centered in a
  // square of side 2 * 0.18 * size and letterboxed to its 400x693 viewBox. Same
  // arithmetic here puts a ring on any gate of that little chart, so the wheel
  // and the bodygraph at its center point at the same thing.
  const S = 1200, R = S * 0.18, side = 2 * R;
  const sc = side / BG_H;
  const ox = S / 2 - R + (side - BG_W * sc) / 2;
  const oy = S / 2 - R;
  const rings = Object.entries(d.anchors).map(([g, a]) => {
    const cx0 = ox + (a.x + String(g).length * 3.1) * sc;
    const cy0 = oy + (a.y - 3.5) * sc;
    return `<g class="hubring" data-gate="${g}">${goldRing(cx0, cy0, 9 * sc)}</g>`;
  }).join("");
  return `<div class="mandala">${svg.replace(/<\/svg>\s*$/, `<g class="hubrings">${rings}</g></svg>`)}</div>`;
}

// ── interactive page ────────────────────────────────────────────────────────
function buildHtml(d: SceneData, canvases: string, mandala: string, astro: string,
  fonts: Map<number, Buffer>): string {
  const logoSrc = brandMark("Delphi Logo.svg");
  const knowSrc = brandMark("Know Thyself.svg");
  const iconSrc = favicon();
  // On a client chart these dock into the empty corner of the stage instead of
  // the panel, which is where the panel's height was coming from. The teaching
  // diagram has room, so there they stay in the panel.
  const viewControls = `<div class="sec" id="viewsec" hidden>VIEW</div>
    <div class="row" id="viewrow" hidden>
      <button id="vPlain" class="on">Bodygraph</button>
      <button id="vBody">Circuits</button>
      <button id="vMandala">Mandala</button>
      <button id="vTransit">Transit</button>
      <button id="vAstro">Astrology</button>
    </div>
    <div class="row" id="siderow" hidden>
      <button id="sideP" class="on">Personality</button>
      <button id="sideD" class="on">Design</button>
    </div>
    <div class="row" id="hangrow" hidden>
      <button id="defined" class="on">Defined Channels</button>
      <button id="hang" class="on">Hanging Gates</button>
    </div>
    <div class="row" id="actrow" hidden>
      <button id="reset" class="gold">Reset</button>
      <button id="snap">Save Image</button>
    </div>`;
  const face = [...fonts.entries()].map(([w, buf]) =>
    `@font-face{font-family:Montserrat;font-style:normal;font-weight:${w};font-display:swap;` +
    `src:url(data:font/ttf;base64,${buf.toString("base64")}) format('truetype');}`,
  ).join("");

  const payload = {
    astro: d.astro ?? null,
    read: d.read ?? null,
    cycles: d.client?.report.cycles ?? [],
    client: d.client
      ? { name: d.client.name,
          dates: {
            birth: d.client.subtitle.personality[0] ?? "",
            place: d.client.subtitle.personality[1] ?? "",
            design: d.client.subtitle.design[0] ?? "",
          },
          cycles: d.client.report.cycles,
          islands: definitionMap(d).islands,
          bridges: definitionMap(d).bridges,
          channelList: d.channels
            .filter((c) => d.client!.channels.has(c.key))
            .sort((a, b) => a.gates[0] - b.gates[0])
            .map((c) => ({
              key: c.key,
              label: `(${c.key}) ${c.name.replace(/^[^:]*:\s*/, "")}`,
              circuit: c.circuit,
            })),
          variables: d.client.variables.map((v) => ({
            ...v, report: d.client!.report.props[`var-${v.key}`] ?? "",
          })),
          meta: d.client.meta.map((m) => ({
            ...m,
            key: m.label.toLowerCase().replace(/^incarnation cross$/, "cross"),
            report: d.client!.report.props[m.label.toLowerCase().replace(/^incarnation cross$/, "cross")] ?? "",
            wide: /cross|frequencies/i.test(m.label),
          })),
          defined: [...d.client.channels], centers: [...d.client.centers] }
      : null,
    channels: d.channels.map((c) => ({
      key: c.key, name: c.name, circuit: c.circuit,
      circuitName: CIRCUITS.find((x) => x.id === c.circuit)!.name,
      from: CENTER_DISPLAY[c.source], to: CENTER_DISPLAY[c.target],
      cFrom: c.source, cTo: c.target,
      srcGate: c.srcGate, tgtGate: c.tgtGate, keynote: c.keynote, type: c.type,
      live: !d.client || d.client.channels.has(c.key),
      report: d.client?.report.channels[c.key] ?? "",
    })),
    centers: (Object.keys(CENTER_SVG_ID) as Center[]).map((c) => {
      // Undefined and open are not the same centre. Undefined carries an
      // activated gate with no channel completing it; open carries nothing at
      // all, and is conditioned far more indiscriminately. The chart used to
      // call both "Open", which loses the distinction Kaycee teaches.
      const defined = d.client ? d.client.centers.has(c) : null;
      const carries = d.client ? [...d.client.gates].some((g) => centerOf(g) === c) : false;
      const state = defined === null ? null : defined ? "defined" : carries ? "undefined" : "open";
      return {
        id: c, name: CENTER_DISPLAY[c], fns: d.fn[c], biology: d.biology[c],
        defined, state,
        stateLabel: state ? state.charAt(0).toUpperCase() + state.slice(1) : "",
        stateText: state ? d.states[c][state] : "",
        // the tooltip is 250px wide, so the hover gets the opening sentences and
        // the card gets the rest
        stateShort: state ? firstSentences(d.states[c][state], 2) : "",
        report: d.client?.report.centers[c] ?? "",
        notSelf: d.states[c].theme,
      };
    }),
    placements: d.client
      ? d.client.acts.map((a) => ({
          side: a.side, planet: a.planet, pid: planetId(a.planet),
          gate: a.gate, line: a.line, fix: a.fix,
          gateName: d.gateInfo[a.gate]?.name ?? gateName(a.gate),
          lineName: d.lineName(a.gate, a.line),
          keynote: d.gateInfo[a.gate]?.keynote ?? "",
          func: d.gateInfo[a.gate]?.func ?? "",
          circuit: d.gateInfo[a.gate]?.circuit ?? "",
          quarter: d.gateInfo[a.gate]?.quarter ?? "",
          center: CENTER_DISPLAY[centerOf(a.gate)], cid: centerOf(a.gate),
          sign: signOf(a.gate, a.line, a.color, a.tone, a.base).sign,
          signDeg: r2(signOf(a.gate, a.line, a.color, a.tone, a.base).degree),
          onBoundary: lineOnBoundary(a.gate, a.line),
          report: d.client!.report.gates[`${a.side}|${a.planet}`] ?? "",
        }))
      : [],
    circuits: CIRCUITS.map((c) => ({
      ...c, total: d.channels.filter((ch) => ch.circuit === c.id).length,
    })),
    tagInfo: d.tagInfo,
    lineNames: PROFILE_LINES,
    groupInfo: Object.fromEntries(
      ["Individual", "Collective", "Tribal", "Integration"].map((g) => {
        const first = CIRCUITS.find((c) => c.group === g);
        return [g, first ? (d.tagInfo[first.name.trim().toLowerCase()] ?? "") : ""];
      }),
    ),
    gateLib: Object.fromEntries(
      Array.from({ length: 64 }, (_, i) => i + 1).map((g) => [g, {
        name: d.gateInfo[g]?.name ?? gateName(g),
        keynote: d.gateInfo[g]?.keynote ?? "",
        func: d.gateInfo[g]?.func ?? "",
        circuit: d.gateInfo[g]?.circuit ?? "",
        quarter: d.gateInfo[g]?.quarter ?? "",
        center: CENTER_DISPLAY[centerOf(g)], cid: centerOf(g),
      }]),
    ),
    sky: d.sky ? { date: d.sky.date, time: d.sky.time, positions: d.sky.positions.map((p) => ({
      planet: p.planet, gate: p.gate, line: p.line, fixingState: p.fixingState,
    })) } : null,
    natalGates: d.client ? [...new Set(d.client.acts.map((a) => a.gate))].sort((a, b) => a - b) : [],
    zodiac: ZODIAC.map((z) => ({ name: z, glyph: ZODIAC_GLYPH[z] })),
    signsByGate: SIGNS_BY_GATE,
    planets: PLANET_ROWS.map((p) => ({ id: planetId(p), name: p })),
    functions: FUNCTION_ORDER.map((f) => ({ name: f, color: FUNCTIONS[f] })),
  };

  // one cascade step is a fixed slice of the loop, so the light hands off from
  // channel to channel instead of every channel pulsing at once
  const step = r2((100 / d.slots) * 1.35);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.client ? `${d.client.name} - Delphi Human Design` : "The Nine Centers and the Flow to the Throat")}</title>
${iconSrc ? `<link rel="icon" href="${iconSrc}">` : ""}
<style>
${face}
:root { --period: 9s; --purple: #845095; --gnum-off: #6b6790; --gnum-on: #845095; }
* { box-sizing: border-box; }
[hidden] { display:none !important; }
body { margin:0; font-family:${FONT_STACK}; background:#ffffff; color:#1c1a2e; }
/* The wrap is exactly one screen tall, never taller. It used to be min-height,
   so a tall panel grew the page and the bodygraph scrolled away with it. Fixed
   height means the panel overflows inside itself instead, and the chart holds
   still while the reading scrolls beside it. box-sizing is border-box globally,
   so the padding is already inside the 100vh. */
.wrap { display:flex; gap:18px; padding:12px; height:100vh; align-items:flex-start; position:relative; }
.brandmark { position:absolute; pointer-events:none; user-select:none; }
.brandmark.logo { left:14px; top:10px; width:132px; opacity:.92; }
.brandmark.know { right:6px; bottom:4px; width:170px; opacity:.75; }
.stage { flex:1 1 auto; min-width:0; position:relative; display:flex; justify-content:center; }
.card { position:absolute; z-index:5; width:266px; padding:14px 32px 14px 15px; border-radius:14px; font-size:12px;
  line-height:1.55; background:rgba(255,255,255,.98); border:1px solid rgba(132,80,149,.28); color:#1c1a2e;
  box-shadow:0 14px 34px rgba(60,40,80,.18); pointer-events:auto; }
.card[hidden] { display:none; }
.card b { display:block; font-size:13.5px; font-weight:600; margin-bottom:5px; }
.card .kn { display:block; font-style:italic; opacity:.9; margin-bottom:7px; }
.card .meta { display:block; opacity:.66; }
.card .tag { display:inline-block; font-size:9.5px; font-weight:600; letter-spacing:.08em; padding:2px 8px;
  border-radius:8px; margin:0 5px 7px 0; color:#231f33; }
.card .body p:first-child { font-style:italic; opacity:.9; }
.card .meta i { opacity:.75; font-style:normal; letter-spacing:.04em; }
.card .tag.ghost { background:none !important; border:1px solid currentColor; color:inherit; opacity:.6; margin-left:5px; }
.card .tag.has { cursor:help; }
.card .tag.has:hover { outline:1.5px solid rgba(132,80,149,.5); outline-offset:1px; }
.card .close { position:absolute; top:6px; right:8px; background:none; border:0; font-size:17px; line-height:1;
  opacity:.5; padding:2px 5px; color:inherit; }
.card .close:hover { opacity:1; background:none; }
svg.canvas.plain { display:none; }
svg.canvas { display:none; max-height:calc(100vh - 28px); max-width:100%; width:auto; height:auto; margin:0 auto; }
body.skin-paper svg.canvas[data-skin="paper"] { display:block; }
body.view-plain svg.canvas[data-skin="paper"] { display:none !important; }
body.view-plain svg.canvas.plain:not(.transit) { display:block; }
svg.canvas.transit { display:none; }
body.view-transit svg.canvas[data-skin="paper"] { display:none !important; }
body.view-transit svg.canvas.plain:not(.transit) { display:none !important; }
body.view-transit svg.canvas.transit { display:block; }
body.view-transit { background:#ffffff; color:#1c1a2e; }
body.view-transit .bridge, body.view-transit .halo { display:none; }
/* The client tint is a light purple and the awareness centres are a mid purple,
   so a gate disc sitting on the spleen or the solar plexus disappears into it.
   A thin dark rim gives every disc an edge on any centre colour. */
svg.canvas.transit .gdisc { stroke:#0a5f57; stroke-width:1.1; }
svg.canvas.transit .pnum.on-disc, svg.canvas.transit .pnum.on-disc.off { fill:#ffffff !important; opacity:1 !important; }
/* Only a disc with something in it gets a rim. Every gate the client does not
   carry is a paintable transit disc now, so rimming them all drew a black ring
   around every unactivated gate on the chart. */
svg.canvas.transit .tdisc:not([fill="none"]) { stroke:#101014; stroke-width:1.1; }
/* a transit gate lit from its column or from the read */
svg.canvas.transit .tleg.lit { fill:#f1c232 !important; }
svg.canvas.transit .tdisc.lit { stroke:#f1c232 !important; stroke-width:3 !important; }
/* and the client's own gates light exactly the same way, so hovering their
   column rings the gate rather than covering it */
svg.canvas.transit .gdisc.lit { stroke:#f1c232 !important; stroke-width:3 !important; }
body.view-plain { background:#ffffff; color:#1c1a2e; }
body.view-astro .panel,
body.view-transit .panel, body.view-plain .panel { background:rgba(132,80,149,.06); border-color:rgba(132,80,149,.22); }
body.view-transit .card, body.view-plain .card { background:rgba(255,255,255,.98); border-color:rgba(132,80,149,.28);
  color:#1c1a2e; box-shadow:0 14px 34px rgba(60,40,80,.18); }
body.view-transit .tip, body.view-plain .tip { background:rgba(255,255,255,.98); color:#1c1a2e; border-color:rgba(132,80,149,.25); }
/* circuit colouring means nothing on the other two views; the defined and
   hanging buttons still do, except on the mandala */
body.view-plain #circdrop, body.view-mandala #circdrop, body.view-transit #circdrop { display:none; }
/* a gate number sitting on a hidden disc has to come back to dark */
.pnum.off { fill:#1c1a2e !important; }
/* the traditional chart carries its own coloring: leave the gate numbers alone */
body.view-plain svg.canvas .gnum, body.view-transit svg.canvas .gnum { fill:inherit; font-weight:inherit; }
.panel { flex:0 0 306px; align-self:stretch; padding:18px 16px; border-radius:16px;
  background:rgba(132,80,149,.06); border:1px solid rgba(132,80,149,.22);
  /* the panel matches the bodygraph's height, so on a short laptop screen its
     content used to push the page taller and scroll the chart out of view.
     Scrolling inside the panel instead keeps the bodygraph whole and keeps the
     booking links reachable at any window size. */
  min-height:0; overflow-y:auto; scrollbar-width:thin; }
.panel h1 { font-size:16px; margin:0 0 4px; font-weight:600; letter-spacing:.01em; }
.panel p.sub { font-size:11.5px; line-height:1.5; margin:0 0 16px; opacity:.72; }
details.drop { margin-top:12px; border-top:1px solid rgba(132,80,149,.18); padding-top:8px; }
details.drop > summary { font-size:9.5px; letter-spacing:.18em; font-weight:600; opacity:.62; cursor:pointer;
  text-transform:uppercase; list-style:none; padding:3px 0; }
details.drop > summary::-webkit-details-marker { display:none; }
details.drop > summary::after { content:" \\25BE"; color:var(--purple); opacity:1; font-size:12px; }
details.drop[open] > summary::after { content:" \\25B4"; }
.tip { position:absolute; z-index:6; pointer-events:none; padding:7px 10px; border-radius:9px; font-size:11px;
  line-height:1.5; background:rgba(255,255,255,.98); color:#1c1a2e; border:1px solid rgba(132,80,149,.25);
  box-shadow:0 8px 22px rgba(60,40,80,.18); max-width:250px; }
.tip[hidden] { display:none; }
.tip b { display:block; font-size:12px; }
.tip .tipbody { display:block; margin-top:5px; font-size:10.5px; line-height:1.5; }
.halo > *:not(:last-child) { opacity:0; transition:opacity .2s; }
.halo.on > *:not(:last-child) { opacity:1; }
.halo.on .hl-fill { opacity:.28; }
.card .body { max-height:46vh; overflow-y:auto; margin-top:8px; }
.card .body p { margin:0 0 8px; }
.card .body h4 { margin:12px 0 5px; font-size:11px; font-weight:600; letter-spacing:.1em;
  text-transform:uppercase; opacity:.62; }
.card .body h4:first-child { margin-top:0; }
.sec { font-size:9.5px; letter-spacing:.18em; font-weight:600; opacity:.6; margin:12px 0 6px; }
.grp { font-size:10.5px; letter-spacing:.1em; opacity:.55; margin:10px 0 4px; font-weight:600; }
label.cc { display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; padding:3px 0; }
label.cc input { accent-color:var(--purple); cursor:pointer; }
.sw { width:20px; height:4px; border-radius:2px; flex:0 0 20px; }
.row { display:flex; gap:7px; flex-wrap:wrap; margin-top:6px; }
button { font-family:inherit; font-size:11px; padding:5px 10px; border-radius:20px; border:1px solid transparent;
  cursor:pointer; background:rgba(132,80,149,.2); color:inherit; transition:all .15s; }
button:hover { background:rgba(132,80,149,.34); }
button.on { background:var(--purple); color:#fff; }
.chips { display:flex; flex-wrap:wrap; gap:6px; }
.chips span { font-size:9.5px; font-weight:600; letter-spacing:.06em; padding:3px 9px; border-radius:9px; color:#231f33; }
.readout { margin-top:16px; padding:12px; border-radius:12px; min-height:104px; font-size:11.5px; line-height:1.55;
  background:rgba(132,80,149,.05); border:1px solid rgba(132,80,149,.16); }
.readout b { display:block; font-size:13px; margin-bottom:3px; }
.readout .meta { opacity:.65; }
.hint { font-size:10.5px; opacity:.5; margin-top:10px; line-height:1.5; }
#pmeta { font-size:11px; line-height:1.45; margin:12px 0 4px; padding-top:12px;
  border-top:1px solid rgba(132,80,149,.22);
  display:grid; grid-template-columns:1fr 1fr; gap:2px 10px; }
#pmeta .prop.wide { grid-column:1 / -1; }
#pmeta .prop span { display:block; font-size:9px; letter-spacing:.1em; text-transform:uppercase; opacity:.5; }
#pmeta span { opacity:.6; }
#pmeta .prop { padding:3px 6px; margin:0 -2px; border-radius:7px; }
#pmeta .prop.has { cursor:pointer; }
#pmeta .prop.has:hover { background:rgba(132,80,149,.22); }
label.cc.absent { opacity:.38; }
label.cc .cnt { margin-left:auto; font-size:10.5px; opacity:.55; }
body.nohang .ch.hang { display:none; }

@keyframes sweep {
  0%   { transform: translateX(calc(var(--L) * -1px)); }
  ${step}% { transform: translateX(calc(var(--L) * 1px)); }
  100% { transform: translateX(calc(var(--L) * 1px)); }
}
.beam { animation: sweep var(--period) linear infinite; }
body.paused .beam { animation-play-state: paused; }
body.nomotion .beam { display:none; }
.ch { cursor:pointer; }
.varrow { cursor:pointer; }
.mandala [data-planet], .mandala [data-gatecell], .mandala [data-hex] { cursor:pointer; }
.mandala [data-planet]:hover { stroke-width:3; }
.mandala [data-gatecell]:hover, .mandala [data-hex]:hover { opacity:.72; }
.hubring { opacity:0; transition:opacity .15s; pointer-events:none; }
.mandala .pleg, .mandala .pnum, .mandala .gdisc, .mandala .cshape { cursor:pointer; }
.hubring.on { opacity:1; }
.varrow:hover { opacity:.75; }
@keyframes hlpulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
/* A highlighted channel takes a solid colour, never a glow.
   A drop-shadow traces EVERY edge inside the group, including the seam where
   the two legs meet and the notches where they join the gate discs, so it reads
   as a smudge around a black bar rather than a lit channel. It also never
   recolours the channel itself, and its radius is in screen pixels so its
   weight drifts with the window size. Filling the legs is unambiguous at any
   zoom and has no soft edge that can be subtly wrong.
   Plain view: the real legs live in .chgrp (from the branded SVG) and .ch is
   only a transparent hit area. Circuit view: .ch carries the drawn shapes. */
/* Every drawn shape, at any depth: the legs sit inside nested groups, and a
   fill on a group never beats a fill attribute on the path inside it, so a
   direct-child selector recolours only half the channel. */
svg.canvas.plain .gdisc.in-isle { fill:var(--isle) !important; }
svg.canvas.plain .pleg.in-isle { fill:var(--isle) !important; }
svg.canvas.plain .chgrp.in-isle path, svg.canvas.plain .chgrp.in-isle polygon,
svg.canvas.plain .chgrp.in-isle rect { fill:var(--isle) !important; }
svg.canvas:not(.plain) .ch.in-isle path, svg.canvas:not(.plain) .ch.in-isle polygon,
svg.canvas:not(.plain) .ch.in-isle rect { fill:var(--isle) !important; }
svg.canvas.plain .chgrp.hot path, svg.canvas.plain .chgrp.hot polygon,
svg.canvas.plain .chgrp.hot rect { fill:${HL_GOLD} !important; }
svg.canvas:not(.plain) .ch.hot path, svg.canvas:not(.plain) .ch.hot polygon,
svg.canvas:not(.plain) .ch.hot rect { fill:${HL_GOLD} !important; }
/* a single gate's leg lights the same way, solid rather than glowing */
svg.canvas:not(.plain) .leg.lit path, svg.canvas:not(.plain) .leg.lit polygon,
svg.canvas:not(.plain) .leg.lit rect { fill:${HL_GOLD} !important; }
svg.canvas.plain .pleg.lit { fill:${HL_GOLD} !important; }
.cshape.lit { stroke:#ffcc00 !important; stroke-width:3.4 !important;
  filter: drop-shadow(0 0 3px rgba(255,204,0,.85)); }
/* and the wheel echoes it */
.mhi { animation:hlpulse 1.2s ease-in-out infinite; }
.mandala [data-gatecell].lit path { stroke:#9c7415 !important; stroke-width:2.6 !important; }
.mandala [data-hex].lit { opacity:1 !important; }
.mandala line[data-gate].lit { stroke:#c79a2e !important; stroke-width:3.4 !important; stroke-opacity:1 !important; }
.mandala text[data-gate].lit { font-weight:bold; }
${CIRCUITS.map((c) => `body.off-${c.id} .ch[data-circuit="${c.id}"]:not(.hang) { display:none; }`).join("\n")}
body.nodefined .ch:not(.hang) { display:none; }
/* a deselected planet or side leaves the placement columns alone, dropping out
   of the mandala; its table row just dims */
${PLANET_ROWS.map((p) => {
  const id = planetId(p);
  return `body.off-p-${id} .mandala [data-planet="${id}"] { display:none; }\n` +
    `body.off-p-${id} .prow[data-planet="${id}"] { opacity:.3; }`;
}).join("\n")}
body.off-s-personality .mandala [data-side="personality"] { display:none; }
body.off-s-design .mandala [data-side="design"] { display:none; }
body.off-s-personality .prow[data-side="personality"],
body.off-s-design .prow[data-side="design"] { opacity:.3; }
/* the gate number follows whatever is still showing */
body.chart svg.canvas .gnum { fill:var(--gnum-off); font-weight:400; }
body.chart svg.canvas .gnum.lit { fill:var(--gnum-on); font-weight:600; }
body.notables .ptable { display:none; }
#viewrow button, #actrow button, #hangrow button, #siderow button { font-size:10.5px; padding:5px 8px; }
/* client charts: the view controls sit in the stage's empty lower-left corner
   rather than in the panel, so the panel only carries the reading itself */
.viewdock.docked { position:absolute; left:0; bottom:2px; z-index:5; width:154px;
  padding:8px 10px 10px; border-radius:12px; background:rgba(255,255,255,.93);
  border:1px solid rgba(132,80,149,.18); backdrop-filter:blur(3px);
  box-shadow:0 6px 18px rgba(60,40,80,.08); }
.viewdock.docked .sec { margin:0 0 7px; }
.viewdock.docked .row { flex-direction:column; align-items:stretch; margin-top:6px; gap:6px; }
.viewdock.docked button { width:100%; text-align:center; }
/* the three views are a mode switch, one at a time, so they read in the ink
   family rather than the purple one: charcoal when off, black when on. The
   purple pills below them are independent filters. Selected also takes full
   white and more weight, because black against charcoal alone is too small a
   step to tell at a glance. */
.viewdock.docked #viewrow { gap:0; }
.viewdock.docked #viewrow button { border-radius:0; }
.viewdock.docked #viewrow button:first-child { border-radius:10px 10px 0 0; }
.viewdock.docked #viewrow button:last-child { border-radius:0 0 10px 10px; }
.viewdock.docked #viewrow button + button { border-top-color:rgba(255,255,255,.18); }
#viewrow button { background:#4d4d55; color:rgba(255,255,255,.82); }
#viewrow button:hover { background:#3d3d45; color:#fff; }
#viewrow button.on, #viewrow button.on:hover { background:#111111; color:#fff; font-weight:600; }
button.gold { background:#c79a2e; color:#fff; }
button.gold:hover { background:#b0871f; }
.todaysec, .datesec { display:none; margin-top:10px; border-top:1px solid rgba(132,80,149,.18); padding-top:9px; }
body.view-transit .todaysec, body.view-transit .datesec { display:block; }
.todaysec > summary { font-size:9.5px; letter-spacing:.18em; font-weight:600; opacity:.62; cursor:pointer;
  text-transform:uppercase; padding:3px 0; list-style:none; }
.todaysec > summary::-webkit-details-marker { display:none; }
.todaysec > summary::after { content:" \\25B4"; color:var(--purple); font-size:12px; }
.todaysec:not([open]) > summary::after { content:" \\25BE"; }
.datepick { display:flex; align-items:center; gap:4px; }
.dstep { flex:0 0 auto; font-size:13px; line-height:1; padding:3px 6px; }
.dfield { flex:1 1 auto; min-width:0; font-family:inherit; font-size:11px; padding:4px 6px;
  border-radius:7px; border:1px solid rgba(132,80,149,.25); background:rgba(255,255,255,.7); color:inherit; }
.dtoday { flex:0 0 auto; font-size:9.5px; padding:4px 7px; visibility:hidden; }
.dtoday.show { visibility:visible; }
.tfield { flex:0 0 auto; width:82px; }
/* The native pickers' own calendar and clock glyphs cost about 20px each and
   buy nothing: both fields are typed into or stepped with the arrows, and the
   whole row only fits on one line without them. */
.dfield::-webkit-calendar-picker-indicator { display:none; }
.dfield::-webkit-inner-spin-button { display:none; }
.cycrow { display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; }
.cycpill { font-size:10px; padding:4px 9px; border-radius:999px; line-height:1.1;
  border:1px solid rgba(132,80,149,.34); background:transparent; color:inherit;
  font-family:inherit; cursor:pointer; }
.cycpill:hover { border-color:var(--purple); }
.cycpill.on { background:var(--purple); border-color:var(--purple); color:#fff; font-weight:600; }
.datesec.loading .datepick, .datesec.loading .cycrow { opacity:.45; pointer-events:none; }
.noread { font-size:11.5px; opacity:.62; line-height:1.5; margin-top:6px; }
/* in the transit view the panel is about today, not about their design */
body.view-transit #placements, body.view-transit #chandrop, body.view-transit #defdrop { display:none; }
.todaylab { font-size:9.5px; letter-spacing:.18em; font-weight:600; opacity:.62;
  text-transform:uppercase; margin-bottom:6px; }
.todayread { font-size:11.5px; line-height:1.62; }
.rref { border-bottom:1px dotted rgba(132,80,149,.55); cursor:pointer; }
.rref:hover, .rref.on { background:rgba(241,194,50,.30); border-bottom-color:#c79a2e; }
.todaylist { margin-top:8px; font-size:10.5px; line-height:1.5; }
.todaylist .cmp { padding:3px 6px; margin:0 -6px; border-radius:6px; cursor:pointer; }
.todaylist .cmp:hover { background:rgba(241,194,50,.22); }
.todaylist .cmp b { font-weight:600; }
.todaylist .brdg { color:#0d9488; font-weight:600; }
.survey { margin-top:11px; border-top:1px solid rgba(132,80,149,.14); padding-top:9px; }
.survey .qlab { font-size:11px; font-weight:600; margin-bottom:6px; }
.survey .qrow { display:flex; gap:5px; }
.survey .qbtn { flex:1; font-size:10.5px; padding:5px 4px; }
.survey .qbtn.on { background:var(--purple); color:#fff; }
.survey .qnote { width:100%; margin-top:6px; font-family:inherit; font-size:11px; padding:5px 7px;
  border-radius:7px; border:1px solid rgba(132,80,149,.25); background:rgba(255,255,255,.7);
  color:inherit; resize:vertical; }
.survey .qsend { display:flex; align-items:center; gap:8px; margin-top:6px; }
.survey .qgo { font-size:10.5px; padding:5px 12px; background:#c79a2e; color:#fff; }
.survey .qmsg { font-size:10.5px; opacity:.75; }
/* a sent response replaces the form rather than sitting under it, so it is
   obvious it went and there is nothing left to press twice */
.survey .qdone { display:none; }
.survey.sent .qlab, .survey.sent .qrow, .survey.sent .qnote, .survey.sent .qsend { display:none; }
.survey.sent .qdone { display:flex; align-items:center; gap:7px; font-size:13.5px; font-weight:600;
  color:#0d9488; padding:9px 10px; border-radius:9px; background:rgba(13,148,136,.10);
  border:1px solid rgba(13,148,136,.30); }
.survey.sent .qdone::before { content:"\\2713"; font-size:15px; }
.booknote { margin-top:10px; border-top:1px solid rgba(132,80,149,.18); padding-top:8px; }
.booknote .booklab { font-size:9.5px; letter-spacing:.18em; font-weight:600; opacity:.62;
  text-transform:uppercase; margin-bottom:5px; }
.booknote a { display:flex; justify-content:space-between; align-items:baseline; gap:8px;
  text-decoration:none; color:var(--purple); font-size:11px; font-weight:600; padding:3px 7px;
  border-radius:7px; margin-bottom:1px; }
.booknote a:hover { background:rgba(132,80,149,.12); }
.booknote a em { font-style:normal; font-weight:500; font-size:10px; opacity:.6; }
.bridge { opacity:0; transition:opacity .2s; pointer-events:none; }
/* The half of the channel the client does not carry, drawn in the same pink as
   the bridge ring so the whole channel reads as one shape: their leg in its own
   colour, the missing leg in pink. Only while Bridge gates is on. */
.bleg { fill:none; transition:fill .2s; }
body.show-bridges .bleg { fill:#d24dff !important; opacity:.62; }
body.show-bridges .pnum.bnum { opacity:0; }
body.show-bridges .bleg.on { fill:#d24dff !important; opacity:1; }
body.show-bridges .bridge { opacity:1; }
.bridge.on { opacity:1 !important; }
.bridge.on circle { stroke:#f1c232; stroke-width:3; }
.isle { font-size:11.5px; line-height:1.6; padding:3px 0; }
.isle b { font-weight:600; }
.isle .brg { cursor:pointer; border-bottom:1px dotted rgba(132,80,149,.6); }
.isle .brg:hover { color:var(--purple); }
.isle .dot { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:6px;
  vertical-align:middle; }
.tabs { display:flex; gap:6px; margin:-4px 0 12px; }
.tabbtn { flex:1; font-size:11.5px; padding:6px 8px; border-radius:9px; background:rgba(132,80,149,.12);
  border:1px solid transparent; }
.tabbtn.on { background:var(--purple); color:#fff; }
.pane[hidden] { display:none !important; }
.chan-item { font-size:11.5px; padding:4px 7px; margin:0 -7px; border-radius:7px; cursor:pointer;
  display:flex; align-items:center; gap:7px; }
.chan-item:hover { background:rgba(132,80,149,.14); }
.chan-item .sw { width:14px; height:4px; border-radius:2px; flex:0 0 14px; }
#tab-dates h4, #tab-stats h4 { font-size:9.5px; letter-spacing:.18em; font-weight:600; opacity:.6; margin:16px 0 7px;
  text-transform:uppercase; }
#tab-dates .line, .pane .line { font-size:11.5px; line-height:1.6; }
#tab-dates .line span, .pane .line span { opacity:.6; }
.cyc { font-size:11.5px; line-height:1.5; padding:6px 7px; margin:0 -7px 2px; border-radius:7px; cursor:pointer; }
.cyc:hover { background:rgba(132,80,149,.14); }
.cyc b { display:block; font-weight:600; }
.cyc span { opacity:.62; }
.bar { display:grid; grid-template-columns:78px 1fr 26px; align-items:center; gap:7px; font-size:11.5px;
  margin-bottom:3px; }
.bar { cursor:default; padding:1px 6px; margin-left:-6px; margin-right:-6px; border-radius:6px; }
.bar:hover { background:rgba(132,80,149,.12); }
.bar i { font-style:normal; opacity:.75; }
.bar.grp { margin-top:6px; }
.bar.grp i { opacity:1; font-weight:600; letter-spacing:.05em; text-transform:uppercase; font-size:10px; }
.bar.sub i { padding-left:9px; }
.k-sign .bar { grid-template-columns:94px 1fr 26px; }
.bar .track { height:7px; border-radius:4px; background:rgba(132,80,149,.14); overflow:hidden; }
.bar .fill { height:100%; background:var(--purple); border-radius:4px; }
.bar b { text-align:right; font-weight:600; font-size:11px; }
.pgrid { display:grid; grid-template-columns:1fr 1fr; gap:0 10px; }
.pgrid label { font-size:11.5px; }
.side-d { color:${DESIGN_RED}; }
.prow rect { transition:fill .12s; }
.prow.hi rect, .trow.hi rect { fill:rgba(132,80,149,.32); }
.trow { cursor:pointer; }
.mandala { display:none; }
body.view-mandala .mandala { display:block; }
.astro { display:none; }
body.view-astro .astro { display:block; }
body.view-astro svg.canvas, body.view-astro .mandala { display:none !important; }
body.view-astro { background:#ffffff; color:#1c1a2e; }
body.view-astro .astro { display:flex; align-items:center; justify-content:center; width:100%; }
body.view-astro .astro svg { height:calc(100vh - 36px); width:auto; max-width:100%; display:block; }
/* the classic set on opening; the rest is a click away rather than a deletion */
body:not(.astro-all) .astro .asp.extra { display:none; }
body:not(.astro-all) #astroaspects .line.extra { display:none; }
/* this view's home tab is astrology, not Human Design */
#astrohome { display:none; }
body.view-astro #astrohome { display:block; }
body.view-astro #pmeta, body.view-astro #circdrop, body.view-astro #placements,
body.view-astro #datesec, body.view-astro #todaysec, body.view-astro #chandrop,
body.view-astro #defdrop { display:none !important; }
#astroplanets .line, #astrohouses .line, #astroaspects .line { display:grid;
  grid-template-columns:74px 1fr auto; gap:6px; font-size:11.5px; line-height:1.85; }
#astroplanets .line i, #astrohouses .line i, #astroaspects .line i { font-style:normal; opacity:.55; }
body.view-mandala svg.canvas { display:none !important; }
.mandala { border-radius:18px; overflow:hidden; }
body.view-mandala .mandala svg { max-height:calc(100vh - 28px); width:auto; height:auto; margin:0 auto; display:block; }
</style></head>
<body class="skin-paper${d.client ? " chart" : ""}">
<div class="wrap">
  ${logoSrc ? `<img class="brandmark logo" src="${logoSrc}" alt="Delphi">` : ""}
  <div class="stage">${canvases}${mandala}${astro}<div class="tip" id="tip" hidden></div><div class="card" id="card" hidden></div>${knowSrc ? `<img class="brandmark know" src="${knowSrc}" alt="Know thyself">` : ""}${d.client ? `<div class="viewdock docked">${viewControls}</div>` : ""}</div>
  <aside class="panel">
${d.client ? "" : `<h1 id="ptitle">Centers, function, and flow</h1>
    <p class="sub" id="psub">Nine centers, each labeled with what it does. The moving light follows every channel toward the Throat, the only center that turns energy into expression.</p>`}
    <div class="tabs" id="ptabs" hidden>
      <button class="tabbtn on" data-tab="home">Home</button>
      <button class="tabbtn" data-tab="dates">Dates</button>
      <button class="tabbtn" data-tab="stats">Stats</button>
    </div>

${d.client ? "" : viewControls}

    <div id="tab-dates" class="pane" hidden></div>
    <div id="tab-stats" class="pane" hidden></div>

    <div id="tab-home" class="pane">
    <div id="pmeta"></div>


    <details class="drop" id="circdrop"${d.client ? "" : " open"}>
      <summary>Circuitry</summary>
      <div id="circuits"></div>
      <div class="row"><button id="all">All</button><button id="none">None</button></div>
    </details>

    <div id="astrohome">
      <div id="astrometa"></div>
      <div class="row" id="asprow"><button id="aspAll">Show every aspect</button></div>
      <details class="drop" open><summary>Placements</summary><div id="astroplanets"></div></details>
      <details class="drop"><summary>Houses</summary><div id="astrohouses"></div></details>
      <details class="drop"><summary>Aspects</summary><div id="astroaspects"></div></details>
    </div>

    <details class="drop" id="placements" hidden>
      <summary>Placements</summary>
      <div class="row"><button id="tables" class="on">Columns</button></div>
      <div class="row" id="pgroups"></div>
      <div class="pgrid" id="planets"></div>
      <div class="row"><button id="pAll">All</button><button id="pNone">None</button></div>
    </details>

    <div class="datesec" id="datesec">
      <div class="todaylab">Date</div>
      <div class="datepick">
        <button class="dstep" id="dprev" title="Previous day">&#8249;</button>
        <input class="dfield" id="dfield" type="date">
        <button class="dstep" id="dnext" title="Next day">&#8250;</button>
        <input class="dfield tfield" id="tfield" type="time" step="60">
        <button class="dtoday" id="dtoday" title="Jump to right now">Now</button>
      </div>
    </div>
    <details class="todaysec drop" id="todaysec" open>
      <summary id="todaylab">TODAY</summary>
      <div class="todayread" id="todayread"></div>
      <div class="todaylist" id="todaylist"></div>
      <div class="survey" id="survey">
        <div class="qlab">Does this land?</div>
        <div class="qrow">
          <button class="qbtn" data-a="Yes">Yes</button>
          <button class="qbtn" data-a="Sort of">Sort of</button>
          <button class="qbtn" data-a="Not really">Not really</button>
        </div>
        <textarea class="qnote" id="qnote" rows="2" placeholder="Anything you'd add? (optional)"></textarea>
        <div class="qsend"><button class="qgo" id="qgo">Send</button><span class="qmsg" id="qmsg"></span></div>
        <div class="qdone" id="qdone">Thank you. That has been sent.</div>
      </div>
    </details>
    <details class="drop" id="chandrop" hidden>
      <summary>Channels</summary>
      <div id="chanlist"></div>
    </details>

    <details class="drop" id="defdrop" hidden>
      <summary>Definition</summary>
      <div class="row">
        <button id="tIslands">Islands</button>
        <button id="tBridges">Bridge gates</button>
      </div>
      <div id="deflist"></div>
    </details>

    </div>
${d.client ? `<div class="booknote"><div class="booklab">Book a session</div>${BOOKING_SESSIONS.map(
      (s) => `<a href="${BOOKING_URL}/${s.slug}" target="_blank" rel="noopener"><span>${s.name}</span><em>${s.meta}</em></a>`,
    ).join("")}</div>` : ""}
${d.client ? "" : `<div class="readout" id="readout"><b>Hover the bodygraph</b><span class="meta">Click to pin a description over the chart.</span></div>
    <p class="hint">Arrows point the way energy travels: toward the Throat, hop by hop. Click a channel or a center to pin its description over the bodygraph.</p>`}
  </aside>
</div>
<script>
var DATA = ${JSON.stringify(payload)};
var CLIENT_TINT_JS = ${JSON.stringify(CLIENT_TINT)};
// the brand font again, so a saved image carries it too (an SVG drawn into a
// canvas cannot reach the page's fonts)
var FONTCSS = ${JSON.stringify(face)};
var body = document.body;
var metaBy = {};

// client header
if (DATA.client) {
  document.getElementById('pmeta').innerHTML = DATA.client.meta.map(function (m) {
    return '<div class="prop' + (m.report ? ' has' : '') + (m.wide ? ' wide' : '') +
      '" data-key="' + m.key + '"><span>' + m.label + '</span> ' + m.value + '</div>';
  }).join('');
  metaBy = {}; DATA.client.meta.forEach(function (m) { metaBy[m.key] = m; });
  document.getElementById('hangrow').hidden = false;
  document.getElementById('placements').hidden = false;
  document.getElementById('chandrop').hidden = false;
  document.getElementById('defdrop').hidden = false;

  // definition: the islands, and the gates that would join them
  // Island colours. Deliberately dark enough that the white gate number on a
// filled disc stays readable: the old bright teal gave white text about 2:1,
// which looked washed out at chart size.
  var ISLE_COLORS = ['#1d4ed8', '#0d9488', '#c2410c', '#be123c'];
  var isles = DATA.client.islands || [];
  var bridges = DATA.client.bridges || [];
  var centerName = {};
  DATA.centers.forEach(function (c) { centerName[c.id] = c.name; });
  document.getElementById('deflist').innerHTML =
    (isles.length
      ? isles.map(function (g, i) {
          return '<div class="isle"><span class="dot" style="background:' + ISLE_COLORS[i % 4] + '"></span>' +
            '<b>Island ' + (i + 1) + '</b> ' +
            g.map(function (c) { return esc(centerName[c] || c); }).join(', ') + '</div>';
        }).join('')
      : '<div class="isle">No defined centers.</div>') +
    (bridges.length
      ? '<div class="isle" style="margin-top:7px"><b>Bridges</b> ' +
        bridges.map(function (b) { return b.gate; })
          .filter(function (g, i, a) { return a.indexOf(g) === i; })
          .sort(function (a, b) { return a - b; })
          .map(function (g) { return '<span class="brg" data-gate="' + g + '">' + g + '</span>'; })
          .join(', ') + '</div>' +
        '<div class="isle" style="opacity:.6">Each would complete a channel across the split.</div>'
      : (isles.length > 1 ? '' : '<div class="isle" style="opacity:.6">One island: nothing to bridge.</div>'));

  // every gate of a channel that sits wholly inside an island
  var isleOfGate = {};
  DATA.channels.forEach(function (c) {
    if (!DATA.client.defined || DATA.client.defined.indexOf(c.key) < 0) return;
    isles.forEach(function (g, i) {
      if (g.indexOf(c.cFrom) >= 0 && g.indexOf(c.cTo) >= 0) {
        isleOfGate[c.srcGate] = i;
        isleOfGate[c.tgtGate] = i;
      }
    });
  });
  var paintIslands = function (on) {
    [].forEach.call(document.querySelectorAll('.cshape'), function (el) {
      var idx = -1;
      isles.forEach(function (g, i) { if (g.indexOf(el.dataset.center) >= 0) idx = i; });
      if (on && idx >= 0) {
        el.style.stroke = ISLE_COLORS[idx % 4];
        el.style.strokeWidth = '4';
      } else {
        el.style.stroke = '';
        el.style.strokeWidth = '';
      }
    });
    // The channels inside an island take that island's colour as a solid fill.
    // This used to be a casing faked from nine stacked drop-shadows, which is
    // a blurry approximation of an outline and was the thing that looked wrong.
    var isleOfChannel = {};
    DATA.channels.forEach(function (c) {
      if (!DATA.client.defined || DATA.client.defined.indexOf(c.key) < 0) return;
      isles.forEach(function (g, i) {
        if (g.indexOf(c.cFrom) >= 0 && g.indexOf(c.cTo) >= 0) isleOfChannel[c.key] = i;
      });
    });
    [].forEach.call(document.querySelectorAll('.chgrp, .ch'), function (el) {
      var i = isleOfChannel[el.dataset.ch];
      var col = (on && i !== undefined) ? ISLE_COLORS[i % 4] : '';
      el.style.filter = '';
      if (col) el.style.setProperty('--isle', col); else el.style.removeProperty('--isle');
      el.classList.toggle('in-isle', !!col);
    });
    // The integration gates (57, 20, 34, 10) share a single group in the branded
    // SVG, because each belongs to more than one channel. Nothing keyed by
    // channel can reach inside it, so their legs are painted per gate. Every
    // other gate's leg sits in its channel's own group and is already handled,
    // but painting by gate is correct for those too and keeps one code path.
    [].forEach.call(document.querySelectorAll('.pleg'), function (el) {
      var i = isleOfGate[el.dataset.gate];
      var col = (on && i !== undefined) ? ISLE_COLORS[i % 4] : '';
      if (col) el.style.setProperty('--isle', col); else el.style.removeProperty('--isle');
      el.classList.toggle('in-isle', !!col);
    });
    // the gate discs at each end of those channels are part of the island
    [].forEach.call(document.querySelectorAll('.gdisc'), function (el) {
      var i = isleOfGate[el.dataset.gate];
      var col = (on && i !== undefined) ? ISLE_COLORS[i % 4] : '';
      if (col) el.style.setProperty('--isle', col); else el.style.removeProperty('--isle');
      el.classList.toggle('in-isle', !!col);
    });
  };
  var bIsl = document.getElementById('tIslands');
  bIsl.onclick = function () { bIsl.classList.toggle('on'); paintIslands(bIsl.classList.contains('on')); };
  var bBr = document.getElementById('tBridges');
  bBr.onclick = function () { bBr.classList.toggle('on', body.classList.toggle('show-bridges')); };
  document.getElementById('deflist').addEventListener('mousemove', function (e) {
    var el = e.target.closest ? e.target.closest('.brg') : null;
    if (!el) return;
    litGate(+el.dataset.gate);
    var L = (DATA.gateLib || {})[el.dataset.gate] || {};
    showTip(e, '<b>Gate ' + el.dataset.gate + '</b>' + esc(L.name || '') + '<br>' +
      '<span style="opacity:.7">would complete a channel across the split</span>');
  });
  document.getElementById('deflist').addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('.brg') : null;
    if (el) openCard(el, gateLibHtml(+el.dataset.gate), null, +el.dataset.gate);
  });

  // Save the chart exactly as it stands, with a footer of the basics and a line
  // saying which views and filters were on. The visible SVG is cloned, its
  // computed styles baked in (the page's CSS does not travel with it), drawn to
  // a canvas and handed over as a PNG.
  var BAKE = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
    'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'display',
    'visibility', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'filter'];
  function bake(src, dst) {
    var a = src.querySelectorAll('*'), b = dst.querySelectorAll('*');
    var apply = function (from, to) {
      var cs = getComputedStyle(from), css = '';
      for (var i = 0; i < BAKE.length; i++) {
        var v = cs.getPropertyValue(BAKE[i]);
        if (v && v !== 'none' || BAKE[i] === 'display' || BAKE[i] === 'fill') css += BAKE[i] + ':' + v + ';';
      }
      to.setAttribute('style', css);
    };
    apply(src, dst);
    for (var i = 0; i < a.length && i < b.length; i++) apply(a[i], b[i]);
  }
  function activeSvg() {
    if (body.classList.contains('view-mandala')) return document.querySelector('.mandala svg');
    return [].filter.call(document.querySelectorAll('svg.canvas'), function (sv) {
      return getComputedStyle(sv).display !== 'none';
    })[0];
  }
  function stateLine() {
    var bits = [];
    bits.push(body.classList.contains('view-mandala') ? 'Mandala'
      : body.classList.contains('view-plain') ? 'Bodygraph' : 'Circuits');
    var sides = [];
    if (!body.classList.contains('off-s-personality')) sides.push('Personality');
    if (!body.classList.contains('off-s-design')) sides.push('Design');
    bits.push(sides.length ? sides.join(' + ') : 'no placements');
    if (body.classList.contains('nodefined')) bits.push('defined channels hidden');
    if (body.classList.contains('nohang')) bits.push('hanging gates hidden');
    var off = [].filter.call(document.querySelectorAll('.cbx'), function (b) { return !b.checked; })
      .map(function (b) { return b.dataset.id; });
    if (off.length) {
      var on = DATA.circuits.filter(function (c) { return off.indexOf(c.id) < 0; })
        .map(function (c) { return c.name; });
      bits.push(on.length ? 'circuits: ' + on.join(', ') : 'no circuits');
    }
    var pOff = [].filter.call(document.querySelectorAll('.pbx'), function (b) { return !b.checked; });
    if (pOff.length) {
      bits.push('planets: ' + [].filter.call(document.querySelectorAll('.pbx'), function (b) { return b.checked; })
        .map(function (b) { return b.parentNode.textContent.trim(); }).join(', '));
    }
    if (document.getElementById('tIslands').classList.contains('on')) bits.push('islands');
    if (body.classList.contains('show-bridges')) bits.push('bridge gates');
    return bits.join('  ·  ');
  }
  document.getElementById('snap').onclick = function () {
    var svg = activeSvg();
    if (!svg) return;
    var vb = (svg.getAttribute('viewBox') || '').trim().split(' ').map(Number);
    var vw = vb[2] || svg.clientWidth, vh = vb[3] || svg.clientHeight;
    var clone = svg.cloneNode(true);
    bake(svg, clone);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', vw);
    clone.setAttribute('height', vh);
    var st = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    st.textContent = FONTCSS;
    clone.insertBefore(st, clone.firstChild);
    var xml = new XMLSerializer().serializeToString(clone);
    var img = new Image();
    img.onload = function () {
      var S = 2, foot = 210;
      var cv = document.createElement('canvas');
      cv.width = vw * S;
      cv.height = vh * S + foot;
      var g = cv.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(img, 0, 0, vw * S, vh * S);
      var y0 = vh * S + 8;
      g.strokeStyle = 'rgba(132,80,149,.35)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(52, y0); g.lineTo(cv.width - 52, y0); g.stroke();
      var cell = function (label, value, x, y, w) {
        g.fillStyle = 'rgba(28,26,46,.5)';
        g.font = '600 15px Montserrat, sans-serif';
        g.fillText(String(label).toUpperCase(), x, y);
        g.fillStyle = '#1c1a2e';
        g.font = '400 21px Montserrat, sans-serif';
        var t = String(value);
        while (g.measureText(t).width > w && t.length > 4) t = t.slice(0, -2);
        g.fillText(t, x, y + 26);
      };
      var m = {};
      DATA.client.meta.forEach(function (r) { m[r.key] = r.value; });
      var colW = (cv.width - 104) / 4;
      var row1 = ['profile', 'type', 'strategy', 'authority'];
      row1.forEach(function (k, i) {
        cell(k === 'profile' ? 'Profile' : k, m[k] || '', 52 + i * colW, y0 + 36, colW - 18);
      });
      cell('Definition', m.definition || '', 52, y0 + 96, colW - 18);
      cell('Frequencies', m.frequencies || '', 52 + colW, y0 + 96, colW - 18);
      cell('Incarnation Cross', m.cross || '', 52 + colW * 2, y0 + 96, colW * 2 - 18);
      // the brand marks live on the page, not in the chart, so draw them in
      var logo = document.querySelector('.brandmark.logo');
      var know = document.querySelector('.brandmark.know');
      if (logo && logo.complete) g.drawImage(logo, 52, y0 + 132, 132, 66);
      if (know && know.complete) g.drawImage(know, cv.width - 52 - 170, y0 + 148, 170, 42);
      g.fillStyle = 'rgba(28,26,46,.55)';
      g.font = '400 17px Montserrat, sans-serif';
      g.fillText(stateLine(), 200, y0 + 172);
      var a = document.createElement('a');
      a.download = DATA.client.name + ' - ' + stateLine().split('  ·  ')[0] + '.png';
      a.href = cv.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
  };

  // one click back to the whole chart
  document.getElementById('reset').onclick = function () {
    [].forEach.call(document.querySelectorAll('.cbx, .pbx'), function (b) { b.checked = true; });
    sync();
    document.getElementById('planets').dispatchEvent(new Event('change', { bubbles: true }));
    ['off-s-personality', 'off-s-design', 'nodefined', 'nohang', 'notables', 'show-bridges']
      .forEach(function (c) { body.classList.remove(c); });
    ['defined', 'hang', 'sideP', 'sideD', 'tables'].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.classList.add('on');
    });
    bIsl.classList.remove('on');
    bBr.classList.remove('on');
    paintIslands(false);
    [].forEach.call(document.querySelectorAll('.pgrp'), function (b) { b.classList.add('on'); });
    [].forEach.call(document.querySelectorAll('svg.canvas'), function (sv) {
      sv.setAttribute('viewBox', sv.dataset.vbWide);
    });
    closeCard();
    view('plain');
    relight();
  };
  document.getElementById('ptabs').hidden = false;

  // the defined channels, in gate order
  document.getElementById('chanlist').innerHTML = (DATA.client.channelList || []).map(function (c) {
    var col = (DATA.circuits.filter(function (x) { return x.id === c.circuit; })[0] || {}).color || '#845095';
    return '<div class="chan-item" data-ch="' + c.key + '">' +
      '<span class="sw" style="background:' + col + '"></span>' + c.label + '</div>';
  }).join('') || '<div class="chan-item">No defined channels.</div>';

  // tabs
  [].forEach.call(document.querySelectorAll('.tabbtn'), function (b) {
    b.onclick = function () {
      [].forEach.call(document.querySelectorAll('.tabbtn'), function (x) { x.classList.toggle('on', x === b); });
      ['home', 'dates', 'stats'].forEach(function (t) {
        document.getElementById('tab-' + t).hidden = (t !== b.dataset.tab);
      });
    };
  });

  // dates tab
  var D = DATA.client.dates || {};
  var datesHtml = '<h4>Birth</h4><div class="line">' + esc(D.birth || '') +
    (D.place ? '<br><span>' + esc(D.place) + '</span>' : '') + '</div>' +
    '<h4>Design</h4><div class="line">' + esc(D.design || '') + '</div>';
  var cyc = DATA.client.cycles || [];
  if (cyc.length) {
    datesHtml += '<h4>Cycles</h4>' + cyc.map(function (c, i) {
      return '<div class="cyc" data-cyc="' + i + '"><b>' + esc(c.label) + '</b>' +
        '<span>' + esc(c.date) + ' &middot; ' + esc(c.status) + '</span></div>';
    }).join('');
  } else {
    datesHtml += '<h4>Cycles</h4><div class="line"><span>No timeline chapter in this Foundation report.</span></div>';
  }
  document.getElementById('tab-dates').innerHTML = datesHtml;
  document.getElementById('tab-dates').addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('.cyc') : null;
    if (!el) return;
    var c = cyc[+el.dataset.cyc];
    openCard(el, '<b>' + esc(c.label) + '</b><span class="kn">' + esc(c.date) + '</span>' +
      tags([{ text: c.status }]) + prose(c.text));
  });

  // stats tab
  (function () {
    var P = DATA.placements || [], L = DATA.gateLib || {};
    var tally = function (keyFn) {
      var o = {};
      P.forEach(function (p) { var k = keyFn(p); if (k) o[k] = (o[k] || 0) + 1; });
      return o;
    };
    // each row remembers which placements it counts, so hovering it can light
    // them on the chart and in the columns
    var table = function (title, rows, kind) {
      var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
      return '<details class="drop k-' + kind + '"><summary>' + title + '</summary>' + rows.map(function (r) {
        var pl = (r[2] || []).map(function (p) { return p.side + ':' + p.pid; }).join(',');
        return '<div class="bar' + (r[3] ? ' ' + r[3] : '') + '" data-kind="' + kind +
          '" data-key="' + esc(r[0]) + '" data-pl="' + pl + '">' +
          '<i>' + esc(r[0]) + '</i><div class="track"><div class="fill" style="width:' +
          Math.round((r[1] / max) * 100) + '%"></div></div><b>' + r[1] + '</b></div>';
      }).join('') + '</details>';
    };
    var pick = function (fn) { return P.filter(fn); };
    var lineRows = [1, 2, 3, 4, 5, 6].map(function (n) {
      var list = pick(function (p) { return p.line === n; });
      return ['Line ' + n, list.length, list];
    });

    var group = function (p) {
      var c = (L[p.gate] || {}).circuit || '';
      if (!c) return '';
      return c.split(':')[0].trim();
    };
    var groupRows = ['Individual', 'Collective', 'Tribal', 'Integration'].map(function (g) {
      var list = pick(function (p) { return group(p) === g; });
      return [g, list.length, list];
    });

    var byCenter = tally(function (p) { return (L[p.gate] || {}).center; });
    var centerRows = Object.keys(byCenter).sort(function (a, b) { return byCenter[b] - byCenter[a]; })
      .map(function (k) {
        return [k, byCenter[k], pick(function (p) { return (L[p.gate] || {}).center === k; })];
      });

    var byGate = {};
    P.forEach(function (p) { (byGate[p.gate] = byGate[p.gate] || []).push(p); });
    var rep = Object.keys(byGate).filter(function (g) { return byGate[g].length > 1; })
      .sort(function (a, b) { return byGate[b].length - byGate[a].length || a - b; });
    var repHtml = '<details class="drop"><summary>Replicated Gates</summary>' + (rep.length
      ? rep.map(function (g) {
          var list = byGate[g].map(function (p) {
            return (p.side === 'design' ? 'D' : 'P') + ' ' + p.planet + ' ' + p.gate + '.' + p.line;
          }).join(', ');
          return '<div class="cyc" data-gate="' + g + '"><b>Gate ' + g + ' &times; ' + byGate[g].length + '</b>' +
            '<span>' + esc(list) + '</span></div>';
        }).join('')
      : '<div class="line"><span>No gate is activated more than once.</span></div>') + '</details>';

    // Activations by sign: the wheel is fixed against the ecliptic, so every
    // placement already names a longitude and therefore a sign. Ordered round
    // the zodiac rather than by count, because that is the order she reads it in.
    // Sign is where the planet actually is. Whole numbers, no splitting.
    var ELEMENTS = [
      ['Fire', ['Aries', 'Leo', 'Sagittarius']],
      ['Earth', ['Taurus', 'Virgo', 'Capricorn']],
      ['Air', ['Gemini', 'Libra', 'Aquarius']],
      ['Water', ['Cancer', 'Scorpio', 'Pisces']]
    ];
    var glyphOf = {};
    (DATA.zodiac || []).forEach(function (z) { glyphOf[z.name] = z.glyph; });
    // Grouped by element, because the balance between the four is what gets read
    // first and counting it by hand off twelve rows is a chore. An element with
    // nothing in it is kept: a missing element says as much as a full one.
    var signRows = [];
    ELEMENTS.forEach(function (e) {
      var inEl = pick(function (p) { return e[1].indexOf(p.sign) > -1; });
      signRows.push([e[0], inEl.length, inEl, 'grp']);
      e[1].forEach(function (name) {
        var list = pick(function (p) { return p.sign === name; });
        if (list.length) signRows.push([(glyphOf[name] || '') + '  ' + name, list.length, list, 'sub']);
      });
    });

    // Twelve of the 384 gate-lines cross a sign boundary. Anything sitting on
    // one is named, with the side its exact degree puts it on, because that is
    // visible on the mandala and worth being able to check.
    var onEdge = pick(function (p) { return !!p.onBoundary; });
    var transHtml = '';
    if (onEdge.length) {
      transHtml = '<div class="cyc" data-kind="trans" data-key="On a sign boundary" data-pl="' +
        onEdge.map(function (p) { return p.side + ':' + p.pid; }).join(',') + '">' +
        '<b>On a sign boundary &middot; ' + onEdge.length + '</b><span>' +
        onEdge.map(function (p) {
          return (p.side === 'design' ? 'D ' : 'P ') + p.planet + ' ' + p.gate + '.' + p.line +
            ' (' + p.onBoundary.join('/') + ') falls in ' + p.sign + ' at ' +
            Math.floor(p.signDeg) + '\u00b0';
        }).join(' &middot; ') + '</span></div>';
    }

    // Conjunctions: two or more planets sharing a gate on the SAME side. The
    // Replicated Gates section above counts a gate held on both sides; this is
    // the tighter thing, planets sitting together within one side.
    var conj = [];
    ['personality', 'design'].forEach(function (side) {
      var bySideGate = {};
      P.filter(function (p) { return p.side === side; }).forEach(function (p) {
        (bySideGate[p.gate] = bySideGate[p.gate] || []).push(p);
      });
      Object.keys(bySideGate).forEach(function (g) {
        if (bySideGate[g].length > 1) conj.push({ side: side, gate: +g, list: bySideGate[g] });
      });
    });
    conj.sort(function (a, b) { return b.list.length - a.list.length || a.gate - b.gate; });
    var conjHtml = '<details class="drop"><summary>Conjunctions</summary>' + (conj.length
      ? conj.map(function (c) {
          var who = c.list.map(function (p) { return p.planet + ' ' + p.gate + '.' + p.line; }).join(', ');
          var pl = c.list.map(function (p) { return p.side + ':' + p.pid; }).join(',');
          return '<div class="cyc" data-gate="' + c.gate + '" data-pl="' + pl + '" data-kind="conj" ' +
            'data-key="' + (c.side === 'design' ? 'Design' : 'Personality') + ' Gate ' + c.gate + '">' +
            '<b>' + (c.side === 'design' ? 'Design' : 'Personality') + ' &middot; Gate ' + c.gate +
            ' &times; ' + c.list.length + '</b><span>' + esc(who) + '</span></div>';
        }).join('')
      : '<div class="line"><span>No two planets share a gate on the same side.</span></div>') + '</details>';

    document.getElementById('tab-stats').innerHTML =
      table('Activations by Line', lineRows, 'line') +
      table('Activations by Circuit', groupRows, 'group') +
      table('Activations by Center', centerRows, 'center') +
      table('Activations by Astrological Sign', signRows, 'sign').replace('</details>', transHtml + '</details>') +
      repHtml +
      conjHtml;
    document.getElementById('tab-stats').addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-gate]') : null;
      if (el) openCard(el, gateLibHtml(+el.dataset.gate), null, +el.dataset.gate);
    });

    var statTip = function (el, e) {
      var keys = (el.dataset.pl || '').split(',').filter(Boolean);
      var list = keys.map(function (k) { return placeBy[k.split(':')[0] + '|' + k.split(':')[1]]; })
        .filter(Boolean);
      var gates = list.map(function (p) { return p.gate; });
      litGate(gates);
      markRowsFor(list);
      var head = el.dataset.key, sub = '';
      if (el.dataset.kind === 'line') {
        var n = String(el.dataset.key).split(' ')[1];
        // the keynote only: line meanings are Kaycee's to write, not mine
        head = 'Line ' + n + ': ' + ((DATA.lineNames || {})[n] || '');
      } else if (el.dataset.kind === 'group') {
        sub = (DATA.groupInfo || {})[el.dataset.key] || '';
      } else if (el.dataset.kind === 'center') {
        var c = DATA.centers.filter(function (x) { return x.name === el.dataset.key; })[0];
        if (c) sub = c.fns.join(' + ') + (c.stateLabel ? ' &middot; ' + c.stateLabel : '') +
          (c.biology ? '. ' + c.biology : '');
      } else if (el.dataset.kind === 'sign' && el.className.indexOf('grp') > -1) {
        // an element is a total, so the useful breakdown is which of its three
        // signs carries the weight, not twelve planets and their degrees
        var grp = ELEMENTS.filter(function (x) { return x[0] === el.dataset.key; })[0];
        sub = grp ? grp[1].map(function (n) {
          return n + ' ' + list.filter(function (p) { return p.sign === n; }).length;
        }).join(' &middot; ') : '';
      } else if (el.dataset.kind === 'sign') {
        // where in the sign each one falls, which is the thing worth seeing
        sub = list.map(function (p) {
          return (p.side === 'design' ? 'D ' : 'P ') + p.planet + ' ' +
            Math.floor(p.signDeg) + '\u00b0';
        }).join(' &middot; ');
      } else if (el.dataset.kind === 'conj') {
        var g0 = list.length ? list[0].gate : null;
        var GL = g0 ? (DATA.gateLib || {})[g0] : null;
        if (GL) sub = esc(GL.name) + (GL.center ? ' &middot; ' + esc(GL.center) : '');
      }
      var gl = list.map(function (p) { return p.gate + '.' + p.line; }).join(', ');
      showTip(e, '<b>' + esc(head) + '</b>' + (sub ? sub + '<br>' : '') +
        (gl ? '<span style="opacity:.7">' + esc(gl) + '</span>' : 'None in this chart.'));
    };
    document.getElementById('tab-stats').addEventListener('mousemove', function (e) {
      var el = e.target.closest ? e.target.closest('.bar, .cyc[data-pl]') : null;
      if (el) { statTip(el, e); return; }
      var g = e.target.closest ? e.target.closest('[data-gate]') : null;
      if (g) return;
      if (!pinned) { litGate(null); markRowsFor(null); }
      tip.hidden = true;
    });
    document.getElementById('tab-stats').addEventListener('mouseleave', function () {
      if (!pinned) { litGate(null); markRowsFor(null); }
      tip.hidden = true;
    });
  })();

  // the channel list drives the chart like anything else
  var cl = document.getElementById('chanlist');
  cl.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('.chan-item') : null;
    if (el && el.dataset.ch) {
      var lc = chByKey[el.dataset.ch];
      openCard(el, chanHtml(lc), el.dataset.ch, [lc.srcGate, lc.tgtGate]);
    }
  });
  cl.addEventListener('mousemove', function (e) {
    var el = e.target.closest ? e.target.closest('.chan-item') : null;
    if (!el || !el.dataset.ch || pinned) return;
    var c = chByKey[el.dataset.ch];
    hot(el.dataset.ch);
    litGate([c.srcGate, c.tgtGate]);
    markRowsFor((DATA.placements || []).filter(function (p) {
      return p.gate === c.srcGate || p.gate === c.tgtGate;
    }));
  });
  cl.addEventListener('mouseleave', function () {
    if (!pinned) { hot(null); litGate(null); markRowsFor(null); }
  });
  // ── today's read ────────────────────────────────────────────────────────
  // The paragraph is quoted from Kaycee's morning report. A phrase only becomes
  // hoverable when it names something in that day's completions, so nothing is
  // guessed out of free text: a number that is not a gate in play stays plain.
  // Written without regular expressions on purpose. This script lives inside a
  // template literal, which eats single backslashes, so every escape class here
  // would silently become a literal letter.
  var SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TODAY_LOCAL = (function () {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  })();
  function shortDate(iso) {
    var b = String(iso).split('-');
    return SHORT_MONTHS[+b[1] - 1] + ' ' + (+b[2]) + ', ' + b[0];
  }

  // The read is not baked into the chart any more, apart from the day it was
  // built for, which stays as an offline fallback. Everything else is fetched,
  // so this morning's words reach every chart the moment Kaycee's report runs
  // rather than waiting for all 28 to be rebuilt and republished.
  var readCache = {}, readWanted = null;
  // The baked read is a FALLBACK for when the fetch fails, not a cache entry.
  // Seeding the cache with it meant the page already "had" today's read and
  // never asked the server, so a read corrected after the chart was published
  // stayed wrong on the page forever. Joe Goodin's 702-word read kept its
  // swallowed data tables for exactly this reason after the parser was fixed.
  function chartToken() {
    var parts = location.pathname.split('/c/');
    var t = parts.length > 1 ? parts[1].split('/')[0] : '';
    return t.length === 32 ? t : '';
  }
  function fetchRead(d) {
    readWanted = d;
    if (readCache[d] !== undefined) { renderRead(readCache[d], d); return; }
    var tok = chartToken();
    // opened as a file rather than through the link: only the baked day exists
    if (!tok) { renderRead(null, d); return; }
    renderRead(null, d);
    fetch('/api/read?token=' + tok + '&date=' + d).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) throw new Error('no read');
      readCache[d] = j.read || null;
      if (readWanted === d) renderRead(j.read || null, d);
    }).catch(function () {
      if (readWanted !== d) return;
      // The copy baked in at publish time, used only when the server cannot be
      // reached, and only for the day it was baked for.
      if (DATA.read && DATA.read.date === d) { renderRead(DATA.read, d); return; }
      // a read that cannot be fetched is not a read that does not exist, and
      // saying so wrongly would have a client think Kaycee skipped their day
      var el = document.getElementById('todayread');
      if (el) el.innerHTML = '<div class="noread">Could not load the reading for ' +
        esc(shortDate(d)) + '. The chart above is still that day&rsquo;s sky.</div>';
    });
  }

  /** Paint one day's read into the TODAY section. Called for the day the chart
   *  was built with, and again whenever the date picker lands on a day Kaycee
   *  has written a report for. */
  function renderRead(R, forDate) {
    var lab0 = document.getElementById('todaylab');
    var readEl = document.getElementById('todayread');
    var listEl = document.getElementById('todaylist');
    var survey = document.getElementById('survey');
    if (!lab0) return;
    var today = TODAY_LOCAL;
    var day = (R && R.date) || forDate || today;
    // Kaycee writes one of these each morning, so a day she has not written is
    // ordinary rather than an error. The survey asks whether the read landed:
    // with no read there is nothing to answer, so it goes away.
    if (survey) survey.style.display = R ? '' : 'none';
    if (!R) {
      lab0.textContent = shortDate(day);
      readEl.innerHTML = '<div class="noread">No written read for this day. ' +
        "The chart above still shows that day's sky.</div>";
      listEl.innerHTML = '';
      return;
    }
    var gateOf = {}, chById = {}, chByName = {};
    R.completions.forEach(function (c) {
      gateOf[c.transitGate] = 1; gateOf[c.natalGate] = 1;
      chById[c.channel] = c.channel;
      if (c.channelName) chByName[c.channelName.toLowerCase()] = c.channel;
    });
    var isDigit = function (ch) { return ch >= '0' && ch <= '9'; };
    var isWordCh = function (ch) { return !!ch && /[A-Za-z0-9]/.test(ch); };

    var lab = lab0;
    var written = R.writtenAt ? new Date(R.writtenAt) : null;
    lab.textContent = (R.date === today ? 'TODAY · ' : '') + shortDate(R.date) +
      (written ? ' · read written ' + written.toISOString().slice(11, 16) + ' UTC' : '');

    // one pass over the text, wrapping gate numbers and channel ids
    var src = R.paragraph, out = '', i = 0;
    while (i < src.length) {
      var ch = src[i];
      if (isDigit(ch)) {
        var j = i; while (j < src.length && isDigit(src[j])) j++;
        var num = src.slice(i, j);
        // "12-22" style channel id
        if (src[j] === '-' && isDigit(src[j + 1] || '')) {
          var k = j + 1; while (k < src.length && isDigit(src[k])) k++;
          var pair = src.slice(i, k);
          if (chById[pair]) {
            out += '<span class="rref" data-ch="' + pair + '">' + pair + '</span>';
            i = k; continue;
          }
        }
        if (gateOf[+num] && !isWordCh(src[j])) {
          out += '<span class="rref" data-gate="' + num + '">' + num + '</span>';
          i = j; continue;
        }
        out += esc(num); i = j; continue;
      }
      out += esc(ch); i++;
    }

    // channel names, matched literally: they are plain words like "Mating"
    Object.keys(chByName).forEach(function (name) {
      var key = chByName[name], lower = out.toLowerCase(), at = 0, acc = '';
      while (true) {
        var p = lower.indexOf(name, at);
        if (p < 0) { acc += out.slice(at); break; }
        var before = p === 0 ? ' ' : out[p - 1], after = out[p + name.length] || ' ';
        var inTag = out.lastIndexOf('<', p) > out.lastIndexOf('>', p);
        if (!isWordCh(before) && !isWordCh(after) && !inTag) {
          acc += out.slice(at, p) + '<span class="rref" data-ch="' + key + '">' +
            out.slice(p, p + name.length) + '</span>';
        } else {
          acc += out.slice(at, p + name.length);
        }
        at = p + name.length;
      }
      out = acc;
    });
    readEl.innerHTML = out;

    listEl.innerHTML = R.completions.map(function (c) {
      return '<div class="cmp" data-ch="' + c.channel + '" data-gate="' + c.transitGate + '">' +
        '<b>' + esc(c.planet) + '</b> in ' + c.transitGate +
        ' completes <b>' + esc(c.channel) + '</b> ' + esc(c.channelName) +
        ' with their ' + c.natalGate +
        (c.bridges ? ' <span class="brdg">bridges the split</span>' : '') +
        (c.center ? ' · ' + esc(c.center) : '') +
        ' [' + esc(c.duration) + ']</div>';
    }).join('');
  }

  if (DATA.sky) {
    renderRead(DATA.read, TODAY_LOCAL);

    // hovering the prose or a completion lights exactly what the rest of the
    // panel lights, so the read and the chart behave as one object
    var liveRef = function (el) {
      if (!el) { hot(null); litGate(null); markRowsFor(null); return; }
      var chk = el.dataset.ch, g = el.dataset.gate;
      var c = chk ? chByKey[chk] : null;
      if (c) { hot(chk); litGate([c.srcGate, c.tgtGate]); }
      else if (g) { hot(null); litGate(+g); }
      markRowsFor((DATA.placements || []).filter(function (p) {
        return c ? (p.gate === c.srcGate || p.gate === c.tgtGate) : p.gate === +g;
      }));
    };
    var sec = document.getElementById('todaysec');
    sec.addEventListener('mousemove', function (e) {
      var el = e.target.closest ? e.target.closest('.rref, .cmp') : null;
      if (!pinned) liveRef(el);
    });
    sec.addEventListener('mouseleave', function () { if (!pinned) liveRef(null); });

    // ── the survey ────────────────────────────────────────────────────────
    var picked = null;
    var msg = document.getElementById('qmsg');
    [].forEach.call(document.querySelectorAll('.qbtn'), function (b) {
      b.onclick = function () {
        picked = b.dataset.a;
        [].forEach.call(document.querySelectorAll('.qbtn'), function (o) {
          o.classList.toggle('on', o === b);
        });
      };
    });
    document.getElementById('qgo').onclick = function () {
      if (!picked) { msg.textContent = 'Pick one first.'; return; }
      var parts = location.pathname.split('/c/');
      var tok = parts.length > 1 ? parts[1].split('/')[0] : '';
      if (tok.length !== 32) { msg.textContent = 'Only works on your shared link.'; return; }
      msg.textContent = 'Sending…';
      fetch('/api/chart-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tok, answer: picked, readDate: R.date,
          comment: document.getElementById('qnote').value,
        }),
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.ok) { msg.textContent = ''; document.getElementById('survey').classList.add('sent'); }
        else { msg.textContent = 'That did not send, sorry.'; }
      }).catch(function () { msg.textContent = 'That did not send, sorry.'; });
    };
  }

  document.getElementById('siderow').hidden = false;
  document.getElementById('viewsec').hidden = false;
  document.getElementById('viewrow').hidden = false;
  // ── the date and time picker ──────────────────────────────────────────────
  // The chart is a baked file, so moving to another moment cannot re-render it
  // on the server. Instead the page asks for that moment's sky and repaints the
  // transit canvas in place: legs, discs, gate numbers, centres and the transit
  // column. The words that go with a day are baked in rather than fetched,
  // because they come out of Kaycee's own morning reports.
  //
  // Date AND time, because the Moon changes line several times a day and a
  // client who knows when something happened wants the sky at that hour, not at
  // an anchor hour someone else picked. The fields are the viewer's own local
  // clock, labelled with their zone; the instant is converted to UTC before it
  // is asked for, so the server never has to reason about anybody's timezone.
  //
  // The pills are the client's own cycle dates, read straight off their
  // Foundation report's timeline, so looking ahead to a Saturn return is one
  // click rather than arithmetic.
  (function () {
    var sec = document.getElementById('datesec');
    if (!sec || !DATA.sky) return;
    var dfield = document.getElementById('dfield');
    var tfield = document.getElementById('tfield');
    var nowBtn = document.getElementById('dtoday');
    var natal = {};
    (DATA.natalGates || []).forEach(function (g) { natal[g] = 1; });
    var UP = String.fromCharCode(0x25B2), DOWN = String.fromCharCode(0x25BC);
    var INK = '#2b2b33', DIM = '#6b6790';
    var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
      'august', 'september', 'october', 'november', 'december'];

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function localDate(d) {
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function localTime(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    // a local wall clock reading, back to the instant it names
    function instant(ymd, hm) {
      var a = ymd.split('-'), b = hm.split(':');
      return new Date(+a[0], +a[1] - 1, +a[2], +b[0], +b[1], 0, 0);
    }
    function clock12(hm) {
      var b = hm.split(':'), h = +b[0], ap = h < 12 ? 'AM' : 'PM';
      h = h % 12; if (h === 0) h = 12;
      return h + ':' + b[1] + ' ' + ap;
    }
    // "January 26, 2015" out of the report, without a regular expression: this
    // script lives in a template literal that eats the backslashes one needs.
    function fromLongDate(txt) {
      if (!txt) return null;
      var bits = String(txt).replace(',', ' ').split(' ').filter(Boolean);
      if (bits.length < 3) return null;
      var mi = MONTHS.indexOf(bits[0].toLowerCase());
      var day = parseInt(bits[1], 10), year = parseInt(bits[2], 10);
      if (mi < 0 || !day || !year) return null;
      return year + '-' + pad(mi + 1) + '-' + pad(day);
    }
    var TZ = (function () {
      try {
        var parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
          .formatToParts(new Date());
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].type === 'timeZoneName') return parts[i].value;
        }
      } catch (e) { /* older browser: the zone label is a nicety, not the data */ }
      return '';
    })();
    if (TZ) tfield.title = 'Your local time (' + TZ + ')';

    // the moment the file was built, as the viewer's own clock reads it
    var baked = new Date(DATA.sky.date + 'T' + DATA.sky.time + ':00Z');
    var curD = localDate(baked), curT = localTime(baked);
    var cache = {};
    cache[DATA.sky.date + 'T' + DATA.sky.time] = DATA.sky.positions;

    // ── the cycle pills ──────────────────────────────────────────────────────
    var pills = ((DATA.client || {}).cycles || []).map(function (c) {
      return { label: c.label, date: fromLongDate(c.date), status: c.status };
    }).filter(function (c) { return !!c.date; });
    if (pills.length) {
      var wrap = document.createElement('div');
      wrap.className = 'cycrow';
      wrap.innerHTML = pills.map(function (c, i) {
        return '<button class="cycpill" data-i="' + i + '" title="' + esc(c.label) +
          ' &middot; ' + esc(c.status) + '">' + esc(c.label) + '</button>';
      }).join('');
      sec.appendChild(wrap);
      wrap.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.cycpill') : null;
        if (b) go(pills[+b.dataset.i].date, curT);
      });
    }

    // ── painting one moment onto the chart ───────────────────────────────────
    function repaint(d, t, positions) {
      var lit = {};
      positions.forEach(function (p) { lit[p.gate] = 1; });

      // the sky's own gates: charcoal when the transit is there, empty when not
      [].forEach.call(document.querySelectorAll('svg.canvas.transit .tleg, svg.canvas.transit .tdisc'),
        function (el) {
          el.setAttribute('fill', lit[el.dataset.gate] ? INK : 'none');
        });
      // a number is only white while there is a disc under it to sit on
      [].forEach.call(document.querySelectorAll('svg.canvas.transit .pnum[data-gate]'), function (n) {
        var g = n.dataset.gate;
        if (natal[g]) return;
        var on = !!lit[g];
        n.classList.toggle('on-disc', on);
        n.setAttribute('fill', on ? '#ffffff' : DIM);
      });

      // a centre a transit has just defined has to read as defined, and a
      // centre that was only defined a moment ago has to open again
      var have = {};
      Object.keys(natal).forEach(function (g) { have[g] = 1; });
      Object.keys(lit).forEach(function (g) { have[g] = 1; });
      var def = {};
      (DATA.channels || []).forEach(function (c) {
        if (have[c.srcGate] && have[c.tgtGate]) { def[c.cFrom] = 1; def[c.cTo] = 1; }
      });
      [].forEach.call(document.querySelectorAll('svg.canvas.transit .cshape'), function (el) {
        var open = el.getAttribute('data-openfill'), on = el.getAttribute('data-litfill');
        if (open == null) return;
        el.setAttribute('fill', def[el.dataset.center] ? on : open);
      });

      // the transit column, row by row, so the eye can still run across
      var byP = {};
      positions.forEach(function (p) { byP[p.planet] = p; });
      [].forEach.call(document.querySelectorAll('.trow'), function (r) {
        var p = byP[r.dataset.planet];
        if (!p) return;
        r.dataset.gate = p.gate;
        r.dataset.line = p.line;
      });
      [].forEach.call(document.querySelectorAll('.tgl'), function (t) {
        var p = byP[t.dataset.planet];
        if (p) t.textContent = p.gate + '.' + p.line;
      });
      [].forEach.call(document.querySelectorAll('.tfx'), function (t) {
        var p = byP[t.dataset.planet];
        if (p) t.textContent = p.fixingState === 'Exalted' ? UP : p.fixingState === 'Detriment' ? DOWN : '';
      });
      [].forEach.call(document.querySelectorAll('.tdate'), function (e) { e.textContent = shortDate(d); });
      [].forEach.call(document.querySelectorAll('.ttime'), function (e) {
        e.textContent = clock12(t) + (TZ ? ' ' + TZ : '');
      });

      // and the words, which belong to the calendar day rather than the hour
      fetchRead(d);
    }

    // ── moving between moments ───────────────────────────────────────────────
    function go(d, t) {
      if (busyFlag || !d || !t || (d === curD && t === curT)) return;
      curD = d; curT = t;
      dfield.value = d;
      tfield.value = t;
      [].forEach.call(document.querySelectorAll('.cycpill'), function (b) {
        b.classList.toggle('on', pills[+b.dataset.i].date === d);
      });
      var iso = instant(d, t).toISOString();
      var utcD = iso.slice(0, 10), utcT = iso.slice(11, 16), key = utcD + 'T' + utcT;
      if (cache[key]) { repaint(d, t, cache[key]); litGate(null); return; }
      busyFlag = true;
      sec.classList.add('loading');
      fetch('/api/sky?date=' + utcD + '&time=' + utcT).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok) throw new Error(j && j.error ? j.error : 'no sky');
        // A server that has not learned about the time parameter answers for
        // its own anchor hour and says nothing about it, which would put the
        // wrong sky on the chart under the right clock. Make it say which
        // moment it actually cast, and refuse anything else.
        if (j.time !== utcT || j.date !== utcD) throw new Error('server sent a different moment');
        cache[key] = j.positions;
        if (curD === d && curT === t) { repaint(d, t, j.positions); litGate(null); }
      }).catch(function () {
        // loud rather than a chart that quietly shows the wrong moment
        document.getElementById('todaylab').textContent = shortDate(d);
        var read = document.getElementById('todayread');
        if (read) read.innerHTML = '<div class="noread">Could not get the sky for ' +
          esc(shortDate(d)) + ' at ' + esc(clock12(t)) + '. The chart still shows the ' +
          'moment it was built for, so nothing on it is wrong.</div>';
        document.getElementById('todaylist').innerHTML = '';
      }).then(function () {
        busyFlag = false;
        sec.classList.remove('loading');
      });
    }
    var busyFlag = false;

    function shiftDay(days) {
      var d = instant(curD, curT);
      d.setDate(d.getDate() + days);
      go(localDate(d), localTime(d));
    }

    dfield.value = curD;
    tfield.value = curT;
    nowBtn.classList.add('show');
    fetchRead(curD);

    // A baked file opens on the moment it was BUILT, which is the moment it
    // stopped being now. Kaycee opened her chart the next morning and got the
    // previous evening's sky and the previous day's read, both correct for the
    // date the page thought it was on and both wrong for her. So if the build
    // moment is not still roughly now, move to now before anyone reads it.
    var STALE_MS = 45 * 60 * 1000;
    var nowStamp = new Date();
    if (Math.abs(nowStamp.getTime() - baked.getTime()) > STALE_MS) {
      go(localDate(nowStamp), localTime(nowStamp));
    }
    [].forEach.call(document.querySelectorAll('.ttime'), function (e) {
      e.textContent = clock12(curT) + (TZ ? ' ' + TZ : '');
    });
    dfield.addEventListener('change', function () { if (dfield.value) go(dfield.value, curT); });
    tfield.addEventListener('change', function () { if (tfield.value) go(curD, tfield.value.slice(0, 5)); });
    document.getElementById('dprev').addEventListener('click', function () { shiftDay(-1); });
    document.getElementById('dnext').addEventListener('click', function () { shiftDay(1); });
    nowBtn.addEventListener('click', function () {
      var n = new Date();
      go(localDate(n), localTime(n));
    });
  })();

  document.getElementById('actrow').hidden = false;
  document.title = DATA.client.name + ' - Delphi Human Design';

  // planet checkboxes drive the tables, the marks on the chart and the mandala
  document.getElementById('planets').innerHTML = DATA.planets.map(function (p) {
    return '<label class="cc"><input type="checkbox" class="pbx" data-id="' + p.id + '" checked>' + p.name + '</label>';
  }).join('');
  document.getElementById('planets').addEventListener('change', function () {
    [].forEach.call(document.querySelectorAll('.pbx'), function (b) {
      body.classList.toggle('off-p-' + b.dataset.id, !b.checked);
    });
    relight();
  });
  var toggleBtn = function (id, cls) {
    var b = document.getElementById(id);
    b.onclick = function () { b.classList.toggle('on', !body.classList.toggle(cls)); relight(); };
  };
  toggleBtn('defined', 'nodefined');
  toggleBtn('hang', 'nohang');
  toggleBtn('sideP', 'off-s-personality');
  toggleBtn('sideD', 'off-s-design');
  var setPlanets = function (on) {
    [].forEach.call(document.querySelectorAll('.pbx'), function (b) { b.checked = on; });
    document.getElementById('planets').dispatchEvent(new Event('change', { bubbles: true }));
  };
  document.getElementById('pAll').onclick = function () { setPlanets(true); };
  document.getElementById('pNone').onclick = function () { setPlanets(false); };

  // group toggles: the cross (Sun and Earth, both sides), inner, social, outer
  var GROUPS = [
    { id: 'cross', label: 'Cross', ids: ['sun', 'earth'] },
    { id: 'nodes', label: 'Nodes', ids: ['north-node', 'south-node'] },
    { id: 'inner', label: 'Inner', ids: ['moon', 'mercury', 'venus', 'mars'] },
    { id: 'outer', label: 'Outer', ids: ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] }
  ];
  var gh = document.getElementById('pgroups');
  gh.innerHTML = GROUPS.map(function (g) {
    return '<button class="pgrp on" data-grp="' + g.id + '">' + g.label + '</button>';
  }).join('');
  gh.addEventListener('click', function (e) {
    var b = e.target.closest('.pgrp');
    if (!b) return;
    var g = GROUPS.filter(function (x) { return x.id === b.dataset.grp; })[0];
    var boxes = g.ids.map(function (id) { return document.querySelector('.pbx[data-id="' + id + '"]'); }).filter(Boolean);
    var allOn = boxes.every(function (x) { return x.checked; });
    boxes.forEach(function (x) { x.checked = !allOn; });
    b.classList.toggle('on', !allOn);
    document.getElementById('planets').dispatchEvent(new Event('change', { bubbles: true }));
  });
  // a group button reflects its planets when they are toggled individually
  document.getElementById('planets').addEventListener('change', function () {
    GROUPS.forEach(function (g) {
      var on = g.ids.some(function (id) {
        var b = document.querySelector('.pbx[data-id="' + id + '"]');
        return b && b.checked;
      });
      var btn = gh.querySelector('.pgrp[data-grp="' + g.id + '"]');
      if (btn) btn.classList.toggle('on', on);
    });
  });
  // hiding the tables also crops the canvas in, so the diagram fills the space
  var tbtn = document.getElementById('tables');
  tbtn.onclick = function () {
    var off = body.classList.toggle('notables');
    tbtn.classList.toggle('on', !off);
    [].forEach.call(document.querySelectorAll('svg.canvas'), function (sv) {
      sv.setAttribute('viewBox', off ? sv.dataset.vbCore : sv.dataset.vbWide);
    });
  };
  var view = function (id) {
    body.classList.toggle('view-astro', id === 'astro');
    body.classList.toggle('view-mandala', id === 'mandala');
    body.classList.toggle('view-plain', id === 'plain');
    body.classList.toggle('view-transit', id === 'transit');
    document.getElementById('vBody').classList.toggle('on', id === 'body');
    document.getElementById('vPlain').classList.toggle('on', id === 'plain');
    document.getElementById('vMandala').classList.toggle('on', id === 'mandala');
    var vt = document.getElementById('vTransit');
    if (vt) vt.classList.toggle('on', id === 'transit');
    var va = document.getElementById('vAstro');
    if (va) va.classList.toggle('on', id === 'astro');
  };
  document.getElementById('vBody').onclick = function () { view('body'); };
  view('plain');
  document.getElementById('vPlain').onclick = function () { view('plain'); };
  document.getElementById('vMandala').onclick = function () { view('mandala'); };
  var vt0 = document.getElementById('vTransit');
  if (vt0) vt0.onclick = function () { view('transit'); };
  var va0 = document.getElementById('vAstro');
  if (va0) va0.onclick = function () { view('astro'); };

  // The Astrology view answers with astrology. The Human Design sections of the
  // home tab are hidden by CSS in this view and these stand in their place, so
  // the panel is talking about the same chart as the wheel beside it.
  if (DATA.astro) {
    var A = DATA.astro;
    var HOUSE_N = { First_House: 1, Second_House: 2, Third_House: 3, Fourth_House: 4,
      Fifth_House: 5, Sixth_House: 6, Seventh_House: 7, Eighth_House: 8,
      Ninth_House: 9, Tenth_House: 10, Eleventh_House: 11, Twelfth_House: 12 };
    var ZSIGN = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
      'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
    var MINOR_PT = { Chiron: 1, Mean_Lilith: 1, Mean_Node: 1, True_Node: 1 };
    var CLASSIC = { conjunction: 1, opposition: 1, square: 1, trine: 1, sextile: 1 };
    var dg = function (v) {
      var d = Math.floor(v), m = Math.round((v - d) * 60);
      if (m === 60) { d += 1; m = 0; }
      return d + '\u00b0' + (m < 10 ? '0' : '') + m + "'";
    };
    var pretty = function (n) { return n.replace(/_/g, ' '); };
    var byName = function (n) {
      for (var i = 0; i < A.planets.length; i++) if (A.planets[i].name === n) return A.planets[i];
      return null;
    };
    var sun = byName('Sun'), moon = byName('Moon');
    document.getElementById('astrometa').innerHTML =
      (sun ? '<div class="line"><span>Sun</span> ' + sun.sign + ' ' + dg(sun.position) + '</div>' : '') +
      (moon ? '<div class="line"><span>Moon</span> ' + moon.sign + ' ' + dg(moon.position) + '</div>' : '') +
      '<div class="line"><span>Ascendant</span> ' + ZSIGN[Math.floor(A.ascendant / 30) % 12] +
      ' ' + dg(A.ascendant % 30) + '</div>' +
      '<div class="line"><span>Midheaven</span> ' + ZSIGN[Math.floor(A.mc / 30) % 12] +
      ' ' + dg(A.mc % 30) + '</div>';

    document.getElementById('astroplanets').innerHTML = A.planets.map(function (p) {
      return '<div class="line"><i>' + esc(pretty(p.name)) + '</i><span>' + esc(p.sign) +
        ' ' + dg(p.position) + '</span><i>' + (HOUSE_N[p.house] || '') + '</i></div>';
    }).join('');

    document.getElementById('astrohouses').innerHTML = A.houses.map(function (h, i) {
      return '<div class="line"><i>House ' + (i + 1) + '</i><span>' + esc(h.sign) +
        ' ' + dg(h.position) + '</span><i></i></div>';
    }).join('');

    var isPlanet = {};
    A.planets.forEach(function (p) { isPlanet[p.name] = 1; });
    document.getElementById('astroaspects').innerHTML = A.aspects.filter(function (x) {
      return isPlanet[x.p1_name] && isPlanet[x.p2_name];
    }).map(function (x) {
      var core = CLASSIC[x.aspect] && !MINOR_PT[x.p1_name] && !MINOR_PT[x.p2_name] &&
        Math.abs(x.orbit) <= 6;
      return '<div class="line ' + (core ? 'core' : 'extra') + '"><i>' + esc(pretty(x.p1_name)) +
        '</i><span>' + esc(x.aspect) + ' ' + esc(pretty(x.p2_name)) + '</span><i>' +
        (Math.round(Math.abs(x.orbit) * 10) / 10) + '\u00b0</i></div>';
    }).join('');

    var ab = document.getElementById('aspAll');
    ab.onclick = function () {
      var on = body.classList.toggle('astro-all');
      ab.classList.toggle('on', on);
      ab.textContent = on ? 'Show the classic set' : 'Show every aspect';
    };
  } else {
    var vaGone = document.getElementById('vAstro');
    if (vaGone) vaGone.remove();
  }
}


if (DATA.client) relight();

// circuit toggles
var host = document.getElementById('circuits');
var groups = {};
DATA.circuits.forEach(function (c) { (groups[c.group] = groups[c.group] || []).push(c); });
host.innerHTML = Object.keys(groups).map(function (g) {
  return '<div class="grp">' + g.toUpperCase() + '</div>' + groups[g].map(function (c) {
    var n = DATA.channels.filter(function (x) { return x.circuit === c.id && x.live; }).length;
    var absent = DATA.client && n === 0;
    return '<label class="cc' + (absent ? ' absent' : '') + '">' +
      '<input type="checkbox" class="cbx" data-id="' + c.id + '" checked>' +
      '<span class="sw" style="background:' + c.color + '"></span>' +
      c.name.replace(/^[^:]+:\\s*/, '') +
      (DATA.client ? '<span class="cnt">' + n + '/' + c.total + '</span>' : '') + '</label>';
  }).join('');
}).join('');
function sync() {
  [].forEach.call(document.querySelectorAll('.cbx'), function (b) {
    body.classList.toggle('off-' + b.dataset.id, !b.checked);
  });
}
host.addEventListener('change', sync);
document.getElementById('all').onclick = function () {
  [].forEach.call(document.querySelectorAll('.cbx'), function (b) { b.checked = true; }); sync();
};
document.getElementById('none').onclick = function () {
  [].forEach.call(document.querySelectorAll('.cbx'), function (b) { b.checked = false; }); sync();
};


// One place decides what a deselected planet or side does to the chart: the
// gate's leg goes, its number stops being lit, and on the traditional view the
// leg falls back to the side that is still showing.
function relight() {
  if (!DATA.client) return;
  var offP = {}, offS = {};
  [].forEach.call(document.querySelectorAll('.pbx'), function (b) { if (!b.checked) offP[b.dataset.id] = 1; });
  offS.personality = body.classList.contains('off-s-personality');
  offS.design = body.classList.contains('off-s-design');

  var live = {}, liveP = {}, liveD = {};
  (DATA.placements || []).forEach(function (p) {
    if (offP[p.pid] || offS[p.side]) return;
    live[p.gate] = 1;
    if (p.side === 'personality') liveP[p.gate] = 1; else liveD[p.gate] = 1;
  });

  [].forEach.call(document.querySelectorAll('svg.canvas .gnum'), function (t) {
    t.classList.toggle('lit', !!live[t.dataset.gate]);
  });
  // circuit view: the colored leg belongs to its gate
  [].forEach.call(document.querySelectorAll('svg.canvas .leg'), function (g) {
    g.style.display = live[g.dataset.gate] ? '' : 'none';
  });
  [].forEach.call(document.querySelectorAll('svg.canvas .arrow'), function (a) {
    a.style.display = (live[a.dataset.g1] && live[a.dataset.g2]) ? '' : 'none';
  });
  // which channels still stand, and so which centers are still defined
  var noDef = body.classList.contains('nodefined');
  var noHang = body.classList.contains('nohang');
  var defCenters = {}, inDefined = {};
  DATA.channels.forEach(function (c) {
    if (!live[c.srcGate] || !live[c.tgtGate]) return;
    inDefined[c.srcGate] = 1; inDefined[c.tgtGate] = 1;
    // with the defined channels hidden there is no definition to color
    if (noDef) return;
    defCenters[c.cFrom] = 1; defCenters[c.cTo] = 1;
  });
  [].forEach.call(document.querySelectorAll('.cshape'), function (el) {
    // The overlay's definition is natal PLUS whatever the sky is completing,
    // and it changes with the date picker. This repaint only knows the natal
    // chart, so left alone it runs on load and paints every transit-defined
    // centre back to open. The transit canvas owns its own centres.
    var sv = el.closest ? el.closest('svg.canvas') : null;
    if (sv && sv.classList.contains('transit')) return;
    var on = !!defCenters[el.dataset.center];
    el.setAttribute('fill', on ? el.dataset.on : el.dataset.off);
    el.classList.toggle('open', !on);
    if (el.dataset.dash) el.setAttribute('stroke-dasharray', on ? 'none' : el.dataset.dash);
  });

  // traditional view: black is Personality, red is Design, and the defined /
  // hanging buttons act on the legs the design itself drew
  [].forEach.call(document.querySelectorAll('.pleg'), function (el) {
    var g = el.dataset.gate;
    var hidden = !live[g] ||
      (noDef && inDefined[g]) ||
      (noHang && !inDefined[g]);
    if (hidden) { el.style.display = 'none'; return; }
    el.style.display = '';
    var col = el.dataset.fill === 'red' ? '#e06666' : '#000000';
    if (el.dataset.fill === 'black' && !liveP[g] && liveD[g]) col = '#e06666';
    if (el.dataset.fill === 'red' && !liveD[g] && liveP[g]) col = '#000000';
    // On the overlay the client is ONE colour, not two: this repaint runs on
    // load and on every toggle, and without this it puts the traditional black
    // and red straight back over the overlay's own fills.
    var sv = el.closest ? el.closest('svg.canvas') : null;
    if (sv && sv.classList.contains('transit')) col = CLIENT_TINT_JS;
    el.setAttribute('fill', col);
  });
  [].forEach.call(document.querySelectorAll('.gdisc'), function (el) {
    el.style.display = live[el.dataset.gate] ? '' : 'none';
  });
  [].forEach.call(document.querySelectorAll('.pnum'), function (el) {
    el.classList.toggle('off', !live[el.dataset.gate]);
  });
}

// hover shows a light tip, click pins the full description over the bodygraph
var readout = document.getElementById('readout');
var card = document.getElementById('card');
var tip = document.getElementById('tip');
var stage = document.querySelector('.stage');
var chByKey = {}; DATA.channels.forEach(function (c) { chByKey[c.key] = c; });
var ctrByID = {}; DATA.centers.forEach(function (c) { ctrByID[c.id] = c; });
var placeBy = {}; (DATA.placements || []).forEach(function (p) { placeBy[p.side + '|' + p.pid] = p; });
var byGate = {}; (DATA.placements || []).forEach(function (p) { (byGate[p.gate] = byGate[p.gate] || []).push(p); });
var fnColor = {}; DATA.functions.forEach(function (f) { fnColor[f.name] = f.color; });
var circColor = {}; DATA.circuits.forEach(function (c) { circColor[c.id] = c.color; });
var pinned = null;
var varBy = {};
if (DATA.client && DATA.client.variables) {
  DATA.client.variables.forEach(function (v) { varBy[v.key] = v; });
}

function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function show(html) { if (readout) readout.innerHTML = html; }
function hot(key) {
  // .chgrp holds the drawn legs in the plain view, .ch in the circuit view
  [].forEach.call(document.querySelectorAll('.ch, .chgrp'), function (g) {
    g.classList.toggle('hot', !!key && g.dataset.ch === key);
  });
}
function markCenter(cid) {
  // a center outlines even when it holds no activated gate
  [].forEach.call(document.querySelectorAll('.cshape'), function (el) {
    if (cid && el.dataset.center === cid) el.classList.add('lit');
  });
}
function gatesInCenter(cid) {
  return (DATA.placements || []).filter(function (p) { return p.cid === cid; })
    .map(function (p) { return p.gate; });
}
function sidesOf(r) {
  // a merged row stands for both of the client's sides at once
  if (r.dataset.side === 'merged') {
    return [placeBy['personality|' + r.dataset.planet], placeBy['design|' + r.dataset.planet]].filter(Boolean);
  }
  var one = placeBy[r.dataset.side + '|' + r.dataset.planet];
  return one ? [one] : [];
}
function markRows(cid) {
  [].forEach.call(document.querySelectorAll('.prow'), function (r) {
    r.classList.toggle('hi', !!cid && sidesOf(r).some(function (p) { return p.cid === cid; }));
  });
}
/** Highlight exactly these placements in the columns. */
function markRowsFor(list) {
  var want = {};
  (list || []).forEach(function (p) { want[p.side + '|' + p.pid] = 1; });
  [].forEach.call(document.querySelectorAll('.prow'), function (r) {
    r.classList.toggle('hi', sidesOf(r).some(function (p) { return want[p.side + '|' + p.pid]; }));
  });
}
function litGate(gates) {
  var want = {};
  if (gates != null) [].concat(gates).forEach(function (g) { want[g] = 1; });
  [].forEach.call(document.querySelectorAll('.halo'), function (h) {
    h.classList.toggle('on', !!want[h.dataset.gate]);
  });
  // the sky's own gates have no halo, because the client does not carry them:
  // their leg and disc take the highlight directly
  [].forEach.call(document.querySelectorAll('.tleg, .tdisc, .bleg, .gdisc'), function (e) {
    e.classList.toggle('lit', !!want[e.dataset.gate]);
  });
  // the transit column follows the same set, whatever asked for it
  [].forEach.call(document.querySelectorAll('.trow'), function (r) {
    r.classList.toggle('hi', !!want[+r.dataset.gate]);
  });
  // the wheel and the bodygraph at its hub follow the same highlight
  [].forEach.call(document.querySelectorAll('.hubring'), function (h) {
    h.classList.toggle('on', !!want[h.dataset.gate]);
  });
  [].forEach.call(document.querySelectorAll('.mandala [data-gatecell], .mandala [data-hex]'), function (c) {
    var on = !!want[c.dataset.gatecell || c.dataset.hex];
    c.classList.toggle('lit', on);
    c.classList.toggle('mhi', on);
  });
  [].forEach.call(document.querySelectorAll('.mandala line[data-gate], .mandala text[data-gate]'), function (e) {
    var on = !!want[e.dataset.gate];
    e.classList.toggle('lit', on);
    e.classList.toggle('mhi', on);
  });
  // the gate's own leg on whichever chart is showing
  [].forEach.call(document.querySelectorAll('.leg, .pleg'), function (el) {
    el.classList.toggle('lit', !!want[el.dataset.gate]);
  });
  [].forEach.call(document.querySelectorAll('.bridge'), function (b) {
    b.classList.toggle('on', !!want[b.dataset.gate]);
  });
  // and the center that gate sits in
  var cens = {};
  Object.keys(want).forEach(function (g) {
    var L = (DATA.gateLib || {})[g];
    if (L && L.cid) cens[L.cid] = 1;
  });
  [].forEach.call(document.querySelectorAll('.cshape'), function (el) {
    el.classList.toggle('lit', !!cens[el.dataset.center]);
  });
}
function tags(list) {
  var info = DATA.tagInfo || {};
  return list.filter(Boolean).map(function (t) {
    var d = info[String(t.text).trim().toLowerCase()];
    return '<span class="tag' + (t.bg ? '' : ' ghost') + (d ? ' has' : '') + '"' +
      (d ? ' data-info="' + esc(d) + '" data-label="' + esc(t.text) + '"' : '') +
      (t.bg ? ' style="background:' + t.bg + '"' : '') + '>' + esc(t.text).toUpperCase() + '</span>';
  }).join('');
}
function prose(text) {
  if (!text) return '';
  return '<div class="body">' + text.split('\\n\\n').map(function (p) {
    return p.charAt(0) === '\u00a7'
      ? '<h4>' + esc(p.slice(1)) + '</h4>'
      : '<p>' + esc(p) + '</p>';
  }).join('') + '</div>';
}
function varHtml(v) {
  return '<b>' + esc(v.label) + '</b>' +
    '<span class="kn">' + esc(v.theme) + '</span>' +
    tags([{ text: v.side === 'design' ? 'Design' : 'Personality',
            bg: v.side === 'design' ? '#e06666' : '#c9b6e4' },
          { text: v.arrow + ' arrow' }]) +
    prose(v.report);
}
function gateLibHtml(gate) {
  var L = (DATA.gateLib || {})[gate] || {};
  var here = (byGate[gate] || []);
  if (here.length) {
    return here.map(gateHtml).join('<hr style="border:0;border-top:1px solid rgba(128,128,128,.25);margin:10px 0">');
  }
  return '<b>Gate ' + gate + '</b><span class="kn">' + esc(L.name || '') + '</span>' +
    tags([L.circuit ? { text: L.circuit } : null,
          L.quarter ? { text: 'Quarter of ' + L.quarter } : null,
          L.center ? { text: L.center } : null]) +
    (L.keynote ? '<span class="meta"><i>Keynote:</i> ' + esc(L.keynote) + '</span>' : '') +
    (L.func ? '<span class="meta"><i>Function:</i> ' + esc(L.func) + '</span>' : '') +
    '<span class="meta">Not activated in this chart.</span>';
}
function propHtml(m) {
  return '<b>' + esc(m.value) + '</b><span class="meta">' + esc(m.label) + '</span>' + prose(m.report);
}

function chanHtml(c) {
  return '<b>' + esc(c.name) + '</b>' +
    (DATA.client && !c.live ? '<span class="meta">Not defined in this chart.</span>' : '') +
    (c.keynote ? '<span class="kn">' + esc(c.keynote) + '</span>' : '') +
    tags([{ text: c.circuitName, bg: circColor[c.circuit] }, c.type ? { text: c.type } : null]) +
    '<span class="meta">Gate ' + c.srcGate + ' in the ' + esc(c.from) + ' feeds gate ' + c.tgtGate +
    ' in the ' + esc(c.to) + '.</span>' + prose(c.report);
}
function ctrHtml(k) {
  var t = k.fns.map(function (f) { return { text: f, bg: fnColor[f] }; });
  if (k.stateLabel) t.push({ text: k.stateLabel });
  var extra = '';
  if (k.state && k.state !== 'defined' && k.notSelf) {
    extra += '<span class="meta"><i>Not-self theme:</i> ' + esc(k.notSelf) + '</span>';
  }
  // their own reading first when this chart has one, Kaycee's general text for
  // the state otherwise, so a centre always says something
  return '<b>' + esc(k.name) + '</b>' + tags(t) +
    (k.biology ? '<span class="meta">' + esc(k.biology) + '</span>' : '') + extra +
    prose(k.report || k.stateText);
}
function gateHtml(p) {
  var sideName = p.side === 'design' ? 'Design' : 'Personality';
  return '<b>Gate ' + p.gate + '.' + p.line + (p.fix ? ' ' + p.fix : '') + '</b>' +
    '<span class="kn">' + esc(p.gateName) + (p.lineName ? ' · ' + esc(p.lineName) : '') + '</span>' +
    tags([{ text: sideName + ' ' + p.planet, bg: p.side === 'design' ? '#e06666' : '#c9b6e4' },
          p.circuit ? { text: p.circuit } : null,
          p.quarter ? { text: 'Quarter of ' + p.quarter } : null,
          { text: p.center }]) +
    (p.keynote ? '<span class="meta"><i>Keynote:</i> ' + esc(p.keynote) + '</span>' : '') +
    (p.func ? '<span class="meta"><i>Function:</i> ' + esc(p.func) + '</span>' : '') +
    prose(p.report);
}

function openCard(el, html, key, gate) {
  card.innerHTML = '<button class="close" aria-label="Close">&times;</button>' + html;
  card.hidden = false;
  var s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (el.closest('.panel')) {
    card.style.left = Math.max(8, s.width - card.offsetWidth - 8) + 'px';
    card.style.top = Math.max(8, Math.min(r.top - s.top, s.height - card.offsetHeight - 8)) + 'px';
    pinned = true; hot(null); litGate(null); tip.hidden = true;
    return;
  }
  var x = r.left - s.left + r.width / 2 - card.offsetWidth / 2;
  var y = r.top - s.top + r.height / 2 - card.offsetHeight / 2;
  x = Math.max(8, Math.min(x + (r.left - s.left < s.width / 2 ? 1 : -1) * (r.width / 2 + 140), s.width - card.offsetWidth - 8));
  y = Math.max(8, Math.min(y, s.height - card.offsetHeight - 8));
  card.style.left = x + 'px';
  card.style.top = y + 'px';
  pinned = key || true;
  hot(key || null);
  litGate(gate == null ? null : gate);
  tip.hidden = true;
}
function closeCard() { card.hidden = true; pinned = null; hot(null); litGate(null); markRows(null); }

function showTip(e, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  var s = stage.getBoundingClientRect();
  var x = e.clientX - s.left + 16, y = e.clientY - s.top + 16;
  tip.style.left = Math.min(x, s.width - tip.offsetWidth - 8) + 'px';
  tip.style.top = Math.min(y, s.height - tip.offsetHeight - 8) + 'px';
}

document.addEventListener('click', function (e) {
  if (e.target.closest && e.target.closest('.close')) { closeCard(); return; }
  if (e.target.closest && e.target.closest('.card')) return;
  var va = e.target.closest ? e.target.closest('.varrow') : null;
  if (va && varBy[va.dataset.var]) { openCard(va, varHtml(varBy[va.dataset.var])); return; }
  // the mandala: a planet on its spoke, or any gate cell on the wheel
  var mp = e.target.closest ? e.target.closest('.mandala [data-planet]') : null;
  if (mp) {
    var pl = placeBy[mp.dataset.side + '|' + mp.dataset.planet];
    if (pl) { openCard(mp, gateHtml(pl), null, pl.gate); return; }
  }
  var cell = e.target.closest ? e.target.closest('.mandala [data-gatecell], .mandala [data-hex]') : null;
  if (cell) {
    var g = cell.dataset.gatecell || cell.dataset.hex;
    if (g) { openCard(cell, gateLibHtml(+g), null, +g); return; }
  }
  // a gate on the little bodygraph at the hub: its leg, its number or its disc
  var hg = e.target.closest ? e.target.closest('.mandala .pleg, .mandala .pnum, .mandala .gdisc') : null;
  if (hg && hg.dataset.gate) { openCard(hg, gateLibHtml(+hg.dataset.gate), null, +hg.dataset.gate); return; }
  var prop = e.target.closest ? e.target.closest('#pmeta .prop.has') : null;
  if (prop && metaBy[prop.dataset.key]) { openCard(prop, propHtml(metaBy[prop.dataset.key])); return; }
  var row = e.target.closest ? e.target.closest('.prow') : null;
  if (row) {
    var p = placeBy[row.dataset.side + '|' + row.dataset.planet];
    if (p) { openCard(row, gateHtml(p), null, p.gate); return; }
  }
  var halo = e.target.closest ? e.target.closest('.halo') : null;
  if (halo) {
    var list = byGate[halo.dataset.gate] || [];
    if (list.length) { openCard(halo, list.map(gateHtml).join('<hr style="border:0;border-top:1px solid rgba(128,128,128,.25);margin:10px 0">'), null, halo.dataset.gate); return; }
  }
  var ch = e.target.closest ? e.target.closest('.ch') : null;
  if (ch) {
    var cc = chByKey[ch.dataset.ch];
    openCard(ch, chanHtml(cc), ch.dataset.ch, [cc.srcGate, cc.tgtGate]);
    return;
  }
  var ct = e.target.closest ? e.target.closest('[data-center]') : null;
  if (ct && ctrByID[ct.dataset.center]) {
    openCard(ct, ctrHtml(ctrByID[ct.dataset.center]), null, gatesInCenter(ct.dataset.center));
    markCenter(ct.dataset.center);
    markRows(ct.dataset.center);
    return;
  }
  if (!e.target.closest || !e.target.closest('.panel')) closeCard();
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCard(); });
stage.addEventListener('mouseleave', function (e) {
  // heading into the panel: it has its own hover behaviour, leave it alone
  if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.panel')) return;
  tip.hidden = true;
  if (!pinned) { hot(null); litGate(null); markRowsFor(null); }
});

document.addEventListener('mousemove', function (e) {
  // the panel has its own hover behaviour (stat rows, channel list, properties);
  // this handler must not clear what those just set
  if (e.target.closest && e.target.closest('.panel')) return;
  // a pill inside a card explains itself, even while that card is pinned
  var tg = e.target.closest ? e.target.closest('.tag.has') : null;
  if (tg) {
    showTip(e, '<b>' + esc(tg.dataset.label) + '</b>' + esc(tg.dataset.info));
    return;
  }
  // off the pill: the tip goes, even while a card is pinned
  if (pinned) { tip.hidden = true; return; }
  var va = e.target.closest ? e.target.closest('.varrow') : null;
  if (va && varBy[va.dataset.var]) {
    var v = varBy[va.dataset.var];
    hot(null); litGate(null); markRows(null);
    showTip(e, '<b>' + esc(v.label) + '</b>' + esc(v.theme) + ' &middot; ' + esc(v.arrow) + ' arrow');
    return;
  }
  var mp = e.target.closest ? e.target.closest('.mandala [data-planet]') : null;
  if (mp) {
    var mpl = placeBy[mp.dataset.side + '|' + mp.dataset.planet];
    if (mpl) {
      hot(null); markRows(null); litGate(mpl.gate);
      showTip(e, '<b>' + (mpl.side === 'design' ? 'Design ' : 'Personality ') + esc(mpl.planet) + '</b>' +
        esc(mpl.gate + '.' + mpl.line) + ' ' + esc(mpl.gateName));
      return;
    }
  }
  var cell = e.target.closest ? e.target.closest('.mandala [data-gatecell], .mandala [data-hex]') : null;
  if (cell) {
    var cg = cell.dataset.gatecell || cell.dataset.hex;
    var L = (DATA.gateLib || {})[cg];
    if (L) {
      hot(null); markRows(null); litGate(+cg);
      showTip(e, '<b>Gate ' + cg + '</b>' + esc(L.name) + (L.keynote ? '<br>' + esc(L.keynote) : ''));
      return;
    }
  }
  var hg = e.target.closest ? e.target.closest('.mandala .pleg, .mandala .pnum, .mandala .gdisc') : null;
  if (hg && hg.dataset.gate) {
    var HL = (DATA.gateLib || {})[hg.dataset.gate];
    hot(null); markRows(null); litGate(+hg.dataset.gate);
    if (HL) showTip(e, '<b>Gate ' + hg.dataset.gate + '</b>' + esc(HL.name));
    return;
  }
  var trow = e.target.closest ? e.target.closest('.trow') : null;
  if (trow) {
    var tg = +trow.dataset.gate, TL = (DATA.gateLib || {})[tg] || {};
    hot(null); markRows(null); litGate(tg);
    showTip(e, '<b>Transit ' + esc(trow.dataset.planet) + '</b>' +
      esc(tg + '.' + trow.dataset.line) + (TL.name ? ' ' + esc(TL.name) : ''));
    return;
  }
  var row = e.target.closest ? e.target.closest('.prow') : null;
  if (row && row.dataset.side === 'merged') {
    var both = sidesOf(row);
    if (!both.length) return;
    litGate(both.map(function (x) { return x.gate; }));
    showTip(e, '<b>' + esc(both[0].planet) + '</b>' + both.map(function (x) {
      return (x.side === 'design' ? 'Design ' : 'Personality ') + x.gate + '.' + x.line;
    }).join(' \u00b7 '));
    return;
  }
  if (row) {
    var p = placeBy[row.dataset.side + '|' + row.dataset.planet];
    if (!p) return;
    litGate(p.gate);
    showTip(e, '<b>' + (p.side === 'design' ? 'Design ' : 'Personality ') + esc(p.planet) + '</b>' +
      esc(p.gate + '.' + p.line) + ' ' + esc(p.gateName) +
      (p.lineName ? ' · ' + esc(p.lineName) : ''));
    show('<b>' + esc(p.gateName) + ' ' + p.gate + '.' + p.line + '</b><span class="meta">' +
      (p.side === 'design' ? 'Design ' : 'Personality ') + esc(p.planet) + ' in the ' + esc(p.center) +
      '. Click for the full reading.</span>');
    return;
  }
  var halo = e.target.closest ? e.target.closest('.halo') : null;
  if (halo) { litGate(halo.dataset.gate); return; }
  var ch = e.target.closest ? e.target.closest('.ch') : null;
  if (ch) {
    var c = chByKey[ch.dataset.ch];
    hot(ch.dataset.ch); litGate([c.srcGate, c.tgtGate]);
    showTip(e, '<b>' + esc(c.name) + '</b>' + esc(c.circuitName) + (c.type ? ' · ' + esc(c.type) : ''));
    show('<b>' + esc(c.name) + '</b><span class="meta">' + esc(c.circuitName) +
      (c.type ? ' · ' + esc(c.type) : '') +
      '<br>Gate ' + c.srcGate + ' in the ' + esc(c.from) + ' feeds gate ' + c.tgtGate + ' in the ' + esc(c.to) + '.</span>');
    return;
  }
  var ct = e.target.closest ? e.target.closest('[data-center]') : null;
  if (ct && ctrByID[ct.dataset.center]) {
    var k = ctrByID[ct.dataset.center];
    hot(null); litGate(gatesInCenter(ct.dataset.center)); markCenter(ct.dataset.center); markRows(ct.dataset.center);
    showTip(e, '<b>' + esc(k.name) + (k.stateLabel ? ' &middot; ' + k.stateLabel : '') + '</b>' +
      '<span style="opacity:.68">' + k.fns.join(' + ') + '</span>' +
      (k.stateShort ? '<span class="tipbody">' + esc(k.stateShort) + '</span>' : ''));
    show('<b>' + esc(k.name) + (k.stateLabel ? ' &middot; ' + k.stateLabel : '') +
      '</b><span class="meta">' + k.fns.join(' + ') +
      (k.biology ? '<br>' + esc(k.biology) : '') + '</span>' + prose(k.stateText));
    return;
  }
  hot(null); litGate(null); markRows(null); tip.hidden = true;
  if (!e.target.closest || !e.target.closest('.panel')) {
    show('<b>Hover the chart</b><span class="meta">Click anything to pin its description.</span>');
  }
});
</script></body></html>`;
}

// ── publishing a client link ────────────────────────────────────────────────
// Uploads the built HTML to the private `charts` bucket and prints the link.
// The token is created once per client and reused, so republishing refreshes
// what a link already sent shows, rather than minting a new address.

// charts.delphihd.com, never the apex: delphihd.com serves Kaycee's Wix site.
const SITE = process.env.DELPHI_SITE_URL ?? "https://charts.delphihd.com";

async function publishChart(client: ClientCtx, html: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to publish");
  const { createClient: createSupabase } = await import("@supabase/supabase-js");
  const db = createSupabase(url, key, { auth: { persistSession: false } });

  const slug = client.slug;
  const { data: existing } = await db
    .from("client_charts")
    .select("token, storage_path")
    .eq("client_slug", slug)
    .maybeSingle();

  const token = existing?.token ?? randomBytes(16).toString("hex");
  const path = existing?.storage_path ?? `${slug}/${token}.html`;

  // Storage caches an object for an hour by default, so a republished chart
  // would keep serving yesterday's file to the client holding the link. The
  // link is the same address every time, so the file behind it has to be the
  // one just uploaded.
  const up = await db.storage.from("charts").upload(path, Buffer.from(html, "utf8"), {
    contentType: "text/html; charset=utf-8",
    cacheControl: "0",
    upsert: true,
  });
  if (up.error) throw new Error(`upload failed: ${up.error.message}`);

  const row = {
    token, client_slug: slug, client_name: client.name,
    storage_path: path, updated_at: new Date().toISOString(), revoked_at: null,
  };
  const saved = existing
    ? await db.from("client_charts").update(row).eq("client_slug", slug)
    : await db.from("client_charts").insert(row);
  if (saved.error) throw new Error(`link record failed: ${saved.error.message}`);

  return `${SITE}/c/${token}`;
}

/** Pull a link. The chart stays in storage; the route stops serving it. */
async function unpublishChart(slug: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars are missing");
  const { createClient: createSupabase } = await import("@supabase/supabase-js");
  const db = createSupabase(url, key, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("client_charts")
    .update({ revoked_at: new Date().toISOString() })
    .eq("client_slug", slug)
    .select("token");
  if (error) throw new Error(error.message);
  return !!data?.length;
}

// ── main ────────────────────────────────────────────────────────────────────
/** All 64 gate-number labels -> their position in the SVG's own coordinates. */
function gateAnchors(svg: string): Record<number, { x: number; y: number }> {
  const out: Record<number, { x: number; y: number }> = {};
  const re = /<text\b[^>]*transform="translate\(([\d.]+)\s+([\d.]+)\)[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    // strip the inner <tspan> tags first: their x="0" y="0" attributes would
    // otherwise be read as the gate number
    const n = (m[3].replace(/<[^>]*>/g, "").match(/\d+/) ?? [])[0];
    if (n) out[+n] = { x: +m[1], y: +m[2] };
  }
  return out;
}

function centerBoxes(svg: string): Record<Center, BBox> {
  const out = {} as Record<Center, BBox>;
  for (const [center, id] of Object.entries(CENTER_SVG_ID) as [Center, string][]) {
    const m = svg.match(new RegExp(`<path id="${id}"([^>]*)>`));
    if (!m) throw new Error(`branded SVG has no ${id} shape`);
    out[center] = bboxOfEl({ tag: "path", attrs: m[1], raw: m[0] });
  }
  return out;
}

async function rasterize(svg: string, width: number): Promise<Buffer> {
  const { Resvg } = await import("@resvg/resvg-js");
  const fontFiles = FONT_WEIGHTS
    .map((w) => join(FONT_DIR, `Montserrat-${w}.ttf`))
    .filter((p) => existsSync(p));
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles, loadSystemFonts: true, defaultFontFamily: "Montserrat" },
  });
  return r.render().asPng();
}

(async () => {
  // no argument: the teaching diagram. A client slug: that person's own chart.
  const args = process.argv.slice(2);
  const wantPublish = args.includes("--publish");
  const wantUnpublish = args.includes("--unpublish");
  const slug = args.find((a) => !a.startsWith("--")) ?? process.env.CLIENT;

  if (wantUnpublish) {
    if (!slug) throw new Error("--unpublish needs a client slug");
    const brief = clientFromSlug(slug);
    const pulled = await unpublishChart(brief.slug);
    console.log(pulled
      ? `✓ link pulled for ${brief.name}; it now returns not found`
      : `no published link found for ${brief.name}`);
    return;
  }
  const client = slug ? await loadClient(clientFromSlug(slug)) : undefined;

  const outDir = client
    ? client.outDir
    : join(process.env.HOME ?? "", "Desktop", "Mandala Renderer Output", "Educational");
  mkdirSync(outDir, { recursive: true });

  const chunks = loadChunks();
  const fn = centerFunctions(chunks);
  const biology = centerBiology(chunks);
  const circuits = channelCircuits(chunks);

  const raw = client ? client.svg : await blankBodygraph();
  const centerBox = centerBoxes(raw);
  const { channels, slots } = buildChannels(raw, circuits, centerBox);

  const inner: Record<string, string> = {};
  for (const skin of [PAPER]) {
    inner[skin.id] = paintCenters(
      neutralize(raw, skin, !!client, client?.gates), skin, fn, client?.centers);
  }

  const libNames = loadLibraryNames();
  const gateInfo = gateMeta(chunks);
  const tags = tagInfo(chunks);
  const states = centerStates(chunks);
  const anchors = gateAnchors(raw);
  if (client && Object.keys(anchors).length < 64) {
    console.warn(`  only ${Object.keys(anchors).length}/64 gate anchors parsed; some placement marks will be missing`);
  }
  // Today's sky, laid over the client's chart. A transit gate completes a
  // channel with one of their natal gates, and that channel defines a centre
  // even when the centre is open in their own design, so the combined set is
  // what the overlay must draw.
  let transitInnerSvg: string | undefined;
  let sky: SceneData["sky"];
  let dayRead: DayRead | undefined;
  if (client) {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toISOString().slice(11, 16);
    const moment = await castSkyAt(date, time, "UTC");
    const tGates = new Set(moment.positions.map((p) => p.gate));
    const both = new Set<number>([...client.gates, ...tGates]);
    const liveChannels = channels.filter((c) => both.has(c.srcGate) && both.has(c.tgtGate));
    const definedNow = new Set<Center>();
    for (const c of liveChannels) { definedNow.add(c.source); definedNow.add(c.target); }
    transitInnerSvg = transitInner(raw, client.gates, tGates, definedNow);
    sky = {
      date, time,
      positions: moment.positions.map((p) => ({
        planet: p.planet, gate: p.gate, line: p.line, fixingState: p.fixingState,
      })),
    };
    dayRead = loadDayRead(client.name, date, CLIENTS[client.slug]?.id) ?? undefined;
    console.log(dayRead
      ? `Today's read: ${dayRead.paragraph.split(" ").length} words, ${dayRead.completions.length} completion(s) from ${date}`
      : `Today's read: none found for ${date} (no transit report yet)`);
    console.log("Reads: fetched from /api/read; today's is baked in as a fallback.");
    const newlyDefined = [...definedNow].filter((c) => !client.centers.has(c));
    console.log(`Transit (${date} ${time} UTC): ${tGates.size} gates` +
      `, ${liveChannels.length - channels.filter((c) => client.channels.has(c.key)).length} channel(s) completed` +
      `, centers newly defined: ${newlyDefined.join(", ") || "(none)"}`);
  }

  const scene: SceneData = {
    client, inner, plain: client ? plainInner(raw, definitionMap({ client, channels } as SceneData).bridges.map((b) => b.gate)) : undefined,
    transit: transitInnerSvg, sky, read: dayRead,
    channels, slots, centerBox, fn, biology, anchors,
    gateInfo, states, tagInfo: tags, lineName: (g, l) => libNames.line(g, l),
  };
  const fonts = await montserrat();

  if (client) {
    const defined = channels.filter((c) => client.channels.has(c.key));
    console.log(`${client.name}: ${client.meta.map((m) => `${m.label} ${m.value}`).join(" | ")}`);
    console.log(`Defined centers: ${[...client.centers].join(", ") || "(none)"}`);
    console.log(`Defined channels: ${defined.length}`);
    for (const c of defined.sort((a, b) => a.slot - b.slot)) {
      console.log(`  ${c.name}  (${CIRCUITS.find((x) => x.id === c.circuit)!.name})`);
    }
    const hanging = channels
      .filter((c) => !client.channels.has(c.key))
      .flatMap((c) => c.halves.filter((h) => client.gates.has(h.gate)).map((h) => `${h.gate} (${c.key})`));
    console.log(`Hanging gates: ${hanging.join(", ") || "(none)"}`);
  } else {
    console.log(`Channels mapped: ${channels.length}/36`);
    console.log("Flow directions (source gate -> target gate):");
    for (const c of [...channels].sort((a, b) => a.slot - b.slot)) {
      console.log(`  [${c.slot}] ${c.srcGate} (${c.source}) -> ${c.tgtGate} (${c.target})  ${c.name}`);
    }
  }

  // the client file is the thing she hands over, so it carries the brand name
  const stem = client ? `${client.name} - Delphi Human Design` : "Bodygraph - Energy Flow";
  const canvases = [PAPER]
    .map((sk) => buildCanvas(sk, scene, { animate: true, legend: false }))
    .join("\n") +
    (client ? "\n" + buildCanvas(PAPER, scene, { animate: false, legend: false, plain: true }) : "") +
    (client ? "\n" + buildCanvas(PAPER, scene, { animate: false, legend: false, plain: true, transit: true }) : "");
  // The natal wheel, for the Astrology view. Only a client chart has a birth
  // moment to draw, and a failure here must not cost her the whole chart: the
  // view simply does not appear.
  let astroChart: AstroChart | null = null;
  if (client) {
    try {
      const brief = clientFromSlug(slug);
      astroChart = await getAstro({
        birthDate: brief.birthDate, birthTime: brief.birthTime,
        place: placeForLookup(brief),
      });
    } catch (err) {
      console.log(`  astrology unavailable: ${(err as Error).message}`);
    }
  }
  const astroHtml = astroChart
    ? `<div class="astro">${renderWheel(astroChart, client!.name)}</div>`
    : "";
  if (astroChart) scene.astro = astroChart;

  const htmlPath = join(outDir, `${stem}.html`);
  const html = buildHtml(scene, canvases, mandalaView(scene), astroHtml, fonts);
  writeFileSync(htmlPath, html);
  console.log(`\n✓ ${htmlPath}`);

  if (wantPublish) {
    if (!client) throw new Error("--publish needs a client slug");
    const link = await publishChart(client, html);
    console.log(`✓ link: ${link}`);
  }

  const still = buildCanvas(PAPER, scene, { animate: false, legend: true });
  writeFileSync(join(outDir, `${stem}.svg`), still);
  writeFileSync(join(outDir, `${stem}.png`), await rasterize(still, 2360));
  console.log(`✓ ${join(outDir, `${stem}.png`)}`);
})();
