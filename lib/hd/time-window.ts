/**
 * What a chart would be if the birth time were different.
 *
 * Somebody who says "some time in the afternoon" gets a chart cast at 3pm, and
 * without this it looks exactly as certain as one cast from a birth certificate.
 * This casts the same birth at both ends of the window they actually gave and
 * reports what moves between them, so the chart can mark the parts that are not
 * settled and leave alone the parts that are.
 *
 * HOW OFTEN TO LOOK
 *
 * Kaycee, 2026-09-12: "Can the scan timing logic be based on the speed of the
 * moon since it's the one that changes most frequently?" That is the right
 * anchor, and it fixes a real hole: searching between two endpoints finds one
 * crossing, so if two happen inside the same gap the second is missed. The step
 * has to be smaller than the time the Moon takes to cross one line.
 *
 * The Moon moves roughly 13.2 degrees a day, but between about 11.8 and 15.4
 * depending where it is in its orbit, which is Kaycee's point that some days
 * carry more change than others. So the speed is measured rather than assumed:
 * the two endpoint casts already say where the Moon was, and the difference
 * gives its speed on that date for free.
 *
 *   a gate   5.625째  ~10 hours
 *   a line   0.9375째 ~1 hour 42
 *   a colour 0.156째  ~17 minutes
 *   a tone   0.026째  ~3 minutes
 *   a base   0.0043째 ~30 seconds
 *
 * This scans to the LINE. Colour, tone and base move far too fast for any scan
 * to bracket honestly, so they are reported as unreliable rather than searched:
 * a base changes about every thirty seconds, which no approximate time can
 * survive. That is a statement about the sky, not a limitation of the code.
 */

import { getChart } from "@/lib/mybodygraph";
import { longitudeOf } from "@/lib/hd/gate-longitude";
import type { Chart, PlanetActivation } from "@/lib/chart/types";

/** 360 degrees over 64 gates, six lines each. */
const DEGREES_PER_LINE = 360 / 64 / 6;

export interface Birth {
  birthDate: string;
  timezone: string;
  locationQuery?: string;
  latitude?: number;
  longitude?: number;
}

/** One thing that is not the same at both ends of the window. */
export interface Change {
  /** "Profile", "Authority", "Personality Sun", "Throat centre", "10-20"… */
  field: string;
  /** Where it belongs on the page, so the mark can be put in the right place. */
  kind: "property" | "activation" | "center" | "channel" | "variable";
  from: string;
  to: string;
  /** Local HH:MM the change happens at, once it has been narrowed down. */
  at?: string;
}

export interface WindowReport {
  from: string;              // HH:MM
  to: string;                // HH:MM
  /** How far the Moon travelled across the window, in degrees. */
  moonDegrees: number;
  /** Casts spent. Worth knowing: each one is an API call. */
  casts: number;
  changes: Change[];
  /** True when nothing at all moves, which is the reassuring answer. */
  steady: boolean;
}

// ── reading a chart as flat, comparable values ──────────────────────────────

const CENTER_LABEL: Record<string, string> = {
  head: "Head", ajna: "Ajna", throat: "Throat", g: "G / Identity",
  heart: "Heart", "solar plexus": "Solar Plexus", sacral: "Sacral",
  spleen: "Spleen", root: "Root",
};

/**
 * Every field of a chart as a plain string, keyed by where it lives. Comparing
 * two charts is then comparing two of these, which is why "compare everything"
 * is possible at all: a chart is structured data, not prose.
 */
export function flatten(c: Chart): Map<string, { kind: Change["kind"]; value: string }> {
  const out = new Map<string, { kind: Change["kind"]; value: string }>();
  const put = (field: string, kind: Change["kind"], value: string) =>
    out.set(field, { kind, value });

  for (const [label, p] of [
    ["Type", c.type], ["Strategy", c.strategy], ["Authority", c.authority],
    ["Profile", c.profile], ["Definition", c.definition],
    ["Incarnation Cross", c.incarnationCross], ["Signature", c.signature],
    ["Not-self theme", c.notSelfTheme],
  ] as const) {
    if (p?.value) put(label, "property", p.value);
  }

  // Gate and line only. Colour, tone and base are deliberately not compared:
  // they move faster than any honest scan and are reported as unreliable.
  const side = (list: PlanetActivation[] | undefined, name: string) => {
    for (const a of list ?? []) put(`${name} ${a.planet}`, "activation", `${a.gate}.${a.line}`);
  };
  side(c.activations?.personality, "Personality");
  side(c.activations?.design, "Design");

  for (const ctr of c.centers ?? []) {
    put(`${CENTER_LABEL[ctr.name] ?? ctr.name} centre`, "center",
      ctr.defined ? `defined (${ctr.consciousness})` : "open");
  }

  // A channel that exists in one cast and not the other shows up as a change of
  // presence, which is what somebody would notice.
  const ids = new Set((c.channels ?? []).map((ch) => ch.id));
  for (const id of ids) put(`Channel ${id}`, "channel", "defined");

  const v = c.variables;
  if (v) {
    for (const [label, key] of [
      ["Determination", "determination"], ["Environment", "environment"],
      ["Motivation", "motivation"], ["Perspective", "perspective"],
    ] as const) {
      const x = v[key];
      if (x) put(label, "variable", `${x.arrow} · ${x.theme}`);
    }
    if (v.sense) put("Sense", "variable", v.sense);
    if (v.designSense) put("Design Sense", "variable", v.designSense);
  }
  return out;
}

/** What differs between two casts, in the order a reader would meet them. */
export function diff(a: Chart, b: Chart): Change[] {
  const fa = flatten(a), fb = flatten(b);
  const fields = new Set([...fa.keys(), ...fb.keys()]);
  const changes: Change[] = [];
  for (const field of fields) {
    const x = fa.get(field), y = fb.get(field);
    const from = x?.value ?? "—", to = y?.value ?? "—";
    if (from === to) continue;
    changes.push({ field, kind: (x ?? y)!.kind, from, to });
  }
  const order: Change["kind"][] = ["property", "variable", "activation", "center", "channel"];
  return changes.sort((p, q) =>
    order.indexOf(p.kind) - order.indexOf(q.kind) || p.field.localeCompare(q.field));
}

// ── time helpers, kept dull on purpose ──────────────────────────────────────

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toClock = (mins: number) => {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * Where the Moon is, in real degrees around the wheel.
 *
 * Gate numbers are NOT in wheel order, so subtracting one gate number from
 * another says nothing about distance travelled. lib/hd/gate-longitude holds
 * the actual sequence and is what the mandala is drawn from, so the same
 * mapping is used here rather than a second, wrong one.
 */
function moonLongitude(c: Chart): number | null {
  const moon = (c.activations?.personality ?? []).find((a: PlanetActivation) => a.planet === "Moon");
  if (!moon) return null;
  return longitudeOf(moon.gate, moon.line, moon.color, moon.tone, moon.base);
}

/** Degrees travelled the short way round, so crossing 0째 does not read as 359. */
function arcBetween(a: number, b: number): number {
  const d = Math.abs(((b - a + 540) % 360) - 180);
  return d;
}

// ── the scan ────────────────────────────────────────────────────────────────

export interface ScanOptions {
  /** How close to pin a crossing, in minutes. Below this it stops bisecting. */
  precisionMinutes?: number;
  /** A hard ceiling on API calls, so a pathological day cannot run away. */
  maxCasts?: number;
}

/**
 * Cast the same birth across a window and report what moves.
 *
 * Two casts on a quiet day. On a busy one it steps at the Moon's own pace and
 * then bisects each gap that changed, which is a handful more.
 */
export async function scanWindow(
  birth: Birth,
  fromTime: string,
  toTime: string,
  opts: ScanOptions = {},
): Promise<WindowReport> {
  const precision = opts.precisionMinutes ?? 10;
  const maxCasts = opts.maxCasts ?? 14;
  let casts = 0;

  const cast = async (hhmm: string): Promise<Chart> => {
    casts++;
    return getChart({ ...birth, birthTime: hhmm });
  };

  const start = toMinutes(fromTime), end = toMinutes(toTime);
  const [a, b] = await Promise.all([cast(fromTime), cast(toTime)]);

  const ma = moonLongitude(a), mb = moonLongitude(b);
  const movedDegrees = ma !== null && mb !== null ? arcBetween(ma, mb) : 0;
  // the step is measured in line-widths: one sample per line the Moon crosses
  const movedLines = movedDegrees / DEGREES_PER_LINE;
  const spanMins = Math.max(1, end - start);

  const ends = diff(a, b);
  if (!ends.length) {
    return {
      from: fromTime, to: toTime, casts,
      moonDegrees: movedDegrees,
      changes: [], steady: true,
    };
  }

  // Step small enough that no single line crossing can hide inside one gap.
  // If the Moon crossed N lines across the window, N+1 samples bracket them all.
  const steps = Math.min(
    Math.max(2, Math.ceil(movedLines) + 1),
    Math.max(2, Math.floor((maxCasts - casts) / 2)),
  );
  const samples: { mins: number; chart: Chart }[] = [{ mins: start, chart: a }];
  for (let i = 1; i < steps; i++) {
    if (casts >= maxCasts) break;
    const t = start + (spanMins * i) / steps;
    samples.push({ mins: t, chart: await cast(toClock(t)) });
  }
  samples.push({ mins: end, chart: b });

  // Narrow each gap that changed, so the report can say when rather than that.
  const found = new Map<string, Change>();
  for (let i = 0; i < samples.length - 1; i++) {
    let lo = samples[i], hi = samples[i + 1];
    const gap = diff(lo.chart, hi.chart);
    if (!gap.length) continue;
    while (hi.mins - lo.mins > precision && casts < maxCasts) {
      const midMins = (lo.mins + hi.mins) / 2;
      const mid = { mins: midMins, chart: await cast(toClock(midMins)) };
      if (diff(lo.chart, mid.chart).length) hi = mid; else lo = mid;
    }
    for (const ch of gap) {
      // first crossing wins: it is the earliest time the reader stops being safe
      if (!found.has(ch.field)) found.set(ch.field, { ...ch, at: toClock(hi.mins) });
    }
  }

  // Anything the endpoints disagree on but the walk never isolated still counts;
  // it is a real difference, we just could not say when within the cast budget.
  for (const ch of ends) if (!found.has(ch.field)) found.set(ch.field, ch);

  return {
    from: fromTime, to: toTime, casts,
    moonDegrees: movedDegrees,
    changes: [...found.values()],
    steady: false,
  };
}
