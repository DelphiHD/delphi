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
import { castSkyAt } from "@/lib/transit/sky";
import { scanWindow } from "@/lib/hd/time-window";

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
  // Kaycee, 2026-09-15: "only people marked bfki should count", so nobody is added by default
  return i > -1 ? args[i + 1].split(",").map((s) => s.trim()).filter(Boolean) : [];
})();

async function people() {
  const d = db();
  const cols = "person_name, birth_date, birth_time, birth_timezone, birth_place, token, time_accuracy, created_at";
  const { data, error } = DEMO
    ? await d.from("charts").select(cols).eq("source", "sandbox").order("person_name")
    : await d.from("charts").select(cols).eq("source", EVENT).order("created_at");
  if (error) throw new Error(`could not read the roster: ${error.message}`);
  // someone who signs up twice is one person: same first name and birth date keeps the
  // newest sign-up, which carries his corrections (Patrick, 2026-09-15, added a birth time)
  const firstOf = (n: unknown) => String(n ?? "").trim().split(/\s+/)[0].toLowerCase();
  const all = data ?? [];
  const rows = DEMO ? all : all.filter((r, i) => !all.slice(i + 1).some((l) =>
    String(l.birth_date) === String(r.birth_date) && firstOf(l.person_name) === firstOf(r.person_name)));
  if (!DEMO && WITH.length) {
    const { data: extra } = await d.from("charts").select(cols).eq("tier", "seed").in("person_name", WITH);
    // someone on the roster who also signed up through the event link is one person,
    // not two: same birth date and time (Max Jones and "Max Zen Jones", 2026-09-15)
    for (const e of extra ?? []) {
      // same birth date and first name: his sign-up says 20:31, the roster 20:30
      const first = (n: unknown) => String(n ?? "").trim().split(/\s+/)[0].toLowerCase();
      const same = rows.some((r) => r.person_name === e.person_name ||
        (String(r.birth_date) === String(e.birth_date) && first(r.person_name) === first(e.person_name)));
      if (!same) rows.unshift(e);
    }
  }
  return rows;
}

/** Her words, keyed the way the deck asks for them. */
async function library() {
  const chunks = await loadLibraryChunks();
  const lib = {
    centers: {} as Record<string, { themes: string; type: string; defined: string; undefined: string; open: string }>,
    types: {} as Record<string, { basic: string; strategy: string; frequencies: string; notSelf: string; signature: string; strategyName?: string }>,
    authority: {} as Record<string, string>,
    definition: {} as Record<string, string>,
    profile: {} as Record<string, string>,
    line: {} as Record<string, string>,
    planet: {} as Record<string, string>,
    quarter: {} as Record<string, string>,
    // her Workshop Slides database, by slide name
    slides: {} as Record<string, string>,
    notSelf: {} as Record<string, string>,
    // each gate's name, by gate number
    gateName: {} as Record<string, string>,
    // Head and Root pressures, in Kaycee's words (2026-09-13)
    pressure: {
      "64": "Pressure to Make Sense of the Past", "61": "Pressure to Discover Something New", "63": "Pressure that Doubts the Pattern",
      "53": "Pressure to Begin", "60": "Pressure to Mutate/Transcend Limitation", "52": "Pressure to Focus",
      "19": "Pressure to Need", "39": "Pressure to Find Spirit/Passion", "41": "Pressure to Have New Experiences",
      "58": "Pressure to Correct", "38": "Pressure to Find Purpose", "54": "Pressure to Achieve",
    } as Record<string, string>,
    // Presentation bullets per center and state, distilled from her Delphi
    // Defined/Undefined/Open Basic text; the full text stays as presenter notes.
    centerBullets: {
      "Head": {
        defined: ["Steady source of inspiration", "Trust the questions that arise", "Turn mental pressure into action"],
        undefined: ["Pulled into questions that aren't yours", "Explore ideas without pressure", "Let your Authority guide"],
        open: ["Free to wonder about anything", "Let mental pressure pass through", "Not-Self: questions that don't matter"],
      },
      "Ajna": {
        defined: ["Consistent way of thinking", "Clear, confident focus", "Turns insights into plans"],
        undefined: ["Open, flexible mind", "Recognizes who has good answers", "Not-Self: pretending to be certain"],
        open: ["Explores ideas without clinging", "Curious, playful learning", "Uncertainty is a strength"],
      },
      "Throat": {
        defined: ["Reliable voice and expression", "Speaks the same way each time", "Shares what matters with clarity"],
        undefined: ["Urge to attract attention", "Wait for the invitation to speak", "Share when it's meaningful"],
        open: ["Silence and timing are power", "The right attention comes easily", "Not-Self: trying to attract attention"],
      },
      "G (Identity)": {
        defined: ["Stable sense of identity", "Inner GPS toward love and purpose", "Honor others' paths"],
        undefined: ["Adapts to people and places", "A wrong place signals a mismatch", "Choose supportive surroundings"],
        open: ["Senses the right environments", "Belonging comes through place", "Not-Self: searching for direction and love"],
      },
      "Ego (Heart, Will)": {
        defined: ["Consistent willpower", "Keeps promises", "Commit only to what resonates"],
        undefined: ["Nothing to prove", "Don't over-promise", "Not-Self: trying to prove yourself"],
        open: ["Free of pressure to prove worth", "Commitments that feel authentic", "Worth is not earned"],
      },
      "Sacral": {
        defined: ["Steady life force energy", "Check in with your body", "Rest when you're truly done"],
        undefined: ["Takes on others' energy", "Hard to know your limits", "Not-Self: not knowing when enough is enough"],
        open: ["Absorbs the energy around you", "Ask: am I truly rested?", "Set clear boundaries"],
      },
      "Solar Plexus (Emotional)": {
        defined: ["Your own emotional wave", "Clarity comes over time", "Ride the wave before deciding"],
        undefined: ["Amplifies others' emotions", "Ask: is this feeling mine?", "Not-Self: avoiding confrontation and truth"],
        open: ["Sensitive emotional antenna", "Release what isn't yours", "Speak your truth calmly"],
      },
      "Spleen": {
        defined: ["Clear, in-the-moment instincts", "Trust your gut instantly", "Supports health and well-being"],
        undefined: ["Amplifies fear", "Holds on to what isn't healthy", "Face fears one at a time"],
        open: ["Sensitive to survival alerts", "Stay present with instinct", "Not-Self: holding on to what isn't good for you"],
      },
      "Root": {
        defined: ["Pressure becomes fuel", "Steady drive to start", "Productive without rushing"],
        undefined: ["Absorbs others' stress", "The pressure isn't yours", "Not-Self: always in a hurry to be free"],
        open: ["Feels constantly rushed", "Pause, breathe, wait for Authority", "Turn overwhelm into momentum"],
      },
    } as Record<string, Record<string, string[]>>,
    channels: {} as Record<string, { name: string; basic: string }>,
    // Gate keynotes for the stage hovers, in Kaycee's words (2026-09-13)
    gateNote: {
      "64": { k: "Confusion", t: "" }, "61": { k: "Mystery", t: "" }, "63": { k: "Doubt", t: "" },
      "47": { k: "Realization", t: "Confusion that resolves into insight, given time." },
      "24": { k: "Rationalization", t: "The mind returning to a question until understanding lands." },
      "4": { k: "Formulization", t: "Holding a possible answer until life confirms it." },
      "11": { k: "Ideas", t: "A gallery of ideas passing through, meant to be shared.", g: "Gate of Left Eye" },
      "43": { k: "Insight", t: "Knowing something in a new way before anyone else does." },
      "17": { k: "Opinions", t: "Offering a considered view that is worth testing.", g: "Gate of Right Eye" },
      "62": { k: "I Think", t: "The precision of naming things accurately." },
      "23": { k: "I Know", t: "Turning individual insight into language others can receive." },
      "56": { k: "I Believe", t: "The storyteller who moves people through what they have seen." },
      "16": { k: "I Experiment", t: "Enthusiasm that repeats itself into real skill." },
      "20": { k: "I Am Now", t: "Clarity that arrives fully in the present." },
      "31": { k: "I Lead", t: "Leadership handed over by the people who choose to follow." },
      "8": { k: "I Contribute", t: "Giving voice to what deserves attention." },
      "33": { k: "I Remember", t: "Carrying experience forward as something worth telling." },
      "35": { k: "I Experience", t: "Appetite for what has not been tried yet." },
      "12": { k: "I Know I Can Try", t: "Expression that waits for its moment and then lands." },
      "45": { k: "I Have", t: "Stewardship of resources, and teaching what you hold." },
      "1": { k: "The Present", t: "Creative expression available right now." },
      "13": { k: "The Past", t: "The listener who keeps the story." },
      "7": { k: "The Future", t: "Guidance toward where things are going." },
      "2": { k: "The Driver", t: "Knowing which way to point." },
      "15": { k: "Love of Humanity", t: "Room in the pattern for everyone." },
      "10": { k: "Love of Self", t: "Being at home in your own behavior." },
      "25": { k: "Universal Love", t: "Innocence that loves without condition." },
      "46": { k: "Love of the Body", t: "Delight in being here in form, and the luck of good timing." },
      "21": { k: "Control of Circumstances", t: "The gift of running your own territory." },
      "40": { k: "Will to Provide", t: "Strength to deliver, and the right to rest after." },
      "26": { k: "The Marketer", t: "Making value visible." },
      "51": { k: "To Be First", t: "Courage that comes alive when it gets shaken." },
      "34": { k: "Power to Empower", t: "Pure available power, busy in its own right." },
      "5": { k: "Rhythm", t: "Energy that keeps a pattern alive." },
      "14": { k: "Fuel for Direction", t: "Resources that back where you are headed." },
      "29": { k: "The Yes", t: "Energy to commit and see it all the way through." },
      "59": { k: "Bonding", t: "Energy that gets through barriers and makes intimacy possible." },
      "9": { k: "Focus", t: "Energy for the detail that holds a pattern together." },
      "3": { k: "Beginnings", t: "Bringing order to new life in its own time." },
      "42": { k: "Completion", t: "Seeing cycles through to the end." },
      "27": { k: "Nourishment", t: "Caring for what has been created." },
      "48": { k: "Depth", t: "The well of solutions, deepening with time." },
      "57": { k: "Intuitive Clarity", t: "Truth heard in the present moment.", g: "Sense of Hearing" },
      "44": { k: "Alertness", t: "Recognizing talent and potential in others.", g: "Sense of Smell" },
      "50": { k: "Values", t: "The instinct for what keeps a group safe." },
      "32": { k: "Continuity", t: "Knowing what has the potential to last." },
      "28": { k: "Purpose", t: "Finding something worth the struggle." },
      "18": { k: "Correction", t: "Seeing what could be better and raising the standard." },
      "37": { k: "Loyalty", t: "The handshake that makes a bargain hold.", g: "Tribal Wave" },
      "6": { k: "Intimacy", t: "The diaphragm that opens when the timing is right.", g: "Tribal Wave" },
      "49": { k: "Principles", t: "Sensing when the terms need to change.", g: "Tribal Wave" },
      "22": { k: "Grace", t: "Openness that listens when the mood arrives.", g: "Individual Wave" },
      "55": { k: "Spirit", t: "Abundance found on the other side of melancholy.", g: "Individual Wave" },
      "36": { k: "New Experience", t: "Hunger for what has not been lived yet.", g: "Collective Wave" },
      "30": { k: "Desire", t: "The fire that wants to feel everything.", g: "Collective Wave" },
    } as Record<string, { k: string; t: string; g?: string }>,
    // circuit families and circuits, Delphi Basic, by title
    circuit: {} as Record<string, string>,
  };
  for (const c of chunks) {
    const m = (c.metadata ?? {}) as Record<string, string>;
    const title = (c.title ?? "").trim();
    switch (c.source_kind) {
      case "workshop_slide": if (delphi(m)) lib.slides[title] = delphi(m); break;
      case "circuit": if (delphi(m)) lib.circuit[title] = delphi(m); break;
      case "gate": {
        const n = Number(m["Gate #"]);
        const name = (String(m["Gate Name"] ?? "").trim() || title).replace(/^\d+\s*:\s*/, "");
        if (n && name) lib.gateName[String(n)] = name;
        break;
      }
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
          notSelf: (m["Not-Self Theme"] ?? "").trim(), signature: (m.Signature ?? "").trim(), strategyName: (m.Strategy ?? "").trim(),
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

  // Ra Uru Hu's own Delphi chart for the Origins page: the public figure in the
  // funnel, built beside the deck like everyone else's (not published from here).
  let raChart = "";
  try {
    const { data: raRow } = await db().from("charts").select("token").eq("source", "public-figure").eq("person_name", "Ra Uru Hu").maybeSingle();
    if (raRow?.token) {
      const kept = readdirSync(chartDir).find((f) => f.startsWith("Ra Uru Hu - ") && f.endsWith(".html"));
      if (!(args.includes("--no-charts") && kept)) await runBuilder(["--token", String(raRow.token), "--no-png"]);
      const file = readdirSync(chartDir).find((f) => f.startsWith("Ra Uru Hu - ") && f.endsWith(".html"));
      raChart = file ? `charts/${file}` : "";
    }
  } catch (e) {
    console.warn(`  Ra Uru Hu's chart could not be built: ${e instanceof Error ? e.message : e}`);
  }

  // The teaching bodygraph's still, circuit coloured, for the center slides.
  // The teaching bodygraph with its flowing beams, taken from the interactive
  // Energy Flow page (the still .svg has no motion).
  const eduDir = join(process.env.HOME ?? "", "Desktop", "Mandala Renderer Output", "Educational");
  const teachHtml = join(eduDir, "Bodygraph - Energy Flow.html");
  const teachSvgPath = join(eduDir, "Bodygraph - Energy Flow.svg");
  let teachSvg = "";
  if (existsSync(teachHtml)) {
    const h = readFileSync(teachHtml, "utf8");
    const a = h.indexOf("<svg class=\"canvas\"");
    const b = a < 0 ? -1 : h.indexOf("</svg>", a);
    if (b > 0) teachSvg = h.slice(a, b + 6);
  }
  if (!teachSvg && existsSync(teachSvgPath)) teachSvg = readFileSync(teachSvgPath, "utf8").replace(/^[\s\S]*?(<svg\b)/, "$1");

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

  // The sky on the day of the workshop, cast when the folder is built so the Stage
  // needs no signal. --sky-date, --sky-time and --sky-tz set the moment.
  const argOf = (k: string, d: string) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : d; };
  let sky: { date: string; time: string; timezone: string; positions: { planet: string; gate: number; line: number }[] } | null = null;
  try {
    // a dropped connection should not cost the Sky: try three times
    let m: Awaited<ReturnType<typeof castSkyAt>> | null = null;
    for (let tries = 0; tries < 3 && !m; tries++) {
      try { m = await castSkyAt(argOf("--sky-date", "2026-09-15"), argOf("--sky-time", "12:00"), argOf("--sky-tz", "America/Denver")); }
      catch (e) { if (tries === 2) throw e; await new Promise((r) => setTimeout(r, 2000 * (tries + 1))); }
    }
    if (!m) throw new Error("no sky");
    sky = { date: m.date, time: m.time, timezone: m.timezone,
      positions: m.positions.filter((x) => CORE.has(x.planet)).map((x) => ({ planet: x.planet, gate: x.gate, line: x.line })) };
    console.log(`  sky for ${sky.date} ${sky.time}: ${sky.positions.length} placements`);
  } catch (e) {
    console.log(`  sky not cast: ${(e as Error).message}`);
  }
  // Ra Uru Hu's chart for the Origins page: April 9, 1948, 00:05, Montreal.
  let ra: Record<string, unknown> | null = null;
  try {
    const c = await getChart({ birthDate: "1948-04-09", birthTime: "00:05", timezone: "America/Toronto" });
    const raActs = (["personality", "design"] as const).flatMap((side) => c.activations[side]
      .filter((a) => CORE.has(a.planet)).map((a) => ({ side, planet: a.planet, gate: a.gate, line: a.line })));
    const raDefined = new Set((c.centers ?? []).filter((x) => x.defined).map((x) => FROM_API[x.name.toLowerCase()]).filter(Boolean));
    ra = {
      type: c.type.value, profile: (c.profile.value.match(/\d\s*\/\s*\d/) ?? [""])[0].replace(/\s/g, ""),
      authority: c.authority.value, definition: c.definition.value, cross: c.incarnationCross.value,
      acts: raActs, defined: [...raDefined],
      channels: (c.channels ?? []).map((x) => String(x.id).split("-").map(Number).sort((a, b) => a - b).join("-")),
    };
    console.log(`  Ra Uru Hu: ${c.type.value} ${c.profile.value}`);
  } catch (e) {
    console.log(`  Ra Uru Hu's chart not cast: ${(e as Error).message}`);
  }
  // Figures in the Origins story whose birth time is unknown: their chart for each
  // stretch of the day where the reading changes, side by side (Kaycee, 2026-09-14).
  async function variationsOf(name: string, born: string, birth: { birthDate: string; timezone: string }) {
    try {
      const scan = await scanWindow(birth, "00:00", "23:59", { maxCasts: 80 });
      const cuts = new Set<string>(["00:00"]);
      for (const c of scan.changes) {
        if (c.kind === "property" || c.kind === "channel" || c.kind === "center") for (const sp of c.spans) cuts.add(sp.from);
      }
      const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
      // a stretch under ten minutes (one right at midnight, say) folds into its neighbour
      const starts = [...cuts].sort().filter((t, i, all) => i === 0 || (mins(all[i + 1] ?? "23:59") - mins(t)) >= 10);
      const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const key = name.split(" ").pop()!.toLowerCase();
      const variations = [];
      for (let i = 0; i < starts.length; i++) {
        const from = starts[i], to = starts[i + 1] ?? "23:59";
        const c = await getChart({ ...birth, birthTime: hhmm(Math.floor((mins(from) + mins(to)) / 2)), brandedSvg: true });
        const ns = `${key}${i}`;
        const svg = String(c.bodygraphSvg ?? "")
          .replace(/\bid="([^"]+)"/g, `id="${ns}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${ns}-$1)`).replace(/href="#([^"]+)"/g, `href="#${ns}-$1"`);
        const side = (k: "personality" | "design") => c.activations[k].filter((a) => CORE.has(a.planet)).map((a) => ({ planet: a.planet, gate: a.gate, line: a.line }));
        variations.push({
          from, to, svg,
          type: c.type.value, profile: c.profile.value, authority: c.authority.value, definition: c.definition.value, cross: c.incarnationCross.value,
          channels: (c.channels ?? []).map((x) => String(x.id)),
          personality: side("personality"), design: side("design"),
        });
      }
      console.log(`  ${name}: ${variations.length} chart variation(s) across the day`);
      return { key, name, born, variations };
    } catch (e) {
      console.log(`  ${name}'s chart variations not cast: ${(e as Error).message}`);
      return null;
    }
  }
  const figures = [
    await variationsOf("Nicholas Sanduleak", "June 22, 1933 · Lackawanna, New York · time unknown", { birthDate: "1933-06-22", timezone: "America/New_York" }),
    // born 31 July 1831 in the old calendar, 12 August in ours, in Yekaterinoslav (now Dnipro)
    await variationsOf("Helena Blavatsky", "August 12, 1831 · Yekaterinoslav, now Dnipro, Ukraine · time unknown", { birthDate: "1831-08-12", timezone: "Europe/Kiev" }),
  ].filter(Boolean);
  const data = {
    sky, ra, raChart, figures,
    // Ra Uru Hu's photo, at the top of the Origins timeline (Kaycee, 2026-09-14)
    raPhoto: existsSync(join(process.cwd(), "assets", "workshop", "ra-uru-hu.png"))
      ? `data:image/png;base64,${readFileSync(join(process.cwd(), "assets", "workshop", "ra-uru-hu.png")).toString("base64")}` : "",
    // the eight trigrams, shown from the 64 Gates card on the Origins page
    trigrams: existsSync(join(BRAND_DIR, "Eight Trigrams - Grid.svg"))
      ? `data:image/svg+xml;base64,${readFileSync(join(BRAND_DIR, "Eight Trigrams - Grid.svg")).toString("base64")}` : "",
    event: DEMO ? "Workshop" : EVENT.toUpperCase(),
    builtAt: new Date().toISOString(),
    centerOrder: CENTER_ORDER, centerName: CENTER_NAME, centerLib: CENTER_LIB,
    room, lib, rings, marks, logo, know, blank, teachSvg,
    circuits: [
      { id: "ind-knowing", name: "Individual: Knowing", group: "Individual", color: "#3d7fe0" },
      { id: "ind-centering", name: "Individual: Centering", group: "Individual", color: "#8ec0ff" },
      { id: "col-logic", name: "Collective: Understanding (Logic)", group: "Collective", color: "#2fa35f" },
      { id: "col-abstract", name: "Collective: Sensing (Abstract)", group: "Collective", color: "#9ad88a" },
      { id: "tri-ego", name: "Tribal: Ego", group: "Tribal", color: "#ff9f1c" },
      { id: "tri-defense", name: "Tribal: Defense", group: "Tribal", color: "#ef4b4b" },
      { id: "integration", name: "Integration", group: "Integration", color: "#a77ee0" },
    ],
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
