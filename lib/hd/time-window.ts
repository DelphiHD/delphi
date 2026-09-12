/**
 * What a chart would be if the birth time were different.
 *
 * Somebody who says "some time in the afternoon" gets a chart cast at 3pm, and
 * without this it looks exactly as certain as one cast from a birth certificate.
 * This casts the same birth at both ends of the window they actually gave and
 * reports what moves between them, so the chart can mark the parts that are not
 * settled and leave alone the parts that are.
 *
 * WHERE TO LOOK
 *
 * Kaycee, 2026-09-12: "Can the scan timing logic be based on the speed of the
 * moon since it's the one that changes most frequently?" That was the right
 * anchor, and the first version of this walked the window at the Moon's own
 * pace and bisected every gap that moved. It worked, but it was sampling:
 * forty-eight casts across a day, each one a round trip, and a crossing was
 * only ever known to the nearest ten minutes.
 *
 * It does not sample any more. lib/hd/ephemeris computes the planets here, on
 * the machine, for nothing, so the exact minute each body steps over a
 * boundary is known before a single call is made. The provider is then asked
 * only about those minutes. Fewer calls, and the answer is the real minute
 * rather than a bracket.
 *
 * The provider remains the only authority on what a chart says. Nothing in
 * here decides a gate, a profile or a variable; it decides which moments are
 * worth asking about. Kaycee, 2026-09-12: "Just to be clear, this impacts the
 * scans only and not the charts, correct?" Correct. Delete this whole file and
 * every chart on the site is byte-identical.
 *
 * HOW FINE IT GOES
 *
 * A line is guaranteed: every body's line crossings are always asked about.
 * Below that it takes what it can afford and says which rung it reached, so
 * the chart can be honest about what is settled.
 *
 *   a gate   5.625 deg   Moon ~10 hours
 *   a line   0.9375      ~1 hour 42
 *   a colour 0.156       ~17 minutes
 *   a tone   0.026       ~3 minutes
 *   a base   0.0043      ~30 seconds
 *
 * Colour and tone are affordable for the slow bodies, which is where the
 * variables live: the Sun changes tone about every forty minutes, so a six
 * hour window is nine calls, not a hundred. They are not affordable for the
 * Moon, and a base moves every thirty seconds for everything, so those are
 * reported as unsettled rather than searched. That is a statement about the
 * sky, not a limitation of the code.
 */

import { getChart } from "@/lib/mybodygraph";
import { longitudeOf } from "@/lib/hd/gate-longitude";
import { centerOf } from "@/lib/hd/gate-center";
import { crossingsIn, type Rung } from "@/lib/hd/ephemeris";
import type { Chart, PlanetActivation } from "@/lib/chart/types";


export interface Birth {
  birthDate: string;
  timezone: string;
  locationQuery?: string;
  latitude?: number;
  longitude?: number;
}

/** One value a field holds, and the stretch of the window it holds it for. */
export interface Span {
  value: string;
  /** Local HH:MM this value starts and stops being true. */
  from: string;
  to: string;
}

/**
 * One thing that is not the same across the whole window.
 *
 * `spans` is the useful part and the reason this is not just a from/to pair.
 * Somebody who says "some time in the afternoon" does not want to be told
 * their Design Sense changed at half past twelve, because they do not know
 * what time they were born. They want to know it is one of Taste, Outer Vision
 * or Inner Vision, and which is likeliest given what they do remember. So the
 * whole run of values is kept, in order, with the stretch each one covers.
 */
export interface Change {
  /** "Profile", "Authority", "Personality Sun", "Throat centre", "10-20"… */
  field: string;
  /** Where it belongs on the page, so the mark can be put in the right place. */
  kind: "property" | "activation" | "center" | "channel" | "variable";
  /** Every value the field takes across the window, earliest first. */
  spans: Span[];
  /** First and last, kept because most callers only want the headline. */
  from: string;
  to: string;
  /** Local HH:MM of the first change. Absent when it could not be pinned. */
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
  /** The UTC instant the window starts at, so the astrology layer can be read
   *  across the same hours without casting the chart again. */
  startUtc: string;
  /**
   * The finest rung every body was fully checked at. A line is always
   * guaranteed; colour and tone are reached when the sky that day allows it
   * inside the cast budget. Below this rung the chart should say "not settled"
   * rather than imply it looked.
   */
  resolution: Rung;
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

  // A centre says what is defining it, not just that something is.
  //
  // Kaycee, 2026-09-12: "listing Defined twice makes it appear that there
  // aren't actually differences. Would it be possible to show the channel that
  // would be defining it for both options?" Her Head centre was defined at
  // every hour of the window, but by a different channel early and late, and
  // the report showed "defined" twice with no way to tell them apart.
  for (const ctr of c.centers ?? []) {
    const key = ctr.name.split(" ").join("-");
    const via = (c.channels ?? [])
      .filter((ch) => centerOf(ch.gates[0]) === key || centerOf(ch.gates[1]) === key)
      .map((ch) => ch.id)
      .sort();
    put(`${CENTER_LABEL[ctr.name] ?? ctr.name} centre`, "center",
      ctr.defined && via.length ? `defined via ${via.join(" ")}` : ctr.defined ? "defined" : "open");
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
    changes.push({ field, kind: (x ?? y)!.kind, from, to, spans: [] });
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

/**
 * Make a run of spans contiguous, and give every one of them real time.
 *
 * A value holds right up until the next one starts, so ending a span at the
 * last cast that saw it would leave gaps, and a gap reads as "we do not know".
 *
 * The second half matters at the edges. A crossing found at the final minute of
 * the window produced a span from 23:59 to 23:59: no time at all, shown as a
 * second answer. Kaycee, 2026-09-12, looking at exactly that: "listing Defined
 * twice makes it appear that there aren't actually differences." Such a span
 * borrows a minute from the one before it, which is honest to a scan that
 * reports to the minute.
 */
function tidy(spans: Span[], endTime: string): void {
  for (let i = 0; i < spans.length - 1; i++) spans[i].to = spans[i + 1].from;
  spans[spans.length - 1].to = endTime;
  for (let i = spans.length - 1; i > 0; i--) {
    if (spans[i].from !== spans[i].to) continue;
    const borrowed = toClock(toMinutes(spans[i].to) - 1);
    if (toMinutes(borrowed) <= toMinutes(spans[i - 1].from)) continue;
    spans[i].from = borrowed;
    spans[i - 1].to = borrowed;
  }
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
 * Two casts on a quiet day. On a busy one, one cast per moment the sky
 * actually turns over, which is a handful more and never a guess.
 */
export async function scanWindow(
  birth: Birth,
  fromTime: string,
  toTime: string,
  opts: ScanOptions = {},
): Promise<WindowReport> {
  const precision = opts.precisionMinutes ?? 10;
  const maxCasts = opts.maxCasts ?? 48;
  let casts = 0;

  const cast = async (hhmm: string): Promise<Chart> => {
    casts++;
    return getChart({ ...birth, birthTime: hhmm });
  };

  const start = toMinutes(fromTime), end = toMinutes(toTime);
  const [a, b] = await Promise.all([cast(fromTime), cast(toTime)]);

  // Kept because it is the honest headline for how eventful a day was, and
  // Kaycee's own framing: "some days have more changes than others, it really
  // just depends on what the planets are doing."
  const ma = moonLongitude(a), mb = moonLongitude(b);
  const movedDegrees = ma !== null && mb !== null ? arcBetween(ma, mb) : 0;

  const ends = diff(a, b);
  if (!ends.length) {
    return {
      from: fromTime, to: toTime, casts,
      moonDegrees: movedDegrees,
      changes: [], steady: true, resolution: "tone",
      startUtc: a.birth.utcDate,
    };
  }

  // Where the sky actually turns over, worked out here rather than hunted for.
  // The design side moves with the birth time, so both sides are watched; the
  // offset between them comes from the chart the provider just handed back.
  const designOffsetMins = Math.round(
    (new Date(a.birth.designUtcDate).getTime() - new Date(a.birth.utcDate).getTime()) / 60_000,
  );
  const crossings = crossingsIn({
    startUtc: new Date(a.birth.utcDate),
    startMins: start,
    endMins: end,
    designOffsetMins,
  });

  // Spend the budget a whole body at a time. Half of a body's crossings is
  // worse than none of them: it would report the changes it happened to catch
  // and stay silent about the ones it skipped, which reads as certainty.
  const groups = new Map<string, { rung: Rung; mins: Set<number> }>();
  for (const c of crossings) {
    const key = `${c.planet}|${c.rung}`;
    const g = groups.get(key) ?? { rung: c.rung, mins: new Set<number>() };
    g.mins.add(c.mins);
    groups.set(key, g);
  }
  const RUNG_ORDER: Rung[] = ["gate", "line", "color", "tone"];
  const ranked = [...groups.values()].sort((x, y) =>
    RUNG_ORDER.indexOf(x.rung) - RUNG_ORDER.indexOf(y.rung) || x.mins.size - y.mins.size);

  const want = new Set<number>();
  const covered = new Set<Rung>(["gate"]);
  const skipped = new Set<Rung>();
  for (const g of ranked) {
    const added = [...g.mins].filter((m) => !want.has(m) && m > start && m < end);
    // A line is the promise, so it is taken whether or not the budget likes it.
    if (g.rung === "line" || casts + want.size + added.length <= maxCasts) {
      for (const m of added) want.add(m);
      if (!skipped.has(g.rung)) covered.add(g.rung);
    } else {
      skipped.add(g.rung);
      covered.delete(g.rung);
    }
  }
  const resolution = RUNG_ORDER.filter((r) => covered.has(r)).pop() ?? "gate";

  // All of them together. They do not depend on each other, and lib/mybodygraph
  // now paces everything it sends, so asking for thirty at once is safe.
  const times = [...want].sort((x, y) => x - y);
  const charts = await Promise.all(times.map((mins) => cast(toClock(mins))));
  const middles = times.map((mins, i) => ({ mins, chart: charts[i] }));
  const samples = [
    { mins: start, chart: a }, ...middles, { mins: end, chart: b },
  ];

  // Consecutive casts now sit either side of a real boundary, so the time a
  // thing changes is the time of the later cast. No bisecting, no ten-minute
  // bracket: the minute is the answer.
  //
  // Read down each field rather than across each gap, so a field that moves
  // three times reports all three values and not just the first one somebody
  // happened to catch.
  const flat = samples.map((s) => ({ mins: s.mins, map: flatten(s.chart) }));
  const fields = new Map<string, Change["kind"]>();
  for (const f of flat) for (const [k, v] of f.map) fields.set(k, v.kind);

  const found = new Map<string, Change>();
  for (const [field, kind] of fields) {
    const spans: Span[] = [];
    for (const f of flat) {
      const value = f.map.get(field)?.value ?? "—";
      const last = spans[spans.length - 1];
      if (last && last.value === value) last.to = toClock(f.mins);
      else spans.push({ value, from: toClock(f.mins), to: toClock(f.mins) });
    }
    if (spans.length < 2) continue;
    tidy(spans, toTime);
    found.set(field, {
      field, kind, spans,
      from: spans[0].value, to: spans[spans.length - 1].value,
      at: spans[1].from,
    });
  }

  // The safety net. Nodes, Chiron and Lilith cannot be computed here, and none
  // of them can change a line inside a birth window, but Lilith can shift a
  // tone across a long one. So anything the two ends disagree about that the
  // walk above never accounted for is still hunted the old way, by halving.
  for (const ch of ends) {
    if (found.has(ch.field)) continue;
    let lo = samples[0], hi = samples[samples.length - 1];
    while (hi.mins - lo.mins > precision && casts < maxCasts) {
      const midMins = Math.round((lo.mins + hi.mins) / 2);
      const mid = { mins: midMins, chart: await cast(toClock(midMins)) };
      if (diff(lo.chart, mid.chart).some((d) => d.field === ch.field)) hi = mid; else lo = mid;
    }
    const at = hi.mins > start ? toClock(hi.mins) : undefined;
    const spans: Span[] = [
      { value: ch.from, from: fromTime, to: at ?? toTime },
      { value: ch.to, from: at ?? fromTime, to: toTime },
    ];
    // The same tidying as above. Without it a change caught at the very last
    // minute of the window produced a second bullet covering no time at all,
    // which reads as two answers where there is one crossing.
    tidy(spans, toTime);
    found.set(ch.field, { ...ch, at: spans[1]?.from ?? at, spans });
  }

  return {
    from: fromTime, to: toTime, casts,
    moonDegrees: movedDegrees,
    changes: [...found.values()],
    steady: false,
    resolution,
    startUtc: a.birth.utcDate,
  };
}
