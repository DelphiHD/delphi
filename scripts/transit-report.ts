// Daily Human Design transit report.
//
// Casts the live sky, scans how it shifts across the day, scores the client
// roster to find who is most affected, then writes a collective transit report
// (Haiku 4.5 narrative + a deterministic data appendix) to a Finder-visible
// folder.
//
// Run:
//   npx tsx scripts/transit-report.ts            # today, Mountain time
//   TRANSIT_TZ=America/New_York npx tsx scripts/transit-report.ts
//   TRANSIT_DATE=2026-07-20 npx tsx scripts/transit-report.ts   # a specific day
//   TRANSIT_INTERVAL_MIN=120 npx tsx scripts/transit-report.ts  # coarser day scan
//
// Env: MYBODYGRAPH_API_KEY, ANTHROPIC_API_KEY (from .env.local).

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { getChart, getTimezoneForLocation } from "@/lib/mybodygraph";
import { PLANET_ORDER, type Chart } from "@/lib/chart/types";
import { loadLibraryNames, type LibraryNames } from "@/lib/hd/library-names";
import { loadLibrary, type Library } from "@/lib/hd/library";
import { channelsForGate } from "@/lib/hd/channels";
import { centerOf } from "@/lib/hd/gate-center";
import { shortCrossName } from "@/lib/chart/serialize";
import { verifyReportHtml } from "@/lib/report/verify";
import { notifyMac } from "@/lib/notify";
import { castSkyAt, scanDay, castNatalChart, castTransitBodygraph, moonPhases, assertTraditionalBodies, type SkyMoment, type DayScan, type TransitPosition } from "@/lib/transit/sky";
import type { PhaseChart } from "./render-transit-html";
import { rankImpacts, type ClientImpact } from "@/lib/transit/impact";
import { buildTransitReport, buildBabyOverview, buildSyntheses, buildPersonReads } from "@/lib/report/transit";
import { renderTransitHtml, type BabyEntry } from "./render-transit-html";

import { CLIENTS, type ClientBrief, placeForLookup } from "./client-roster";

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

// Current local clock date + time in a display timezone, without pulling in a
// date library. hourCycle h23 keeps midnight as "00", never "24".
function localNow(tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

// Natal charts never change, so cache them on disk. Casting all 15 clients is
// the bulk of the API calls; after the first run this is free.
async function loadNatalChart(client: ClientBrief): Promise<Chart> {
  const dir = resolve(".cache", "charts");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${client.slug}.json`);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf8")) as Chart;
  }
  const tz = await getTimezoneForLocation(placeForLookup(client));
  const chart = await getChart({
    birthDate: client.birthDate,
    birthTime: client.birthTime,
    timezone: tz,
    locationQuery: placeForLookup(client),
  });
  writeFileSync(path, JSON.stringify(chart));
  return chart;
}

// ── deterministic brief (facts for the model AND the report appendix) ────────

// Standardized placement header: Planet | Gate N: Name | Line M: Name | Center |
// DBHD Function. One scannable row per body, the info Kaycee reads first.
function centerLabel(c: string): string {
  return c.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
// Replace the model's bare per-body headings ("#### Sun") in The Weather Today
// with a standardized header: "#### Sun - Gate 31: Influence | Line 3: Selectivity
// | Throat | I lead or not...". The body name is deterministic; gate/line names,
// center, and DBHD Function come from the chart + library, never the model.
function injectPlacementHeaders(narrative: string, now: SkyMoment, names: LibraryNames): string {
  const byPlanet = new Map<string, TransitPosition>(now.positions.map((p) => [p.planet, p]));
  return narrative.replace(
    /^####\s+(North Node|South Node|Sun|Earth|Moon|Mercury|Venus|Mars|Jupiter|Saturn|Uranus|Neptune|Pluto)\b.*$/gim,
    (m, planet: string) => {
      const p = byPlanet.get(planet);
      if (!p) return m;
      const fix = p.fixingState === "Exalted" ? " ▲" : p.fixingState === "Detriment" ? " ▽" : "";
      const fn = names.func(p.gate).replace(/\s+/g, " ").trim();
      return `#### ${planet} - Gate ${p.gate}: ${names.gate(p.gate)}${fix} | Line ${p.line}: ${names.line(p.gate, p.line)} | ${centerLabel(centerOf(p.gate))}${fn ? ` | ${fn}` : ""}`;
    },
  );
}

// Replace the model's bare per-channel headings ("#### Channel 44-26") in the
// Channels sub-section with a standardized header: "#### 44 - 26: The Channel of
// Surrender | Projected | Spleen - Heart | A design of a Transmitter". Name, type,
// and keynote come from the synced HD Channels library; the two centers are
// derived from the gate pair. If the channel is not in the library the heading is
// left as the model wrote it (graceful).
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
function injectChannelHeaders(narrative: string, names: LibraryNames): string {
  return narrative.replace(
    /^####\s+Channel\s+(\d+)\s*-\s*(\d+)\b.*$/gim,
    (m, a: string, b: string) => {
      const ga = Number(a), gb = Number(b);
      const [lo, hi] = [ga, gb].sort((x, y) => x - y);
      const meta = names.channel(ga, gb);
      const name = meta?.name || `${lo} - ${hi}`;
      const circuit = meta?.circuit?.trim() ?? ""; // her exact circuit string, unformatted
      const type = meta?.type ? titleCase(meta.type) : "";
      const keynote = meta?.keynote ? meta.keynote.charAt(0).toUpperCase() + meta.keynote.slice(1) : "";
      const centers = `${centerLabel(centerOf(lo))} - ${centerLabel(centerOf(hi))}`;
      // Circuit sits right after the channel name, then Type, Centers, Keynote.
      const segs = [name, circuit, type, centers, keynote].filter(Boolean);
      return `#### ${segs.join(" | ")}`;
    },
  );
}

// Per-person input for buildPersonReads: the person's definition, their exact
// completions, a U-shape READ rule, and the grounded library source (channel +
// transit-gate bodies) for the model to interpret from. Quiet people (no
// completions, no reinforcements) are skipped, they get no synthesis.
function personReadItems(impacts: ClientImpact[], names: LibraryNames, library: Library): { key: string; label: string; source: string }[] {
  const items: { key: string; label: string; source: string }[] = [];
  for (const i of impacts) {
    if (!i.completions.length && !i.reinforcements) continue;
    let rule: string;
    if (i.definition.type === "split" && i.definition.splitKind === "simple") {
      rule = "READ: simple split. If a completion below is marked BRIDGES SPLIT, lead with it, today's field temporarily closes the gap in their definition and that bridge is the single thing most worth watching. Otherwise read through the open center a transit lights.";
    } else if (i.definition.type === "triple" || i.definition.type === "quadruple") {
      rule = "READ: many islands, so bridging is background noise. Read their conditioning through which OPEN CENTER a transit lights today.";
    } else {
      rule = "READ: read their conditioning through which OPEN CENTER a transit lights today.";
    }
    const comps = i.completions.map((c) =>
      `- ${c.planet} in gate ${c.transitGate} (${names.gate(c.transitGate)}) completes channel ${c.channelId} ${c.channelName} with their natal ${c.natalGate} (${names.gate(c.natalGate)})`
      + (c.bridgesSplit ? "; BRIDGES SPLIT" : "")
      + (c.definesOpenCenter ? `; lights their open ${c.center} center` : `; ${c.center} center`)
      + ` [${c.duration}]`).join("\n");
    const label = `${i.name} — ${i.definitionLabel}\n${rule}\nCompletions today:\n${comps || `(no channel completions; ${i.reinforcements} natal gate(s) reinforced)`}`;
    // Grounded source: the library bodies for the channels completed and the
    // transiting gates driving them (deduped).
    const srcParts: string[] = [];
    const seen = new Set<string>();
    for (const c of i.completions) {
      const ch = library.channel(c.transitGate, c.natalGate);
      if (ch && !seen.has(`ch${c.channelId}`)) { seen.add(`ch${c.channelId}`); srcParts.push(`CHANNEL ${c.channelId} ${ch.title}\n${ch.body}`); }
      const g = library.gate(c.transitGate);
      if (g && !seen.has(`g${c.transitGate}`)) { seen.add(`g${c.transitGate}`); srcParts.push(`GATE ${c.transitGate} ${g.title}\n${g.body}`); }
    }
    items.push({ key: `person:${i.slug}`, label, source: srcParts.join("\n\n") || "(no additional source)" });
  }
  return items;
}

// The consolidated "Who Feels It Most" section (markdown): the FULL roster,
// ranked, each person as a synthesis paragraph FOLLOWED BY their ranking data
// (the exact completions). Merges what used to be a top-few prose section and a
// separate ranked appendix into one, per Kaycee's request.
function renderWhoSection(impacts: ClientImpact[], reads: Record<string, string>, names: LibraryNames): string {
  const out: string[] = [
    "## Who Feels It Most",
    "",
    "The full roster, ranked by how strongly today's transits land on each chart. Each read is followed by the exact completions driving it.",
    "",
  ];
  let rank = 0;
  for (const i of impacts) {
    rank++;
    out.push(`### ${rank}. ${i.name} · ${i.definitionLabel} (impact ${i.score.toFixed(2)})`, "");
    if (!i.completions.length && !i.reinforcements) {
      out.push("Quiet day, no transit channels or reinforcements.", "");
      continue;
    }
    const read = reads[`person:${i.slug}`];
    if (read) out.push(read, "");
    for (const c of i.completions) {
      out.push(
        `- ${c.planet} in ${c.transitGate} (${names.gate(c.transitGate)}) completes ${c.channelId} ${c.channelName} with natal ${c.natalGate} (${names.gate(c.natalGate)})` +
          (c.bridgesSplit ? "; bridges their split" : "") +
          (c.definesOpenCenter ? `; lights their open ${c.center} center` : `; ${c.center} center`) +
          ` [${c.duration}]`,
      );
    }
    if (i.reinforcements > 0) out.push(`- ${i.reinforcements} natal gate(s) reinforced by today's transits`);
    out.push("");
  }
  return out.join("\n");
}

function renderActiveSky(now: SkyMoment, names: LibraryNames): string {
  const byPlanet = new Map(now.positions.map((p) => [p.planet, p]));
  const lines = ["| Planet | Gate | Line | Center | DBHD Function |", "| --- | --- | --- | --- | --- |"];
  for (const planet of PLANET_ORDER) {
    const p = byPlanet.get(planet);
    if (!p) continue;
    const fix = p.fixingState === "Exalted" ? " ▲" : p.fixingState === "Detriment" ? " ▽" : "";
    const fn = names.func(p.gate).replace(/\s+/g, " ").trim();
    lines.push(`| ${planet} | ${p.gate}: ${names.gate(p.gate)}${fix} | ${p.line}: ${names.line(p.gate, p.line)} | ${centerLabel(centerOf(p.gate))} | ${fn} |`);
  }
  return lines.join("\n");
}

function renderShifts(scan: DayScan, names: LibraryNames): string {
  const gateShifts = scan.shifts.filter((s) => s.kind === "gate");
  const lineShifts = scan.shifts.filter((s) => s.kind === "line");
  const out: string[] = [];

  out.push("Gate changes (a planet crosses into a new gate, the field's theme turns over):");
  out.push("");
  if (gateShifts.length === 0) {
    out.push("_None today._");
  } else {
    out.push("| Time | Planet | Leaves | Enters |", "| --- | --- | --- | --- |");
    for (const s of gateShifts) {
      out.push(`| ${s.time} | ${s.planet} | ${s.from.gate}.${s.from.line} ${names.gate(s.from.gate)} | ${s.to.gate}.${s.to.line} ${names.gate(s.to.gate)} |`);
    }
  }
  out.push("");
  out.push("Line movements (finer shifts within the same gate):");
  out.push("");
  if (lineShifts.length === 0) {
    out.push("_None today._");
  } else {
    out.push("| Time | Planet | Line move |", "| --- | --- | --- |");
    for (const s of lineShifts) {
      out.push(`| ${s.time} | ${s.planet} | ${s.from.gate}.${s.from.line} to ${s.to.gate}.${s.to.line} (${names.line(s.to.gate, s.to.line)}) |`);
    }
  }
  return out.join("\n");
}

function renderImpacts(impacts: ClientImpact[], topN: number, names: LibraryNames): string {
  const out: string[] = [];
  let rank = 0;
  // Full roster, ranked most-affected first (Kaycee uses the complete list for
  // her daily analysis). The narrative "Who Feels It Most" prose still covers
  // only the top few, per the report prompt. topN kept in the signature for
  // callers but the ranking itself is complete.
  for (const i of impacts) {
    rank++;
    if (i.completions.length === 0 && i.reinforcements === 0) {
      out.push(`${rank}. **${i.name}**: quiet day, no transit channels or reinforcements.`);
      continue;
    }
    const head = `${rank}. **${i.name}** · ${i.definitionLabel} (impact ${i.score.toFixed(2)})`;
    const detail: string[] = [];
    for (const c of i.completions) {
      detail.push(
        `   - ${c.planet} in ${c.transitGate} (${names.gate(c.transitGate)}) completes channel ${c.channelId} ${c.channelName} with their natal ${c.natalGate} (${names.gate(c.natalGate)})` +
          (c.bridgesSplit ? `; BRIDGES THEIR SPLIT (deepest hook, temporarily makes their definition whole)` : "") +
          (c.definesOpenCenter ? `; temporarily lights their open ${c.center} center` : `; ${c.center} center`) +
          ` [${c.duration}]`,
      );
    }
    // Tell the model how to read this person's conditioning (U-shape rule).
    if (i.definition.type === "split" && i.definition.splitKind === "simple") {
      detail.push(`   - read: watch the bridge above, it is where today's field most defines them`);
    } else if (i.definition.type === "triple" || i.definition.type === "quadruple") {
      detail.push(`   - read: many islands, so bridging is background noise, read their conditioning through which open centers get lit`);
    } else if (i.definition.type === "single") {
      detail.push(`   - read: whole definition, read their conditioning through which open centers get lit`);
    }
    if (i.reinforcements > 0) detail.push(`   - ${i.reinforcements} natal gate(s) reinforced by today's transits`);
    out.push([head, ...detail].join("\n"));
  }
  return out.join("\n");
}

// What the transiting sky forms on its own today: conjunctions (2+ planets in
// one gate), channels it completes (both gates active among the transits), and
// the centers those channels define. Drives the "if any" sub-sections.
function computeFormations(now: SkyMoment): { conjunctions: string[]; channels: string[]; centers: string[] } {
  const gateSet = new Set(now.positions.map((p) => p.gate));
  const byGate = new Map<number, string[]>();
  for (const p of now.positions) (byGate.get(p.gate) ?? byGate.set(p.gate, []).get(p.gate)!).push(p.planet);
  const conjunctions = [...byGate.entries()]
    .filter(([, pl]) => pl.length >= 2)
    .map(([g, pl]) => `${pl.join(" + ")} in gate ${g}`);

  const chSet = new Set<string>();
  for (const p of now.positions) for (const ch of channelsForGate(p.gate)) if (gateSet.has(ch.partner)) chSet.add(ch.id);
  const centers = new Set<string>();
  for (const id of chSet) { const [a, b] = id.split("-").map(Number); centers.add(centerOf(a)); centers.add(centerOf(b)); }
  return { conjunctions, channels: [...chSet], centers: [...centers] };
}

// Items to synthesize (one grounded line each): every placement (for the
// clickable popups) and every gate/line change (for the As The Day Moves
// synthesis columns). Source is the library body for that gate/line.
function buildSynthesisItems(now: SkyMoment, phasePositions: TransitPosition[][], scan: DayScan, library: Library): { key: string; label: string; source: string }[] {
  const items: { key: string; label: string; source: string }[] = [];
  const seen = new Set<string>();
  const gateSrc = (g: number) => { const e = library.gate(g); return e ? `GATE ${g} ${e.title}\n${e.body}` : ""; };
  const lineSrc = (g: number, l: number) => { const e = library.line(g, l); return e ? `LINE ${g}.${l} ${e.title}\n${e.body}` : ""; };
  const add = (key: string, label: string, source: string) => { if (source && !seen.has(key)) { seen.add(key); items.push({ key, label, source }); } };

  // Placement popups: every planet in the anchor sky AND in every phase chart
  // (their exact gate.line), plus every gate a planet moves into, so every box
  // on every chart has a grounded synthesis.
  const placement = (planet: string, gate: number, line: number) =>
    add(`pl:${planet}:${gate}.${line}`, `${planet} in gate ${gate}, line ${line}`, [gateSrc(gate), lineSrc(gate, line)].filter(Boolean).join("\n\n"));
  for (const p of now.positions) placement(p.planet, p.gate, p.line);
  for (const posSet of phasePositions) for (const p of posSet) placement(p.planet, p.gate, p.line);

  for (const s of scan.shifts) {
    if (s.kind === "gate") {
      add(`gc:${s.time}:${s.planet}:${s.to.gate}`, `${s.planet} enters gate ${s.to.gate}`, gateSrc(s.to.gate));
      placement(s.planet, s.to.gate, s.to.line); // popup for this planet at the phase it enters
    } else {
      add(`lc:${s.time}:${s.planet}:${s.to.gate}.${s.to.line}`, `${s.planet} moves to line ${s.to.line} of gate ${s.to.gate}`, lineSrc(s.to.gate, s.to.line));
    }
  }
  return items;
}

// Assemble the SOURCE MATERIAL: the actual library body text for every gate,
// line, and channel in play today. The narrative interprets only from this.
function buildSourcePack(now: SkyMoment, scan: DayScan, impacts: ClientImpact[], library: Library): { text: string; usedGates: number[]; missing: string[] } {
  const parts: string[] = [];
  const missing: string[] = [];

  const gateSet = new Set<number>();
  const lineSet = new Set<string>();
  for (const p of now.positions) { gateSet.add(p.gate); lineSet.add(`${p.gate}.${p.line}`); }
  for (const s of scan.shifts) {
    gateSet.add(s.from.gate); gateSet.add(s.to.gate);
    lineSet.add(`${s.to.gate}.${s.to.line}`);
  }
  // ONLY the channels the transiting SKY itself forms (both gates occupied by
  // transits). The per-person roster completions are NOT collective channels
  // and must never appear in the Channels section, so they are excluded here.
  const skyChannels = computeFormations(now).channels;

  parts.push("## GATES IN PLAY TODAY");
  for (const g of [...gateSet].sort((a, b) => a - b)) {
    const e = library.gate(g);
    if (e) parts.push(`### Gate ${g}: ${e.title}\n\n${e.body}`);
    else missing.push(`gate ${g}`);
  }
  parts.push("## LINES IN PLAY TODAY");
  for (const key of [...lineSet]) {
    const [g, l] = key.split(".").map(Number);
    const e = library.line(g, l);
    if (e) parts.push(`### ${key}: ${e.title}\n\n${e.body}`);
    else missing.push(`line ${key}`);
  }
  if (skyChannels.length) {
    parts.push("## CHANNELS THE TRANSITING SKY FORMS TODAY");
    parts.push(`These are the ONLY active collective channels today: ${skyChannels.join(", ")}. Do not treat any other channel as active.`);
    for (const id of skyChannels) {
      const [a, b] = id.split("-").map(Number);
      const e = library.channel(a, b);
      if (e) parts.push(`### Channel ${id}: ${e.title}\n\n${e.body}`);
      else missing.push(`channel ${id}`);
    }
  }
  return { text: parts.join("\n\n"), usedGates: [...gateSet], missing };
}

function renderBrief(now: SkyMoment, scan: DayScan, impacts: ClientImpact[], topN: number, names: LibraryNames): string {
  const f = computeFormations(now);
  return [
    "### Active sky right now",
    "",
    renderActiveSky(now, names),
    "",
    "### Transit formations (decide the Conjunctions / Defined Centers / Channels sub-sections from these)",
    "",
    `Conjunctions: ${f.conjunctions.length ? f.conjunctions.join("; ") : "none"}`,
    `Channels the transiting sky completes today: ${f.channels.length ? f.channels.join(", ") : "none"}`,
    `Centers the transiting sky defines today: ${f.centers.length ? f.centers.join(", ") : "none"}`,
    "",
    "### Shifts across the day",
    "",
    renderShifts(scan, names),
    "",
    "### Roster impact ranking (most affected first)",
    "",
    renderImpacts(impacts, topN, names),
  ].join("\n");
}

// The visible "Transit Data (for reference)" appendix: sky + formations + shifts.
// The roster ranking is deliberately excluded here, it now lives in the
// consolidated "Who Feels It Most" section (synthesis + data per person).
function renderVisibleAppendix(now: SkyMoment, scan: DayScan, names: LibraryNames): string {
  const f = computeFormations(now);
  return [
    "### Active sky (12:00 UTC anchor)",
    "",
    renderActiveSky(now, names),
    "",
    "### Transit formations",
    "",
    `Conjunctions: ${f.conjunctions.length ? f.conjunctions.join("; ") : "none"}`,
    `Channels the transiting sky completes today: ${f.channels.length ? f.channels.join(", ") : "none"}`,
    `Centers the transiting sky defines today: ${f.centers.length ? f.centers.join(", ") : "none"}`,
    "",
    "### Shifts across the day",
    "",
    renderShifts(scan, names),
  ].join("\n");
}

async function main() {
  // The report is anchored to 12:00 UTC (Kaycee's edit): the day is a UTC day,
  // times are shown as UTC with Mountain in parentheses.
  const tz = "UTC";
  const intervalMinutes = Number(process.env.TRANSIT_INTERVAL_MIN ?? 60);
  const topN = Number(process.env.TRANSIT_TOP_N ?? 6);
  const date = process.env.TRANSIT_DATE ?? localNow(tz).date;
  const nowTime = "12:00"; // 12:00 UTC anchor
  const timezoneLabel = "anchored at 12:00 UTC";

  console.log(`\n=== Daily Transit Report — ${date} (${tz}) ===\n`);

  // Established gate/line names + full body content from the synced library.
  const names = loadLibraryNames();
  const library = loadLibrary();
  if (!library.loaded) throw new Error("library (.cache/chunks.json) not found; cannot ground the report");

  // 1. The live sky (for "right now" + impact scoring).
  console.log(`Casting the sky for ${date} ${nowTime} ${tz}…`);
  const now = await castSkyAt(date, nowTime, tz);
  assertTraditionalBodies(now.positions, "collective sky (now)");
  const sun = now.positions.find((p) => p.planet === "Sun");
  if (sun) console.log(`  Sun at ${sun.gate}.${sun.line} — ${names.gate(sun.gate)}`);

  // 2. Scan how the sky moves across the day.
  console.log(`Scanning the day at ${intervalMinutes}-minute resolution…`);
  const scan = await scanDay(date, tz, { intervalMinutes });
  console.log(`  ${scan.shifts.length} shift(s) across the day`);

  // Cast one personality-only bodygraph per Moon phase (chronological, at each
  // phase's start). Reused for display AND to ground the placement popups.
  const phaseCharts: PhaseChart[] = [];
  for (const ph of moonPhases(scan)) {
    try {
      const { svg, positions } = await castTransitBodygraph(date, ph.startTime, tz);
      assertTraditionalBodies(positions, `phase bodygraph ${ph.startTime}`);
      phaseCharts.push({ startTime: ph.startTime, endTime: ph.endTime, gate: ph.gate, svg, positions });
    } catch { console.log(`  ⚠ phase ${ph.startTime} skipped`); }
  }

  // 3. Score the roster.
  console.log(`Loading ${Object.keys(CLIENTS).length} natal charts and scoring impact…`);
  const people: { client: { slug: string; name: string }; chart: Chart }[] = [];
  for (const client of Object.values(CLIENTS)) {
    const chart = await loadNatalChart(client);
    people.push({ client: { slug: client.slug, name: client.name }, chart });
  }
  const impacts = rankImpacts(people, now.positions);
  for (const i of impacts.slice(0, topN)) {
    console.log(`  ${i.name.padEnd(20)} score=${i.score.toFixed(2)}  completions=${i.completions.length}`);
  }

  // 4. Assemble the deterministic brief + the grounded source material.
  const brief = renderBrief(now, scan, impacts, topN, names);
  const source = buildSourcePack(now, scan, impacts, library);
  console.log(`Grounding source: ${source.usedGates.length} gates + lines + channels from your library (${Math.round(source.text.length / 1000)}k chars).`);
  if (source.missing.length) console.log(`  ⚠ no library entry for: ${source.missing.join(", ")}`);

  // 5. Narrative (Haiku 4.5), grounded ONLY in the library source material.
  const root = resolve(__dirname, "..");
  const identityMd = readFileSync(resolve(root, "docs/IDENTITY.md"), "utf8");
  const voiceMd = readFileSync(resolve(root, "docs/VOICE.md"), "utf8");
  console.log(`\nWriting narrative (Haiku 4.5), grounded in your library…`);
  const apiKey = must("ANTHROPIC_API_KEY");
  const ceiling = Number(process.env.HARD_COST_CEILING_CENTS ?? 40);
  const t0 = Date.now();
  const narrative = await buildTransitReport({
    date,
    timezoneLabel,
    brief,
    sourceMaterial: source.text,
    identityMd,
    voiceMd,
    apiKey,
    hardCostCeilingCents: ceiling,
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  done in ${elapsed}s, cost $${(narrative.cost_cents / 100).toFixed(4)}`);

  // 5a1. Per-person "Who Feels It Most" reads: one grounded paragraph per person
  // on the roster with any transit activity, paired below with their ranking data.
  console.log(`Writing per-person reads for the roster…`);
  const personItems = personReadItems(impacts, names, library);
  const personReads = await buildPersonReads({ people: personItems, identityMd, voiceMd, apiKey, hardCostCeilingCents: Number(process.env.HARD_COST_CEILING_CENTS ?? 80) });
  console.log(`  ${Object.keys(personReads).length}/${personItems.length} reads returned`);
  // Every person WITH transit activity must get a synthesis. A gap here (a
  // person-reads batch that failed even after retries) is why the TOP-ranked
  // names once shipped with data but no paragraph. Track it and fail the
  // self-check below so the backup run regenerates instead of shipping silently.
  const readGaps = personItems.filter((it) => !personReads[it.key]).map((it) => it.key.replace(/^person:/, ""));
  if (readGaps.length) console.log(`  ⚠ ${readGaps.length} person synthesis(es) MISSING after retries: ${readGaps.join(", ")}`);
  const whoSection = renderWhoSection(impacts, personReads, names);

  // 5a2. Grounded one-line syntheses for the popups + shift-table columns.
  console.log(`Writing grounded syntheses for placements + shifts…`);
  const synthItems = buildSynthesisItems(now, phaseCharts.map((p) => p.positions), scan, library);
  const syntheses = await buildSyntheses({ items: synthItems, identityMd, voiceMd, apiKey, hardCostCeilingCents: Number(process.env.HARD_COST_CEILING_CENTS ?? 80) });
  console.log(`  ${Object.keys(syntheses).length}/${synthItems.length} syntheses returned`);

  // 5b. Babies born today: one full natal chart per day-phase interval, each
  // with its own overview, grounded in the library (Type/Authority/Profile/
  // Definition/Cross + outer-planet gates). Set TRANSIT_BABIES=0 to skip.
  const babyPhases = process.env.TRANSIT_BABIES === "0" ? [] : moonPhases(scan);
  if (babyPhases.length) console.log(`Casting ${babyPhases.length} "born today" chart(s) + grounded overviews…`);
  else console.log(`Babies section off (TRANSIT_BABIES=0).`);
  const babies: BabyEntry[] = [];
  for (const ph of babyPhases) {
    try {
      const natal = await castNatalChart(date, ph.representativeTime, tz);
      const c = natal.chart;
      // Outer planets = the slow, generational current shared with everyone
      // born around this time. Give both sides (Personality + Design).
      const pMap = new Map(c.activations.personality.map((a) => [a.planet, a]));
      const dMap = new Map(c.activations.design.map((a) => [a.planet, a]));
      const outer = (["Uranus", "Neptune", "Pluto"] as const).map((pl) => {
        const p = pMap.get(pl);
        const d = dMap.get(pl);
        const parts: string[] = [];
        if (p) parts.push(`Personality ${p.gate}.${p.line} (${names.gate(p.gate)})`);
        if (d) parts.push(`Design ${d.gate}.${d.line} (${names.gate(d.gate)})`);
        return `  ${pl}: ${parts.join(", ")}`;
      }).join("\n");
      const facts = [
        `Type: ${c.type.value}`,
        `Strategy: ${c.strategy.value}`,
        `Authority: ${c.authority.value}`,
        `Profile: ${c.profile.value}`,
        `Definition: ${c.definition.value}`,
        `Incarnation Cross: ${c.incarnationCross.value}`,
        `Defined centers: ${c.centers.filter((x) => x.defined).map((x) => x.name).join(", ") || "none"}`,
        `Channels: ${c.channels.map((x) => x.id).join(", ") || "none"}`,
        `Outer planets (generational, shared with peers):\n${outer}`,
      ].join("\n");
      // Grounded source: the library write-ups for this chart's building blocks.
      const authShort = c.authority.value.split(/[-(]/)[0].trim();
      const babySrc = [
        library.matchByTitle("type", c.type.value),
        library.matchByTitle("authority", authShort),
        library.matchByTitle("profile", c.profile.value.replace(/\s+/g, "")),
        library.matchByTitle("definition", c.definition.value.replace(/\s+Definition\s*$/i, "").trim()),
        library.matchByTitle("cross", shortCrossName(c.incarnationCross.value)),
        ...(["Uranus", "Neptune", "Pluto"] as const).map((pl) => { const p = pMap.get(pl); return p ? library.gate(p.gate) : null; }),
      ].filter((e): e is NonNullable<typeof e> => !!e).map((e) => `## ${e.title}\n\n${e.body}`).join("\n\n");
      const overview = await buildBabyOverview({ date, time: ph.representativeTime, timezoneLabel, facts, sourceMaterial: babySrc, identityMd, voiceMd, apiKey, hardCostCeilingCents: ceiling });
      babies.push({ time: ph.representativeTime, svg: natal.svg, chart: c, overview: overview.text });
      console.log(`  ${ph.representativeTime}  ${c.type.value} · ${c.profile.value} · $${(overview.cost_cents / 100).toFixed(4)}`);
    } catch (e) {
      console.log(`  ⚠ baby chart ${ph.representativeTime} skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 6. Assemble the final markdown: metadata + narrative + data appendix.
  const generatedAt = new Date().toISOString();
  const metadataBlock = `<!--
report:        Daily Transit Report
date:          ${date}
timezone:      ${tz}
generated_at:  ${generatedAt}
model:         ${narrative.model}
cost_usd:      ${(narrative.cost_cents / 100).toFixed(4)}
scan_interval: ${intervalMinutes}min
shifts:        ${scan.shifts.length}
-->
`;
  const title = `# Daily Transit Report\n\n**${date}** · ${timezoneLabel}\n\n*Delphi HD · the collective weather*\n\n---\n`;
  const appendix = `\n\n---\n\n## Transit Data (for reference)\n\n${renderVisibleAppendix(now, scan, names)}\n`;
  // Normalize heading levels: the script owns the only h1 (the document title),
  // so any single-hash heading from the model is a mislevel (Haiku sometimes
  // writes "# The Weather Today" instead of "##"). Promote every lone "# " to
  // "## " so the section renders as an h2, both in the markdown and, critically,
  // in the HTML (the bodygraph splice keys off the Weather Today <h2>).
  const normalized = narrative.text.replace(/^#(?!#)[ \t]+/gm, "## ");
  // Each body in The Weather Today gets a standardized header (the model wrote a
  // bare "#### Sun"; we replace it with "#### Sun - Gate N: Name | Line M: Name |
  // Center | Function"), and each active channel gets "#### Name | Type | Centers
  // | Keynote", so every placement and channel is labeled like a proper document.
  const wovenNarrative = injectChannelHeaders(injectPlacementHeaders(normalized, now, names), names);
  const finalText = metadataBlock + title + wovenNarrative + "\n\n" + whoSection + appendix;

  // 7. Write to a Finder-visible folder + a working cache copy + the log.
  const outDir = resolve(homedir(), "Desktop", "HD Reports", "Transits");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${date} - Daily Transit Report.md`);
  writeFileSync(outPath, finalText);
  console.log(`\n✓ published to: ${outPath}`);

  mkdirSync(".cache/transits", { recursive: true });
  const cachePath = resolve(".cache", "transits", `${date}.md`);
  writeFileSync(cachePath, finalText);

  // 7b. Branded .html viewer with personality-only bodygraphs + shorthand columns.
  console.log(`Rendering branded .html (personality bodygraphs through the day)…`);
  const htmlPath = resolve(outDir, `${date} - Daily Transit Report.html`);
  try {
    await renderTransitHtml({
      date,
      timezoneLabel,
      tz,
      nowTime,
      narrative: wovenNarrative,
      whoSection,
      now,
      scan,
      impacts,
      topN,
      names,
      babies,
      phaseCharts,
      syntheses,
      outPath: htmlPath,
    });
    console.log(`✓ published to: ${htmlPath}`);
  } catch (e) {
    console.log(`  ⚠ .html render skipped: ${e instanceof Error ? e.message : String(e)}`);
  }

  const logEntry = {
    timestamp: generatedAt,
    date,
    timezone: tz,
    model: narrative.model,
    cost_usd: Math.round((narrative.cost_cents / 100) * 10000) / 10000,
    shifts: scan.shifts.length,
    top_impact: impacts[0] ? { name: impacts[0].name, score: Math.round(impacts[0].score * 100) / 100 } : null,
    out_path: outPath,
  };
  appendFileSync(".cache/transits/log.jsonl", JSON.stringify(logEntry) + "\n");

  // 8. Lint: no em dashes anywhere in the published files (narrative, baby
  // overviews, and any hardcoded copy all get caught here).
  const published = [outPath, htmlPath].filter(existsSync);
  let emDashTotal = 0;
  for (const p of published) {
    const n = (readFileSync(p, "utf8").match(/—/g) ?? []).length;
    if (n > 0) console.log(`\n  ⚠ ${n} em dash(es) in ${p}`);
    emDashTotal += n;
  }
  if (emDashTotal === 0) console.log(`  ✓ no em dashes`);

  // 9. SELF-CHECK: verify the report is actually complete before it counts as
  // "done". Writes a PASS/FAIL status the wrapper reads to decide whether the
  // 7:30 backup should regenerate, and notifies Kaycee on FAIL so a broken
  // report never reaches her desktop unflagged.
  const verdict = verifyReportHtml(htmlPath, { expectBabies: babyPhases.length > 0 });
  // Fold in per-person synthesis completeness (the HTML verifier can't see it):
  // if any active person is missing their read, the report is NOT complete.
  verdict.checks.push({ name: "Person syntheses", pass: readGaps.length === 0, detail: readGaps.length ? `${readGaps.length} missing: ${readGaps.join(", ")}` : "all present" });
  if (readGaps.length) {
    verdict.pass = false;
    verdict.summary = `${verdict.summary === "all complete" ? "" : verdict.summary + "; "}${readGaps.length} person synthesis(es) missing`;
  }
  console.log(`\n${verdict.pass ? "═══ SELF-CHECK: PASSED ═══" : `═══ SELF-CHECK: FAILED ═══`}`);
  for (const c of verdict.checks) console.log(`  ${c.pass ? "✓" : "✗"} ${c.name}: ${c.detail}`);
  const statusPath = resolve(".cache", "transits", `${date}.status`);
  writeFileSync(statusPath, verdict.pass ? "PASS" : `FAIL: ${verdict.summary}`);
  if (!verdict.pass) {
    notifyMac({
      title: "⚠️ Delphi: transit report incomplete",
      subtitle: `${date} needs a look`,
      message: verdict.summary,
      sound: "Basso",
    });
    process.exitCode = 1; // surfaces in the log; the backup run will retry
  }
}

main().catch(async (e) => {
  console.error(e);
  try {
    const { notifyFailure } = await import("../lib/notify");
    notifyFailure("Daily Transit Report", e);
  } catch { /* notification best-effort */ }
  process.exit(1);
});
