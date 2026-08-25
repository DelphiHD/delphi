// Animated mandala motion — a self-contained, interactive HTML that shows the
// planets moving around the Rave I'Ching wheel across a day.
//
// It samples the sky a couple dozen times through the day (cheap), reconstructs
// each planet's EXACT ecliptic longitude from its full fixing (gate.line.color.
// tone.base), and hands the browser those longitude tracks. The browser
// interpolates smoothly between samples, so motion is fluid from coarse data.
//
// Two hand-drawn skins (no external image files, everything is inline SVG):
//   - Night sky: glowing gradient spheres on a starfield (Saturn's ring,
//     Jupiter's bands, a cratered Moon).
//   - Felt board: soft flat felt discs on a warm board, kindergarten-style.
// Toggle between them live. Play/pause, scrub the day, and filter by planet
// group (Sun & Earth / Moon / Nodes / Inner / Social / Outer).
//
// No LLM calls: this is pure geometry + the chart API. Cost is only the ~25
// sky casts (one per sample); zero Anthropic spend.
//
// Run:
//   npx tsx scripts/mandala-motion.ts                         # today (UTC day)
//   TRANSIT_DATE=2026-07-20 npx tsx scripts/mandala-motion.ts
//   MOTION_INTERVAL_MIN=30 npx tsx scripts/mandala-motion.ts  # finer sampling

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { castTransitBodygraph, castNatalChart, assertTraditionalBodies } from "@/lib/transit/sky";
import { WHEEL_SEQUENCE } from "@/lib/hd/gate-longitude";
import { renderMandalaRings, mandalaWheelGeometry } from "@/lib/render/mandala";

// ── wheel geometry: reuse the real mandala's rings + geometry so planets sit
//    exactly where the branded wheel puts each gate ─────────────────────────
const S = 1200;
const WG = mandalaWheelGeometry(S);
const CX = WG.cx;
const CY = WG.cy;
const VISUAL_TOP = 268.25;         // longitude at 12 o'clock (mandala convention)
const R_GATE_OUT = WG.r.gateOuter;
const R_GATE_IN = WG.r.gateInner;
const R_LANE_OUT = 0.330 * S;      // outermost planet lane (Pluto), just inside the zodiac
const R_LANE_IN = 0.200 * S;       // innermost lane (Sun), clears the central bodygraph
const R_TOKEN_SCALE = (S / 820) * 0.8; // token scale, trimmed so 13 lanes don't crowd
const ANCHOR = 302;                // gate 41 line 1 start longitude
const GATE_ARC = 5.625;
const LINE_ARC = 0.9375;

type Group = "lum" | "moon" | "nodes" | "inner" | "social" | "outer";
interface PMeta {
  key: string;
  short: string;   // display label
  glyph: string;
  group: Group;
  color: string;
  size: number;    // token radius in viewBox px
  ring?: boolean;  // Saturn
  bands?: boolean; // Jupiter
  craters?: boolean; // Moon
  node?: boolean;  // lunar nodes (not a body)
  center?: boolean; // the Sun sits at the center of the wheel
}

// Lane order, innermost to outermost. The Sun rides the most central orbit and
// still moves around the wheel by its longitude; the rest follow in solar-system
// order (Moon + lunar nodes just outside Earth, where they belong).
const LANE_ORDER = [
  "Sun", "Mercury", "Venus", "Earth", "Moon", "North Node", "South Node",
  "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
];

// Order = lanes from outer to inner. Chiron/Lilith are intentionally excluded
// (not part of the traditional planetary wheel Kaycee teaches from).
const PLANETS: PMeta[] = [
  { key: "Sun",        short: "Sun",    glyph: "☉", group: "lum",    color: "#f6c453", size: 13 },
  { key: "Earth",      short: "Earth",  glyph: "⊕", group: "lum",    color: "#4a90d9", size: 10 },
  { key: "Moon",       short: "Moon",   glyph: "☽", group: "moon",   color: "#d8dce6", size: 10, craters: true },
  { key: "North Node", short: "N Node", glyph: "☊", group: "nodes",  color: "#b39ddb", size: 8, node: true },
  { key: "South Node", short: "S Node", glyph: "☋", group: "nodes",  color: "#b39ddb", size: 8, node: true },
  { key: "Mercury",    short: "Mercury",glyph: "☿", group: "inner",  color: "#b6b0a8", size: 8 },
  { key: "Venus",      short: "Venus",  glyph: "♀", group: "inner",  color: "#e8d9a0", size: 9 },
  { key: "Mars",       short: "Mars",   glyph: "♂", group: "inner",  color: "#c1440e", size: 9 },
  { key: "Jupiter",    short: "Jupiter",glyph: "♃", group: "social", color: "#d8a25e", size: 11, bands: true },
  { key: "Saturn",     short: "Saturn", glyph: "♄", group: "social", color: "#e3d3a0", size: 10, ring: true },
  { key: "Uranus",     short: "Uranus", glyph: "♅", group: "outer",  color: "#a6e0e5", size: 9 },
  { key: "Neptune",    short: "Neptune",glyph: "♆", group: "outer",  color: "#3b5bdb", size: 9 },
  { key: "Pluto",      short: "Pluto",  glyph: "♇", group: "outer",  color: "#9c8b7a", size: 8 },
];

const GROUPS: { id: Group; label: string }[] = [
  { id: "lum", label: "Sun & Earth" },
  { id: "moon", label: "Moon" },
  { id: "nodes", label: "Nodes" },
  { id: "inner", label: "Inner" },
  { id: "social", label: "Social" },
  { id: "outer", label: "Outer" },
];

// ── small color + geometry helpers ───────────────────────────────────────────
function hexToRgb(h: string) {
  const m = h.replace("#", "");
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
function toHex(n: number) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"); }
function mix(hex: string, target: string, amt: number) {
  const a = hexToRgb(hex), b = hexToRgb(target);
  return `#${toHex(a[0] + (b[0] - a[0]) * amt)}${toHex(a[1] + (b[1] - a[1]) * amt)}${toHex(a[2] + (b[2] - a[2]) * amt)}`;
}
const lighten = (h: string, a = 0.5) => mix(h, "#ffffff", a);
const darken = (h: string, a = 0.5) => mix(h, "#000000", a);

function xyAt(radius: number, lon: number): [number, number] {
  const p = WG.pointAt(radius, lon);
  return [p.x, p.y];
}

// Timezone offset (minutes) between UTC and a display tz on a given date.
function offsetMinutes(date: string, tz: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const local = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((local.getTime() - utc.getTime()) / 60000);
}

// Radial division markers separating the segments of the quarter, hexagram, and
// zodiac rings (styled grey via CSS). Gives the wheel crisp segmentation.
function buildDividers(): string {
  const out: string[] = [];
  const seg = (r1: number, r2: number, lon: number) => {
    const [x1, y1] = xyAt(r1, lon);
    const [x2, y2] = xyAt(r2, lon);
    out.push(`<line class="rings-div" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />`);
  };
  // quarter boundaries (4)
  for (const lon of [313.25, 43.25, 133.25, 223.25]) seg(WG.r.outer, WG.r.quarterInner, lon);
  // zodiac sign boundaries (12)
  for (let i = 0; i < 12; i++) seg(WG.r.zodiacOuter, WG.r.zodiacInner, i * 30);
  // hexagram / gate boundaries (64)
  for (let i = 0; i < 64; i++) seg(WG.r.hexagramOuter, WG.r.hexagramInner, (ANCHOR + i * GATE_ARC) % 360);
  return out.join("\n");
}

// Faint concentric guide rings, one per planet lane (drawn inside the mandala).
function buildLanes(): string {
  const parts: string[] = [];
  LANE_ORDER.forEach((_, i) => {
    parts.push(`<circle class="lane" cx="${CX}" cy="${CY}" r="${laneRadius(i).toFixed(1)}" />`);
  });
  return parts.join("\n");
}

// orderIndex 0 (Sun) = innermost lane, last (Pluto) = outermost.
function laneRadius(orderIndex: number): number {
  const step = (R_LANE_OUT - R_LANE_IN) / (LANE_ORDER.length - 1);
  return R_LANE_IN + orderIndex * step;
}

// ── central bodygraph: the REAL branded Delphi bodygraph, fetched once (one
//    chart call), whose 9 centers light up LIVE from the deterministic transit
//    definition. Recognizable art + live motion, no per-frame chart calls.
const CENTER_IDS = [
  "head-center", "ajna-center", "throat-center", "g-center", "heart-center",
  "splenic-center", "sacral-center", "solar-plexus-center", "root-center",
];

// Style ONE moment's real transit bodygraph (fetched from mybodygraph, so its
// gate legs + channel connectors are already drawn correctly for that instant)
// for the animation: activated legs/channels (drawn black) → white via `.leg.on`;
// everything else (fill none) → grey skeleton via `.leg`; open centers → `.cs.open`
// (dark), defined centers → `.cs` (keep the Delphi color); design side + gate
// discs hidden. Sized as a nested svg for the wheel center. Skin styling is CSS,
// so the sky/felt toggle still works after a swap.
function styleBodygraphForAnim(svg: string): string {
  let s = svg;
  // the white "channel-back" path draws every channel tube (invisible on white
  // paper, but glaring on the dark sky) → dim it; the white gate legs fill it in
  s = s.replace(/(<path id="channel-back")([^>]*?)fill="#ffffff"/, `$1 class="chan-back"$2fill="#ffffff"`);
  // a gate leg is white when its gate is activated; otherwise hidden (the dim
  // tube shows the channel). A channel reads white only when BOTH gates are lit.
  s = s.replace(/(id="personality-[\d-]+")([^>]*?)fill="#000000"/g, `$1 class="leg on"$2fill="#000000"`);
  s = s.replace(/(id="personality-[\d-]+")([^>]*?)fill="none"/g, `$1 class="leg"$2fill="none"`);
  s = s.replace(/(id="design-[\d-]+")([^>]*?)fill="[^"]*"/g, `$1$2fill="none"`);
  s = s.replace(/(<path id="_\d+"[^>]*?fill=")[^"]*(")/g, `$1none$2`);
  for (const id of CENTER_IDS) {
    s = s.replace(new RegExp(`(<path id="${id}")([^>]*?)fill="#ffffff"`), `$1 class="cs open"$2fill="#ffffff"`);
    s = s.replace(new RegExp(`(<path id="${id}")([^>]*?)fill="(#(?!ffffff)[0-9a-fA-F]{6})"`), `$1 class="cs"$2fill="$3"`);
  }
  const bh = 0.34 * S, bw = (bh * 400) / 693, bx = CX - bw / 2, by = CY - bh / 2;
  return s.replace(/<svg\b[^>]*>/, `<svg class="bgsvg" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" viewBox="0 0 400 693" preserveAspectRatio="xMidYMid meet">`);
}

// Shared, de-duplicated pool of styled bodygraph SVGs (many samples share the
// same gate configuration → same bodygraph). Frames reference these by index.
interface BgPool { list: string[]; sig: Map<string, number>; }

// ── per-planet token (both skins live inside; CSS shows one) ─────────────────
function buildDefs(): string {
  const d: string[] = [];
  d.push(`<filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3.2" /></filter>`);
  d.push(`<filter id="feltShadow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#000" flood-opacity="0.35" /></filter>`);
  // felt fuzz: gentle edge displacement
  d.push(`<filter id="feltFuzz"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" /></filter>`);
  for (const p of PLANETS) {
    d.push(`<radialGradient id="sph-${p.key.replace(/\s+/g, "")}" cx="34%" cy="30%" r="78%">` +
      `<stop offset="0%" stop-color="${lighten(p.color, 0.62)}" />` +
      `<stop offset="55%" stop-color="${p.color}" />` +
      `<stop offset="100%" stop-color="${darken(p.color, 0.45)}" />` +
      `</radialGradient>`);
  }
  return d.join("\n");
}

// A deterministic scatter of little darker felt spots for a "wool ball" texture.
function feltDots(r: number, color: string): string {
  const pts: [number, number, number][] = [
    [-0.30, -0.12, 0.13], [0.26, -0.34, 0.10], [0.36, 0.18, 0.12],
    [-0.16, 0.40, 0.11], [0.04, 0.06, 0.09], [-0.44, 0.16, 0.09],
  ];
  return `<g fill="${color}" opacity="0.55">` +
    pts.map(([dx, dy, rr]) => `<circle cx="${(dx * r).toFixed(1)}" cy="${(dy * r).toFixed(1)}" r="${(rr * r).toFixed(1)}" />`).join("") +
    `</g>`;
}

function buildToken(p: PMeta): string {
  const id = p.key.replace(/\s+/g, "");
  const r = p.size * R_TOKEN_SCALE;
  const parts: string[] = [];

  // ---- night sky skin ----
  const sky: string[] = [];
  sky.push(`<circle class="halo" r="${(r * 1.9).toFixed(1)}" fill="${p.color}" filter="url(#glow)" opacity="0.5" />`);
  if (p.node) {
    // nodes: a glowing ring rather than a body
    sky.push(`<circle r="${r}" fill="none" stroke="${lighten(p.color, 0.4)}" stroke-width="2.4" />`);
    sky.push(`<text class="tglyph" y="${(r * 0.5).toFixed(1)}" fill="${lighten(p.color, 0.6)}" style="font-size:${(r * 1.2).toFixed(0)}px">${p.glyph}</text>`);
  } else {
    if (p.ring) sky.push(`<ellipse rx="${(r * 2).toFixed(1)}" ry="${(r * 0.62).toFixed(1)}" fill="none" stroke="${lighten(p.color, 0.35)}" stroke-width="2.6" transform="rotate(-20)" opacity="0.9" />`);
    sky.push(`<circle r="${r}" fill="url(#sph-${id})" />`);
    if (p.bands) {
      sky.push(`<clipPath id="clip-${id}"><circle r="${r}" /></clipPath>`);
      sky.push(`<g clip-path="url(#clip-${id})" opacity="0.55">` +
        `<ellipse cy="${(-r * 0.4).toFixed(1)}" rx="${r}" ry="${(r * 0.16).toFixed(1)}" fill="${darken(p.color, 0.3)}" />` +
        `<ellipse cy="${(r * 0.05).toFixed(1)}" rx="${r}" ry="${(r * 0.2).toFixed(1)}" fill="${darken(p.color, 0.18)}" />` +
        `<ellipse cy="${(r * 0.5).toFixed(1)}" rx="${r}" ry="${(r * 0.14).toFixed(1)}" fill="${darken(p.color, 0.32)}" />` +
        `</g>`);
    }
    if (p.craters) {
      sky.push(`<g opacity="0.5" fill="${darken(p.color, 0.28)}">` +
        `<circle cx="${(-r * 0.3).toFixed(1)}" cy="${(-r * 0.2).toFixed(1)}" r="${(r * 0.22).toFixed(1)}" />` +
        `<circle cx="${(r * 0.35).toFixed(1)}" cy="${(r * 0.1).toFixed(1)}" r="${(r * 0.16).toFixed(1)}" />` +
        `<circle cx="${(r * 0.05).toFixed(1)}" cy="${(r * 0.45).toFixed(1)}" r="${(r * 0.13).toFixed(1)}" />` +
        `</g>`);
    }
    if (p.ring) sky.push(`<path d="M ${(-r * 2).toFixed(1)} 0 A ${(r * 2).toFixed(1)} ${(r * 0.62).toFixed(1)} 0 0 0 ${(r * 2).toFixed(1)} 0" fill="none" stroke="${lighten(p.color, 0.25)}" stroke-width="2.6" transform="rotate(-20)" opacity="0.55" />`);
  }
  parts.push(`<g class="sk sky">${sky.join("")}</g>`);

  // ---- felt board skin ----
  // Each body gets a distinct hand-felted look: spiky smiley Sun, crescent Moon,
  // banded Jupiter, continent Earth, ringed Saturn/Uranus/Pluto, spotted inners,
  // donut nodes. The fuzzy edge comes from feltFuzz; faces stay crisp (no fuzz).
  const felt: string[] = [];
  const feltColor = p.node ? mix(p.color, "#ffffff", 0.15) : p.color;
  let showGlyph = true;

  if (p.key === "Sun") {
    showGlyph = false;
    const nRay = 12, rays: string[] = [];
    for (let i = 0; i < nRay; i++) {
      const a = (i / nRay) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
      const base = r * 0.92, tip = r * 1.55, w = r * 0.26;
      const ax = cx * base, ay = cy * base, tx = cx * tip, ty = cy * tip, px = -cy * w, py = cx * w;
      rays.push(`<path d="M ${(ax + px).toFixed(1)} ${(ay + py).toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)} L ${(ax - px).toFixed(1)} ${(ay - py).toFixed(1)} Z" fill="${p.color}" stroke="${darken(p.color, 0.2)}" stroke-width="0.6" stroke-linejoin="round" />`);
    }
    felt.push(`<g filter="url(#feltShadow)">`);
    felt.push(`<g filter="url(#feltFuzz)">${rays.join("")}<circle r="${r}" fill="${lighten(p.color, 0.12)}" stroke="${darken(p.color, 0.22)}" stroke-width="1.2" /></g>`);
    const face = darken(p.color, 0.52);
    felt.push(`<g fill="${face}"><circle cx="${(-r * 0.32).toFixed(1)}" cy="${(-r * 0.16).toFixed(1)}" r="${(r * 0.12).toFixed(1)}" /><circle cx="${(r * 0.32).toFixed(1)}" cy="${(-r * 0.16).toFixed(1)}" r="${(r * 0.12).toFixed(1)}" /></g>`);
    felt.push(`<path d="M ${(-r * 0.4).toFixed(1)} ${(r * 0.2).toFixed(1)} Q 0 ${(r * 0.62).toFixed(1)} ${(r * 0.4).toFixed(1)} ${(r * 0.2).toFixed(1)}" fill="none" stroke="${face}" stroke-width="${(r * 0.11).toFixed(1)}" stroke-linecap="round" />`);
    felt.push(`</g>`);
  } else if (p.key === "Moon") {
    showGlyph = false;
    const cres = lighten(feltColor, 0.18), r2 = (r * 0.75).toFixed(1);
    felt.push(`<g filter="url(#feltShadow)"><g filter="url(#feltFuzz)" transform="rotate(-18)">` +
      `<path d="M 0 ${(-r).toFixed(1)} a ${r} ${r} 0 1 0 0 ${(2 * r).toFixed(1)} a ${r2} ${r2} 0 1 1 0 ${(-2 * r).toFixed(1)} Z" fill="${cres}" stroke="${darken(cres, 0.22)}" stroke-width="1" />` +
      `</g></g>`);
  } else {
    const ringed = p.ring || p.key === "Uranus" || p.key === "Pluto";
    felt.push(`<g filter="url(#feltShadow)">`);
    if (ringed) felt.push(`<ellipse rx="${(r * 1.9).toFixed(1)}" ry="${(r * 0.5).toFixed(1)}" fill="none" stroke="${darken(feltColor, 0.12)}" stroke-width="${(r * 0.26).toFixed(1)}" transform="rotate(-18)" opacity="0.9" />`);
    felt.push(`<g filter="url(#feltFuzz)">`);
    if (p.node) {
      felt.push(`<circle r="${r}" fill="none" stroke="${feltColor}" stroke-width="${(r * 0.5).toFixed(1)}" />`);
    } else {
      felt.push(`<circle r="${r}" fill="${feltColor}" stroke="${darken(feltColor, 0.25)}" stroke-width="1.1" />`);
      felt.push(`<circle r="${(r * 0.55).toFixed(1)}" cx="${(-r * 0.28).toFixed(1)}" cy="${(-r * 0.28).toFixed(1)}" fill="${lighten(feltColor, 0.3)}" opacity="0.5" />`);
    }
    felt.push(`</g>`);
    if (p.bands) {
      felt.push(`<clipPath id="fclip-${id}"><circle r="${r}" /></clipPath>`);
      felt.push(`<g clip-path="url(#fclip-${id})" stroke="${darken(feltColor, 0.22)}" stroke-width="${(r * 0.13).toFixed(1)}" stroke-linecap="round">` +
        `<line x1="${(-r).toFixed(1)}" y1="${(-r * 0.42).toFixed(1)}" x2="${r}" y2="${(-r * 0.42).toFixed(1)}" />` +
        `<line x1="${(-r).toFixed(1)}" y1="0" x2="${r}" y2="0" />` +
        `<line x1="${(-r).toFixed(1)}" y1="${(r * 0.45).toFixed(1)}" x2="${r}" y2="${(r * 0.45).toFixed(1)}" /></g>`);
    } else if (p.key === "Earth") {
      felt.push(`<g fill="${mix("#3f9d54", feltColor, 0.12)}" opacity="0.85"><circle cx="${(-r * 0.2).toFixed(1)}" cy="${(-r * 0.24).toFixed(1)}" r="${(r * 0.3).toFixed(1)}" /><circle cx="${(r * 0.3).toFixed(1)}" cy="${(r * 0.26).toFixed(1)}" r="${(r * 0.24).toFixed(1)}" /></g>`);
    } else if (!p.node) {
      felt.push(feltDots(r, darken(feltColor, 0.22)));
    }
    felt.push(`</g>`);
  }
  if (showGlyph) felt.push(`<text class="tglyph felt-glyph" y="${(r * 0.5).toFixed(1)}" fill="${darken(feltColor, 0.55)}" style="font-size:${(r * 1.05).toFixed(0)}px">${p.glyph}</text>`);
  parts.push(`<g class="sk felt">${felt.join("")}</g>`);

  // label (name + gate.line), shown under the token
  parts.push(`<g class="lab"><text class="nm" y="${(r + 12).toFixed(1)}">${p.short}</text><text class="gl" y="${(r + 23).toFixed(1)}"></text></g>`);

  return `<g class="planet" data-key="${p.key}" data-group="${p.group}">${parts.join("")}</g>`;
}

// starfield for the night-sky background (deterministic, seed-free jitter)
function buildStars(): string {
  const stars: string[] = [];
  let seed = 1337;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 160; i++) {
    const x = rnd() * S, y = rnd() * S;
    const dx = x - CX, dy = y - CY;
    if (Math.sqrt(dx * dx + dy * dy) > S * 0.49) continue; // keep inside the disc
    const r = 0.4 + rnd() * 1.3;
    stars.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${(0.25 + rnd() * 0.6).toFixed(2)}" />`);
  }
  return stars.join("");
}

// A datetime `elapsedMin` minutes after UTC midnight of `startDate`, as the
// clock strings the chart API wants.
function dateTimeAt(startDate: string, elapsedMin: number): { date: string; hhmm: string } {
  const ms = new Date(`${startDate}T00:00:00Z`).getTime() + elapsedMin * 60000;
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hhmm: `${g("hour")}:${g("minute")}` };
}

interface SpanData {
  startDate: string;
  spanMinutes: number;
  mtOffsetMin: number;
  frames: number[];
  tracks: { key: string; group: Group; color: string; center: boolean; radius: number; lon: number[] }[];
  /** Index into the shared bodygraph pool for each kept frame. */
  bgFrames: number[];
}

// Sample one span (a run of `days` from startDate) at `intervalMin` resolution.
// Each sample fetches the REAL transit bodygraph (positions + the correctly-drawn
// SVG in one call — no extra API cost vs positions-only), so gates/channels are
// mybodygraph-correct at every step. Returns smooth unwrapped longitude tracks +
// a bodygraph index per frame (de-duplicated into the shared pool).
async function sampleSpan(
  startDate: string, days: number, intervalMin: number, displayTz: string, bgPool: BgPool,
): Promise<SpanData> {
  const spanMinutes = days * 1440;
  const times: number[] = [];
  for (let m = 0; m <= spanMinutes; m += intervalMin) times.push(m);
  console.log(`  ${days}-day span: ${times.length} samples (every ${intervalMin} min)…`);

  // Fetch each sample; RETRY failures across passes so no sample is dropped —
  // a missing sample would leave a gap that the unwrap mistakes for retrograde
  // motion (fatal in the coarse year view). Slow pace avoids the API rate-limit.
  const results = new Map<number, { positions: any[]; svg: string }>();
  let pending = times.slice();
  for (let attempt = 0; attempt < 5 && pending.length; attempt++) {
    const failed: number[] = [];
    for (const m of pending) {
      const { date, hhmm } = dateTimeAt(startDate, m);
      try { results.set(m, await castTransitBodygraph(date, hhmm, "UTC")); process.stdout.write("."); }
      catch { failed.push(m); process.stdout.write("x"); }
      await new Promise((r) => setTimeout(r, 220));
    }
    pending = failed;
    if (pending.length) { process.stdout.write(`\n    retrying ${pending.length} failed sample(s)…`); await new Promise((r) => setTimeout(r, 4000)); }
  }
  process.stdout.write("\n");

  const frames = times.filter((m) => results.has(m));
  if (frames.length < 2) throw new Error(`not enough samples for the ${days}-day span`);
  if (frames.length < times.length) console.log(`  ⚠ ${times.length - frames.length} sample(s) still missing after retries`);

  const byPlanet = new Map<string, number[]>();
  for (const p of PLANETS) byPlanet.set(p.key, []);
  const bgFrames: number[] = [];
  for (const m of frames) {
    const sky = results.get(m)!;
    // Guard the 13-body rule: no Chiron/Lilith may ride the wheel or light the
    // bodygraph. Aborts the render loudly if a future change re-leaks them.
    assertTraditionalBodies(sky.positions, `mandala sample ${dateTimeAt(startDate, m).hhmm}`);
    const lonByKey = new Map(sky.positions.map((pos: any) => [pos.planet as string, pos.longitude ?? 0]));
    for (const p of PLANETS) byPlanet.get(p.key)!.push(lonByKey.get(p.key) ?? NaN);
    // de-dup the bodygraph by the 13 tracked bodies' gate signature (same gates
    // → same graph). Uses only the animated bodies so the client can recompute
    // this signature live from the interpolated tracks and match the right graph.
    const gateByKey = new Map(sky.positions.map((pos: any) => [pos.planet as string, pos.gate]));
    const sig = [...new Set(PLANETS.map((p) => gateByKey.get(p.key)!).filter((g) => g != null))].sort((a, b) => a - b).join(",");
    let idx = bgPool.sig.get(sig);
    if (idx === undefined) { idx = bgPool.list.length; bgPool.list.push(styleBodygraphForAnim(sky.svg)); bgPool.sig.set(sig, idx); }
    bgFrames.push(idx);
  }

  // unwrap so linear interpolation crosses the 360→0 seam (and retrograde) cleanly
  const tracks = PLANETS.map((p) => {
    const raw = byPlanet.get(p.key)!;
    const lon: number[] = [];
    let offset = 0;
    for (let k = 0; k < raw.length; k++) {
      if (k === 0) { lon.push(raw[0]); continue; }
      let d = raw[k] + offset - lon[k - 1];
      while (d > 180) { offset -= 360; d -= 360; }
      while (d < -180) { offset += 360; d += 360; }
      lon.push(raw[k] + offset);
    }
    const radius = p.center ? 0 : Number(laneRadius(LANE_ORDER.indexOf(p.key)).toFixed(1));
    return { key: p.key, group: p.group, color: p.color, center: !!p.center, radius, lon };
  });

  return { startDate, spanMinutes, mtOffsetMin: offsetMinutes(startDate, displayTz), frames, tracks, bgFrames };
}

// Sun-gate → incarnation-cross name. Time-invariant (the Sun in a given gate
// always yields the same cross), so we build it ONCE by casting a year of
// charts and cache it to disk; every later run loads it for free. Lets the
// animation show the current cross live with no per-frame calls.
async function loadOrBuildSunCrossMap(): Promise<Record<number, string>> {
  const path = resolve(".cache", "sun-cross-map.json");
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  console.log("Building Sun-gate → incarnation-cross map (one-time, ~64 casts)…");
  const map: Record<number, string> = {};
  const base = Date.parse("2025-01-01T12:00:00Z");
  // Two passes over ~15 months at a 3-day step so transient cast failures on the
  // first pass get a second chance; stops early once all 64 gates are covered.
  for (let pass = 0; pass < 2 && Object.keys(map).length < 64; pass++) {
    for (let d = pass * 1; d < 470 && Object.keys(map).length < 64; d += 3) {
      const dstr = new Date(base + d * 86400000).toISOString().slice(0, 10);
      try {
        const { chart } = await castNatalChart(dstr, "12:00", "UTC");
        const sun = chart.activations.personality.find((a) => a.planet === "Sun");
        if (sun && !map[sun.gate]) map[sun.gate] = chart.incarnationCross.value;
        process.stdout.write(".");
      } catch { process.stdout.write("x"); }
      await new Promise((r) => setTimeout(r, 160));
    }
  }
  process.stdout.write(`\n  mapped ${Object.keys(map).length}/64 Sun gates\n`);
  mkdirSync(resolve(".cache"), { recursive: true });
  writeFileSync(path, JSON.stringify(map));
  return map;
}

async function main() {
  const displayTz = process.env.TRANSIT_DISPLAY_TZ ?? "America/Denver";
  const date = process.env.TRANSIT_DATE ?? new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  console.log(`\n=== Mandala Motion — from ${date} (UTC) ===\n`);

  // Three timescales on one wheel. Coarser sampling for longer spans keeps the
  // API load sane; the browser interpolates so motion stays smooth. Intervals
  // are overridable but the defaults are tuned so even the Moon reads cleanly.
  const dayInt = Number(process.env.MOTION_DAY_MIN ?? 60);       // 25 samples
  const weekInt = Number(process.env.MOTION_WEEK_MIN ?? 360);    // ~29 samples (6h)
  const monthInt = Number(process.env.MOTION_MONTH_MIN ?? 720);  // ~61 samples (12h)
  const yearInt = Number(process.env.MOTION_YEAR_MIN ?? 10080);  // ~53 samples (weekly)

  // Which timescales to include (MOTION_SPANS=day,week for the report embed;
  // all four for the standalone teaching tool) and whether to ship both skins
  // or night-sky only (MOTION_SKIN=sky drops the felt board).
  const SPAN_DEFS: Record<string, [number, number]> = { day: [1, dayInt], week: [7, weekInt], month: [30, monthInt], year: [365, yearInt] };
  const spanList = (process.env.MOTION_SPANS ?? "day,week,month,year").split(",").map((s) => s.trim()).filter((s) => SPAN_DEFS[s]);
  const skinMode = (process.env.MOTION_SKIN ?? "both") === "sky" ? "sky" : "both";
  const autoplay = process.env.MOTION_AUTOPLAY !== "0"; // embed starts paused (=0) to stay light on report open

  console.log(`Sampling the sky + real bodygraph across ${spanList.join(" / ")}…`);
  const bgPool: BgPool = { list: [], sig: new Map() };
  const spans: Record<string, SpanData> = {};
  for (const key of spanList) {
    const [days, interval] = SPAN_DEFS[key];
    spans[key] = await sampleSpan(date, days, interval, displayTz, bgPool);
  }
  console.log(`  ${bgPool.list.length} distinct bodygraph states across ${spanList.length} span(s)`);

  const sunCross = await loadOrBuildSunCrossMap();

  const payload = {
    date,
    displayTz,
    seq: WHEEL_SEQUENCE,
    geom: { CX, CY, TOP: VISUAL_TOP, ANCHOR, GATE_ARC, LINE_ARC, R_GATE_OUT, gateOuter: R_GATE_OUT, gateInner: R_GATE_IN },
    sunCross,
    bodygraphs: bgPool.list,
    bgSig: Object.fromEntries(bgPool.sig),
    spans,
    skinMode,
    autoplay,
  };

  const outDir = resolve(homedir(), "Desktop", "HD Reports", "Transits");
  mkdirSync(outDir, { recursive: true });
  const outPath = process.env.MOTION_OUT ? resolve(process.env.MOTION_OUT) : resolve(outDir, `${date} - Mandala Motion.html`);
  writeFileSync(outPath, buildHtml(payload));
  console.log(`\n✓ published to: ${outPath}`);
}

function buildHtml(payload: any): string {
  const rings = renderMandalaRings(S);
  const dividers = buildDividers();
  const lanes = buildLanes();
  const defs = buildDefs();
  const tokens = PLANETS.map(buildToken).join("\n");
  const stars = buildStars();
  const groupChips = GROUPS.map((g) => `<button class="chip on" data-group="${g.id}">${g.label}</button>`).join("");

  const CLIENT = String.raw`
(function () {
  var MM = window.__MM__;
  var G = MM.geom, SEQ = MM.seq;
  var TOP = G.TOP, CX = G.CX, CY = G.CY;
  var root = document.getElementById('mm');
  var svg = document.getElementById('wheel');
  var clock = document.getElementById('clock');
  var bigdate = document.getElementById('bigdate');
  var crossbar = document.getElementById('crossbar');
  var SUNCROSS = MM.sunCross;
  var sunTrack = null;
  var scrub = document.getElementById('scrub');
  var playBtn = document.getElementById('play');
  var pathsG = document.getElementById('paths');
  var lightsG = document.getElementById('linelights');
  var bodygraphG = document.getElementById('bodygraph');
  var POOL = MM.bodygraphs;
  var BGSIG = MM.bgSig;
  var curBg = -1;
  var SVGNS2 = 'http://www.w3.org/2000/svg';
  var WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var SVGNS = 'http://www.w3.org/2000/svg';

  // current span state (swapped by the Day/Week/Month buttons)
  var cur = (MM.spans && MM.spans.day) ? 'day' : Object.keys(MM.spans)[0], SP, FR, TR, BGF, spanMin, mtOffset, startUTC;
  function loadSpan(id) {
    cur = id; SP = MM.spans[id];
    FR = SP.frames; TR = SP.tracks; BGF = SP.bgFrames; spanMin = SP.spanMinutes; mtOffset = SP.mtOffsetMin;
    var d = SP.startDate.split('-');
    startUTC = Date.UTC(+d[0], +d[1] - 1, +d[2]);
    sunTrack = null;
    for (var q = 0; q < TR.length; q++) if (TR[q].key === 'Sun') sunTrack = TR[q];
    curBg = -1; // force the bodygraph to refresh for the new span
  }
  loadSpan(cur);

  // swap the central bodygraph to the state that applies at elapsed-minute t.
  // Prefer matching the INTERPOLATED gate-set (so a channel forms the instant the
  // planet crosses, not at the next sample); fall back to the sampled frame.
  function updateBodygraph(t) {
    var gs = [], seen = {};
    for (var k = 0; k < TR.length; k++) { var g = gateNum(lonAt(TR[k], t)); if (!seen[g]) { seen[g] = 1; gs.push(g); } }
    gs.sort(function (a, b) { return a - b; });
    var idx = BGSIG[gs.join(',')];
    if (idx === undefined) { var f = FR, i = 0; while (i < f.length - 1 && f[i + 1] <= t) i++; idx = BGF[i]; }
    if (idx === curBg) return;
    curBg = idx; bodygraphG.innerHTML = POOL[idx] || '';
  }

  function xyAt(radius, lon) {
    var fromTop = (((lon - TOP) % 360) + 360) % 360;
    var a = Math.PI / 2 + (fromTop * Math.PI) / 180;
    return [CX + radius * Math.cos(a), CY - radius * Math.sin(a)];
  }
  function gateLine(lon) {
    var fromAnchor = (((lon - G.ANCHOR) % 360) + 360) % 360;
    var wi = Math.floor(fromAnchor / G.GATE_ARC);
    var into = fromAnchor - wi * G.GATE_ARC;
    var line = Math.min(6, Math.floor(into / G.LINE_ARC) + 1);
    return SEQ[wi] + '.' + line;
  }
  function gateNum(lon) {
    var fromAnchor = (((lon - G.ANCHOR) % 360) + 360) % 360;
    return SEQ[Math.floor(fromAnchor / G.GATE_ARC)];
  }
  // which HD quarter a longitude sits in (quarter boundaries at 313.25/43.25/133.25/223.25)
  function quarterOf(lon) {
    var l = ((lon % 360) + 360) % 360;
    if (l >= 313.25 || l < 43.25) return 0; // Initiation
    if (l < 133.25) return 1;               // Civilization
    if (l < 223.25) return 2;               // Duality
    return 3;                               // Mutation
  }
  // is a body moving backwards (retrograde) in the current segment?
  function retroAt(track, t) {
    var f = FR;
    if (t <= f[0]) return track.lon[1] < track.lon[0];
    if (t >= f[f.length - 1]) { var n = track.lon.length; return track.lon[n - 1] < track.lon[n - 2]; }
    var i = 0; while (i < f.length - 1 && f[i + 1] < t) i++;
    return track.lon[i + 1] < track.lon[i];
  }
  // longitude of a track at elapsed-minute t (linear interp between samples)
  function lonAt(track, t) {
    var f = FR;
    if (t <= f[0]) return track.lon[0];
    if (t >= f[f.length - 1]) return track.lon[track.lon.length - 1];
    var i = 0;
    while (i < f.length - 1 && f[i + 1] < t) i++;
    var span = f[i + 1] - f[i];
    var frac = span > 0 ? (t - f[i]) / span : 0;
    return track.lon[i] + (track.lon[i + 1] - track.lon[i]) * frac;
  }

  // cache token + gate-cell elements
  var tokens = {};
  var els = svg.querySelectorAll('.planet');
  for (var k = 0; k < els.length; k++) tokens[els[k].getAttribute('data-key')] = els[k];
  var gateCells = {};
  var gcs = svg.querySelectorAll('[data-gatecell]');
  for (var gi = 0; gi < gcs.length; gi++) gateCells[gcs[gi].getAttribute('data-gatecell')] = gcs[gi];
  var hexEls = {};
  var hxs = svg.querySelectorAll('[data-hex]');
  for (var hi = 0; hi < hxs.length; hi++) hexEls[hxs[hi].getAttribute('data-hex')] = hxs[hi];
  var qLabels = svg.querySelectorAll('.q-label');
  var zLabels = svg.querySelectorAll('.z-label');

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parts(ms) { var d = new Date(ms); return { wd: WD[d.getUTCDay()], mo: MO[d.getUTCMonth()], day: d.getUTCDate(), y: d.getUTCFullYear(), h: d.getUTCHours(), m: d.getUTCMinutes() }; }

  // annulus sector path (ported from lib/render/mandala.ts), used to light up
  // the line cell a planet currently occupies.
  function sector(rOut, rIn, lon1, lon2) {
    var a = xyAt(rOut, lon1), b = xyAt(rOut, lon2), c = xyAt(rIn, lon2), d = xyAt(rIn, lon1);
    var span = (((lon2 - lon1) % 360) + 360) % 360;
    var la = span > 180 ? 1 : 0;
    return 'M ' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) +
      ' A ' + rOut + ' ' + rOut + ' 0 ' + la + ' 0 ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1) +
      ' L ' + c[0].toFixed(1) + ' ' + c[1].toFixed(1) +
      ' A ' + rIn + ' ' + rIn + ' 0 ' + la + ' 1 ' + d[0].toFixed(1) + ' ' + d[1].toFixed(1) + ' Z';
  }
  // longitude where the line cell containing this planet begins
  function lineStartLon(lon) {
    var fromAnchor = (((lon - G.ANCHOR) % 360) + 360) % 360;
    return G.ANCHOR + Math.floor(fromAnchor / G.LINE_ARC) * G.LINE_ARC;
  }

  function render(t) {
    while (lightsG.firstChild) lightsG.removeChild(lightsG.firstChild);
    var activeGates = {};
    for (var i = 0; i < TR.length; i++) {
      var tr = TR[i];
      var el = tokens[tr.key];
      if (!el) continue;
      var lon = lonAt(tr, t);
      var rad = tr.center ? 0 : tr.radius; // the Sun sits at the center
      var p = xyAt(rad, lon);
      el.setAttribute('transform', 'translate(' + p[0].toFixed(2) + ' ' + p[1].toFixed(2) + ')');
      var gl = el.querySelector('.gl');
      if (gl) gl.textContent = gateLine(lon);
      // planet label turns red while the body is retrograde (nodes excluded)
      el.classList.toggle('retro', tr.group !== 'nodes' && retroAt(tr, t));
      // visible planets: light the gate they occupy + beam out to it
      if (active[tr.group]) {
        activeGates[gateNum(lon)] = true;
        // glowing beam from the planet out to its gate cell
        var a = xyAt(rad, lon), b = xyAt(G.gateOuter, lon);
        var beam = document.createElementNS(SVGNS2, 'line');
        beam.setAttribute('x1', a[0].toFixed(1)); beam.setAttribute('y1', a[1].toFixed(1));
        beam.setAttribute('x2', b[0].toFixed(1)); beam.setAttribute('y2', b[1].toFixed(1));
        beam.setAttribute('stroke', tr.color);
        beam.setAttribute('stroke-width', '2.2');
        beam.setAttribute('stroke-linecap', 'round');
        beam.setAttribute('opacity', '0.5');
        beam.setAttribute('filter', 'url(#glow)');
        lightsG.appendChild(beam);
        // the lit line cell itself
        var ls = lineStartLon(lon);
        var cell = document.createElementNS(SVGNS2, 'path');
        cell.setAttribute('d', sector(G.gateOuter, G.gateInner, ls, ls + G.LINE_ARC));
        cell.setAttribute('fill', tr.color);
        cell.setAttribute('fill-opacity', '0.9');
        cell.setAttribute('stroke', tr.color);
        cell.setAttribute('stroke-width', '1');
        cell.setAttribute('filter', 'url(#glow)');
        lightsG.appendChild(cell);
      }
    }
    // gate numbers + hexagrams light up white when a planet occupies that gate
    for (var gk in gateCells) gateCells[gk].classList.toggle('active', !!activeGates[gk]);
    for (var hk in hexEls) hexEls[hk].classList.toggle('active', !!activeGates[hk]);

    // swap in the real bodygraph for this moment (gates/channels/centers correct)
    updateBodygraph(t);

    var ms = startUTC + t * 60000;
    var u = parts(ms), mt = parts(ms + mtOffset * 60000);
    // date line (always) + a time line below it
    var dateStr = u.wd + ' ' + u.mo + ' ' + u.day + ', ' + u.y;
    var timeStr;
    if (cur === 'day') timeStr = pad(u.h) + ':' + pad(u.m) + ' UTC · ' + pad(mt.h) + ':' + pad(mt.m) + ' MT';
    else if (cur === 'year') timeStr = '';
    else timeStr = pad(u.h) + ':' + pad(u.m) + ' UTC';
    bigdate.innerHTML = '<span class="bd-date">' + dateStr + '</span>' + (timeStr ? '<span class="bd-time">' + timeStr + '</span>' : '');
    clock.textContent = timeStr ? dateStr + ' · ' + timeStr : dateStr;

    // incarnation cross of the current transit Sun, shown at the bottom;
    // and highlight the sign + quarter the Sun currently occupies in white.
    if (sunTrack) {
      var sunLon = lonAt(sunTrack, t);
      crossbar.textContent = SUNCROSS[gateNum(sunLon)] || '';
      var signIdx = Math.floor((((sunLon % 360) + 360) % 360) / 30);
      var qIdx = quarterOf(sunLon);
      for (var qi = 0; qi < qLabels.length; qi++) qLabels[qi].classList.toggle('sun-here', +qLabels[qi].getAttribute('data-quarter') === qIdx);
      for (var zi = 0; zi < zLabels.length; zi++) zLabels[zi].classList.toggle('sun-here', +zLabels[zi].getAttribute('data-sign') === signIdx);
    }
  }

  // path overlay: trace each visible planet's route across the whole span
  var pathsOn = false;
  function drawPaths() {
    while (pathsG.firstChild) pathsG.removeChild(pathsG.firstChild);
    if (!pathsOn) return;
    var N = 480;
    for (var i = 0; i < TR.length; i++) {
      var tr = TR[i];
      if (!active[tr.group]) continue;
      var pts = '';
      for (var s = 0; s <= N; s++) {
        var xy = xyAt(tr.radius, lonAt(tr, (s / N) * spanMin));
        pts += xy[0].toFixed(1) + ',' + xy[1].toFixed(1) + ' ';
      }
      var pl = document.createElementNS(SVGNS, 'polyline');
      pl.setAttribute('points', pts);
      pl.setAttribute('fill', 'none');
      pl.setAttribute('stroke', tr.color);
      pl.setAttribute('stroke-width', '1.6');
      pl.setAttribute('stroke-linecap', 'round');
      pl.setAttribute('opacity', '0.55');
      pathsG.appendChild(pl);
    }
  }

  // ── animation loop ──
  var t = 0, playing = (MM.autoplay !== false), last = null, rafOn = false;
  var secondsPerSpan = 24; // whole span plays in N seconds
  // the year covers 365 days in the same wall-clock time, so play it 2x slower
  // (Slow becomes ~2 min), there's a lot more motion to take in.
  function speedMinPerMs() { return spanMin / (secondsPerSpan * (cur === 'year' ? 2 : 1) * 1000); }

  function frame(now) {
    if (!playing) { rafOn = false; return; }  // paused: stop the loop, no CPU churn
    if (last === null) last = now;
    var dt = now - last; last = now;
    t += dt * speedMinPerMs();
    if (t >= spanMin) t -= spanMin;
    scrub.value = String(Math.floor(t));
    render(t);
    requestAnimationFrame(frame);
  }
  function startLoop() { if (!rafOn && playing) { rafOn = true; last = null; requestAnimationFrame(frame); } }

  playBtn.addEventListener('click', function () {
    playing = !playing;
    playBtn.textContent = playing ? '❙❙ Pause' : '▶ Play';
    if (playing) startLoop();
  });
  scrub.addEventListener('input', function () {
    playing = false;
    playBtn.textContent = '▶ Play';
    t = Number(scrub.value);
    render(t);
  });

  // span buttons (Day / Week / Month)
  var spanBtns = document.querySelectorAll('[data-span]');
  for (var sp = 0; sp < spanBtns.length; sp++) {
    spanBtns[sp].addEventListener('click', function (e) {
      loadSpan(e.target.getAttribute('data-span'));
      scrub.max = String(spanMin);
      t = 0; scrub.value = '0'; last = null;
      for (var q = 0; q < spanBtns.length; q++) spanBtns[q].classList.remove('on');
      e.target.classList.add('on');
      drawPaths();
      render(0);
    });
  }

  // speed buttons
  var speeds = document.querySelectorAll('[data-speed]');
  for (var s = 0; s < speeds.length; s++) {
    speeds[s].addEventListener('click', function (e) {
      secondsPerSpan = Number(e.target.getAttribute('data-speed'));
      for (var q = 0; q < speeds.length; q++) speeds[q].classList.remove('on');
      e.target.classList.add('on');
    });
  }

  // skin toggle
  var skinBtns = document.querySelectorAll('[data-skin]');
  for (var b = 0; b < skinBtns.length; b++) {
    skinBtns[b].addEventListener('click', function (e) {
      root.className = 'mm ' + e.target.getAttribute('data-skin') + (root.classList.contains('nolabels') ? ' nolabels' : '');
      for (var q = 0; q < skinBtns.length; q++) skinBtns[q].classList.remove('on');
      e.target.classList.add('on');
    });
  }

  // group filter chips
  var active = {};
  var chips = document.querySelectorAll('button[data-group]');
  for (var c = 0; c < chips.length; c++) {
    active[chips[c].getAttribute('data-group')] = true;
    chips[c].addEventListener('click', function (e) {
      var g = e.target.getAttribute('data-group');
      active[g] = !active[g];
      e.target.classList.toggle('on', active[g]);
      applyGroups();
      drawPaths();
    });
  }
  function applyGroups() {
    var pl = svg.querySelectorAll('.planet');
    for (var i = 0; i < pl.length; i++) {
      var g = pl[i].getAttribute('data-group');
      pl[i].style.display = active[g] ? '' : 'none';
    }
  }

  // labels toggle
  var labToggle = document.getElementById('labels');
  labToggle.addEventListener('change', function () {
    root.classList.toggle('nolabels', !labToggle.checked);
  });

  // paths toggle
  var pathToggle = document.getElementById('paths-toggle');
  pathToggle.addEventListener('change', function () {
    pathsOn = pathToggle.checked;
    drawPaths();
  });

  // present mode: hide the controls for filming; Esc or a click exits
  var presentBtn = document.getElementById('present');
  function setPresent(on) { root.classList.toggle('present', on); }
  presentBtn.addEventListener('click', function () { setPresent(true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setPresent(false); });
  svg.addEventListener('click', function () { if (root.classList.contains('present')) setPresent(false); });

  playBtn.textContent = playing ? '❙❙ Pause' : '▶ Play';
  render(0);
  if (playing) startLoop();
})();
`;

  const STYLE = String.raw`
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Montserrat, system-ui, sans-serif; }
  .mm { min-height: 100vh; padding: 16px; transition: background .4s; display: flex; flex-direction: row; align-items: stretch; gap: 22px; }
  .mm.sky  { background: radial-gradient(circle at 40% 40%, #1a1740 0%, #0b0a1f 70%, #060512 100%); color: #e8e6f5; }
  .mm.felt { background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E"), radial-gradient(circle at 42% 38%, #8f8bcb 0%, #6f6ab4 60%, #5b56a2 100%); color: #14112b; }
  .wheelcol { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
  .panel { flex: 0 0 300px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; max-height: calc(100vh - 32px); padding: 4px 6px; }
  .panel > .controls { margin: 0; }
  .panel::-webkit-scrollbar { width: 8px; } .panel::-webkit-scrollbar-thumb { background: rgba(132,80,149,.4); border-radius: 4px; }
  header { text-align: left; margin-bottom: 2px; }
  header h1 { font-size: 18px; font-weight: 700; margin: 0 0 2px; letter-spacing: .3px; }
  header .sub { font-size: 12px; opacity: .7; }
  .stage { display: flex; justify-content: center; align-items: center; width: 100%; min-height: 0; }
  svg { width: min(82vh, 100%); height: auto; }
  .ring { fill: none; stroke-width: 1; }
  .divider { stroke-width: .6; }
  .lane { fill: none; stroke-width: .5; }
  .gnum { font-size: 12px; text-anchor: middle; dominant-baseline: central; font-weight: 600; }
  .mm.sky .ring { stroke: rgba(255,255,255,.28); }
  .mm.sky .divider { stroke: rgba(255,255,255,.12); }
  .mm.sky .lane { stroke: rgba(255,255,255,.06); }
  /* felt: transparent ring backgrounds (the felt shows through), black text + borders */
  .mm.felt .ring { stroke: #14112b; }
  .mm.felt .divider { stroke: rgba(20,17,43,.4); }
  .mm.felt .lane { stroke: rgba(20,17,43,.16) !important; stroke-width: 1; }
  .mm.felt .q-sector { fill: transparent !important; }
  .mm.felt .z-cell { fill: transparent !important; stroke: rgba(20,17,43,.35); }
  .mm.felt .g-cell { fill: transparent !important; stroke: #14112b; }
  .mm.felt .rings-div { stroke: rgba(20,17,43,.4); }
  .mm.felt .q-label { fill: #14112b !important; }
  .mm.felt .z-label { fill: #14112b !important; }
  .mm.felt .g-num { fill: #14112b !important; }
  .mm.felt .stars { display: none; }
  .mm.felt .halo { display: none; }
  /* Night-sky theming of the reused mandala: clear rings, white text, hexagrams
     inverted to white, gate cells the color of the sky with grey/white numbers. */
  .mm.sky .q-sector { fill: transparent !important; }
  .mm.sky .z-cell { fill: transparent !important; stroke: rgba(255,255,255,.10) !important; }
  .mm.sky .q-label { fill: #7d7a93 !important; }
  .mm.sky .z-label { fill: #7d7a93 !important; }
  /* highlight the sign + quarter the Sun is currently in */
  .mm.sky .q-label.sun-here, .mm.sky .z-label.sun-here { fill: #ffffff !important; font-weight: 600 !important; }
  .mm.felt .q-label.sun-here, .mm.felt .z-label.sun-here { fill: #2a2118 !important; font-weight: 700 !important; }
  /* hexagrams: grey like inactive gates by default, white when a planet is in the gate */
  .mm.sky .hex-img { filter: brightness(0) invert(0.49); }
  .mm.sky .hex-img.active { filter: brightness(0) invert(1); }
  .mm.sky .g-cell { fill: #0b0a1f !important; fill-opacity: 1 !important; stroke: rgba(255,255,255,.12) !important; }
  .mm.sky .g-num { fill: #7d7a93 !important; font-weight: 500 !important; }
  .mm.sky [data-gatecell].active .g-num { fill: #ffffff !important; font-weight: 700 !important; }
  /* grey division markers between ring segments */
  .rings-div { stroke-width: 0.8; }
  .mm.sky .rings-div { stroke: #7d7a93; }
  .mm.felt .rings-div { stroke: rgba(74,63,47,.25); }
  /* central bodygraph (the REAL per-moment transit chart, swapped as it plays) */
  #bodygraph { pointer-events: none; }
  /* keep the 9 centers legible so the shape reads even when few legs are active */
  .cs { stroke-width: 2; }
  .mm.sky .cs { stroke: #b3afca; } .mm.felt .cs { stroke: #7a6f57; }
  .mm.sky .cs.open { fill: #161026 !important; }  /* open center: dark, outlined */
  .mm.felt .cs.open { fill: #f4ecdb !important; }
  /* the channel tube is dim (non-active); an activated gate's leg is white, so a
     channel reads white only when BOTH its gates are lit (both halves white) */
  .chan-back { stroke: none; }
  .mm.sky .chan-back { fill: #2a2842 !important; }
  .mm.felt .chan-back { fill: #ddd3bc !important; }
  .leg { fill: none !important; }
  .mm.sky .leg.on { fill: #ffffff !important; }         /* active gate = white */
  .mm.felt .leg.on { fill: #1c140c !important; }
  /* prominent calendar + incarnation cross */
  #bigdate { text-align: center; font-variant-numeric: tabular-nums; margin: 2px 0 6px; }
  #bigdate .bd-date { display: block; font-size: 22px; font-weight: 700; letter-spacing: .3px; }
  #bigdate .bd-time { display: block; font-size: 26px; font-weight: 700; letter-spacing: .4px; margin-top: 1px; }
  #crossbar { text-align: center; font-size: 16px; font-weight: 600; letter-spacing: .3px; margin: 8px 0 4px; min-height: 20px; opacity: .92; }
  .mm.sky #bigdate { color: #ffffff; } .mm.sky #crossbar { color: #d9b8e6; }
  .mm.felt #bigdate { color: #4a3f2f; } .mm.felt #crossbar { color: #6b4a78; }
  /* Brand: Montserrat everywhere (the mandala renderer emits serif gate numbers). */
  .g-num, .q-label, .z-label { font-family: Montserrat, system-ui, sans-serif !important; }
  .mm.sky .sky { display: block; } .mm.sky .felt { display: none; }
  .mm.felt .felt { display: block; } .mm.felt .sky { display: none; }
  .tglyph { text-anchor: middle; dominant-baseline: central; font-weight: 700; }
  .lab text { text-anchor: middle; paint-order: stroke; stroke-width: 2.4px; stroke-linejoin: round; }
  .nm { font-size: 13px; font-weight: 700; }
  .gl { font-size: 11px; opacity: .95; }
  .mm.sky .lab text { fill: #fff; stroke: rgba(6,5,18,.85); }
  .mm.felt .lab text { fill: #4a3f2f; stroke: rgba(239,230,212,.85); }
  .mm.nolabels .lab { display: none; }
  /* retrograde planets: label turns red */
  .planet.retro .nm, .planet.retro .gl { fill: #ff6b6b !important; }
  .mm.felt .planet.retro .nm, .mm.felt .planet.retro .gl { fill: #c62828 !important; }
  .lanes { pointer-events: none; }
  #linelights path { pointer-events: none; }
  #centerClock { text-anchor: middle; dominant-baseline: central; font-weight: 700; }
  .mm.sky #centerClock { fill: rgba(255,255,255,.92); }
  .mm.felt #centerClock { fill: rgba(74,63,47,.9); }
  #present { background: rgba(132,80,149,.14); }
  .mm.present .panel { display: none; }
  .mm.present { padding: 12px 0; }
  .mm.present .wheelcol { justify-content: center; }
  .mm.present svg { width: min(86vh, 96vw); }
  .mm.present #bigdate .bd-date { font-size: 26px; }
  .mm.present #bigdate .bd-time { font-size: 30px; }
  @media (max-width: 760px) {
    .mm { flex-direction: column; }
    .panel { flex-basis: auto; max-height: none; overflow: visible; }
    .controls { justify-content: center; }
  }
  .controls { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; justify-content: flex-start; }
  .controls .grp { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .controls .lbl { font-size: 11px; opacity: .65; text-transform: uppercase; letter-spacing: .5px; margin-right: 2px; width: 100%; }
  button { font-family: inherit; font-size: 12px; padding: 6px 12px; border-radius: 20px; border: 1px solid transparent; cursor: pointer; background: rgba(132,80,149,.18); color: inherit; transition: all .15s; }
  button:hover { background: rgba(132,80,149,.32); }
  button.on { background: #845095; color: #fff; }
  button.paused { }
  #play { min-width: 92px; font-weight: 600; background: #845095; color: #fff; }
  #scrub { width: 100%; accent-color: #845095; }
  .scrubrow { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
  #clock { font-variant-numeric: tabular-nums; font-size: 13px; font-weight: 600; text-align: right; }
  label.lbltoggle { font-size: 12px; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; opacity: .8; }
`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mandala Motion · ${payload.date}</title>
<style>${STYLE}</style>
</head>
<body>
<div id="mm" class="mm sky">
  <div class="wheelcol">
    <div id="bigdate"></div>
    <div class="stage">
      <svg id="wheel" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
        <defs>${defs}</defs>
        <g class="stars">${stars}</g>
        <g class="mandala">${rings}</g>
        <g class="dividers">${dividers}</g>
        <g class="lanes">${lanes}</g>
        <g id="linelights"></g>
        <g id="paths"></g>
        <g id="bodygraph"></g>
        <g id="planets">${tokens}</g>
      </svg>
    </div>
    <div id="crossbar"></div>
  </div>

  <aside class="panel">
    <header>
      <h1>Mandala Motion</h1>
      <div class="sub">from ${payload.date} · Delphi HD</div>
    </header>
    <div class="controls">
      <div class="grp"><span class="lbl">Span</span>
        ${Object.keys(payload.spans).map((k, i) => `<button data-span="${k}"${i === 0 ? ' class="on"' : ""}>${({ day: "Day", week: "Week", month: "Month", year: "Year" } as Record<string, string>)[k] ?? k}</button>`).join("\n        ")}
      </div>
    </div>
    <div class="scrubrow">
      <button id="play">❙❙ Pause</button>
      <span id="clock"></span>
    </div>
    <input id="scrub" type="range" min="0" max="1440" step="1" value="0" />
    ${payload.skinMode === "sky" ? "" : `<div class="controls">
      <div class="grp"><span class="lbl">Skin</span>
        <button data-skin="sky" class="on">Night sky</button>
        <button data-skin="felt">Felt board</button>
      </div>
    </div>`}
    <div class="controls">
      <div class="grp"><span class="lbl">Speed</span>
        <button data-speed="60">Slow</button>
        <button data-speed="24" class="on">Medium</button>
        <button data-speed="8">Fast</button>
      </div>
    </div>
    <div class="controls">
      <label class="lbltoggle"><input id="labels" type="checkbox" checked /> labels</label>
      <label class="lbltoggle"><input id="paths-toggle" type="checkbox" /> paths</label>
    </div>
    <div class="controls">
      <span class="lbl">Show</span>${groupChips}
    </div>
    <button id="present" title="Hide the panel for filming">⛶ Present</button>
  </aside>
</div>
<script>window.__MM__ = ${JSON.stringify(payload)};</script>
<script>${CLIENT}</script>
</body>
</html>`.replace(/[—―]/g, ", ");  // house style: no em dashes anywhere (also keeps the report self-check green when embedded)
}

main().catch((e) => { console.error(e); process.exit(1); });
