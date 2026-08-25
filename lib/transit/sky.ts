// Transit sky: the live planetary weather, cast for a moment or scanned across
// a day. Reuses the mybodygraph wrapper — a chart cast for "now" returns its
// Personality activations at the exact cast instant, which ARE the current
// transit positions (Personality is computed at the cast time; Design is the
// ~88-day-prior side and is irrelevant to transits, so we drop it).
//
// Planetary gate.line is geocentric ecliptic longitude, which does not depend
// on the observer's location on Earth. We still must pass mybodygraph a
// timezone so it interprets our clock time correctly; location coordinates are
// fixed to Greenwich and have no effect on the gates returned.

import { getChart } from "@/lib/mybodygraph";
import { PLANET_ORDER, type PlanetName, type FixingState, type Chart } from "@/lib/chart/types";
import { CHANNELS } from "@/lib/hd/channels";
import { centerOf, type Center as WheelCenter } from "@/lib/hd/gate-center";
import { longitudeOf } from "@/lib/hd/gate-longitude";

// Fixed observer point. Only the instant matters for planetary gates; the
// coordinates are inert. Greenwich keeps it unambiguous.
const REF_LAT = 51.4779;
const REF_LONG = 0;

export interface TransitPosition {
  planet: PlanetName;
  gate: number;
  line: number;
  fixingState: FixingState;
  /** Exact ecliptic longitude (0-360), reconstructed from the full fixing.
   *  Drives smooth angular placement in the mandala-motion animation. */
  longitude?: number;
}

/** The transit sky at one instant, expressed in a display timezone. */
export interface SkyMoment {
  /** Local clock date, YYYY-MM-DD in the display tz. */
  date: string;
  /** Local clock time, HH:MM in the display tz. */
  time: string;
  timezone: string;
  positions: TransitPosition[];
}

// Planets whose motion is fast enough that an intra-day LINE change is
// meaningful to report. Slow outer planets effectively never change line
// within a day, so we track only their (even rarer) gate changes.
const FAST_MOVERS: ReadonlySet<PlanetName> = new Set<PlanetName>([
  "Sun", "Earth", "Moon", "Mercury", "Venus", "Mars", "North Node", "South Node",
]);

// The 13 traditional bodies Kaycee reads from. mybodygraph also returns Chiron
// and Lilith; those are intentionally EXCLUDED everywhere (collective channels,
// roster impacts, and the bodygraph) so a gate occupied only by Chiron/Lilith is
// never treated as active. Without this, e.g. Lilith alone in 11 would falsely
// complete 11-56 and Chiron alone in 3 would falsely complete 3-60.
const TRADITIONAL_BODIES: ReadonlySet<PlanetName> = new Set<PlanetName>([
  "Sun", "Earth", "Moon", "North Node", "South Node", "Mercury", "Venus",
  "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
]);

/**
 * Fail-loud guard for the 13-body rule. The daily report must NEVER read Chiron
 * or Lilith as active transiting bodies (a gate occupied only by them would
 * invent phantom channels + light phantom centers, contradicting the bodygraph).
 * Call this on every cast the report consumes: if a future change re-leaks them,
 * the run aborts with a clear error instead of silently shipping a wrong report.
 */
export function assertTraditionalBodies(positions: TransitPosition[], where: string): void {
  const intruders = [...new Set(positions.filter((p) => !TRADITIONAL_BODIES.has(p.planet)).map((p) => p.planet))];
  if (intruders.length) {
    throw new Error(`[13-body rule] ${where}: non-traditional body in the transit field (${intruders.join(", ")}). A gate held only by these would fabricate channels/centers. Filter through personalityPositions.`);
  }
  if (positions.length !== TRADITIONAL_BODIES.size) {
    throw new Error(`[13-body rule] ${where}: expected ${TRADITIONAL_BODIES.size} bodies, got ${positions.length} (${positions.map((p) => p.planet).join(", ")}).`);
  }
}

function personalityPositions(
  activations: { planet: PlanetName; gate: number; line: number; fixingState: FixingState; color?: number; tone?: number; base?: number }[],
): TransitPosition[] {
  return activations
    .filter((a) => TRADITIONAL_BODIES.has(a.planet))
    .map((a) => ({
      planet: a.planet,
      gate: a.gate,
      line: a.line,
      fixingState: a.fixingState,
      longitude: longitudeOf(a.gate, a.line, a.color ?? 1, a.tone ?? 1, a.base ?? 1),
    }));
}

/** Cast the transit sky for a single local clock time in the display tz. */
export async function castSkyAt(date: string, time: string, timezone: string): Promise<SkyMoment> {
  const chart = await getChart({
    birthDate: date,
    birthTime: time,
    timezone,
    latitude: REF_LAT,
    longitude: REF_LONG,
  });
  return {
    date,
    time,
    timezone,
    positions: personalityPositions(chart.activations.personality),
  };
}

/**
 * The design=delphi bodygraph ships with an INVALID lowercase `viewbox` attr and
 * no width/height. Browsers (and the interactive chart's HTML) tolerate this, but
 * a standalone rasterizer ignores the malformed viewBox and renders a clipped
 * square, cutting off the lower centers. Normalize to a valid, explicitly-sized
 * portrait SVG so the whole bodygraph rasterizes.
 */
function normalizeBodygraphSvg(svg: string): string {
  const m = svg.match(/viewbox="\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*"/i);
  let s = svg.replace(/\bviewbox=/i, "viewBox=");
  if (m && !/<svg[^>]*\bwidth=/i.test(s)) {
    const w = m[3], h = m[4];
    s = s.replace(/<svg\b/i, `<svg width="${w}" height="${h}"`);
  }
  return s;
}

// Bodygraph SVG element id per center. The delphi SVG colors a `*-center` shape
// when the center is defined; #ffffff is the open (undefined) fill.
const CENTER_SVG_ID: Record<WheelCenter, string> = {
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

// Which centers a set of activated gates defines: a center is defined only when
// a channel it touches is fully activated (both gates present).
function definedCenterIds(gates: Set<number>): Set<string> {
  const ids = new Set<string>();
  for (const ch of CHANNELS) {
    const [a, b] = ch.gates;
    if (gates.has(a) && gates.has(b)) {
      ids.add(CENTER_SVG_ID[centerOf(a)]);
      ids.add(CENTER_SVG_ID[centerOf(b)]);
    }
  }
  return ids;
}

/**
 * Rewrite the dual-side delphi bodygraph so only the PERSONALITY activations
 * remain. The delphi SVG draws Personality in black and Design (red, #e06666)
 * for BOTH halves of every activated gate leg. For a transit chart the Design
 * side is the meaningless ~88-day-prior sky, so we strip it: every activation
 * element (gate leg, channel connector, gate-number circle) survives only if all
 * of its gates are personality-activated, recolored to personality black; every
 * other activation is hidden; and centers that personality alone does not define
 * are re-opened to white.
 */
function personalityOnly(svg: string, positions: TransitPosition[]): string {
  const pGates = new Set(positions.map((p) => p.gate));
  const keepCenters = definedCenterIds(pGates);
  let s = svg;

  // Gate legs and channel connectors: id like "personality-39", "design-34-10".
  s = s.replace(
    /<(polygon|rect|path) id="(personality|design)-([\d-]+?)"([^>]*?)fill="(?:#000000|#e06666)"/g,
    (_m, tag: string, side: string, suffix: string, mid: string) => {
      const gates = suffix.split("-").map(Number).filter((n) => Number.isFinite(n));
      const keep = gates.length > 0 && gates.every((g) => pGates.has(g));
      return `<${tag} id="${side}-${suffix}"${mid}fill="${keep ? "#000000" : "none"}"`;
    },
  );

  // Gate-number circles + their white numeral: "_39". Keep only personality
  // gates; otherwise make the circle transparent and the numeral dark.
  s = s.replace(
    /<path id="_(\d+)"([^>]*?)fill="(?:#000000|#e06666)"><\/path>(\s*<text[^>]*?)fill="#ffffff"/g,
    (m, g: string, mid: string, textPre: string) =>
      pGates.has(Number(g))
        ? m
        : `<path id="_${g}"${mid}fill="rgba(0, 0, 0, 0)"></path>${textPre}fill="#000000"`,
  );

  // Re-open any center personality does not define.
  for (const id of Object.values(CENTER_SVG_ID)) {
    if (keepCenters.has(id)) continue;
    s = s.replace(new RegExp(`(<path id="${id}"[^>]*?fill=")#[0-9a-fA-F]{6}(")`), `$1#ffffff$2`);
  }

  return s;
}

/**
 * Fetch the transit sky at one local clock time as a PERSONALITY-ONLY bodygraph
 * (branded design=delphi SVG with the design side stripped) plus its personality
 * placements. The bodygraph is the one the interactive charts use, cast for a
 * moment rather than a birth.
 */
export async function castTransitBodygraph(
  date: string,
  time: string,
  timezone: string,
): Promise<{ svg: string; positions: TransitPosition[] }> {
  const chart = await getChart({
    birthDate: date,
    birthTime: time,
    timezone,
    latitude: REF_LAT,
    longitude: REF_LONG,
    brandedSvg: true,
  });
  if (!chart.bodygraphSvg || !chart.bodygraphSvg.trimStart().startsWith("<svg")) {
    throw new Error("mybodygraph returned no branded bodygraph SVG (design=delphi)");
  }
  const positions = personalityPositions(chart.activations.personality);
  const svg = personalityOnly(normalizeBodygraphSvg(chart.bodygraphSvg), positions);
  return { svg, positions };
}

/**
 * Cast a full NATAL chart (both Personality and Design sides) for a moment,
 * returning the branded bodygraph SVG and the complete Chart. Used for the
 * "babies born on this day" chart, which is a real birth chart and therefore
 * keeps its design side (unlike the personality-only transit weather).
 */
export async function castNatalChart(
  date: string,
  time: string,
  timezone: string,
): Promise<{ svg: string; chart: Chart }> {
  const chart = await getChart({
    birthDate: date,
    birthTime: time,
    timezone,
    latitude: REF_LAT,
    longitude: REF_LONG,
    brandedSvg: true,
  });
  if (!chart.bodygraphSvg || !chart.bodygraphSvg.trimStart().startsWith("<svg")) {
    throw new Error("mybodygraph returned no branded bodygraph SVG (design=delphi)");
  }
  return { svg: normalizeBodygraphSvg(chart.bodygraphSvg), chart };
}

export interface TransitShift {
  planet: PlanetName;
  /** Local clock time (HH:MM) of the sample where the new gate/line first appears. */
  time: string;
  from: { gate: number; line: number };
  to: { gate: number; line: number };
  /** "gate" when the gate itself changed, "line" when only the line advanced. */
  kind: "gate" | "line";
}

export interface DayScan {
  date: string;
  timezone: string;
  intervalMinutes: number;
  /** Sky at local midnight (day-start baseline). */
  start: SkyMoment;
  shifts: TransitShift[];
}

// ── Moon phases of the day ───────────────────────────────────────────────────
// The Moon is the fastest mover and the strongest narrator of the day's felt
// shifts. Segment the day by the Moon's gate so the report can show one
// bodygraph per phase (morning / midday / evening chambers).

export interface MoonPhase {
  /** Local clock time the phase begins (HH:MM). "00:00" for the first. */
  startTime: string;
  endTime: string;
  gate: number;
  /** A time safely inside the phase, good for casting a representative sky. */
  representativeTime: string;
}

// Format a UTC clock time as "HH:MM UTC (HH:MM MT)", Mountain in parentheses.
// (The report is anchored to UTC; Kaycee wants Mountain shown alongside.)
export function formatUtcTime(date: string, hhmm: string): string {
  const [h, m] = hhmm.split(":");
  const d = new Date(`${date}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:00Z`);
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Denver", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${hhmm} UTC (${get("hour")}:${get("minute")} MT)`;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(min: number): string {
  const c = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}

export function moonPhases(scan: DayScan): MoonPhase[] {
  const startGate = scan.start.positions.find((p) => p.planet === "Moon")?.gate;
  if (startGate == null) return [];
  const boundaries: { time: number; gate: number }[] = [{ time: 0, gate: startGate }];
  for (const s of scan.shifts) {
    if (s.planet === "Moon" && s.kind === "gate") {
      boundaries.push({ time: toMin(s.time), gate: s.to.gate });
    }
  }
  const out: MoonPhase[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].time;
    const end = i + 1 < boundaries.length ? boundaries[i + 1].time : 24 * 60;
    out.push({
      startTime: toHHMM(start),
      endTime: end >= 24 * 60 ? "24:00" : toHHMM(end),
      gate: boundaries[i].gate,
      representativeTime: toHHMM((start + end) / 2),
    });
  }
  return out;
}

function stepTimes(intervalMinutes: number): string[] {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += intervalMinutes) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    out.push(`${hh}:${mm}`);
  }
  return out;
}

/**
 * Sample the sky across a local day and report every gate change (all planets)
 * and every line change (fast movers only). The reported time is the sample at
 * which the new value first shows, so it is accurate to the sampling interval.
 */
export async function scanDay(
  date: string,
  timezone: string,
  opts: { intervalMinutes?: number; delayMs?: number } = {},
): Promise<DayScan> {
  const intervalMinutes = opts.intervalMinutes ?? 60;
  const delayMs = opts.delayMs ?? 120;
  const times = stepTimes(intervalMinutes);

  const samples: SkyMoment[] = [];
  for (const time of times) {
    try {
      samples.push(await castSkyAt(date, time, timezone));
    } catch (e) {
      // The chart API already retries; if a sample still fails, skip it rather
      // than abort the whole (often unattended) run. A missing sample only
      // widens the gap between two shift checkpoints.
      console.warn(`  scanDay: skipped ${time} (${e instanceof Error ? e.message : String(e)})`);
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  const shifts: TransitShift[] = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = new Map(samples[i - 1].positions.map((p) => [p.planet, p]));
    for (const cur of samples[i].positions) {
      const before = prev.get(cur.planet);
      if (!before) continue;
      if (before.gate !== cur.gate) {
        shifts.push({
          planet: cur.planet,
          time: samples[i].time,
          from: { gate: before.gate, line: before.line },
          to: { gate: cur.gate, line: cur.line },
          kind: "gate",
        });
      } else if (before.line !== cur.line && FAST_MOVERS.has(cur.planet) && cur.planet !== "Moon") {
        // The Moon moves so fast that its line changes are hard to notice; keep
        // the Moon at gate-level themes only. Line changes matter for every
        // other body. (Kaycee's edit, 2026-07-17.)
        shifts.push({
          planet: cur.planet,
          time: samples[i].time,
          from: { gate: before.gate, line: before.line },
          to: { gate: cur.gate, line: cur.line },
          kind: "line",
        });
      }
    }
  }

  return { date, timezone, intervalMinutes, start: samples[0], shifts };
}
