/**
 * Build a self-contained interactive teaching chart (single .html file) for a
 * client, driven by their REAL mybodygraph data.
 *
 * Positioning model (why highlights land exactly right):
 *   The branded design=delphi SVG draws all 64 gate-number labels as <text>
 *   elements at precise positions. We parse those 64 anchors at build time and
 *   draw every highlight as an SVG-space <circle> at the gate's own label
 *   coordinate. No screen-pixel math, no drift on resize/zoom. A "Validate
 *   positions" toggle overlays all 64 anchors so the operator can eyeball them.
 *
 * Usage: npx tsx scripts/build-interactive-chart.ts <slug>   (default: rob)
 * Output: "<client output dir>/<Name> - Interactive Chart.html"
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { clientFromSlug, clientOutputDir } from "./client-roster";
import { centerOf, type Center } from "../lib/hd/gate-center";
import { RANGE_BY_GATE, LINE_ARC_DEGREES } from "../lib/hd/gate-longitude";
import { renderFullMandala } from "../lib/render/mandala";

// Mandala wheel geometry — replicates lib/render/mandala.ts so we can place the
// planetary-walk highlights exactly where the renderer drew each planet glyph.
const MANDALA_SIZE = 1000;
const MANDALA_VISUAL_TOP = 268.25;
const MANDALA_PLANET_RING = ["sun", "mercury", "venus", "earth", "moon", "north-node", "south-node", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
const PLANET_TO_MANDALA: Record<string, string> = {
  Sun: "sun", Earth: "earth", Moon: "moon", "North Node": "north-node", "South Node": "south-node",
  Mercury: "mercury", Venus: "venus", Mars: "mars", Jupiter: "jupiter", Saturn: "saturn",
  Uranus: "uranus", Neptune: "neptune", Pluto: "pluto",
};
function mandalaPos(gate: number, line: number, planet: string, size: number): { x: number; y: number } | null {
  const cx = size / 2, cy = size / 2;
  const spokeInner = size * 0.180, spokeOuter = size * 0.335;
  const ringStart = spokeInner + size * 0.010, ringEnd = spokeOuter - size * 0.010;
  const ringStep = (ringEnd - ringStart) / (MANDALA_PLANET_RING.length - 1);
  const idx = MANDALA_PLANET_RING.indexOf(planet);
  const range = RANGE_BY_GATE.get(gate);
  if (idx < 0 || !range) return null;
  const r = ringStart + idx * ringStep;
  const lon = (range.lines[line - 1] + LINE_ARC_DEGREES / 2) % 360;
  const fromTop = ((lon - MANDALA_VISUAL_TOP) % 360 + 360) % 360;
  const a = Math.PI / 2 + (fromTop * Math.PI) / 180;
  return { x: +(cx + r * Math.cos(a)).toFixed(2), y: +(cy - r * Math.sin(a)).toFixed(2) };
}

const HOST = "https://api.bodygraphchart.com";
const API_KEY = process.env.MYBODYGRAPH_API_KEY!;

const PLANET_ORDER: string[] = [
  "Sun", "Earth", "North Node", "South Node", "Moon", "Mercury", "Venus",
  "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
];

const CENTER_LABEL: Record<Center, string> = {
  head: "Head", ajna: "Ajna", throat: "Throat", g: "G / Identity",
  heart: "Heart / Will", spleen: "Spleen", sacral: "Sacral",
  "solar-plexus": "Solar Plexus", root: "Root",
};

const CHANNEL_NAME: Record<string, string> = {
  "11-56": "Curiosity", "3-60": "Mutation",
};

// API returns defined centers as e.g. "splenic center", "g center".
const CENTER_FROM_API: Record<string, string> = {
  "head": "Head", "ajna": "Ajna", "throat": "Throat", "g": "G / Identity",
  "heart": "Heart / Will", "splenic": "Spleen", "sacral": "Sacral",
  "solar plexus": "Solar Plexus", "root": "Root",
};
function definedLabels(list: any[]): string[] {
  return (list ?? [])
    .map((s) => CENTER_FROM_API[String(s).replace(/\s*center\s*$/i, "").trim().toLowerCase()])
    .filter(Boolean);
}

async function lookupTimezone(query: string): Promise<string> {
  const url = new URL(`${HOST}/v210502/locations`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("query", query);
  const j: any = await (await fetch(url)).json();
  return j.locations?.[0]?.timezone ?? j[0]?.timezone ?? "America/Boise";
}

async function fetchRaw(birthDate: string, birthTime: string, place: string) {
  const tz = await lookupTimezone(place);
  const url = new URL(`${HOST}/v221006/hd-data`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("date", `${birthDate} ${birthTime}`);
  url.searchParams.set("timezone", tz);
  url.searchParams.set("design", "delphi");
  return (await fetch(url)).json() as Promise<any>;
}

interface Act { side: "personality" | "design"; planet: string; gate: number; line: number; center: string; fix: string; }

function activations(side: "personality" | "design", planets: Record<string, any>): Act[] {
  const out: Act[] = [];
  for (const label of PLANET_ORDER) {
    const d = planets[label];
    if (d) out.push({ side, planet: label, gate: d.Gate, line: d.Line, center: CENTER_LABEL[centerOf(d.Gate)], fix: d.FixingState ?? "None" });
  }
  return out;
}

// Parse all 64 gate-number labels -> { gate: {x,y} } in SVG user space.
function parseAnchors(svg: string): Record<number, { x: number; y: number }> {
  const re = /<text\b[^>]*transform="translate\(([\d.]+)\s+([\d.]+)\)[^>]*>([\s\S]*?)<\/text>/g;
  const anchors: Record<number, { x: number; y: number }> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const inner = m[3].replace(/<[^>]*>/g, "").trim();
    const num = (inner.match(/\d+/) || [])[0];
    if (num) anchors[+num] = { x: Math.round(+m[1] * 100) / 100, y: Math.round(+m[2] * 100) / 100 };
  }
  return anchors;
}

// Pull gate + line names from the synced Notion library (.cache/chunks.json).
// Gate titles look like "40: Deliverance"; line titles like "62.1 Routine".
function loadNames(): { gates: Record<number, string>; lines: Record<string, string> } {
  const gates: Record<number, string> = {};
  const lines: Record<string, string> = {};
  const path = ".cache/chunks.json";
  if (!existsSync(path)) return { gates, lines };
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    const arr: any[] = Array.isArray(data) ? data : (data.chunks || Object.values(data)[0]);
    for (const c of arr) {
      if (c.source_kind === "gate" && c.gate_number != null) {
        const name = String(c.title || "").replace(/^\s*\d+\s*:\s*/, "").trim();
        if (name) gates[c.gate_number] = name;
      } else if (c.source_kind === "line" && c.gate_number != null && c.line_number >= 1) {
        const name = String(c.title || "").replace(/^\s*\d+\.\d+\s*/, "").trim();
        if (name) lines[`${c.gate_number}.${c.line_number}`] = name;
      }
    }
  } catch { /* degrade gracefully: no names */ }
  return { gates, lines };
}

function channelGroupId(svg: string, a: number, b: number): string | null {
  if (svg.includes(`id="_${a}-${b}"`)) return `_${a}-${b}`;
  if (svg.includes(`id="_${b}-${a}"`)) return `_${b}-${a}`;
  return null;
}

// Trim library/report prose to a brief, clean synthesis (drops markdown
// scaffolding and all-caps section labels; cuts at a sentence boundary).
function brief(body: string, max: number): string {
  const t = String(body ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .filter((l) => {
      const s = l.trim();
      if (!s || /^#/.test(s) || /^-{2,}$/.test(s) || /^untitled$/i.test(s)) return false;
      if (/^[A-Z][A-Z ,()\-]{5,}$/.test(s)) return false; // ALLCAPS labels / title repeats
      return true;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastDot = cut.lastIndexOf(". ");
  return lastDot > 80 ? cut.slice(0, lastDot + 1) : cut.trim() + "…";
}

// Per-placement synthesis from the already-generated Planetary Overview report.
// Headers look like: "## P-Sun | 60.2: Limitation, Decisiveness | Detriment | ..."
// Returns the "> TLDR:" one-liner (brief) and the detailed paragraphs that follow
// (full), so the viewer can show a short summary with a "read more" expansion.
function loadPlacements(slug: string): Record<string, { brief: string; full: string }> {
  const map: Record<string, { brief: string; full: string }> = {};
  const path = `.cache/reports/${slug}-planetary.md`;
  if (!existsSync(path)) return map;
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(P|D)-(.+?)\s+\|\s+\d+\.\d+:/);
    if (!m) continue;
    const side = m[1] === "P" ? "personality" : "design";
    const planet = m[2].trim();
    // collect paragraphs (blank-line separated) until the next header
    const paras: string[] = [];
    let j = i + 1;
    while (j < lines.length && !/^#/.test(lines[j])) {
      while (j < lines.length && lines[j].trim() === "") j++;
      const buf: string[] = [];
      while (j < lines.length && lines[j].trim() !== "" && !/^#/.test(lines[j])) { buf.push(lines[j].trim()); j++; }
      if (buf.length) paras.push(buf.join(" "));
    }
    if (!paras.length) continue;
    const isTldr = /^\s*>\s*TLDR/i.test(paras[0]);
    const briefText = brief((paras[0] || "").replace(/^\s*>\s*TLDR:?\s*/i, "").replace(/>\s*/g, " "), 380);
    const detail = (isTldr ? paras.slice(1) : paras).map((p) => p.replace(/>\s*/g, " ").trim()).filter(Boolean).join("\n\n");
    map[`${side}|${planet}`] = { brief: briefText, full: detail };
  }
  return map;
}

// Split prose into sentences (rough, good enough for brief extraction).
function sentences(text: string): string[] {
  return (text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+/g) || [text]).map((s) => s.trim());
}

// Collect the prose paragraphs under a report section, stopping at the next
// header, a "---" rule, or the per-gate bullet list.
function sectionParas(lines: string[], start: number): string[] {
  const paras: string[] = [];
  let j = start;
  const stop = (l: string) => /^#/.test(l) || /^---/.test(l.trim()) || /^[-*]\s+\*\*Gate/.test(l.trim());
  while (j < lines.length && !stop(lines[j])) {
    while (j < lines.length && lines[j].trim() === "") j++;
    if (j < lines.length && stop(lines[j])) break;
    const buf: string[] = [];
    while (j < lines.length && lines[j].trim() !== "" && !stop(lines[j])) { buf.push(lines[j].trim()); j++; }
    if (buf.length) paras.push(buf.join(" "));
  }
  return paras;
}

const CENTER_REPORT_TO_LABEL: Record<string, string> = {
  "Head": "Head", "Ajna": "Ajna", "Throat": "Throat", "G": "G / Identity",
  "Heart": "Heart / Will", "Spleen": "Spleen", "Sacral": "Sacral",
  "Solar Plexus": "Solar Plexus", "Root": "Root",
};

// Center detail from the Foundation report. The TLDR leads with the not-self
// theme (and the sentence after it), per Kaycee, rather than biology.
function loadCentersFromReport(slug: string): Record<string, { brief: string; full: string }> {
  const map: Record<string, { brief: string; full: string }> = {};
  const path = `.cache/reports/${slug}-foundation.md`;
  if (!existsSync(path)) return map;
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###\s+(.+?)\s+\|\s+.+?\s+\|\s+(Defined|Undefined|Open)\s*$/);
    if (!m) continue;
    const label = CENTER_REPORT_TO_LABEL[m[1].trim()];
    if (!label) continue;
    const paras = sectionParas(lines, i + 1);
    if (!paras.length) continue;
    const full = paras.join("\n\n");
    // Brief = mechanics (what the center does) + not-self theme + the correct/gift
    // expression. Assembled from the report's own sentences, never biology-first.
    const sents = sentences(full);
    let lead = sents[0] || "";
    if (lead.length < 70 && sents[1]) lead += " " + sents[1];
    const ns = sents.find((s) => /not-self/i.test(s)) || "";
    const gift = sents.find((s) => /\bgift\b|correctly orient|operating correctly|when correct|on track|in balance/i.test(s)) || "";
    const parts = [lead];
    if (ns && lead.indexOf(ns) < 0) parts.push(ns);
    if (gift && parts.join(" ").indexOf(gift) < 0) parts.push(gift);
    map[label] = { brief: brief(parts.join(" "), 620), full };
  }
  return map;
}

// Channel detail from the Foundation report (## (a-b) The Channel of ...).
function loadChannelsFromReport(slug: string): Record<string, { brief: string; full: string }> {
  const map: Record<string, { brief: string; full: string }> = {};
  const path = `.cache/reports/${slug}-foundation.md`;
  if (!existsSync(path)) return map;
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+\((\d+)\s*-\s*(\d+)\)/);
    if (!m) continue;
    const key = [+m[1], +m[2]].sort((a, b) => a - b).join("-");
    const paras = sectionParas(lines, i + 1);
    if (!paras.length) continue;
    map[key] = { brief: brief(paras[0], 320), full: paras.join("\n\n") };
  }
  return map;
}

// Variable detail from the Foundation report (## Digestion - ..., ## Environment - ...).
const VAR_REPORT_TO_KEY: Record<string, string> = {
  Digestion: "determination", Environment: "environment", Motivation: "motivation", Perspective: "perspective",
};
function loadVariablesFromReport(slug: string): Record<string, { placement: string; brief: string; full: string }> {
  const map: Record<string, { placement: string; brief: string; full: string }> = {};
  const path = `.cache/reports/${slug}-foundation.md`;
  if (!existsSync(path)) return map;
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    // e.g. "## Environment - Color 5: Valleys, Left Arrow | Observed: Narrow, Tone 3: Outer Vision"
    const m = lines[i].match(/^##\s+(Digestion|Environment|Motivation|Perspective)\s+-\s+(.+?)\s*$/);
    if (!m) continue;
    const paras = sectionParas(lines, i + 1);
    map[VAR_REPORT_TO_KEY[m[1]]] = { placement: m[2].trim(), brief: brief(paras[0] ?? "", 360), full: paras.join("\n\n") };
  }
  return map;
}

// Chart-property synthesis (Type, Strategy, Authority, Profile, Definition,
// Signature, Not-self, Incarnation Cross) from the Foundation report sections.
function loadPropertiesFromReport(slug: string): Record<string, { brief: string; full: string }> {
  const out: Record<string, { brief: string; full: string }> = {};
  const path = `.cache/reports/${slug}-foundation.md`;
  if (!existsSync(path)) return out;
  const lines = readFileSync(path, "utf8").split("\n");
  // first "## " subsection prose under a "# " section (falls back to prose right under the #)
  const firstSub = (h1: RegExp): string[] => {
    for (let i = 0; i < lines.length; i++) {
      if (!h1.test(lines[i])) continue;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^#\s/.test(lines[j])) break;
        if (/^##\s/.test(lines[j])) { const p = sectionParas(lines, j + 1); if (p.length) return p; }
      }
      return sectionParas(lines, i + 1);
    }
    return [];
  };
  const afterH1 = (h1: RegExp): string[] => { for (let i = 0; i < lines.length; i++) if (h1.test(lines[i])) return sectionParas(lines, i + 1); return []; };
  const sub = (re: RegExp): string[] => { for (let i = 0; i < lines.length; i++) if (/^##\s/.test(lines[i]) && re.test(lines[i])) return sectionParas(lines, i + 1); return []; };
  const make = (paras: string[], kw?: string): { brief: string; full: string } => {
    if (!paras.length) return { brief: "", full: "" };
    const full = paras.join("\n\n");
    let b: string;
    if (kw) {
      const ss = sentences(paras.join(" "));
      const idx = ss.findIndex((x) => new RegExp(kw, "i").test(x));
      b = idx >= 0 ? brief(ss[idx] + (ss[idx + 1] && ss[idx].length < 170 ? " " + ss[idx + 1] : ""), 340) : brief(paras[0], 360);
    } else b = brief(paras[0], 360);
    return { brief: b, full };
  };
  out.type = make(firstSub(/^#\s+Your Type\b/));
  out.strategy = make(firstSub(/^#\s+Your Strategy\b/));
  out.authority = make(firstSub(/^#\s+Your Authority\b/));
  out.profile = make(sub(/Combined Rhythm/));
  out.definition = make(afterH1(/^#\s+Your Definition\b/));
  out.cross = make(firstSub(/^#\s+Your Incarnation Cross\b/));
  out.signature = make(sub(/Satisfaction and Frustration/), "satisfaction");
  out.notself = make(sub(/Satisfaction and Frustration/), "frustration");
  return out;
}

// Center synthesis from the Notion-synced library (.cache/chunks.json).
function loadCenterSyntheses(): Record<string, string> {
  const out: Record<string, string> = {};
  const path = ".cache/chunks.json";
  if (!existsSync(path)) return out;
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    const arr: any[] = Array.isArray(data) ? data : (data.chunks || Object.values(data)[0]);
    const TITLE_TO_LABEL: Array<[RegExp, string]> = [
      [/solar plexus|emotional/i, "Solar Plexus"], [/ego|heart|will/i, "Heart / Will"],
      [/identity|^g\b|\bg \(/i, "G / Identity"], [/spleen/i, "Spleen"], [/sacral/i, "Sacral"],
      [/throat/i, "Throat"], [/ajna/i, "Ajna"], [/head/i, "Head"], [/root/i, "Root"],
    ];
    for (const c of arr) {
      if (c.source_kind !== "center") continue;
      const hit = TITLE_TO_LABEL.find(([re]) => re.test(String(c.title || "")));
      if (hit) out[hit[1]] = brief(c.body, 320);
    }
  } catch { /* degrade gracefully */ }
  return out;
}

// Tiny per-line hexagram PNG, embedded as a data URL so the file stays offline.
const HEX_DIR = join(process.env.HOME ?? "", "Desktop", "Delphi Brand Assets", "sections", "hexagrams");
function hexDataUrl(gate: number, line: number): string {
  const p = join(HEX_DIR, `${gate}.${line}.png`);
  if (!existsSync(p)) return "";
  return `data:image/png;base64,${readFileSync(p).toString("base64")}`;
}

function main() {
  const slug = process.argv[2] ?? "rob";
  const client = clientFromSlug(slug);

  return fetchRaw(client.birthDate, client.birthTime, client.birthPlace).then((raw) => {
    const svg: string = raw.SVG ?? "";
    if (!svg.trimStart().startsWith("<svg")) throw new Error("no SVG in API response");

    const props = raw.Properties;
    const pers = activations("personality", raw.Personality);
    const des = activations("design", raw.Design);
    const anchors = parseAnchors(svg);

    const names = loadNames();
    const placements = loadPlacements(slug);
    for (const a of [...pers, ...des] as any[]) {
      a.gateName = names.gates[a.gate] ?? "";
      a.lineName = names.lines[`${a.gate}.${a.line}`] ?? "";
      const pl = placements[`${a.side}|${a.planet}`];
      a.synthesis = pl?.brief ?? "";
      a.synthesisFull = pl?.full ?? "";
      a.hex = hexDataUrl(a.gate, a.line);
    }
    // mandala wheel + each activation's position on it (for the planetary walk)
    const PLANET_GROUP: Record<string, string> = {
      Sun: "ic", Earth: "ic", "North Node": "nodes", "South Node": "nodes",
      Moon: "inner", Mercury: "inner", Venus: "inner", Mars: "inner",
      Jupiter: "outer", Saturn: "outer", Uranus: "outer", Neptune: "outer", Pluto: "outer",
    };
    for (const a of [...pers, ...des] as any[]) {
      a.mplanet = PLANET_TO_MANDALA[a.planet];
      a.mgroup = PLANET_GROUP[a.planet] ?? "inner";
      const mp = mandalaPos(a.gate, a.line, a.mplanet, MANDALA_SIZE);
      a.mx = mp?.x ?? null; a.my = mp?.y ?? null;
    }
    const cFind = (side: string, planet: string) => [...pers, ...des].find((a) => a.side === side && a.planet === planet);
    const mandalaSvg = renderFullMandala({
      clientName: client.name,
      activations: [...pers, ...des].map((a) => ({ side: a.side, planet: PLANET_TO_MANDALA[a.planet] as any, gate: a.gate, line: a.line })),
      cross: {
        personalitySun: cFind("personality", "Sun")?.gate ?? 0, personalityEarth: cFind("personality", "Earth")?.gate ?? 0,
        designSun: cFind("design", "Sun")?.gate ?? 0, designEarth: cFind("design", "Earth")?.gate ?? 0,
      },
      bodygraphSvg: svg,
    }, { size: MANDALA_SIZE, glyphScale: 1.8 });

    const namedGates = Object.keys(names.gates).length, namedLines = Object.keys(names.lines).length;
    const withSynth = [...pers, ...des].filter((a: any) => a.synthesis).length;
    const withHex = [...pers, ...des].filter((a: any) => a.hex).length;

    const channelDetail = loadChannelsFromReport(slug);
    const channels = (raw.Channels ?? []).map((s: any) => {
      const m = String(s).match(/(\d+)\D+(\d+)/);
      if (!m) return null;
      const a = +m[1], b = +m[2];
      const key = [a, b].sort((x, y) => x - y).join("-");
      const det = channelDetail[key];
      return {
        id: key, gates: [a, b] as [number, number],
        name: CHANNEL_NAME[key] ?? `Channel ${key}`,
        centers: [CENTER_LABEL[centerOf(a)], CENTER_LABEL[centerOf(b)]],
        groupId: channelGroupId(svg, a, b),
        brief: det?.brief ?? "", full: det?.full ?? "",
      };
    }).filter(Boolean);

    // validation report
    const missingAnchors = [...pers, ...des].filter((a) => !anchors[a.gate]).map((a) => a.gate);
    console.log(`\n=== ${client.name} — interactive chart build ===`);
    console.log(`Type ${props.Type.option} | Profile ${props.Profile.option} | Authority ${props.InnerAuthority.option}`);
    console.log(`Gate anchors parsed: ${Object.keys(anchors).length}/64`);
    console.log(`Activations: ${pers.length} personality + ${des.length} design`);
    console.log(`Channels: ${channels.map((c: any) => `${c.id}${c.groupId ? "" : " (no group)"}`).join(", ") || "(none)"}`);
    console.log(`Activation gates without an anchor: ${missingAnchors.length ? missingAnchors.join(", ") : "none"}`);
    console.log(`Library names loaded: ${namedGates}/64 gates, ${namedLines} lines`);
    console.log(`Placement synthesis: ${withSynth}/26 | hexagram images: ${withHex}/26`);
    console.log(`Channel detail: ${channels.filter((c: any) => c.full).length}/${channels.length} | center detail (report): ${Object.keys(loadCentersFromReport(slug)).length}/9`);

    const DATA = {
      name: client.name,
      birth: {
        local: props.BirthDateLocal ?? "", utc: props.BirthDateUtc ?? "",
        design: props.DesignDateUtc ?? "", place: client.birthPlace ?? "",
      },
      props: {
        type: props.Type.option, strategy: props.Strategy.option,
        authority: props.InnerAuthority.option, profile: props.Profile.option,
        definition: props.Definition.option, cross: props.IncarnationCross.option,
        signature: props.Signature.option, notSelf: props.NotSelfTheme.option,
      },
      personality: pers, design: des, channels, anchors,
      mandalaSvg, mandalaSize: MANDALA_SIZE,
      definedCenters: definedLabels(raw.DefinedCenters),
      properties: (() => {
        const pd = loadPropertiesFromReport(slug);
        const mk = (key: string, label: string, value: any) => ({ label, value: value ?? "", brief: pd[key]?.brief ?? "", full: pd[key]?.full ?? "" });
        return {
          type: mk("type", "Type", props.Type.option),
          strategy: mk("strategy", "Strategy", props.Strategy.option),
          authority: mk("authority", "Authority", props.InnerAuthority.option),
          profile: mk("profile", "Profile", props.Profile.option),
          definition: mk("definition", "Definition", props.Definition.option),
          signature: mk("signature", "Signature", props.Signature.option),
          notself: mk("notself", "Not-self", props.NotSelfTheme.option),
          cross: mk("cross", "Incarnation Cross", props.IncarnationCross.option),
        };
      })(),
      centerDetails: (() => {
        const rep = loadCentersFromReport(slug), lib = loadCenterSyntheses(), out: Record<string, { brief: string; full: string }> = {};
        for (const label of Object.values(CENTER_REPORT_TO_LABEL)) {
          out[label] = rep[label] ?? { brief: lib[label] ?? "", full: "" };
        }
        return out;
      })(),
      variables: (() => {
        const vd = loadVariablesFromReport(slug);
        const v: any = {
          determination: { arrow: raw.Variables?.Digestion, theme: props.Digestion?.option },
          environment: { arrow: raw.Variables?.Environment, theme: props.Environment?.option },
          motivation: { arrow: raw.Variables?.Awareness, theme: props.Motivation?.option },
          perspective: { arrow: raw.Variables?.Perspective, theme: props.Perspective?.option },
          sense: props.Sense?.option, designSense: props.DesignSense?.option,
        };
        for (const k of ["determination", "environment", "motivation", "perspective"]) {
          v[k].brief = vd[k]?.brief ?? ""; v[k].full = vd[k]?.full ?? ""; v[k].placement = vd[k]?.placement ?? "";
        }
        return v;
      })(),
    };

    const html = renderHtml(svg, DATA);
    const outPath = join(clientOutputDir(client), `${client.name} - Interactive Chart.html`);
    writeFileSync(outPath, html);
    console.log(`\nWrote: ${outPath}\n`);
  });
}

function renderHtml(svg: string, data: unknown): string {
  return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Interactive Chart</title>
<style>
  :root{ --purple:#845095; --purple-d:#5f3a6c; --red:#e06666; --gold:#c79a2e; --gold-d:#9c7415; --ink:#1c1320; --muted:#7a6f80; --line:#e7e0ea; --bg:#fbf9fc; }
  *{ box-sizing:border-box; }
  html,body{ margin:0; height:100%; }
  body{ font-family:'Montserrat',-apple-system,Segoe UI,Roboto,sans-serif; color:var(--ink); background:var(--bg); }
  .layout{ display:grid; grid-template-columns:100px minmax(0,1fr) 100px 340px; height:100vh; }
  .coltbl{ display:flex; flex-direction:column; justify-content:center; gap:1px; padding:10px 6px; overflow:hidden; min-width:0; }
  .coltbl.design{ align-items:stretch; border-right:1px solid var(--line); }
  .coltbl.personality{ align-items:stretch; border-left:1px solid var(--line); border-right:1px solid var(--line); }
  .cap{ font-size:9px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); font-weight:700; text-align:center; margin-bottom:6px; }
  .prow{ display:flex; align-items:center; font-size:12.5px; padding:3px 4px; border-radius:6px; cursor:pointer; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .prow:hover{ background:#f6f1f8; } .prow.sel{ background:#efe3f3; }
  .coltbl.design .prow{ color:var(--red); justify-content:flex-end; }
  .coltbl.personality .prow{ color:var(--ink); justify-content:flex-start; }
  .glyph{ display:inline-block; width:20px; text-align:center; font-family:"Apple Symbols","Segoe UI Symbol","Noto Sans Symbols2",serif; font-size:15px; line-height:1; }
  .gl{ display:inline-block; width:42px; }
  .coltbl.design .gl{ text-align:right; } .coltbl.personality .gl{ text-align:right; }
  .fxc{ display:inline-block; width:14px; text-align:center; }
  .fx{ font-size:9px; color:var(--purple); }
  .stage{ position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:8px 12px; min-height:0; overflow:hidden; }
  #svghost,#mandalahost{ display:flex; align-items:center; justify-content:center; width:100%; min-height:0; }
  #mandalahost{ display:none; }
  /* viewport-bounded so the chart never overflows; bodygraph svg has no intrinsic
     size, so it needs an explicit height; the mandala is square with intrinsic 1000². */
  #svghost svg{ display:block; height:calc(100vh - 58px); max-height:calc(100vh - 58px); width:auto; max-width:100%; }
  #mandalahost svg{ display:block; max-height:calc(100vh - 48px); max-width:100%; width:auto; height:auto; }
  .layout.mandala{ grid-template-columns:0 minmax(0,1fr) 0 360px; }
  .layout.mandala .chartlegend{ display:none; }
  .layout.mandala .coltbl{ visibility:hidden; }
  .viewswitch{ display:flex; gap:6px; margin:0 0 14px; }
  .vbtn{ flex:1; padding:9px 4px; font:inherit; font-size:12px; font-weight:600; cursor:pointer; border:1px solid var(--line); background:#fff; color:var(--muted); border-radius:9px; }
  .vbtn.on{ background:var(--ink); color:#fff; border-color:var(--ink); }
  .walk .walkcap{ min-height:96px; font-size:14px; line-height:1.5; }
  .walk .walkcap .tag{ display:inline-block; font-size:10px; font-weight:600; padding:2px 8px; border-radius:20px; margin-bottom:6px; }
  .walk .walkcap .tag.p{ background:#efe6f2; color:var(--purple-d); } .walk .walkcap .tag.d{ background:#fbe5e5; color:#a23b3b; }
  .walk .walkcap .syn{ font-size:12.5px; color:var(--ink); margin-top:8px; line-height:1.5; }
  .walk .wctrls{ display:flex; gap:7px; margin:12px 0; }
  .walk .wctrls button{ flex:1; padding:9px; font:inherit; font-size:12px; font-weight:600; border:1px solid var(--line); background:#fff; border-radius:9px; cursor:pointer; }
  .walk .wctrls button:hover{ background:#f4eef6; } .walk .wctrls button.primary{ background:var(--purple); color:#fff; border-color:var(--purple); }
  .walk .scrubrow{ display:flex; align-items:center; gap:10px; font-size:11px; color:var(--muted); }
  .walk .scrubrow input{ flex:1; accent-color:var(--purple); }
  .mfilter{ margin-top:16px; border-top:1px solid var(--line); padding-top:12px; }
  .mfilter .flabel{ font-size:9.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); font-weight:700; margin-bottom:7px; }
  .mfilter .frow{ display:flex; gap:14px; margin-bottom:7px; }
  .mfilter label{ display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; flex:1; }
  .mfilter input{ accent-color:var(--purple); cursor:pointer; }
  @keyframes mpulse{ 0%,100%{ opacity:1; } 50%{ opacity:0.4; } }
  .mhi-line{ stroke:#c79a2e !important; stroke-width:3.4 !important; stroke-opacity:1 !important; animation:mpulse 1.1s ease-in-out infinite; }
  .mhi-cell path{ stroke:#9c7415 !important; stroke-width:2.6 !important; }
  .mhi-cell{ animation:mpulse 1.1s ease-in-out infinite; }
  .mhi-hex{ opacity:1 !important; animation:mpulse 1.1s ease-in-out infinite; }
  .mhi-glyph{ font-weight:bold; animation:mpulse 1.1s ease-in-out infinite; }
  .mhi-center{ stroke:#c79a2e !important; stroke-width:5 !important; }
  .mfilterbox{ display:none; position:absolute; top:10px; right:10px; max-height:calc(100% - 20px); overflow-y:auto; background:#fff; border:1px solid var(--line); border-radius:12px; box-shadow:0 6px 20px rgba(40,20,50,.12); padding:11px 13px; font-size:12px; z-index:8; min-width:138px; }
  .layout.mandala .mfilterbox{ display:block; }
  .mfilterbox .mfb-title{ font-size:9.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); font-weight:700; margin:9px 0 5px; }
  .mfilterbox .mfb-title:first-child{ margin-top:0; }
  .mfilterbox label{ display:flex; align-items:center; gap:6px; cursor:pointer; padding:2px 0; }
  .mfilterbox label.grp{ font-weight:600; }
  .mfilterbox label.pl{ padding-left:14px; font-size:11.5px; color:var(--ink); }
  .mfilterbox input{ accent-color:var(--purple); cursor:pointer; }
  .bgtoggle{ position:absolute; top:10px; right:10px; background:#fff; border:1px solid var(--line); border-radius:10px; box-shadow:0 4px 14px rgba(40,20,50,.10); padding:8px 11px; font-size:12px; z-index:8; }
  .layout.mandala .bgtoggle{ display:none; }
  .bgtoggle label{ display:flex; align-items:center; gap:6px; cursor:pointer; padding:2px 0; }
  .bgtoggle input{ accent-color:var(--purple); cursor:pointer; }
  .panel{ border-left:1px solid var(--line); background:#fff; padding:20px 20px 24px; overflow-y:auto; display:flex; flex-direction:column; }
  h1{ font-size:20px; font-weight:600; margin:0 0 12px; cursor:pointer; }
  h1:hover{ color:var(--purple); }
  .chartlegend{ flex:0 0 auto; margin-top:6px; display:flex; flex-wrap:nowrap; white-space:nowrap; gap:0 14px; align-items:center; justify-content:center; font-size:11px; color:var(--muted); }
  .chartlegend>span{ display:inline-flex; align-items:center; }
  .chartlegend .sw{ display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:5px; }
  .chartlegend .fx{ font-size:10px; color:var(--purple); margin-right:3px; }
  .gaterow{ padding:7px 9px; border-radius:8px; cursor:pointer; }
  .gaterow:hover{ background:#f6f1f8; } .gaterow.sel{ background:#efe3f3; }
  .gaterow .top{ display:flex; align-items:center; gap:9px; font-size:13px; font-variant-numeric:tabular-nums; }
  .gaterow .top .pl{ font-weight:600; flex:1; }
  .gaterow .nm{ font-size:11.5px; color:var(--muted); margin:2px 0 0 17px; }
  .propcards{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:0 0 16px; }
  .pcard{ background:var(--bg); border:1px solid var(--line); border-radius:10px; padding:8px 11px; cursor:pointer; transition:background .12s,border-color .12s; }
  .pcard:hover{ background:#f4eef6; border-color:var(--purple); }
  .pcard b{ display:block; font-size:9px; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); font-weight:700; margin-bottom:3px; }
  .pcard span{ font-size:13.5px; font-weight:500; color:var(--ink); line-height:1.25; }
  .pcard.wide{ grid-column:1 / -1; }
  .tabs{ display:flex; gap:5px; margin-bottom:14px; }
  .tab{ flex:1; padding:9px 3px; font:inherit; font-size:11.5px; font-weight:600; cursor:pointer; border:1px solid var(--line); background:#fff; color:var(--muted); border-radius:9px; }
  .tab.on{ background:var(--purple); color:#fff; border-color:var(--purple); }
  .body{ flex:1; min-height:0; overflow-y:auto; }
  .hint{ font-size:12px; color:var(--muted); line-height:1.5; margin:0 0 12px; }
  .sechead{ font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:var(--muted); font-weight:700; margin:14px 0 6px; }
  .row{ display:flex; align-items:center; gap:9px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:13px; }
  .row:hover{ background:#f6f1f8; } .row.sel{ background:#f3ead3; }
  .row .pl{ flex:1; font-weight:600; }
  .row .gl2{ color:var(--ink); font-size:12.5px; }
  .row .ct{ color:var(--muted); font-size:11px; min-width:70px; text-align:right; }
  .dot{ width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
  .dot.p{ background:var(--ink); } .dot.d{ background:var(--red); }
  .legend{ font-size:11px; color:var(--muted); margin-top:12px; line-height:1.7; }
  .legend .sw{ display:inline-block; width:9px; height:9px; border-radius:50%; vertical-align:middle; margin-right:4px; }
  .toolrow{ display:flex; align-items:center; justify-content:space-between; margin-top:12px; gap:8px; }
  .toggle{ font:inherit; font-size:11px; font-weight:600; color:var(--gold-d); background:#faf3df; border:1px solid #ecd9a4; border-radius:8px; padding:6px 10px; cursor:pointer; }
  .toggle.on{ background:var(--gold); color:#fff; border-color:var(--gold); }
  .ctip{ position:absolute; pointer-events:none; background:var(--ink); color:#fff; font-size:11px; padding:4px 8px; border-radius:6px; transform:translate(-50%,-130%); white-space:nowrap; opacity:0; transition:opacity .12s; }
  .ptip{ position:fixed; pointer-events:none; background:var(--ink); color:#fff; font-size:12px; font-weight:600; padding:4px 9px; border-radius:6px; transform:translate(-50%,-100%); white-space:nowrap; opacity:0; transition:opacity .1s; z-index:20; }
  .cbox{ position:absolute; min-width:230px; max-width:300px; max-height:74vh; overflow-y:auto; background:#fff; border:1px solid var(--line); border-radius:12px; box-shadow:0 10px 30px rgba(40,20,50,.20); padding:14px 16px; z-index:15; display:none; }
  .cbox h3{ margin:0; font-size:15px; font-weight:600; display:inline-block; }
  .cbox .grow{ display:flex; align-items:flex-start; gap:12px; margin-top:9px; }
  .cbox .gmeta{ flex:1; min-width:0; }
  .cbox .hex{ display:block; width:48px; height:48px; flex:0 0 auto; margin-top:30px; border:1px solid var(--line); border-radius:6px; background:#fff; padding:3px; }
  .cbox .synth{ font-size:12.5px; color:var(--ink); line-height:1.5; margin-top:3px; }
  .cbox .more{ display:none; font-size:12.5px; color:var(--ink); line-height:1.5; margin-top:6px; }
  .cbox .more p{ margin:0 0 9px; } .cbox .more p:last-child{ margin-bottom:0; }
  .cbox .moretoggle{ margin-top:7px; font:inherit; font-size:11.5px; font-weight:600; color:var(--purple-d); background:none; border:none; padding:3px 0; cursor:pointer; }
  .cbox .gtag{ cursor:pointer; } .cbox .gtag:hover{ background:#efe3f3; }
  .cbox .badge{ font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:2px 7px; border-radius:10px; margin-left:8px; vertical-align:middle; }
  .badge.def{ background:#efe3f3; color:var(--purple-d); } .badge.opn{ background:#eee; color:var(--muted); }
  .badge.p{ background:#efe9f1; color:var(--ink); } .badge.d{ background:#fbe5e5; color:#a23b3b; }
  .cbox .gname{ font-size:13px; font-weight:500; margin-top:1px; }
  .cbox .themes{ font-size:12px; color:var(--muted); margin:8px 0 4px; line-height:1.45; }
  .cbox .lbl{ font-size:9.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); font-weight:700; margin:11px 0 6px; }
  .cbox .gates{ display:flex; flex-wrap:wrap; gap:5px; }
  .cbox .gtag{ font-size:11.5px; padding:3px 7px; border-radius:7px; background:#f4f1f6; font-variant-numeric:tabular-nums; }
  .cbox .gtag.d{ color:var(--red); } .cbox .gtag.p{ color:var(--ink); }
  .cbox .gtag .g{ font-family:"Apple Symbols","Segoe UI Symbol","Noto Sans Symbols2",serif; }
  .cbox .close{ position:absolute; top:7px; right:9px; cursor:pointer; color:var(--muted); font-size:18px; line-height:1; border:none; background:none; padding:2px 4px; }
  .cbox .close:hover{ color:var(--ink); }
</style>
</head>
<body>
<div class="layout">
  <div class="coltbl design"><div class="cap">Design</div><div id="design-tbl"></div></div>
  <div class="stage" id="stage"><div id="svghost"></div><div id="mandalahost"></div><div class="ctip" id="ctip"></div><div class="cbox" id="cbox"></div><div class="cbox" id="gbox"></div><div class="cbox" id="chbox"></div><div class="cbox" id="vbox"></div><div class="cbox" id="pbox"></div>
    <div class="mfilterbox" id="mfilterbox"></div>
    <div class="bgtoggle" id="bgtoggle">
      <label><input type="checkbox" class="bside" data-side="personality" checked> Personality</label>
      <label><input type="checkbox" class="bside" data-side="design" checked> Design</label>
    </div>
    <div class="chartlegend">
      <span><span class="sw" style="background:#1c1320"></span>Personality</span>
      <span><span class="sw" style="background:#e06666"></span>Design</span>
      <span class="fx up">&#9650;</span>exalted
      <span class="fx dn">&#9660;</span>detriment
      <span class="fx jx">&#10022;</span>juxtaposed
    </div>
  </div>
  <div class="ptip" id="ptip"></div>
  <div class="coltbl personality"><div class="cap">Personality</div><div id="personality-tbl"></div></div>
  <div class="panel">
    <h1 id="cname" title="Birth & design dates"></h1>
    <div class="propcards" id="propcards"></div>
    <div class="viewswitch" id="viewswitch">
      <button class="vbtn on" data-view="bodygraph">Bodygraph</button>
      <button class="vbtn" data-view="mandala">Mandala</button>
    </div>
    <div class="tabs" id="tabs">
      <button class="tab on" data-mode="centers">Centers</button>
      <button class="tab" data-mode="gates">Gates</button>
      <button class="tab" data-mode="channels">Channels</button>
      <button class="tab" data-mode="variables">Variables</button>
    </div>
    <div class="body" id="body"></div>
    <div class="walk" id="walk" style="display:none">
      <p class="hint">The planetary walk around the wheel, in Ra's order. Step through each placement and its planet lights up on the mandala.</p>
      <div class="walkcap" id="walkcap"></div>
      <div class="wctrls">
        <button id="w-prev">‹ Back</button>
        <button id="w-play" class="primary">▶ Play</button>
        <button id="w-next">Next ›</button>
      </div>
      <div class="scrubrow"><input type="range" id="w-scrub" min="0" value="0" /><span id="w-num"></span></div>
    </div>
    <div class="toolrow">
      <span style="font-size:11px;color:var(--muted)">Highlights anchored to each gate's own label.</span>
      <button class="toggle" id="cal">Validate positions</button>
    </div>
  </div>
</div>

<script>
var SVG = ${JSON.stringify(svg)};
var DATA = ${JSON.stringify(data)};
var NS = 'http://www.w3.org/2000/svg';
var HLB = '#ffcc00';   // gold inner ring
var HLD = '#845095';   // Delphi purple halo (gold + purple, no brown)
var ANCHORS = DATA.anchors;
var DX = 5.0, DY = -3.4;
var GLYPH = {Sun:'☉',Earth:'⊕',Moon:'☽','North Node':'☊','South Node':'☋',Mercury:'☿',Venus:'♀',Mars:'♂',Jupiter:'♃',Saturn:'♄',Uranus:'⛢',Neptune:'♆',Pluto:'♇'};
var CHART_ID = {'Head':'head-center','Ajna':'ajna-center','Throat':'throat-center','G / Identity':'g-center','Heart / Will':'heart-center','Spleen':'splenic-center','Sacral':'sacral-center','Solar Plexus':'solar-plexus-center','Root':'root-center'};
var NAME_FROM_ID = {}; for(var _k in CHART_ID){ NAME_FROM_ID[CHART_ID[_k]]=_k; }
var CTHEME = {
  'Head':'Mental pressure and inspiration. Questions, doubt, and the pressure to make sense of things.',
  'Ajna':'Conceptualization and mental awareness. How the mind processes, organizes, and holds ideas and opinions.',
  'Throat':'Manifestation and communication. Speaking, expressing, and taking action in the world.',
  'G / Identity':'Identity, direction, and love. The sense of self and where life is heading.',
  'Heart / Will':'Willpower, worth, and the material world. Drive, ego, and proving.',
  'Sacral':'Life force, vitality, and response. Generative energy for work, sex, and creativity.',
  'Spleen':'Intuition, instinct, and survival. Bodily awareness of health, fear, and the present moment.',
  'Solar Plexus':'Emotions and feelings. The emotional wave, desire, moods, and social connection.',
  'Root':'Adrenalized pressure and drive. Stress, fuel, and the pulse to get things done.'
};
var PLANET_FULL = {Sun:'Sun',Earth:'Earth',Moon:'Moon','North Node':'North Node','South Node':'South Node',Mercury:'Mercury',Venus:'Venus',Mars:'Mars',Jupiter:'Jupiter',Saturn:'Saturn',Uranus:'Uranus',Neptune:'Neptune',Pluto:'Pluto'};
var VARLABEL = {determination:'Determination',environment:'Environment',motivation:'Motivation',perspective:'Perspective'};
var ARROWPOS = {};

document.getElementById('svghost').innerHTML = SVG;
var svgEl = document.querySelector('#svghost svg');
var stage = document.getElementById('stage');
var ctip = document.getElementById('ctip');

var hl = document.createElementNS(NS,'g'); hl.setAttribute('id','hl'); svgEl.appendChild(hl);

// View-aware bodygraph target. In mandala view, bodygraph-style highlights are
// drawn on the hub bodygraph composited at the wheel's center (same element ids
// and viewBox as the main bodygraph, so ANCHORS still apply).
var currentView='bodygraph';
var hubSvg=null, hubHl=null;
function activeBg(){ return (currentView==='mandala'&&hubSvg)?hubSvg:svgEl; }
function activeHl(){ return (currentView==='mandala'&&hubHl)?hubHl:hl; }
// Shared Personality/Design visibility, driven by the toggle in either view.
var sideState={personality:true,design:true};
function setSide(side,checked){
  sideState[side]=checked;
  [].forEach.call(document.querySelectorAll('input.bside[data-side="'+side+'"],input.fside[data-side="'+side+'"]'),function(c){ c.checked=checked; });
  if(typeof applyMandalaFilter==='function') applyMandalaFilter();
}

document.getElementById('cname').textContent = DATA.name;
(function(){
  var order=['type','strategy','authority','profile','definition','signature','notself','cross'];
  var host=document.getElementById('propcards');
  host.innerHTML=order.map(function(k){ var p=(DATA.properties||{})[k]||{}; return '<div class="pcard'+(k==='cross'?' wide':'')+'" data-k="'+k+'"><b>'+(p.label||k)+'</b><span>'+(p.value||'—')+'</span></div>'; }).join('');
  [].forEach.call(host.querySelectorAll('.pcard'),function(card){ card.addEventListener('click',function(ev){ ev.stopPropagation(); openPropertyBox(card.dataset.k,card); }); });
})();
document.getElementById('cname').addEventListener('click',function(ev){ ev.stopPropagation(); openInfoBox(); });

// ── highlighting ──────────────────────────────────────────────────────────
function clearHL(){ if(hl) while(hl.firstChild) hl.removeChild(hl.firstChild); if(hubHl) while(hubHl.firstChild) hubHl.removeChild(hubHl.firstChild); restoreChannels(); if(typeof mClearHi==='function') mClearHi(); }
function circle(cx,cy,r,stroke,sw,fill,op){ var c=document.createElementNS(NS,'circle'); c.setAttribute('cx',cx); c.setAttribute('cy',cy); c.setAttribute('r',r); c.setAttribute('fill',fill||'none'); if(stroke){ c.setAttribute('stroke',stroke); c.setAttribute('stroke-width',sw); } if(op!=null) c.setAttribute('opacity',op); activeHl().appendChild(c); return c; }
function ringAt(cx,cy,opts){
  opts=opts||{};
  var r=opts.r||11;
  if(opts.fill) circle(cx,cy,r-0.5,null,0,HLB,0.30);
  circle(cx,cy,r+1.3,HLD,(opts.sw||2.6)+2.2);   // dark halo so it pops on any center
  circle(cx,cy,r,HLB,opts.sw||2.6);              // bright ring on top
}
// Highlight a gate: ring on the active bodygraph (hub in mandala) AND, in mandala
// view, pulse the wheel pieces (gate cell, hexagram, spokes, glyphs, center).
function ringGate(gate,opts){ opts=opts||{}; var a=ANCHORS[gate]; if(a) ringAt(a.x+DX,a.y+DY,opts); if(currentView==='mandala' && typeof mAddGate==='function') mAddGate(gate); }
var channelTouched=[];
function highlightChannel(c){
  ringGate(c.gates[0],{fill:true}); ringGate(c.gates[1],{fill:true});
  if(c.groupId){ var g=activeBg().querySelector('[id="'+c.groupId+'"]'); if(g) [].forEach.call(g.querySelectorAll('path,polygon,rect'),function(p){ channelTouched.push([p,p.getAttribute('stroke'),p.getAttribute('stroke-width')]); p.setAttribute('stroke',HLB); p.setAttribute('stroke-width','3.2'); }); }
}
function restoreChannels(){ channelTouched.forEach(function(t){ if(t[1]===null) t[0].removeAttribute('stroke'); else t[0].setAttribute('stroke',t[1]); if(t[2]===null) t[0].removeAttribute('stroke-width'); else t[0].setAttribute('stroke-width',t[2]); }); channelTouched=[]; }
var centerTouched=null;
function highlightCenter(el){ centerTouched=[el,el.getAttribute('stroke'),el.getAttribute('stroke-width')]; el.setAttribute('stroke',HLB); el.setAttribute('stroke-width','4'); }
function restoreCenter(){ if(!centerTouched) return; var t=centerTouched; if(t[1]===null) t[0].removeAttribute('stroke'); else t[0].setAttribute('stroke',t[1]); if(t[2]===null) t[0].removeAttribute('stroke-width'); else t[0].setAttribute('stroke-width',t[2]); centerTouched=null; }
function emphArrow(k){ var p=ARROWPOS[k]; if(p) ringAt(p.x,p.y,{r:13,sw:2.6}); }
// View-aware center highlight: outline the center on the active bodygraph (hub in
// mandala) and, in mandala, pulse its activated gates' cells on the wheel.
function hiCenter(name){
  var cid=CHART_ID[name]; if(!cid) return;
  var el=activeBg().querySelector('[id="'+cid+'"]'); if(el) highlightCenter(el);
  if(currentView==='mandala'){ activatedGatesIn(name).forEach(function(a){ mAddCellHex(a.gate); }); }
}
function clearCenterHi(){ restoreCenter(); if(typeof mClearHi==='function') mClearHi(); }
// Focus a single activation across both representations (used by clicks).
function focusGate(a){
  clearHL();
  if(a.gate!=null) ringGate(a.gate,{fill:true});
  if(currentView==='mandala'){ mAddAct(a); if(a.mx!=null && typeof ringMandala==='function') ringMandala(a.mx,a.my); }
  openGateBox(a);
}

// ── variable arrows (drawn from data; not in the source SVG) ───────────────
function drawArrows(){
  var head = svgEl.querySelector('[id="head-center"]') || svgEl.querySelector('[id$="HeadCenter"]');
  if(!head) return;
  var b = head.getBBox();
  var leftX = b.x - 30, rightX = b.x + b.width + 30;
  var topY = b.y + b.height*0.16, botY = b.y + b.height*0.86;
  // Top-Left: Digestion(Determination)  Top-Right: Motivation
  // Bottom-Left: Environment            Bottom-Right: Perspective
  var defs=[
    {k:'determination',side:'design',x:leftX,y:topY},
    {k:'environment',side:'design',x:leftX,y:botY},
    {k:'motivation',side:'personality',x:rightX,y:topY},
    {k:'perspective',side:'personality',x:rightX,y:botY}
  ];
  var layer=document.createElementNS(NS,'g'); layer.setAttribute('id','vars');
  defs.forEach(function(d){
    ARROWPOS[d.k]={x:d.x,y:d.y};
    var dir=((DATA.variables[d.k]||{}).arrow||'left').toLowerCase();
    var col=d.side==='design'?'#e06666':'#1c1320';
    var g=document.createElementNS(NS,'g'); g.setAttribute('id','var-'+d.k); g.style.cursor='pointer';
    var x=d.x,y=d.y,w=21;
    var line=document.createElementNS(NS,'line'); line.setAttribute('x1',x-w); line.setAttribute('y1',y); line.setAttribute('x2',x+w); line.setAttribute('y2',y); line.setAttribute('stroke',col); line.setAttribute('stroke-width','4.6'); g.appendChild(line);
    var tri=document.createElementNS(NS,'polygon');
    var pts = dir==='left' ? [[x-w,y],[x-w+14,y-9],[x-w+14,y+9]] : [[x+w,y],[x+w-14,y-9],[x+w-14,y+9]];
    tri.setAttribute('points',pts.map(function(p){return p.join(',');}).join(' ')); tri.setAttribute('fill',col); g.appendChild(tri);
    var t=document.createElementNS(NS,'title'); t.textContent=VARLABEL[d.k]; g.appendChild(t);
    g.addEventListener('mouseenter',function(){ var r=g.getBoundingClientRect(); var pt=document.getElementById('ptip'); pt.textContent=VARLABEL[d.k]; pt.style.left=(r.left+r.width/2)+'px'; pt.style.top=(r.top-4)+'px'; pt.style.opacity=1; });
    g.addEventListener('mouseleave',function(){ document.getElementById('ptip').style.opacity=0; });
    g.addEventListener('click',function(ev){ ev.stopPropagation(); openVariableBox(d.k); });
    layer.appendChild(g);
  });
  svgEl.appendChild(layer);
}
drawArrows();

// ── flanking planet tables (also the interactive activation lists) ─────────
function fixMark(f){ if(f==='Exalted') return '<span class="fx" title="Exalted">▲</span>'; if(f==='Detriment') return '<span class="fx" title="Detriment">▼</span>'; if(f==='Juxtaposed') return '<span class="fx" title="Juxtaposed">✦</span>'; return ''; }
function fxc(f){ return '<span class="fxc">'+fixMark(f)+'</span>'; }
function glc(a){ return '<span class="gl">'+a.gate+'.'+a.line+'</span>'; }
function gly(a){ return '<span class="glyph">'+(GLYPH[a.planet]||'')+'</span>'; }
var gbox=document.getElementById('gbox'), chbox=document.getElementById('chbox'), vbox=document.getElementById('vbox'), pbox=document.getElementById('pbox');
var selected=null;
// place a box at the right of the stage, vertically aligned with a panel card
function posBoxNearCard(box,cardEl){ var s=stage.getBoundingClientRect(), c=cardEl.getBoundingClientRect(); var bw=box.offsetWidth, bh=box.offsetHeight; box.style.left=Math.max(8,s.width-bw-14)+'px'; box.style.top=Math.max(8,Math.min(c.top-s.top,s.height-bh-8))+'px'; }
function openPropertyBox(key,cardEl){
  cbox.style.display='none'; gbox.style.display='none'; chbox.style.display='none'; pbox.style.display='none'; vbox.style.display='none';
  var p=(DATA.properties||{})[key]; if(!p) return;
  var pf=p.full?p.full.split('\n\n').map(function(x){return '<p>'+x+'</p>';}).join(''):'';
  pbox.innerHTML='<button class="close" aria-label="Close">×</button>'+
    '<div class="lbl">'+(p.label||key)+'</div><h3>'+(p.value||'—')+'</h3>'+
    (p.brief?'<div class="lbl">Synthesis</div><div class="synth">'+p.brief+'</div>':'')+
    (p.full?'<div class="more" id="pmore">'+pf+'</div><button class="moretoggle" id="pmt">Read more ▾</button>':'');
  pbox.style.display='block';
  pbox.querySelector('.close').onclick=function(ev){ ev.stopPropagation(); pbox.style.display='none'; };
  var mt=pbox.querySelector('#pmt');
  if(mt) mt.onclick=function(ev){ ev.stopPropagation(); var more=pbox.querySelector('#pmore'); var open=more.style.display==='block'; more.style.display=open?'none':'block'; mt.textContent=open?'Read more ▾':'Show less ▴'; };
  posBoxNearCard(pbox,cardEl);
}
function openInfoBox(){
  cbox.style.display='none'; gbox.style.display='none'; chbox.style.display='none'; vbox.style.display='none';
  var b=DATA.birth||{};
  pbox.innerHTML='<button class="close" aria-label="Close">×</button>'+
    '<div class="lbl">Chart for</div><h3>'+DATA.name+'</h3>'+
    '<div class="lbl">Birth</div><div class="synth">'+(b.local||'—')+(b.place?'<br>'+b.place:'')+'</div>'+
    (b.utc?'<div class="lbl">Birth (UTC)</div><div class="synth">'+b.utc+'</div>':'')+
    (b.design?'<div class="lbl">Design date (≈88° before birth, UTC)</div><div class="synth">'+b.design+'</div>':'');
  pbox.style.display='block';
  pbox.querySelector('.close').onclick=function(ev){ ev.stopPropagation(); pbox.style.display='none'; };
  posBoxNearCard(pbox,document.getElementById('cname'));
}
function posBoxAt(box,sx,sy){
  var s=stage.getBoundingClientRect(); var bw=box.offsetWidth, bh=box.offsetHeight, left, top;
  var ctm=svgEl.getScreenCTM&&svgEl.getScreenCTM();   // null when the bodygraph is hidden (mandala view)
  if(ctm){ var pt=svgEl.createSVGPoint(); pt.x=sx; pt.y=sy; var sp=pt.matrixTransform(ctm);
    left=sp.x-s.left+16; top=sp.y-s.top-12; if(left+bw>s.width-8) left=sp.x-s.left-bw-16; }
  else { left=(s.width-bw)/2; top=40; }
  box.style.left=Math.max(8,Math.min(left,s.width-bw-8))+'px'; box.style.top=Math.max(8,Math.min(top,s.height-bh-8))+'px';
}
function posBoxAtGate(box,gate){ var a=ANCHORS[gate]; if(a) posBoxAt(box,a.x+DX,a.y+DY); else posBoxAt(box,200,200); }
function openChannelBox(c){
  cbox.style.display='none'; gbox.style.display='none'; vbox.style.display='none'; pbox.style.display='none';
  var cf=c.full?c.full.split('\n\n').map(function(p){return '<p>'+p+'</p>';}).join(''):'';
  chbox.innerHTML='<button class="close" aria-label="Close">×</button>'+
    '<h3>'+c.name+'</h3> <span class="badge def">'+c.id+'</span>'+
    '<div class="lbl">Connects</div><div class="gname">'+c.centers[0]+' – '+c.centers[1]+'</div>'+
    (c.brief?'<div class="lbl">Synthesis</div><div class="synth">'+c.brief+'</div>':'')+
    (c.full?'<div class="more" id="chmore">'+cf+'</div><button class="moretoggle" id="chmt">Read more ▾</button>':'');
  chbox.style.display='block';
  chbox.querySelector('.close').onclick=function(ev){ ev.stopPropagation(); chbox.style.display='none'; };
  var mt=chbox.querySelector('#chmt');
  if(mt) mt.onclick=function(ev){ ev.stopPropagation(); var more=chbox.querySelector('#chmore'); var open=more.style.display==='block'; more.style.display=open?'none':'block'; mt.textContent=open?'Read more ▾':'Show less ▴'; };
  var a=ANCHORS[c.gates[0]], b=ANCHORS[c.gates[1]];
  if(a&&b) posBoxAt(chbox,(a.x+b.x)/2+DX,(a.y+b.y)/2+DY); else posBoxAtGate(chbox,c.gates[0]);
}
function openVariableBox(k){
  cbox.style.display='none'; gbox.style.display='none'; chbox.style.display='none'; pbox.style.display='none';
  var v=(DATA.variables||{})[k]||{}; var side=(k==='determination'||k==='environment')?'d':'p';
  var arrow=((v.arrow||'').toLowerCase()==='left')?'◄ left arrow':'right arrow ►';
  var vf=v.full?v.full.split('\n\n').map(function(p){return '<p>'+p+'</p>';}).join(''):'';
  vbox.innerHTML='<button class="close" aria-label="Close">×</button>'+
    '<h3>'+(VARLABEL[k]||k)+'</h3> <span class="badge '+side+'">'+(side==='d'?'Design':'Personality')+'</span>'+
    '<div class="lbl">Placement</div><div class="gname">'+(v.placement||((v.theme||'—')+' · '+arrow))+'</div>'+
    (v.brief?'<div class="lbl">Synthesis</div><div class="synth">'+v.brief+'</div>':'')+
    (v.full?'<div class="more" id="vmore">'+vf+'</div><button class="moretoggle" id="vmt">Read more ▾</button>':'');
  vbox.style.display='block';
  vbox.querySelector('.close').onclick=function(ev){ ev.stopPropagation(); vbox.style.display='none'; };
  var mt=vbox.querySelector('#vmt');
  if(mt) mt.onclick=function(ev){ ev.stopPropagation(); var more=vbox.querySelector('#vmore'); var open=more.style.display==='block'; more.style.display=open?'none':'block'; mt.textContent=open?'Read more ▾':'Show less ▴'; };
  var p=ARROWPOS[k]; if(p) posBoxAt(vbox,p.x,p.y); else posBoxAt(vbox,200,60);
}
function openGateBox(a){
  cbox.style.display='none'; chbox.style.display='none'; vbox.style.display='none'; pbox.style.display='none';
  var sideCls=a.side==='design'?'d':'p', sideTxt=a.side==='design'?'Design':'Personality';
  var hex=a.hex?'<img class="hex" src="'+a.hex+'" alt="Gate '+a.gate+' hexagram">':'';
  var synth='';
  if(a.synthesis){
    synth='<div class="lbl">Synthesis</div><div class="synth">'+a.synthesis+'</div>';
    if(a.synthesisFull){
      var full=a.synthesisFull.split('\n\n').map(function(p){return '<p>'+p+'</p>';}).join('');
      synth+='<div class="more" id="gmore">'+full+'</div><button class="moretoggle" id="gmt">Read more ▾</button>';
    }
  }
  gbox.innerHTML='<button class="close" aria-label="Close">×</button>'+
    '<h3>'+(PLANET_FULL[a.planet]||a.planet)+'</h3> <span class="badge '+sideCls+'">'+sideTxt+'</span>'+
    '<div class="grow">'+hex+'<div class="gmeta">'+
      '<div class="lbl">Gate '+a.gate+'</div><div class="gname">'+(a.gateName||'—')+'</div>'+
      '<div class="lbl" style="margin-top:7px">Line '+a.line+'</div><div class="gname">'+(a.lineName||'—')+'</div>'+
    '</div></div>'+
    synth;
  gbox.style.display='block';
  gbox.querySelector('.close').onclick=function(ev){ ev.stopPropagation(); gbox.style.display='none'; };
  function place(){ if(currentView==='mandala' && a.mx!=null && typeof posBoxAtMandala==='function') posBoxAtMandala(gbox,a.mx,a.my); else posBoxAtGate(gbox,a.gate); }
  var mt=gbox.querySelector('#gmt');
  if(mt) mt.onclick=function(ev){ ev.stopPropagation(); var more=gbox.querySelector('#gmore'); var open=more.style.display==='block'; more.style.display=open?'none':'block'; mt.textContent=open?'Read more ▾':'Show less ▴'; place(); };
  place();
}
function selectGate(row,a){
  if(selected===row){ selected=null; row.classList.remove('sel'); clearHL(); gbox.style.display='none'; return; }
  if(selected) selected.classList.remove('sel');
  selected=row; row.classList.add('sel'); clearHL(); ringGate(a.gate,{fill:true}); openGateBox(a);
}
// Jump to a gate's box from elsewhere (e.g. a center's activated-gate tag).
function showGate(a){ if(selected){ selected.classList.remove('sel'); selected=null; } focusGate(a); }
function buildTables(){
  // fixed-width columns (fxc / gl / glyph) so every gate.line lines up
  document.getElementById('design-tbl').innerHTML = DATA.design.map(function(a){
    return '<div class="prow" data-gate="'+a.gate+'" data-planet="'+a.planet+'" title="'+PLANET_FULL[a.planet]+'">'+fxc(a.fix)+glc(a)+gly(a)+'</div>';
  }).join('');
  document.getElementById('personality-tbl').innerHTML = DATA.personality.map(function(a){
    return '<div class="prow" data-gate="'+a.gate+'" data-planet="'+a.planet+'" title="'+PLANET_FULL[a.planet]+'">'+gly(a)+glc(a)+fxc(a.fix)+'</div>';
  }).join('');
  var bySide={personality:{},design:{}};
  DATA.personality.forEach(function(a){ bySide.personality[a.planet]=a; });
  DATA.design.forEach(function(a){ bySide.design[a.planet]=a; });
  var ptip=document.getElementById('ptip');
  [].forEach.call(document.querySelectorAll('.prow'),function(r){
    var side=r.closest('.coltbl.design')?'design':'personality';
    var a=bySide[side][r.dataset.planet]; var gate=a.gate, name=PLANET_FULL[a.planet]||a.planet;
    var glyph=r.querySelector('.glyph');
    function showName(){ var b=glyph.getBoundingClientRect(); ptip.textContent=name; ptip.style.left=(b.left+b.width/2)+'px'; ptip.style.top=(b.top-4)+'px'; ptip.style.opacity=1; }
    r.addEventListener('mouseenter',function(){ showName(); if(!selected){ clearHL(); ringGate(gate); } });
    r.addEventListener('mouseleave',function(){ ptip.style.opacity=0; if(!selected){ clearHL(); } });
    r.addEventListener('click',function(ev){ ev.stopPropagation(); selectGate(r,a); });
  });
}
buildTables();

// ── center detail box (name, themes, activated gates) ──────────────────────
var cbox=document.getElementById('cbox');
function activatedGatesIn(name){ return DATA.personality.concat(DATA.design).filter(function(a){ return a.center===name; }); }
function openCenterBox(name){
  var defined=(DATA.definedCenters||[]).indexOf(name)>=0;
  var acts=activatedGatesIn(name).sort(function(a,b){ return a.gate-b.gate; });
  var gatesHtml = acts.length ? acts.map(function(a,ix){ return '<span class="gtag '+(a.side==='design'?'d':'p')+'" data-idx="'+ix+'" title="'+(PLANET_FULL[a.planet])+(a.side==='design'?' (design)':' (personality)')+' — click for detail"><span class="g">'+(GLYPH[a.planet]||'')+'</span> '+a.gate+'.'+a.line+'</span>'; }).join('') : '<span style="font-size:12px;color:var(--muted)">No activated gates (open center).</span>';
  var det=(DATA.centerDetails||{})[name]||{brief:CTHEME[name]||'',full:''};
  var themes='<div class="themes">'+(det.brief||CTHEME[name]||'')+'</div>';
  if(det.full){ var cf=det.full.split('\n\n').map(function(p){return '<p>'+p+'</p>';}).join(''); themes+='<div class="more" id="cmore">'+cf+'</div><button class="moretoggle" id="cmt">Read more ▾</button>'; }
  cbox.innerHTML='<button class="close" aria-label="Close">×</button>'+
    '<h3>'+name+'</h3> <span class="badge '+(defined?'def':'opn')+'">'+(defined?'defined':'open')+'</span>'+
    themes+
    '<div class="lbl">Activated gates</div><div class="gates">'+gatesHtml+'</div>';
  gbox.style.display='none'; chbox.style.display='none'; vbox.style.display='none'; pbox.style.display='none';
  cbox.style.display='block';
  cbox.querySelector('.close').onclick=function(ev){ ev.stopPropagation(); cbox.style.display='none'; };
  var cmt=cbox.querySelector('#cmt');
  if(cmt) cmt.onclick=function(ev){ ev.stopPropagation(); var more=cbox.querySelector('#cmore'); var open=more.style.display==='block'; more.style.display=open?'none':'block'; cmt.textContent=open?'Read more ▾':'Show less ▴'; };
  [].forEach.call(cbox.querySelectorAll('.gtag[data-idx]'),function(t){ t.addEventListener('click',function(ev){ ev.stopPropagation(); showGate(acts[+t.dataset.idx]); }); });
  // position next to the chart center, clamped to the stage
  var el=activeBg().querySelector('[id="'+CHART_ID[name]+'"]'); var s=stage.getBoundingClientRect();
  var bw=cbox.offsetWidth, bh=cbox.offsetHeight, left, top;
  if(el){ var r=el.getBoundingClientRect(); left=r.right-s.left+14; top=r.top-s.top-10; if(left+bw>s.width-8) left=r.left-s.left-bw-14; }
  else { left=(s.width-bw)/2; top=40; }
  left=Math.max(8,Math.min(left,s.width-bw-8)); top=Math.max(8,Math.min(top,s.height-bh-8));
  cbox.style.left=left+'px'; cbox.style.top=top+'px';
}
// chart centers clickable: attach to the bodygraph centers AND (later) the hub
// bodygraph centers, so they work in both views.
function centerEls(root){ return [].slice.call((root||svgEl).querySelectorAll('[id]')).filter(function(e){ return /^[a-z]+(-[a-z]+)*-center$/.test(e.id); }); }
function wireCenters(root){
  centerEls(root).forEach(function(el){ el.style.cursor='pointer';
    el.addEventListener('mouseenter',function(){ var nm=NAME_FROM_ID[el.id]||''; clearCenterHi(); hiCenter(nm); var r=el.getBoundingClientRect(),s=stage.getBoundingClientRect(); ctip.textContent=nm; ctip.style.left=(r.left-s.left+r.width/2)+'px'; ctip.style.top=(r.top-s.top)+'px'; ctip.style.opacity=1; });
    el.addEventListener('mouseleave',function(){ clearCenterHi(); ctip.style.opacity=0; });
    el.addEventListener('click',function(ev){ ev.stopPropagation(); var nm=NAME_FROM_ID[el.id]; if(nm) openCenterBox(nm); });
  });
}
wireCenters(svgEl);
document.addEventListener('click',function(ev){
  if(cbox.style.display==='block' && !cbox.contains(ev.target)) cbox.style.display='none';
  if(chbox.style.display==='block' && !chbox.contains(ev.target)) chbox.style.display='none';
  if(vbox.style.display==='block' && !vbox.contains(ev.target)) vbox.style.display='none';
  if(pbox.style.display==='block' && !pbox.contains(ev.target) && !(ev.target.closest&&ev.target.closest('.pcard'))) pbox.style.display='none';
  if(gbox.style.display==='block' && !gbox.contains(ev.target) && !(selected&&selected.contains(ev.target))){ gbox.style.display='none'; if(selected){ selected.classList.remove('sel'); selected=null; clearHL(); } }
});

// ── right-panel modes ──────────────────────────────────────────────────────
var body=document.getElementById('body');
var first=DATA.name.split(' ')[0];
function modeCenters(){
  body.innerHTML='<p class="hint">Hover a center on the chart or list to highlight it. Click a center to open its themes and activated gates. Colored centers are defined; white centers are open.</p><div id="clist"></div>';
  var defined={}; (DATA.definedCenters||[]).forEach(function(n){ defined[n]=true; });
  var order=['Head','Ajna','Throat','G / Identity','Sacral','Spleen','Solar Plexus','Heart / Will','Root'];
  document.getElementById('clist').innerHTML=order.map(function(n){ var on=!!defined[n]; return '<div class="row" data-center="'+n+'"><span class="dot" style="background:'+(on?'var(--purple)':'#cfc7d3')+'"></span><span class="pl">'+n+'</span><span class="ct">'+(on?'defined':'open')+'</span></div>'; }).join('');
  [].forEach.call(document.querySelectorAll('#clist .row'),function(r){
    var name=r.dataset.center;
    r.addEventListener('mouseenter',function(){ clearCenterHi(); hiCenter(name); });
    r.addEventListener('mouseleave',clearCenterHi);
    r.addEventListener('click',function(ev){ ev.stopPropagation(); openCenterBox(name); });
  });
}
function modeChannels(){
  if(!DATA.channels.length){ body.innerHTML='<p class="hint">No defined channels in this chart.</p>'; return; }
  body.innerHTML='<p class="hint">Each channel is a fixed wire between two centers. Click one to light it up and open its synthesis.</p><div id="chlist"></div>';
  document.getElementById('chlist').innerHTML=DATA.channels.map(function(c){ return '<div class="row" data-id="'+c.id+'"><span class="dot" style="background:var(--gold)"></span><span class="pl">'+c.name+'</span><span class="gl2">'+c.id+'</span><span class="ct">'+c.centers[0]+' – '+c.centers[1]+'</span></div>'; }).join('');
  var sel=null;
  [].forEach.call(document.querySelectorAll('#chlist .row'),function(r){ var c=DATA.channels.filter(function(x){return x.id===r.dataset.id;})[0];
    r.addEventListener('mouseenter',function(){ if(!sel){ clearHL(); highlightChannel(c); } });
    r.addEventListener('mouseleave',function(){ if(!sel){ clearHL(); } });
    r.addEventListener('click',function(ev){ ev.stopPropagation(); if(sel===r){ sel=null; r.classList.remove('sel'); clearHL(); chbox.style.display='none'; return; } if(sel) sel.classList.remove('sel'); sel=r; r.classList.add('sel'); clearHL(); highlightChannel(c); openChannelBox(c); }); });
}
function modeGates(){
  body.innerHTML='<p class="hint">Every gate activation with its gate and line names. Click a row for its full detail. Personality first, then Design.</p><div id="glist"></div>';
  function section(title,list){
    return '<div class="sechead">'+title+'</div>'+list.map(function(a){
      return '<div class="gaterow" data-side="'+a.side+'" data-planet="'+a.planet+'">'+
        '<div class="top"><span class="dot '+(a.side==='design'?'d':'p')+'"></span><span class="pl">'+a.planet+'</span><span class="gl2">'+a.gate+'.'+a.line+'</span></div>'+
        '<div class="nm">'+(a.gateName||('Gate '+a.gate))+' · '+(a.lineName||('Line '+a.line))+'</div>'+
      '</div>';
    }).join('');
  }
  document.getElementById('glist').innerHTML=section('Personality · conscious',DATA.personality)+section('Design · unconscious',DATA.design);
  var bySide={personality:{},design:{}};
  DATA.personality.forEach(function(a){ bySide.personality[a.planet]=a; });
  DATA.design.forEach(function(a){ bySide.design[a.planet]=a; });
  [].forEach.call(document.querySelectorAll('#glist .gaterow'),function(r){
    var a=bySide[r.dataset.side][r.dataset.planet];
    r.addEventListener('mouseenter',function(){ if(!selected){ clearHL(); ringGate(a.gate); } });
    r.addEventListener('mouseleave',function(){ if(!selected){ clearHL(); } });
    r.addEventListener('click',function(ev){ ev.stopPropagation(); showGate(a); });
  });
}
function modeVariables(){
  var V=DATA.variables;
  body.innerHTML='<p class="hint">The four Variables (PHS). Hover a row to find its arrow beside the head; click for its full description. Design (red) on the left, Personality (black) on the right.</p><div id="vlist"></div>';
  var rows=[{k:'determination',name:'Determination',side:'design'},{k:'environment',name:'Environment',side:'design'},{k:'motivation',name:'Motivation',side:'personality'},{k:'perspective',name:'Perspective',side:'personality'}];
  document.getElementById('vlist').innerHTML=rows.map(function(r){ var v=V[r.k]||{}; var arrow=((v.arrow||'').toLowerCase()==='left')?'◄ left':'right ►'; return '<div class="row" data-k="'+r.k+'"><span class="dot '+(r.side==='design'?'d':'p')+'"></span><span class="pl">'+r.name+'</span><span class="gl2">'+(v.theme||'')+'</span><span class="ct">'+arrow+'</span></div>'; }).join('')
    + '<div class="sechead">Senses</div>'
    + '<div class="row"><span class="dot p"></span><span class="pl">Sense</span><span class="ct">'+(V.sense||'')+'</span></div>'
    + '<div class="row"><span class="dot d"></span><span class="pl">Design Sense</span><span class="ct">'+(V.designSense||'')+'</span></div>';
  [].forEach.call(document.querySelectorAll('#vlist .row[data-k]'),function(r){ var k=r.dataset.k; r.addEventListener('mouseenter',function(){ clearHL(); emphArrow(k); }); r.addEventListener('mouseleave',clearHL); r.addEventListener('click',function(ev){ ev.stopPropagation(); openVariableBox(k); }); });
}
function setMode(m){
  clearHL(); restoreCenter(); ctip.style.opacity=0;
  if(selected){ selected.classList.remove('sel'); selected=null; } gbox.style.display='none'; cbox.style.display='none'; chbox.style.display='none'; vbox.style.display='none'; pbox.style.display='none';
  [].forEach.call(document.querySelectorAll('.tab'),function(t){ t.classList.toggle('on',t.dataset.mode===m); });
  if(m==='centers') modeCenters(); else if(m==='gates') modeGates(); else if(m==='channels') modeChannels(); else modeVariables();
}
[].forEach.call(document.querySelectorAll('.tab'),function(t){ t.onclick=function(){ setMode(t.dataset.mode); }; });

// ── calibration overlay ────────────────────────────────────────────────────
var calOn=false, calLayer=null;
document.getElementById('cal').onclick=function(){
  calOn=!calOn; this.classList.toggle('on',calOn);
  if(calOn){ calLayer=document.createElementNS(NS,'g'); Object.keys(ANCHORS).forEach(function(g){ var a=ANCHORS[g],cx=a.x+DX,cy=a.y+DY; var d=document.createElementNS(NS,'circle'); d.setAttribute('cx',cx); d.setAttribute('cy',cy); d.setAttribute('r',2); d.setAttribute('fill','#1f7a3d'); calLayer.appendChild(d); var rng=document.createElementNS(NS,'circle'); rng.setAttribute('cx',cx); rng.setAttribute('cy',cy); rng.setAttribute('r',9); rng.setAttribute('fill','none'); rng.setAttribute('stroke','#1f7a3d'); rng.setAttribute('stroke-width','0.8'); rng.setAttribute('opacity','0.7'); calLayer.appendChild(rng); }); svgEl.appendChild(calLayer); }
  else if(calLayer){ calLayer.remove(); calLayer=null; }
};

setMode('centers');

// ── mandala view ───────────────────────────────────────────────────────────
var mandalaEl=null, mhl=null, walkTimer=null, wi=0;
var mSeq=DATA.personality.concat(DATA.design);
(function(){
  var host=document.getElementById('mandalahost');
  host.innerHTML=DATA.mandalaSvg||'';
  mandalaEl=host.querySelector('svg');
  if(!mandalaEl) return;
  mhl=document.createElementNS(NS,'g'); mhl.setAttribute('id','mhl'); mandalaEl.appendChild(mhl);
  // hub bodygraph (composited in the wheel center) + its own highlight layer, so
  // bodygraph-style highlights (centers, channels, gate rings) can be drawn there.
  hubSvg=mandalaEl.querySelector('svg');
  if(hubSvg){ hubHl=document.createElementNS(NS,'g'); hubHl.setAttribute('id','hubhl'); hubSvg.appendChild(hubHl); wireCenters(hubSvg); }
  var seqByKey={}; mSeq.forEach(function(a){ seqByKey[a.side+'|'+a.mplanet]=a; });
  function showTip(el,text){ var r=el.getBoundingClientRect(); var pt=document.getElementById('ptip'); pt.textContent=text; pt.style.left=(r.left+r.width/2)+'px'; pt.style.top=(r.top-2)+'px'; pt.style.opacity=1; }
  function hideTip(){ document.getElementById('ptip').style.opacity=0; }
  function go(a){ focusGate(a); }
  var hot=document.createElementNS(NS,'g'); hot.setAttribute('id','mhot');
  // glyph hotspots (sized to the larger glyphs)
  mSeq.forEach(function(a,idx){
    if(a.mx==null) return;
    var c=document.createElementNS(NS,'circle');
    c.setAttribute('cx',a.mx); c.setAttribute('cy',a.my); c.setAttribute('r',DATA.mandalaSize*0.020);
    c.setAttribute('fill','transparent'); c.setAttribute('data-idx',idx); c.style.cursor='pointer';
    c.addEventListener('click',function(ev){ ev.stopPropagation(); go(a); });
    c.addEventListener('mouseenter',function(){ mHighlight(a); showTip(c,a.planet+' '+a.gate+'.'+a.line); });
    c.addEventListener('mouseleave',function(){ mClearHi(); hideTip(); });
    hot.appendChild(c);
  });
  // spoke hit-lines: hover/click anywhere along the line
  [].forEach.call(mandalaEl.querySelectorAll('line[data-planet]'),function(ln){
    var a=seqByKey[ln.getAttribute('data-side')+'|'+ln.getAttribute('data-planet')]; if(!a) return;
    var h=document.createElementNS(NS,'line');
    ['x1','y1','x2','y2'].forEach(function(at){ h.setAttribute(at,ln.getAttribute(at)); });
    h.setAttribute('stroke','transparent'); h.setAttribute('stroke-width',DATA.mandalaSize*0.013); h.style.cursor='pointer';
    h.setAttribute('data-hitspoke',a.side+'|'+a.mplanet);
    h.addEventListener('mouseenter',function(){ mHighlight(a); showTip(h,a.planet+' '+a.gate+'.'+a.line); });
    h.addEventListener('mouseleave',function(){ mClearHi(); hideTip(); });
    h.addEventListener('click',function(ev){ ev.stopPropagation(); go(a); });
    hot.appendChild(h);
  });
  // hexagrams: hover highlights the whole gate; click opens its detail
  [].forEach.call(mandalaEl.querySelectorAll('image[data-hex]'),function(img){
    var gate=+img.getAttribute('data-hex'); img.style.cursor='pointer';
    img.addEventListener('mouseenter',function(){ mHighlightGate(gate); });
    img.addEventListener('mouseleave',function(){ mClearHi(); });
    img.addEventListener('click',function(ev){ ev.stopPropagation(); var a=mSeq.filter(function(x){return x.gate===gate;})[0]; if(a) go(a); });
  });
  mandalaEl.appendChild(hot);
})();
// hover-highlight chain: spoke + glyph + gate cell + hexagram + center pulse together
var mHi=[];
function mClearHi(){ if(mHi) mHi.forEach(function(e){ e.classList.remove(e._cls); }); mHi=[]; }
function mAdd(el,cls){ if(el){ el.classList.add(cls); el._cls=cls; mHi.push(el); } }
// add-only wheel pulses (no clear), so several can composite for a channel/center
function mAddAct(a){ if(!mandalaEl) return;
  mAdd(mandalaEl.querySelector('line[data-side="'+a.side+'"][data-planet="'+a.mplanet+'"]'),'mhi-line');
  mAdd(mandalaEl.querySelector('text[data-side="'+a.side+'"][data-planet="'+a.mplanet+'"]'),'mhi-glyph');
  mAdd(mandalaEl.querySelector('[data-gatecell="'+a.gate+'"]'),'mhi-cell');
  mAdd(mandalaEl.querySelector('[data-hex="'+a.gate+'"]'),'mhi-hex');
  var cid=CHART_ID[a.center]; if(cid) mAdd(mandalaEl.querySelector('[id="'+cid+'"]'),'mhi-center');
}
function mAddGate(gate){ if(!mandalaEl) return;
  mAdd(mandalaEl.querySelector('[data-gatecell="'+gate+'"]'),'mhi-cell');
  mAdd(mandalaEl.querySelector('[data-hex="'+gate+'"]'),'mhi-hex');
  [].forEach.call(mandalaEl.querySelectorAll('line[data-gate="'+gate+'"]'),function(e){ mAdd(e,'mhi-line'); });
  [].forEach.call(mandalaEl.querySelectorAll('text[data-gate="'+gate+'"]'),function(e){ mAdd(e,'mhi-glyph'); });
  var act=mSeq.filter(function(x){return x.gate===gate;})[0];
  if(act){ var cid=CHART_ID[act.center]; if(cid) mAdd(mandalaEl.querySelector('[id="'+cid+'"]'),'mhi-center'); }
}
function mAddCellHex(gate){ if(!mandalaEl) return; mAdd(mandalaEl.querySelector('[data-gatecell="'+gate+'"]'),'mhi-cell'); mAdd(mandalaEl.querySelector('[data-hex="'+gate+'"]'),'mhi-hex'); }
function mHighlight(a){ mClearHi(); mAddAct(a); }
function mHighlightGate(gate){ mClearHi(); mAddGate(gate); }
function posBoxAtMandala(box,mx,my){
  if(!mandalaEl||!mandalaEl.getScreenCTM) return; var ctm=mandalaEl.getScreenCTM(); if(!ctm) return;
  var pt=mandalaEl.createSVGPoint(); pt.x=mx; pt.y=my; var sp=pt.matrixTransform(ctm); var s=stage.getBoundingClientRect();
  var bw=box.offsetWidth, bh=box.offsetHeight; var left=sp.x-s.left+16; if(left+bw>s.width-8) left=sp.x-s.left-bw-16;
  box.style.left=Math.max(8,Math.min(left,s.width-bw-8))+'px'; box.style.top=Math.max(8,Math.min(sp.y-s.top-12,s.height-bh-8))+'px';
}
// ── filter overlay: side + group masters + every planet ────────────────────
var MGROUPS=[
  {grp:'ic',title:'Cross',planets:[['sun','Sun'],['earth','Earth']]},
  {grp:'nodes',title:'Nodes',planets:[['north-node','North Node'],['south-node','South Node']]},
  {grp:'inner',title:'Inner planets',planets:[['moon','Moon'],['mercury','Mercury'],['venus','Venus'],['mars','Mars']]},
  {grp:'outer',title:'Outer planets',planets:[['jupiter','Jupiter'],['saturn','Saturn'],['uranus','Uranus'],['neptune','Neptune'],['pluto','Pluto']]}
];
(function(){
  var box=document.getElementById('mfilterbox'); if(!box) return;
  var html='<div class="mfb-title">Activation</div>'+
    '<label><input type="checkbox" class="fside" data-side="personality" checked> Personality</label>'+
    '<label><input type="checkbox" class="fside" data-side="design" checked> Design</label>';
  MGROUPS.forEach(function(g){
    html+='<div class="mfb-title">'+g.title+'</div>'+
      '<label class="grp"><input type="checkbox" class="fgrp" data-grp="'+g.grp+'" checked> All</label>'+
      g.planets.map(function(p){ return '<label class="pl"><input type="checkbox" class="fpl" data-grp="'+g.grp+'" data-planet="'+p[0]+'" checked> '+p[1]+'</label>'; }).join('');
  });
  box.innerHTML=html;
  [].forEach.call(box.querySelectorAll('.fgrp'),function(g){ g.addEventListener('change',function(){ [].forEach.call(box.querySelectorAll('.fpl[data-grp="'+g.dataset.grp+'"]'),function(p){ p.checked=g.checked; }); g.indeterminate=false; applyMandalaFilter(); }); });
  [].forEach.call(box.querySelectorAll('.fpl'),function(p){ p.addEventListener('change',function(){ var grp=p.dataset.grp; var all=box.querySelectorAll('.fpl[data-grp="'+grp+'"]').length; var on=box.querySelectorAll('.fpl[data-grp="'+grp+'"]:checked').length; var m=box.querySelector('.fgrp[data-grp="'+grp+'"]'); m.checked=(on===all); m.indeterminate=(on>0&&on<all); applyMandalaFilter(); }); });
  [].forEach.call(box.querySelectorAll('.fside'),function(s){ s.addEventListener('change',function(){ setSide(s.dataset.side,s.checked); }); });
})();
// the bodygraph view's own Personality/Design toggle (synced with the mandala one)
[].forEach.call(document.querySelectorAll('input.bside'),function(s){ s.addEventListener('change',function(){ setSide(s.dataset.side,s.checked); }); });
function applyMandalaFilter(){
  var box=document.getElementById('mfilterbox');
  var sides=sideState, planetOn={};
  if(box) [].forEach.call(box.querySelectorAll('.fpl'),function(c){ planetOn[c.dataset.planet]=c.checked; });
  // bodygraph-image side toggle works in either view (mandalaEl may be absent)
  [svgEl, hubSvg].forEach(function(root){ var bs=bgSides(root); if(!bs) return;
    bs.personality.forEach(function(e){ e.style.display=(sides.personality!==false)?'':'none'; });
    bs.design.forEach(function(e){ e.style.display=(sides.design!==false)?'':'none'; });
  });
  if(!mandalaEl || !box) return;
  mSeq.forEach(function(a,idx){
    var disp=(sides[a.side]!==false && planetOn[a.mplanet]!==false)?'':'none';
    var gl=mandalaEl.querySelector('text[data-side="'+a.side+'"][data-planet="'+a.mplanet+'"]'); if(gl) gl.style.display=disp;
    var sp=mandalaEl.querySelector('line[data-side="'+a.side+'"][data-planet="'+a.mplanet+'"]'); if(sp) sp.style.display=disp;
    var hs=mandalaEl.querySelector('#mhot circle[data-idx="'+idx+'"]'); if(hs) hs.style.display=disp;
    var hsl=mandalaEl.querySelector('#mhot line[data-hitspoke="'+a.side+'|'+a.mplanet+'"]'); if(hsl) hsl.style.display=disp;
  });
}
function bgSides(root){
  if(!root) return null;
  if(root._bgSides) return root._bgSides;
  var d=[], p=[];
  // design = any red (#e06666) element (distinctive); exclude our own var-arrows
  [].forEach.call(root.querySelectorAll('*'),function(e){
    if((e.id||'').indexOf('var-')===0) return;
    var f=(e.getAttribute('fill')||'').toLowerCase(), s=(e.getAttribute('stroke')||'').toLowerCase();
    if(f==='#e06666'||s==='#e06666') d.push(e);
  });
  // personality = black activation fills, scoped to activation ids so structural
  // black (numbers, strokes, body outline) is never touched
  [].forEach.call(root.querySelectorAll('[id^="personality-"],[id^="design-"]'),function(e){
    if((e.getAttribute('fill')||'').toLowerCase()==='#000000') p.push(e);
  });
  root._bgSides={personality:p,design:d};
  return root._bgSides;
}
function clearMandalaHL(){ if(mhl) while(mhl.firstChild) mhl.removeChild(mhl.firstChild); }
function mcircle(x,y,r,stroke,sw){ var c=document.createElementNS(NS,'circle'); c.setAttribute('cx',x); c.setAttribute('cy',y); c.setAttribute('r',r); c.setAttribute('fill','none'); c.setAttribute('stroke',stroke); c.setAttribute('stroke-width',sw); mhl.appendChild(c); }
function ringMandala(x,y){ if(!mhl) return; var R=DATA.mandalaSize*0.019; mcircle(x,y,R*0.55,HLB,2); mcircle(x,y,R+3.5,HLD,5.5); mcircle(x,y,R,HLB,3.5); }
function walkSeq(){ return DATA.personality.concat(DATA.design); }
function walkShow(i){
  var seq=walkSeq(); wi=Math.max(0,Math.min(seq.length-1,i)); var a=seq[wi];
  clearMandalaHL(); if(a.mx!=null) ringMandala(a.mx,a.my);
  document.getElementById('walkcap').innerHTML='<span class="tag '+(a.side==='design'?'d':'p')+'">'+(a.side==='design'?'Design · unconscious':'Personality · conscious')+'</span><br><b>'+a.planet+'</b> in Gate <b>'+a.gate+'.'+a.line+'</b><br><span style="color:var(--muted);font-size:12.5px">'+(a.gateName||'')+' · '+(a.lineName||'')+'</span>'+(a.synthesis?'<div class="syn">'+a.synthesis+'</div>':'');
  document.getElementById('w-scrub').value=wi; document.getElementById('w-num').textContent=(wi+1)+' / '+seq.length;
}
function walkStop(){ if(walkTimer){ clearInterval(walkTimer); walkTimer=null; } var pb=document.getElementById('w-play'); if(pb) pb.textContent='▶ Play'; }
document.getElementById('w-prev').onclick=function(){ walkStop(); walkShow(wi-1); };
document.getElementById('w-next').onclick=function(){ walkStop(); walkShow(wi+1); };
document.getElementById('w-play').onclick=function(){ if(walkTimer){ walkStop(); return; } var seq=walkSeq(); if(wi>=seq.length-1) wi=-1; document.getElementById('w-play').textContent='❚❚ Pause'; walkTimer=setInterval(function(){ if(wi>=seq.length-1){ walkStop(); return; } walkShow(wi+1); },1300); };
document.getElementById('w-scrub').addEventListener('input',function(){ walkStop(); walkShow(+this.value); });
function hideAllBoxes(){ [cbox,gbox,chbox,vbox,pbox].forEach(function(b){ b.style.display='none'; }); }
function setView(v){
  currentView=v; walkStop(); clearHL(); clearMandalaHL(); restoreCenter(); hideAllBoxes();
  if(selected){ selected.classList.remove('sel'); selected=null; }
  document.querySelector('.layout').classList.toggle('mandala',v==='mandala');
  document.getElementById('svghost').style.display=v==='bodygraph'?'flex':'none';
  document.getElementById('mandalahost').style.display=v==='mandala'?'flex':'none';
  // shared panel: same tabs/body in both views (no planetary walk)
  document.getElementById('tabs').style.display='flex';
  document.getElementById('body').style.display='block';
  document.getElementById('walk').style.display='none';
  document.getElementById('cal').style.display=v==='mandala'?'none':'';
  [].forEach.call(document.querySelectorAll('.vbtn'),function(b){ b.classList.toggle('on',b.dataset.view===v); });
  if(v==='mandala') applyMandalaFilter();
}
[].forEach.call(document.querySelectorAll('.vbtn'),function(b){ b.onclick=function(){ setView(b.dataset.view); }; });
</script>
</body>
</html>`;
}

main();
