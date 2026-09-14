/**
 * The workshop tool: an interactive teaching deck built from the people in the
 * room.
 *
 * Kaycee, 2026-09-13: "I want the tool to be interactive, meaning anyone who
 * signs up for the event using the BFKI link will show up in the tool for the
 * counts for the defined/undefined/open centers, types and strategies... I
 * would love the living mandala we worked on to be one of the views."
 *
 * It follows the Living Your Design flow in Delphi's own words: the room, the
 * wheel, the bodygraph, the nine centers (defined, undefined, open, with names),
 * definition, authority, type and strategy, profiles, then groups, pairings and
 * side-by-side comparisons. Every text comes from her synced library.
 *
 * Built the night before and opened from the laptop: one folder, no network.
 * The living mandala and the teaching bodygraph ride along as their own files
 * and open inside the deck.
 *
 * Run:
 *   npx tsx scripts/workshop-deck.ts                 # everyone tagged bfki
 *   npx tsx scripts/workshop-deck.ts --event bfki
 *   npx tsx scripts/workshop-deck.ts --demo          # the sandbox charts, for trying it out
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getChart } from "@/lib/mybodygraph";
import { CENTER_GATES, type Center } from "@/lib/hd/gate-center";
import { readSplit } from "@/lib/hd/split-kind";
import { longitudeOf } from "@/lib/hd/gate-longitude";
import { loadLibraryChunks } from "@/lib/hd/chunks-source";
import { mandalaWheelGeometry, renderMandalaRings } from "@/lib/render/mandala";

const args = process.argv.slice(2);
const DEMO = args.includes("--demo");
const EVENT = (() => {
  const i = args.indexOf("--event");
  return i > -1 ? args[i + 1] : "bfki";
})();

const OUT_DIR = join(process.env.HOME ?? "", "Desktop", "Mandala Renderer Output", "Educational",
  DEMO ? "Workshop (demo)" : `${EVENT.toUpperCase()} Workshop`);
const BRAND_DIR = join(process.cwd(), "assets", "brand");

const CENTER_ORDER: Center[] = ["head", "ajna", "throat", "g", "heart", "spleen", "solar-plexus", "sacral", "root"];
const CENTER_NAME: Record<Center, string> = {
  head: "Head", ajna: "Ajna", throat: "Throat", g: "G / Identity", heart: "Ego / Heart",
  spleen: "Spleen", sacral: "Sacral", "solar-plexus": "Solar Plexus", root: "Root",
};
const CENTER_LIB: Record<Center, string> = {
  head: "Head", ajna: "Ajna", throat: "Throat", g: "G (Identity)", heart: "Ego (Heart, Will)",
  spleen: "Spleen", sacral: "Sacral", "solar-plexus": "Solar Plexus (Emotional)", root: "Root",
};
const FROM_API: Record<string, Center> = {
  head: "head", ajna: "ajna", throat: "throat", g: "g", heart: "heart", ego: "heart",
  "solar plexus": "solar-plexus", sacral: "sacral", spleen: "spleen", root: "root",
};
const DEMO_NAMES = ["Ava", "Ben", "Cora", "Dane", "Eli", "Faye", "Gus", "Hana", "Ivy", "Jude", "Kai", "Lena", "Milo", "Nora", "Owen", "Pia"];
const CORE = new Set(["Sun", "Earth", "North Node", "South Node", "Moon", "Mercury", "Venus",
  "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]);

const norm = (v: string) =>
  v.toLowerCase().split(":")[0].replace(/\bdefinition\b/g, "").replace(/[^a-z0-9/]/g, "");
const delphi = (m: Record<string, string> | undefined) =>
  ((m ?? {})["Delphi Basic"] ?? (m ?? {})["Delphi Basic Description"] ?? "").trim();

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } });
}

// People who are in the room without registering: Kaycee and Max from her
// roster. Kaycee, 2026-09-13: "Max Jones and I will both be there though."
// Add names with --with "First Last,First Last".
const WITH = (() => {
  const i = args.indexOf("--with");
  return i > -1 ? args[i + 1].split(",").map((s) => s.trim()).filter(Boolean) : ["Kaycee Vandenberg", "Max Jones"];
})();

async function people() {
  const d = db();
  const cols = "person_name, birth_date, birth_time, birth_timezone, birth_place, token, time_accuracy, created_at";
  const { data, error } = DEMO
    ? await d.from("charts").select(cols).eq("source", "sandbox").order("person_name")
    : await d.from("charts").select(cols).eq("source", EVENT).order("created_at");
  if (error) throw new Error(`could not read the roster: ${error.message}`);
  const rows = data ?? [];
  if (!DEMO && WITH.length) {
    const { data: extra } = await d.from("charts").select(cols).eq("tier", "seed").in("person_name", WITH);
    for (const e of extra ?? []) if (!rows.some((r) => r.person_name === e.person_name)) rows.unshift(e);
  }
  return rows;
}

/** Her words, keyed the way the deck asks for them. */
async function library() {
  const chunks = await loadLibraryChunks();
  const lib = {
    centers: {} as Record<string, { themes: string; type: string; defined: string; undefined: string; open: string }>,
    types: {} as Record<string, { basic: string; strategy: string; frequencies: string; notSelf: string; signature: string }>,
    authority: {} as Record<string, string>,
    definition: {} as Record<string, string>,
    profile: {} as Record<string, string>,
    line: {} as Record<string, string>,
    planet: {} as Record<string, string>,
    quarter: {} as Record<string, string>,
    // her Workshop Slides database, by slide name
    slides: {} as Record<string, string>,
    notSelf: {} as Record<string, string>,
    channels: {} as Record<string, { name: string; basic: string }>,
  };
  for (const c of chunks) {
    const m = (c.metadata ?? {}) as Record<string, string>;
    const title = (c.title ?? "").trim();
    switch (c.source_kind) {
      case "workshop_slide": if (delphi(m)) lib.slides[title] = delphi(m); break;
      case "channel": {
        const id = (title.match(/(\d{1,2})\s*-\s*(\d{1,2})/) ?? []).slice(1, 3).map(Number).sort((a, b) => a - b).join("-");
        if (id) lib.channels[id] = { name: title.replace(/^[^:]*:\s*/, ""), basic: delphi(m) };
        break;
      }
      case "center":
        lib.notSelf[title] = (m["Not Self Themes"] ?? "").trim();
        lib.centers[title] = {
          themes: (m.Themes ?? "").trim(), type: (m.Type ?? "").trim(),
          defined: (m["Delphi Defined Basic"] ?? "").trim(),
          undefined: (m["Delphi Undefined Basic"] ?? "").trim(),
          open: (m["Delphi Open Basic"] ?? "").trim(),
        };
        break;
      case "type":
        lib.types[norm(title)] = {
          basic: delphi(m), strategy: (m["Delphi Strategy Basic"] ?? "").trim(),
          frequencies: (m["Delphi Frequencies Basic"] ?? "").trim(),
          notSelf: (m["Not-Self Theme"] ?? "").trim(), signature: (m.Signature ?? "").trim(),
        };
        break;
      case "authority": if (delphi(m)) lib.authority[norm(title)] = delphi(m); break;
      case "definition": if (delphi(m)) lib.definition[norm(title)] = delphi(m); break;
      case "profile": if (delphi(m)) lib.profile[norm(title)] = delphi(m); break;
      case "profile_line": if (delphi(m)) lib.line[title.split(":")[0].trim()] = delphi(m); break;
      case "planet": if (delphi(m)) lib.planet[title] = delphi(m); break;
      case "quarter": if (delphi(m)) lib.quarter[title.replace(/^\d+:\s*/, "")] = delphi(m); break;
    }
  }
  return lib;
}

/** The authority entry in her database for a chart's authority and type. */
function authorityKey(value: string, type: string): string {
  const a = value.trim().toLowerCase();
  if (a === "ego") return norm(type === "Manifestor" ? "Ego Manifested" : "Ego Projected");
  if (a === "lunar") return norm("Lunar Authority");
  if (a === "mental") return norm("Environment (Mental Projectors)");
  return norm(value);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const roster = await people();
  console.log(`${roster.length} ${DEMO ? "sandbox" : EVENT} chart(s)`);
  const lib = await library();
  const wheel = mandalaWheelGeometry(1000);

  const room = [];
  for (const r of roster) {
    const chart = await getChart({
      birthDate: String(r.birth_date),
      birthTime: String(r.birth_time ?? "12:00").slice(0, 5),
      timezone: String(r.birth_timezone),
      locationQuery: String(r.birth_place),
      brandedSvg: true,
    });
    const acts = [...chart.activations.personality, ...chart.activations.design].filter((a) => CORE.has(a.planet));
    const gates = new Set(acts.map((a) => a.gate));
    const defined = new Set((chart.centers ?? []).filter((c) => c.defined).map((c) => FROM_API[c.name.toLowerCase()]).filter(Boolean));
    const centers: Record<string, "defined" | "undefined" | "open"> = {};
    for (const c of CENTER_ORDER) {
      centers[c] = defined.has(c) ? "defined" : CENTER_GATES[c].some((g) => gates.has(g)) ? "undefined" : "open";
    }
    const split = readSplit({
      definedChannels: (chart.channels ?? []).map((c) => c.id),
      definedCenters: [...defined],
      gates: acts.map((a) => a.gate),
    });
    let definition = /^no\b/i.test(chart.definition.value.trim()) ? "No Definition"
      : chart.definition.value.replace(/\s*Definition\s*$/i, "").trim();
    if (definition === "Split" && split.kind) definition = split.kind === "simple" ? "Simple Split" : "Wide Split";
    const sun = chart.activations.personality.find((a) => a.planet === "Sun")!;
    const dSun = chart.activations.design.find((a) => a.planet === "Sun")!;
    const first = String(r.person_name).trim().split(/\s+/)[0];
    const type = chart.type.value;
    const profile = (chart.profile.value.match(/\d\s*\/\s*\d/) ?? [""])[0].replace(/\s/g, "");
    room.push({
      // the demo stands in short first names, like the real room will have
      name: DEMO ? DEMO_NAMES[room.length % DEMO_NAMES.length] : first,
      fullName: String(r.person_name),
      token: r.token,
      type, strategy: chart.strategy.value, authority: chart.authority.value,
      authorityKey: authorityKey(chart.authority.value, type),
      profile, definition, cross: chart.incarnationCross.value,
      signature: chart.signature.value, notSelf: chart.notSelfTheme.value,
      centers,
      channels: (chart.channels ?? []).map((c) => String(c.id).split("-").map(Number).sort((a, b) => a - b).join("-")),
      gates: [...gates].sort((a, b) => a - b),
      sunGate: `${sun.gate}.${sun.line}`, designSunGate: `${dSun.gate}.${dSun.line}`,
      sunLon: longitudeOf(sun.gate, sun.line, sun.color ?? 1, sun.tone ?? 1, sun.base ?? 1),
      designSunLon: longitudeOf(dSun.gate, dSun.line, dSun.color ?? 1, dSun.tone ?? 1, dSun.base ?? 1),
      // every placement with its exact place on the wheel, for building a chart live
      acts: (["personality", "design"] as const).flatMap((side) => chart.activations[side]
        .filter((a) => CORE.has(a.planet))
        .map((a) => ({ side, planet: a.planet, gate: a.gate, line: a.line,
          lon: longitudeOf(a.gate, a.line, a.color ?? 1, a.tone ?? 1, a.base ?? 1) }))),
      svg: chart.bodygraphSvg ?? chart.chartImageSvg ?? "",
      timeKnown: r.time_accuracy !== "unknown",
    });
    console.log(`  ${room[room.length - 1].name.padEnd(26)} ${type} ${profile} ${definition}`);
  }

  // Each person's own Delphi chart, the same page their link opens, saved beside
  // the deck. Nothing about a chart is rebuilt here; the chart builder makes it.
  const chartDir = join(OUT_DIR, "charts");
  mkdirSync(chartDir, { recursive: true });
  process.env.CHART_OUT_DIR = chartDir;
  const { runBuilder } = await import("./energy-flow-diagram");
  for (const p of room) {
    // --no-charts reuses charts already in the folder, for quick layout changes
    const kept = readdirSync(chartDir).find((f) => f.startsWith(`${p.fullName} - `) && f.endsWith(".html"));
    if (args.includes("--no-charts") && kept) { (p as { chartFile?: string }).chartFile = `charts/${kept}`; continue; }
    const before = new Set(existsSync(chartDir) ? readdirSync(chartDir) : []);
    try {
      await runBuilder(["--token", String(p.token), "--no-png"]);
      const made = readdirSync(chartDir).filter((f) => f.endsWith(".html") && !before.has(f));
      const file = made[0] ?? readdirSync(chartDir).find((f) => f.startsWith(String(p.fullName)) && f.endsWith(".html"));
      (p as { chartFile?: string }).chartFile = file ? `charts/${file}` : "";
    } catch (e) {
      console.warn(`  chart for ${p.name} could not be built: ${e instanceof Error ? e.message : e}`);
    }
  }

  // The teaching bodygraph's still, circuit coloured, for the center slides.
  const teachSvgPath = join(process.env.HOME ?? "", "Desktop", "Mandala Renderer Output", "Educational", "Bodygraph - Energy Flow.svg");
  const teachSvg = existsSync(teachSvgPath) ? readFileSync(teachSvgPath, "utf8").replace(/^[\s\S]*?(<svg\b)/, "$1") : "";

  // The room's birth Suns on the wheel: the rings of the real mandala, with a
  // mark and a first name where each person's Personality Sun sits.
  const rings = `<svg viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg" font-family="Montserrat, sans-serif">${renderMandalaRings(1000)}</svg>`;
  // Her real bodygraph, blank, for the center slides: the same drawing the charts use.
  // The cached drawing carries one chart's activations, so they are emptied the
  // same way the teaching bodygraph empties them.
  let blank = existsSync(".cache/blank-bodygraph.svg") ? readFileSync(".cache/blank-bodygraph.svg", "utf8") : "";
  blank = blank
    .replace(/(id="(?:personality|design)-[\d-]+"[^>]*?)fill="[^"]*"/g, '$1fill="none"')
    .replace(/(<path id="_\d+"[^>]*?)fill="[^"]*"/g, '$1fill="none"')
    .replace(/(<path id="channel-back"[^>]*?)fill="[^"]*"/, '$1fill="#f1ecf4"')
    .replace(/<text\b([^>]*)>/g, (_m, attrs: string) => `<text${attrs.replace(/\sfill="[^"]*"/g, "")} fill="#6b6478">`)
    .replace(/font-family:\s*[^;"]+/g, "font-family: Montserrat, system-ui, sans-serif");
  const marks = room.map((p, i) => {
    const r = wheel.r.gateInner - 26 - (i % 4) * 30;
    const pt = wheel.pointAt(r, p.sunLon);
    const lab = wheel.pointAt(r - 24, p.sunLon);
    return { x: pt.x, y: pt.y, lx: lab.x, ly: lab.y, name: p.name };
  });

  // The living mandala, today's sky, into the deck folder so it opens offline.
  const motionPath = join(OUT_DIR, "Living Mandala.html");
  // --no-motion keeps the living mandala already in the folder (it takes a few minutes)
  if (args.includes("--no-motion") && existsSync(motionPath)) console.log("  keeping the living mandala already built");
  else try {
    execFileSync("./node_modules/.bin/tsx", ["scripts/mandala-motion.ts"], {
      cwd: process.cwd(), stdio: "inherit",
      env: { ...process.env, MOTION_OUT: motionPath, MOTION_AUTOPLAY: "1" },
    });
  } catch {
    console.warn("  living mandala could not be built; that view will be empty");
  }
  // The teaching bodygraph, as it was last built.
  const teach = join(process.env.HOME ?? "", "Desktop", "Mandala Renderer Output", "Educational", "Bodygraph - Energy Flow.html");
  if (existsSync(teach)) copyFileSync(teach, join(OUT_DIR, "Bodygraph.html"));

  const fontFace = [400, 600].map((w) => {
    const p = join("assets/fonts", `Montserrat-${w}.ttf`);
    return existsSync(p)
      ? `@font-face{font-family:Montserrat;font-weight:${w};src:url(data:font/ttf;base64,${readFileSync(p).toString("base64")}) format("truetype")}`
      : "";
  }).join("");
  const logo = existsSync(join(BRAND_DIR, "Delphi Logo.svg"))
    ? `data:image/svg+xml;base64,${readFileSync(join(BRAND_DIR, "Delphi Logo.svg")).toString("base64")}` : "";
  const know = existsSync(join(BRAND_DIR, "Know Thyself.svg"))
    ? `data:image/svg+xml;base64,${readFileSync(join(BRAND_DIR, "Know Thyself.svg")).toString("base64")}` : "";

  const data = {
    event: DEMO ? "Workshop" : EVENT.toUpperCase(),
    builtAt: new Date().toISOString(),
    centerOrder: CENTER_ORDER, centerName: CENTER_NAME, centerLib: CENTER_LIB,
    room, lib, rings, marks, logo, know, blank, teachSvg,
    centerSvgId: { head: "head-center", ajna: "ajna-center", throat: "throat-center", g: "g-center",
      heart: "heart-center", spleen: "splenic-center", sacral: "sacral-center",
      "solar-plexus": "solar-plexus-center", root: "root-center" },
  };
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const css = readFileSync("scripts/workshop-deck.css", "utf8");
  const js = readFileSync("scripts/workshop-deck.client.js", "utf8");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Delphi Human Design · ${data.event}</title>
<style>${fontFace}${css}</style></head><body>
<div id="app"></div>
<script id="deck-data" type="application/json">${json}</script>
<script>${js}</script>
</body></html>`;
  const out = join(OUT_DIR, "Workshop.html");
  writeFileSync(out, html);
  console.log(`\n✓ ${out}`);

  // The stage: one screen, no slides, everything happening on the bodygraph and
  // the wheel. Kaycee, 2026-09-13: "It still looks like a powerpoint slideshow...
  // I was hoping to see some creative ideas about how to illustrate the concepts
  // graphically using the pretty tools we created."
  const wheelGeo = { cx: wheel.cx, cy: wheel.cy, rIn: wheel.r.gateInner, rOut: wheel.r.gateOuter };
  const stageJson = JSON.stringify({ ...data, wheelGeo, top: 268.25 }).replace(/</g, "\\u003c");
  const stage = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Delphi Human Design · ${data.event}</title>
<style>${fontFace}${readFileSync("scripts/workshop-stage.css", "utf8")}</style></head><body>
<div id="app"></div>
<script id="deck-data" type="application/json">${stageJson}</script>
<script>${readFileSync("scripts/workshop-stage.client.js", "utf8")}</script>
</body></html>`;
  const stageOut = join(OUT_DIR, "Stage.html");
  writeFileSync(stageOut, stage);
  console.log(`✓ ${stageOut}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
