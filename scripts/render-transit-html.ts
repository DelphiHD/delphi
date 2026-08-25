// Branded HTML renderer for the daily transit report.
//
// Produces a self-contained .html viewer (Delphi purple, Montserrat) that shows
// the transit sky as PERSONALITY-ONLY bodygraphs, laid out side by side, each
// with a Genetic-Matrix-style shorthand placement column (planet glyph + gate.line)
// down its side, plus a "babies born today" full natal chart with an overview.
// HTML embeds the SVG natively (no rasterizing) and matches the interactive-chart
// medium. Gate/line names come from Kaycee's synced library (LibraryNames).

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { PLANET_ORDER, type Chart } from "@/lib/chart/types";
import type { LibraryNames } from "@/lib/hd/library-names";
import { formatUtcTime, type SkyMoment, type DayScan, type TransitPosition } from "@/lib/transit/sky";
import { centerOf } from "@/lib/hd/gate-center";

/** A pre-cast bodygraph for one Moon phase, built in transit-report.ts. */
export interface PhaseChart {
  startTime: string;
  endTime: string;
  gate: number;
  svg: string;
  positions: TransitPosition[];
}
import type { ClientImpact } from "@/lib/transit/impact";

const BRAND_DIR = "/Users/dorothygale/Desktop/Delphi Brand Assets/brand";
const LOGO_DELPHI_PATH = join(BRAND_DIR, "Delphi.png");

// The 13 planets Genetic Matrix lists in its shorthand column (no Chiron/Lilith).
const SHORTHAND_PLANETS = PLANET_ORDER.slice(0, 13);

const PLANET_GLYPHS: Record<string, string> = {
  Sun: "☉", Earth: "⊕", Moon: "☽", "North Node": "☊", "South Node": "☋",
  Mercury: "☿", Venus: "♀", Mars: "♂", Jupiter: "♃", Saturn: "♄",
  Uranus: "♅", Neptune: "♆", Pluto: "♇", Chiron: "⚷", Lilith: "⚸",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Escape for a double-quoted HTML attribute value.
function escA(s: string): string {
  return esc(s).replace(/"/g, "&quot;");
}

// Namespace every id in an inline SVG (and any internal #references) so embedding
// many bodygraphs in one document does not collide on shared ids ("ajna-center").
function namespaceSvg(svg: string, prefix: string): string {
  return svg
    .replace(/\bid="([^"]+)"/g, `id="${prefix}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${prefix}-$1"`);
}

// ── shorthand placement column (Genetic Matrix style) ────────────────────────
// prev (the previous phase's positions) drives the purple "changed gate"
// highlight: a box lights up when that planet has moved into a new gate.

function shorthandColumn(positions: TransitPosition[], names: LibraryNames, syn: Record<string, string>, prev?: TransitPosition[]): string {
  const prevByPlanet = prev ? new Map(prev.map((p) => [p.planet, p])) : null;
  const boxes = SHORTHAND_PLANETS.map((planet) => {
    const p = positions.find((x) => x.planet === planet);
    if (!p) return "";
    const glyph = PLANET_GLYPHS[planet] ?? "";
    const fix = p.fixingState === "Exalted" ? "<span class='fix ex'>▲</span>"
             : p.fixingState === "Detriment" ? "<span class='fix de'>▽</span>" : "";
    const before = prevByPlanet?.get(planet);
    const changed = before && before.gate !== p.gate;
    const lineName = names.line(p.gate, p.line);
    const gateNm = names.gate(p.gate);
    const title = `${planet} ${p.gate}.${p.line} ${gateNm}${lineName ? " · " + lineName : ""}`;
    const synth = syn[`pl:${planet}:${p.gate}.${p.line}`] || "";
    return `<div class="pbox${changed ? " chg" : ""}" title="${escA(title)}"`
      + ` data-gate="${p.gate}" data-planet="${escA(planet)}" data-gl="${p.gate}.${p.line}"`
      + ` data-glyph="${escA(glyph)}" data-gname="${escA(gateNm)}" data-lname="${escA(lineName)}" data-syn="${escA(synth)}">`
      + `<span class="gly">${glyph}</span><span class="gl">${p.gate}.${p.line}</span>${fix}</div>`;
  });
  return `<div class="cols">${boxes.join("")}</div>`;
}

// A natal placement column (Design or Personality) for the baby charts. Static
// display, no popups (these are birth placements, not transit).
function natalColumn(acts: Array<{ planet: string; gate: number; line: number; fixingState: string }>, side: "design" | "pers"): string {
  const boxes = SHORTHAND_PLANETS.map((planet) => {
    const p = acts.find((x) => x.planet === planet);
    if (!p) return "";
    const glyph = PLANET_GLYPHS[planet] ?? "";
    const fix = p.fixingState === "Exalted" ? "<span class='fix ex'>▲</span>"
             : p.fixingState === "Detriment" ? "<span class='fix de'>▽</span>" : "";
    return `<div class="pbox ${side}" title="${escA(`${planet} ${p.gate}.${p.line}`)}"><span class="gly">${glyph}</span><span class="gl">${p.gate}.${p.line}</span>${fix}</div>`;
  });
  return `<div class="cols">${boxes.join("")}</div>`;
}

function chartCard(svg: string, positions: TransitPosition[], names: LibraryNames, syn: Record<string, string>, prefix: string, caption: string, sub: string, variant: "big" | "phase", prev?: TransitPosition[]): string {
  return `<figure class="chart ${variant}">
    <div class="chartrow">
      <div class="bg">${namespaceSvg(svg, prefix)}</div>
      ${shorthandColumn(positions, names, syn, prev)}
    </div>
    <figcaption><span class="cap">${esc(caption)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ""}<div class="readout" aria-live="polite"></div></figcaption>
  </figure>`;
}

// ── narrative / prose markdown → HTML ────────────────────────────────────────

function inline(text: string): string {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function proseToHtml(md: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let inList = false;
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const closeList = () => { if (inList) { out.push("</ul>"); inList = false; } };
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (/^####\s+/.test(line)) { flushPara(); closeList(); out.push(`<h4 class="pl">${inline(line.replace(/^####\s+/, ""))}</h4>`); continue; }
    if (/^###\s+/.test(line)) { flushPara(); closeList(); out.push(`<h3>${inline(line.replace(/^###\s+/, ""))}</h3>`); continue; }
    if (/^##\s+/.test(line)) { flushPara(); closeList(); out.push(`<h2>${inline(line.replace(/^##\s+/, ""))}</h2>`); continue; }
    // A lone "# " heading should never fall through to body text; render as h2.
    if (/^#\s+/.test(line)) { flushPara(); closeList(); out.push(`<h2>${inline(line.replace(/^#\s+/, ""))}</h2>`); continue; }
    if (/^[-*]\s+/.test(line)) { flushPara(); if (!inList) { out.push("<ul>"); inList = true; } out.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`); continue; }
    if (line === "") { flushPara(); closeList(); continue; }
    para.push(line);
  }
  flushPara(); closeList();
  return out.join("\n");
}

// ── deterministic appendix ───────────────────────────────────────────────────

function centerLabel(c: string): string {
  return c.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
// Standardized placement header: Planet | Gate N: Name | Line M: Name | Center |
// DBHD Function. One scannable row per body.
function skyTable(now: SkyMoment, names: LibraryNames): string {
  const byPlanet = new Map(now.positions.map((p) => [p.planet, p]));
  const rows = PLANET_ORDER.map((planet) => {
    const p = byPlanet.get(planet);
    if (!p) return "";
    const fix = p.fixingState === "Exalted" ? " ▲" : p.fixingState === "Detriment" ? " ▽" : "";
    const fn = names.func(p.gate).replace(/\s+/g, " ").trim();
    return `<tr><td>${PLANET_GLYPHS[planet] ?? ""} ${esc(planet)}</td><td><strong>${p.gate}</strong>: ${esc(names.gate(p.gate))}${fix}</td><td>${p.line}: ${esc(names.line(p.gate, p.line))}</td><td>${esc(centerLabel(centerOf(p.gate)))}</td><td class="muted">${esc(fn)}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Planet</th><th>Gate</th><th>Line</th><th>Center</th><th>DBHD Function</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// "As The Day Moves": a Gate changes table and a Line changes tab, each with a
// grounded synthesis column. Times are dual UTC / Mountain. Moon line moves are
// already excluded upstream (Moon is gate-level only).
function shiftsHtml(scan: DayScan, names: LibraryNames, date: string, syn: Record<string, string>): string {
  const gateShifts = scan.shifts.filter((s) => s.kind === "gate");
  const lineShifts = scan.shifts.filter((s) => s.kind === "line");

  const gateRows = gateShifts.map((s) => {
    const synth = syn[`gc:${s.time}:${s.planet}:${s.to.gate}`] || "";
    return `<tr><td class="t">${esc(formatUtcTime(date, s.time))}</td><td>${esc(s.planet)}</td>`
      + `<td class="muted">${s.from.gate}.${s.from.line} ${esc(names.gate(s.from.gate))}</td>`
      + `<td class="to"><strong>${s.to.gate}.${s.to.line} ${esc(names.gate(s.to.gate))}</strong></td>`
      + `<td>${esc(synth)}</td></tr>`;
  }).join("");
  const gateTable = gateShifts.length
    ? `<table class="gatechanges"><thead><tr><th>Time</th><th>Planet</th><th>Moving from</th><th>Moving to</th><th>Synthesis</th></tr></thead><tbody>${gateRows}</tbody></table>`
    : `<p class="muted">No gate changes today. The active gates hold all day.</p>`;

  const lineRows = lineShifts.map((s) => {
    const synth = syn[`lc:${s.time}:${s.planet}:${s.to.gate}.${s.to.line}`] || "";
    return `<tr><td class="t">${esc(formatUtcTime(date, s.time))}</td><td>${esc(s.planet)}</td>`
      + `<td class="muted">${s.from.gate}.${s.from.line} ${esc(names.line(s.from.gate, s.from.line))}</td>`
      + `<td>${s.to.gate}.${s.to.line} ${esc(names.line(s.to.gate, s.to.line))}</td>`
      + `<td>${esc(synth)}</td></tr>`;
  }).join("");
  const lineTable = lineShifts.length
    ? `<table><thead><tr><th>Time</th><th>Planet</th><th>Moving from</th><th>Moving to</th><th>Synthesis</th></tr></thead><tbody>${lineRows}</tbody></table>`
    : `<p class="muted">No line movements today.</p>`;

  // Two tabs: Gate changes (default) and Line changes.
  return `<div class="shifttabs">
    <div class="tabstrip">
      <button class="stab on" data-shift="gate">Gate changes</button>
      <button class="stab" data-shift="line">Line changes</button>
    </div>
    <div class="shiftpanel" data-shift="gate">${gateTable}</div>
    <div class="shiftpanel" data-shift="line" hidden>${lineTable}</div>
  </div>`;
}

// ── babies born today (clickable birth-time tabs) ────────────────────────────

export interface BabyEntry {
  /** Local birth time (HH:MM) this chart is cast for. */
  time: string;
  svg: string;
  chart: Chart;
  overview: string;
}

function babyPanel(b: BabyEntry, idx: number): string {
  const c = b.chart;
  const definedCenters = c.centers.filter((x) => x.defined).map((x) => x.name).join(", ") || "none";
  const fact = (label: string, value: string) => `<div class="f"><b>${esc(label)}</b> ${esc(value)}</div>`;
  const facts = [
    fact("Type", c.type.value),
    fact("Strategy", c.strategy.value),
    fact("Authority", c.authority.value),
    fact("Profile", c.profile.value),
    fact("Definition", c.definition.value),
    fact("Incarnation Cross", c.incarnationCross.value),
    fact("Defined centers", definedCenters),
  ].join("");
  return `<div class="tabpanel" data-baby="${idx}"${idx === 0 ? "" : " hidden"}>
    <div class="baby">
      <div class="bchart"><div class="chartrow">${natalColumn(b.chart.activations.design, "design")}<div class="bg">${namespaceSvg(b.svg, "baby" + idx)}</div>${natalColumn(b.chart.activations.personality, "pers")}</div><div class="bcap">Born ~${esc(b.time)} · design (red) left, personality (black) right</div></div>
      <div class="btext"><div class="facts">${facts}</div>${proseToHtml(b.overview.replace(/^#\s+.*(?:\r?\n|$)/, ""))}</div>
    </div>
  </div>`;
}

function babiesSection(babies: BabyEntry[]): string {
  if (!babies.length) return "";
  const tabs = babies.map((b, i) =>
    `<button class="btab${i === 0 ? " on" : ""}" data-baby="${i}">${esc(b.time)}<span class="bsub">${esc(b.chart.profile.value)} ${esc(b.chart.type.value)}</span></button>`).join("");
  const panels = babies.map((b, i) => babyPanel(b, i)).join("\n");
  return `<p class="muted">A chart for a child born at each phase of the day. Click a birth time to read that chart. Birth time changes the design, so these can differ across the day.</p>
    <div class="babytabs"><div class="tabstrip">${tabs}</div>${panels}</div>`;
}

// ── page shell ───────────────────────────────────────────────────────────────

function logoDataUri(): string {
  if (!existsSync(LOGO_DELPHI_PATH)) return "";
  return `data:image/png;base64,${readFileSync(LOGO_DELPHI_PATH).toString("base64")}`;
}

const CSS = `
:root{ --purple:#845095; --purple-d:#5f3a6c; --gold:#c79a2e; --ink:#1c1320; --muted:#7a6f80; --line:#e7e0ea; --bg:#fbf9fc; --card:#ffffff; }
*{ box-sizing:border-box; }
body{ margin:0; background:var(--bg); color:var(--ink); font-family:Montserrat,"Helvetica Neue",Arial,sans-serif; line-height:1.55; }
.wrap{ max-width:1180px; margin:0 auto; padding:32px 28px 80px; }
header.top{ display:flex; align-items:center; gap:18px; border-bottom:2px solid var(--purple); padding-bottom:16px; margin-bottom:8px; }
header.top img{ height:46px; width:auto; }
header.top .t{ margin-left:auto; text-align:right; }
h1{ font-size:30px; color:var(--purple); margin:14px 0 2px; letter-spacing:.3px; }
.dateline{ color:var(--muted); font-size:14px; margin:0 0 6px; }
h2{ font-size:19px; color:var(--purple); text-transform:uppercase; letter-spacing:.6px; border-bottom:1px solid var(--line); padding-bottom:6px; margin:34px 0 12px; }
h3{ font-size:15px; color:var(--ink); margin:22px 0 6px; }
h4.sub{ font-size:13px; color:var(--purple); text-transform:uppercase; letter-spacing:.5px; margin:16px 0 6px; }
h4.pl{ font-size:14px; color:var(--purple); font-weight:700; margin:18px 0 4px; line-height:1.35; border-bottom:1px solid var(--line); padding-bottom:4px; }
p{ margin:0 0 12px; }
.muted{ color:var(--muted); }
ul{ margin:0 0 12px; padding-left:20px; }
li{ margin:2px 0; }
.legend{ font-size:12px; color:var(--muted); margin:2px 0 14px; }
.legend .sw{ display:inline-block; width:11px; height:11px; border-radius:3px; background:var(--purple); vertical-align:-1px; margin:0 4px 0 0; }
/* chart grid */
.charts{ display:flex; flex-wrap:wrap; gap:22px; align-items:flex-start; }
.chart{ margin:0; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 14px 10px; box-shadow:0 1px 3px rgba(90,50,100,.06); }
.chart.big{ width:100%; max-width:520px; }
.chart.phase{ width:340px; }
.chartrow{ display:flex; gap:12px; align-items:stretch; }
.bg{ flex:1 1 auto; min-width:0; }
.bg svg{ width:100%; height:auto; display:block; }
figcaption{ margin-top:10px; text-align:center; }
figcaption .cap{ display:block; font-weight:600; color:var(--purple); font-size:14px; }
figcaption .sub{ display:block; color:var(--muted); font-size:12px; }
.readout{ min-height:17px; margin-top:8px; font-size:12px; color:var(--ink); }
.readout .g{ color:var(--purple); font-weight:600; }
.readout .ln{ color:var(--muted); font-style:italic; }
.hint{ font-size:12px; color:var(--muted); margin:2px 0 12px; }
/* shorthand column (Genetic Matrix style) */
.cols{ display:flex; flex-direction:column; gap:4px; justify-content:center; flex:0 0 auto; }
.pbox{ display:flex; align-items:center; gap:6px; background:var(--ink); color:#fff; border-radius:5px; padding:3px 7px; min-width:56px; cursor:pointer; user-select:none; transition:transform .06s ease; }
.pbox:hover{ transform:translateX(-1px); }
.pbox.sel{ outline:2px solid var(--gold); outline-offset:1px; }
.pbox.chg{ background:var(--purple); box-shadow:0 0 0 2px rgba(132,80,149,.25); }
.bg svg .hl{ stroke:#c79a2e !important; stroke-width:2.6 !important; paint-order:stroke; }
.pbox .gly{ font-size:14px; line-height:1; width:16px; text-align:center; }
.pbox .gl{ font-size:12px; font-weight:600; letter-spacing:.3px; }
.pbox .fix{ font-size:9px; margin-left:auto; }
.pbox .fix.ex{ color:#ffd27a; } .pbox .fix.de{ color:#9fb4ff; }
/* tables */
table{ border-collapse:collapse; width:100%; font-size:13px; margin:6px 0 16px; }
th,td{ text-align:left; padding:6px 10px; border:1px solid var(--line); }
th{ background:#f2ecf4; color:var(--purple); font-weight:600; }
td.t{ white-space:nowrap; font-variant-numeric:tabular-nums; }
table.gatechanges td.to{ color:var(--purple); }
details.lines summary{ cursor:pointer; color:var(--purple); font-size:13px; margin:4px 0; }
.person{ margin:0 0 14px; }
.person h4{ margin:10px 0 4px; color:var(--ink); font-size:14px; }
.person .score{ color:var(--muted); font-weight:400; font-size:12px; }
/* shift tabs (gate / line changes) */
.shifttabs .tabstrip{ display:flex; gap:6px; margin:2px 0 14px; }
.stab{ font:inherit; cursor:pointer; background:#fff; border:1px solid var(--line); border-radius:8px; padding:6px 14px; color:var(--ink); font-weight:600; }
.stab.on{ background:var(--purple); border-color:var(--purple); color:#fff; }
.shiftpanel table{ table-layout:fixed; }
.shiftpanel td.t{ white-space:nowrap; }
.shiftpanel table th:nth-child(1), .shiftpanel table td:nth-child(1){ width:18%; }
.shiftpanel table th:nth-child(2), .shiftpanel table td:nth-child(2){ width:9%; }
.shiftpanel table th:nth-child(3), .shiftpanel table td:nth-child(3){ width:16%; }
.shiftpanel table th:nth-child(4), .shiftpanel table td:nth-child(4){ width:16%; }
.shiftpanel table th:nth-child(5), .shiftpanel table td:nth-child(5){ width:41%; }
.gatechanges td.to{ color:var(--purple); }
/* placement popup (grounded synthesis) */
.readout{ min-height:0; }
.popup{ margin-top:10px; background:#faf6fc; border:1px solid var(--line); border-left:3px solid var(--purple); border-radius:8px; padding:10px 12px; font-size:13px; }
.popup .ph{ font-weight:600; color:var(--purple); margin-bottom:3px; }
.popup .ph .gl{ color:var(--ink); }
.popup .ln{ color:var(--muted); font-style:italic; }
.popup .syn{ margin-top:4px; color:var(--ink); }
/* fixed, always-visible synthesis popup */
.txpop{ position:fixed; left:50%; bottom:26px; transform:translateX(-50%); z-index:1000; width:min(560px, calc(100% - 32px)); background:#fff; border:1px solid var(--line); border-left:4px solid var(--purple); border-radius:12px; padding:15px 40px 15px 18px; box-shadow:0 10px 34px rgba(60,30,70,.24); font-size:14px; line-height:1.5; }
.txpop[hidden]{ display:none; }
.txpop .close{ position:absolute; top:8px; right:12px; cursor:pointer; background:none; border:none; color:var(--muted); font-size:22px; line-height:1; }
.txpop .ph{ font-weight:600; color:var(--purple); margin:0 0 4px; }
.txpop .ph .gl{ color:var(--ink); } .txpop .ph .ln{ color:var(--muted); font-style:italic; font-weight:400; }
.txpop .syn{ color:var(--ink); }
/* babies */
.babytabs .tabstrip{ display:flex; flex-wrap:wrap; gap:6px; margin:2px 0 18px; }
.btab{ font:inherit; cursor:pointer; background:#fff; border:1px solid var(--line); border-radius:8px; padding:7px 12px; color:var(--ink); display:flex; flex-direction:column; align-items:flex-start; line-height:1.2; font-weight:600; }
.btab .bsub{ font-size:11px; color:var(--muted); margin-top:2px; font-weight:400; }
.btab.on{ background:var(--purple); border-color:var(--purple); color:#fff; }
.btab.on .bsub{ color:rgba(255,255,255,.82); }
.baby{ display:flex; gap:26px; flex-wrap:wrap; align-items:flex-start; }
.baby .bchart{ width:440px; flex:0 0 auto; }
.baby .bchart .bg{ flex:1 1 auto; min-width:0; }
.baby .pbox{ cursor:default; }
.pbox.design{ background:#e06666; }
.baby .bchart svg{ width:100%; height:auto; display:block; }
.baby .bcap{ text-align:center; color:var(--muted); font-size:12px; margin-top:6px; }
.baby .btext{ flex:1 1 340px; min-width:300px; }
.facts{ display:flex; flex-wrap:wrap; gap:6px 18px; margin:0 0 14px; }
.facts .f{ font-size:13px; }
.facts .f b{ color:var(--purple); }
.appendix{ margin-top:20px; }
footer{ margin-top:40px; color:var(--muted); font-size:12px; text-align:center; }
/* embedded mandala motion (night-sky, day+week) */
iframe.skymotion{ width:100%; height:min(80vh,860px); border:1px solid var(--line); border-radius:12px; background:#0d0b1a; display:block; margin:6px 0 8px; }
`;

export interface RenderTransitHtmlArgs {
  date: string;
  timezoneLabel: string;
  tz: string;
  nowTime: string;
  narrative: string;
  /** The consolidated "Who Feels It Most" section (markdown): per person a
   *  synthesis paragraph followed by their ranking data, full roster. */
  whoSection: string;
  now: SkyMoment;
  scan: DayScan;
  impacts: ClientImpact[];
  topN: number;
  names: LibraryNames;
  babies: BabyEntry[];
  /** Pre-cast bodygraphs, one per Moon phase, chronological from 00:00 UTC. */
  phaseCharts: PhaseChart[];
  /** key -> grounded one-line synthesis, for popups (pl:..) and shift tables (gc:../lc:..). */
  syntheses: Record<string, string>;
  outPath: string;
}

function phaseLabel(startHHMM: string): string {
  const h = parseInt(startHHMM.split(":")[0], 10);
  if (h < 5) return "Late night";
  if (h < 11) return "Morning";
  if (h < 14) return "Midday";
  if (h < 18) return "Afternoon";
  if (h < 22) return "Evening";
  return "Night";
}

export async function renderTransitHtml(args: RenderTransitHtmlArgs): Promise<void> {
  const { names } = args;

  // One bodygraph per Moon phase, in CHRONOLOGICAL order from 00:00 UTC, all
  // the SAME size (personality-only). Pre-cast in transit-report.ts.
  const phaseCards: string[] = [];
  let prev: TransitPosition[] | undefined;
  let n = 0;
  for (const ph of args.phaseCharts) {
    phaseCards.push(chartCard(ph.svg, ph.positions, names, args.syntheses, `p${n++}`, `Moon in ${ph.gate} ${names.gate(ph.gate)}`, `from ${formatUtcTime(args.date, ph.startTime)}`, "phase", prev));
    prev = ph.positions;
  }

  // "The Weather Today" owns the bodygraphs (chronological, uniform), spliced
  // under the narrative's Weather Today heading.
  const bodygraphsBlock =
    `<p class="legend"><span class="sw"></span>A purple placement marks a planet that has changed gate since the previous chart. Click any placement, or a gate on the chart, for its transit synthesis.</p>\n`
    + `  <div class="charts">${phaseCards.join("\n")}</div>`;
  // The narrative is now just "The Weather Today" (ends at The Thread); the
  // bodygraphs splice in under its heading. "Who Feels It Most" is a separate,
  // deterministic section (synthesis + ranking data per person) rendered below,
  // after the As The Day Moves tables and the Babies section.
  let weatherBody = proseToHtml(args.narrative);
  weatherBody = weatherBody.replace(/(<h2>[^<]*Weather Today[^<]*<\/h2>)/i, (m) => `${m}\n  ${bodygraphsBlock}`);
  if (!/Weather Today/i.test(weatherBody)) weatherBody = bodygraphsBlock + "\n" + weatherBody; // fallback
  const whoBody = proseToHtml(args.whoSection);

  const asTheDayMoves = `<h2>As The Day Moves</h2>\n  ${shiftsHtml(args.scan, names, args.date, args.syntheses)}`;

  const logo = logoDataUri();
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Daily Transit Report · ${esc(args.date)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    ${logo ? `<img src="${logo}" alt="Delphi HD">` : `<strong style="color:var(--purple);font-size:20px">Delphi HD</strong>`}
    <div class="t"><div class="muted">Daily Transit Report</div><div class="muted">${esc(args.date)} · ${esc(args.timezoneLabel)}</div></div>
  </header>
  <h1>The Collective Weather</h1>
  <p class="dateline">${esc(args.date)} · ${esc(args.timezoneLabel)}</p>

  ${weatherBody}

  ${asTheDayMoves}

  ${args.babies.length ? `<h2>Babies Born on This Day</h2>\n  ${babiesSection(args.babies)}` : ""}

  ${whoBody}

  <div class="appendix">
    <h2>Transit Data</h2>
    <h3>Active sky (12:00 UTC anchor)</h3>
    ${skyTable(args.now, names)}
  </div>

  <footer>Delphi HD · www.delphihd.com · generated ${esc(args.date)}</footer>
</div>
<div id="txpop" class="txpop" hidden></div>
<script>
// Baby birth-time tabs.
document.querySelectorAll('.babytabs').forEach(function(box){
  box.querySelectorAll('.btab').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = btn.getAttribute('data-baby');
      box.querySelectorAll('.btab').forEach(function(b){ b.classList.toggle('on', b === btn); });
      box.querySelectorAll('.tabpanel').forEach(function(p){ p.hidden = p.getAttribute('data-baby') !== id; });
    });
  });
});

// Gate/Line changes tabs.
document.querySelectorAll('.shifttabs').forEach(function(box){
  box.querySelectorAll('.stab').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = btn.getAttribute('data-shift');
      box.querySelectorAll('.stab').forEach(function(b){ b.classList.toggle('on', b === btn); });
      box.querySelectorAll('.shiftpanel').forEach(function(p){ p.hidden = p.getAttribute('data-shift') !== id; });
    });
  });
});

// Clickable placement columns: highlight the gate on this card's bodygraph and
// show a readout. Scoped per .chart so each column drives its own bodygraph.
// A single fixed popup, always visible near the bottom of the viewport.
var txpop = document.getElementById('txpop');
function clearHL(){
  document.querySelectorAll('.chart .bg .hl').forEach(function(e){ e.classList.remove('hl'); });
  document.querySelectorAll('.pbox.sel').forEach(function(b){ b.classList.remove('sel'); });
}
function hidePop(){ if (txpop) txpop.hidden = true; clearHL(); }
document.querySelectorAll('.chart').forEach(function(card){
  var boxes = card.querySelectorAll('.pbox');
  function gateEls(g){ return card.querySelectorAll('.bg [id$="_' + g + '"], .bg [id$="personality-' + g + '"]'); }
  function activate(box){
    hidePop();
    box.classList.add('sel');
    gateEls(box.getAttribute('data-gate')).forEach(function(e){ e.classList.add('hl'); });
    var ln = box.getAttribute('data-lname');
    var synth = box.getAttribute('data-syn') || '';
    var header = '<div class="ph">' + box.getAttribute('data-glyph') + ' ' + box.getAttribute('data-planet')
      + ' <span class="gl">' + box.getAttribute('data-gl') + '</span> ' + box.getAttribute('data-gname')
      + (ln ? ' <span class="ln">' + ln + '</span>' : '') + '</div>';
    if (txpop) {
      txpop.innerHTML = '<button class="close" aria-label="Close">&times;</button>' + header
        + '<div class="syn">' + (synth || 'No source synthesis for this placement.') + '</div>';
      txpop.hidden = false;
      txpop.querySelector('.close').addEventListener('click', function(ev){ ev.stopPropagation(); hidePop(); });
    }
  }
  boxes.forEach(function(box){ box.addEventListener('click', function(ev){ ev.stopPropagation(); activate(box); }); });
  // Gate shapes on the bodygraph open the same popup.
  var boxByGate = {};
  boxes.forEach(function(box){ var g = box.getAttribute('data-gate'); if (!(g in boxByGate)) boxByGate[g] = box; });
  Object.keys(boxByGate).forEach(function(g){
    gateEls(g).forEach(function(el){
      el.style.cursor = 'pointer';
      el.addEventListener('click', function(ev){ ev.stopPropagation(); activate(boxByGate[g]); });
    });
  });
});
// Click anywhere outside the popup closes it.
document.addEventListener('click', function(e){ if (txpop && !txpop.hidden && !txpop.contains(e.target)) hidePop(); });
</script>
</body>
</html>`;

  writeFileSync(args.outPath, html);
}
