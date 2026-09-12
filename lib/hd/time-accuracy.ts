/**
 * What a chart is allowed to claim, given how well the birth time is known.
 *
 * A chart cast from a birth certificate and a chart cast from "some time in the
 * afternoon" look identical, and that is the problem. The second one is a guess
 * presented with the same confidence as the first, to somebody who is new to
 * this and has no way to tell the difference.
 *
 * Measured on 2026-09-12 across 24 birth dates spread over four decades, same
 * six-hour afternoon window, same place:
 *
 *     42%   type, profile, authority, definition or the cross changed
 *     33%   a centre or a channel changed
 *    100%   at least one planet's gate.line changed
 *    100%   at least one variable changed
 *
 * One of those dates went from Generator to Projector inside the window, which
 * takes Strategy, Signature and the Not-self theme with it. So this is not a
 * matter of precision. For four people in ten the line at the top of the chart
 * is a different line depending on an hour they do not remember.
 *
 * Kaycee, 2026-09-12: "Is it possible to return some kind of message like Exact
 * Birth Time Required or Can Not be Determined response in those fields if it
 * changes? I think we should do that for the variables in all cases of unknown
 * birth times."
 *
 * So two rules, and the second one is hers, not the measurement's:
 *
 *   1. Any field the scan finds moving inside the window is not shown as a
 *      value. It says what it needs instead, and offers what it could be.
 *   2. The variables are never shown without an exact time, whether or not the
 *      scan caught them moving. They turn over on colour and tone, which move
 *      every seventeen minutes and every three, so "it did not change across
 *      the sample" is luck rather than evidence.
 */

import { scanWindow, type WindowReport } from "@/lib/hd/time-window";

export type Accuracy = "document" | "told" | "approximate" | "unknown";

/** What the chart prints where a value would have gone. */
export const NEEDS_EXACT = "Exact Birth Time Required";

/**
 * The four variables, by the name the scan uses for them. Always withheld
 * without an exact time, per Kaycee, above.
 */
export const VARIABLE_FIELDS = [
  "Determination", "Environment", "Motivation", "Perspective",
  "Sense", "Design Sense",
];

export interface TimeWindow {
  /** Local HH:MM, the earliest and latest the birth could have been. */
  from: string;
  to: string;
  /** "the Afternoon", for a sentence. */
  label: string;
  /** The time the chart was actually cast for, which the chart should say. */
  castFor: string;
}

/**
 * The window a stored birth time stands for.
 *
 * The form offers four parts of the day and stores the middle of whichever one
 * was picked, so the middle is enough to recover the window. Kaycee,
 * 2026-09-12: "We should also make it clear what time we are using for the
 * estimate for each day segment."
 */
const SEGMENTS: { at: string; from: string; to: string; label: string }[] = [
  { at: "03:00", from: "00:00", to: "06:00", label: "the Small Hours" },
  { at: "09:00", from: "06:00", to: "12:00", label: "the Morning" },
  { at: "15:00", from: "12:00", to: "18:00", label: "the Afternoon" },
  { at: "21:00", from: "18:00", to: "23:59", label: "the Evening" },
];

export function windowFor(accuracy: Accuracy, birthTime: string | null): TimeWindow | null {
  if (accuracy === "document" || accuracy === "told") return null;
  const at = (birthTime ?? "").slice(0, 5);
  const seg = SEGMENTS.find((s) => s.at === at);
  if (seg) return { from: seg.from, to: seg.to, label: seg.label, castFor: seg.at };
  // Nothing at all to go on: the whole day, cast for noon. Noon rather than
  // midnight because midnight is a real birth time and would read as an answer.
  return { from: "00:00", to: "23:59", label: "the whole day", castFor: "12:00" };
}

/** Where a field sits on the page, so the chart can mark the right thing. */
export type FieldKind = WindowReport["changes"][number]["kind"];

export interface Unsettled {
  field: string;
  kind: FieldKind;
  /** Every value it takes across the window, in order, without repeats. */
  couldBe: string[];
  /** Present when the scan actually watched it move; absent for the variables,
   *  which are withheld on principle rather than on evidence. */
  spans?: { value: string; from: string; to: string }[];
}

export interface Reliability {
  accuracy: Accuracy;
  /** True when the chart can be trusted as cast. */
  exact: boolean;
  window: TimeWindow | null;
  /** Keyed by the field name the scan uses. */
  unsettled: Map<string, Unsettled>;
  /** True when the top of the chart is among the casualties. */
  identityUnsettled: boolean;
  /** How finely the sky was actually checked. */
  resolution?: WindowReport["resolution"];
  casts: number;
}

/** The fields a newcomer reads as "who I am". */
const IDENTITY = new Set([
  "Type", "Strategy", "Authority", "Profile", "Definition",
  "Incarnation Cross", "Signature", "Not-self theme",
]);

/** An exact time: nothing is withheld. */
export function settled(accuracy: Accuracy): Reliability {
  return {
    accuracy, exact: true, window: null,
    unsettled: new Map(), identityUnsettled: false, casts: 0,
  };
}

/**
 * Cast the window and work out what this particular chart may claim.
 *
 * Per person, never generic: two people born the same afternoon in different
 * years get completely different answers, so nobody is handed somebody else's
 * warning.
 */
export async function reliabilityOf(args: {
  accuracy: Accuracy;
  birthDate: string;
  birthTime: string | null;
  timezone: string;
  locationQuery?: string;
  latitude?: number;
  longitude?: number;
}): Promise<Reliability> {
  const window = windowFor(args.accuracy, args.birthTime);
  if (!window) return settled(args.accuracy);

  const report = await scanWindow(
    {
      birthDate: args.birthDate, timezone: args.timezone,
      locationQuery: args.locationQuery,
      latitude: args.latitude, longitude: args.longitude,
    },
    window.from, window.to,
  );

  const unsettled = new Map<string, Unsettled>();
  for (const c of report.changes) {
    const couldBe: string[] = [];
    for (const s of c.spans) if (!couldBe.includes(s.value)) couldBe.push(s.value);
    unsettled.set(c.field, { field: c.field, kind: c.kind, couldBe, spans: c.spans });
  }
  // Kaycee's rule: the variables go whether or not the scan caught them.
  for (const field of VARIABLE_FIELDS) {
    if (unsettled.has(field)) continue;
    unsettled.set(field, { field, kind: "variable", couldBe: [] });
  }

  return {
    accuracy: args.accuracy,
    exact: false,
    window,
    unsettled,
    identityUnsettled: [...unsettled.keys()].some((f) => IDENTITY.has(f)),
    resolution: report.resolution,
    casts: report.casts,
  };
}

// ── turning field names back into things on the drawing ─────────────────────

/**
 * The centre names the scan reports, back to the keys the bodygraph is painted
 * with. Written out rather than derived, because a silent miss here would draw
 * an unsettled centre as a settled one, which is the exact failure this whole
 * file exists to prevent.
 */
const CENTER_KEY: Record<string, string> = {
  "Head centre": "head",
  "Ajna centre": "ajna",
  "Throat centre": "throat",
  "G / Identity centre": "g",
  "Heart centre": "heart",
  "Solar Plexus centre": "solar-plexus",
  "Sacral centre": "sacral",
  "Spleen centre": "spleen",
  "Root centre": "root",
};

/**
 * Channels that are there for some of the window and not the rest.
 *
 * Kaycee, 2026-09-12, choosing how the bodygraph handles this: "2 seems most
 * inline with our educational purpose." Option 2 was: draw solid only what
 * holds across the whole window, and draw what comes and goes as visibly
 * pending. So nothing on the drawing is ever wrong, and a beginner can see at a
 * glance which parts of themselves the missing hour is costing them.
 */
export function unsettledChannels(r: Reliability): Set<string> {
  const out = new Set<string>();
  for (const u of r.unsettled.values()) {
    if (u.kind !== "channel") continue;
    const id = u.field.startsWith("Channel ") ? u.field.slice(8) : null;
    if (id) out.add(id);
  }
  return out;
}

/** Centres whose definition depends on the hour. */
export function unsettledCenters(r: Reliability): Set<string> {
  const out = new Set<string>();
  for (const u of r.unsettled.values()) {
    if (u.kind !== "center") continue;
    const key = CENTER_KEY[u.field];
    if (key) out.add(key);
  }
  return out;
}

/**
 * Gates whose activation depends on the hour, as plain numbers.
 *
 * An activation field reads "Personality Sun" and its values read "36.4", so
 * the gate is the part before the dot. A gate counts as unsettled when the
 * planet that carries it lands on different gates at different hours; a planet
 * that only moves a line stays on the same gate and the drawing is unaffected.
 */
export function unsettledGates(r: Reliability): Set<number> {
  const out = new Set<number>();
  for (const u of r.unsettled.values()) {
    if (u.kind !== "activation") continue;
    const gates = new Set(u.couldBe.map((v) => Number(v.split(".")[0])).filter(Boolean));
    if (gates.size > 1) for (const g of gates) out.add(g);
  }
  return out;
}

// ── keeping the answer ──────────────────────────────────────────────────────

/**
 * What the scan was run against.
 *
 * A stored scan is only true for the birth details it was cast from. Kaycee
 * corrects birth details often, and a correction that left a confident old
 * answer in place would be worse than having no answer at all, so the details
 * travel with the scan and it is thrown away the moment they stop matching.
 */
export function birthFingerprint(args: {
  accuracy: Accuracy; birthDate: string; birthTime: string | null;
  timezone: string; locationQuery?: string;
}): string {
  return [
    args.accuracy, args.birthDate, args.birthTime ?? "",
    args.timezone, args.locationQuery ?? "",
  ].join("|");
}

/** The shape that goes into the database. A Map does not survive JSON. */
export interface StoredScan {
  accuracy: Accuracy;
  window: TimeWindow | null;
  identityUnsettled: boolean;
  resolution?: WindowReport["resolution"];
  casts: number;
  unsettled: Unsettled[];
}

export function toStored(r: Reliability): StoredScan {
  return {
    accuracy: r.accuracy, window: r.window,
    identityUnsettled: r.identityUnsettled,
    resolution: r.resolution, casts: r.casts,
    unsettled: [...r.unsettled.values()],
  };
}

export function fromStored(s: StoredScan): Reliability {
  return {
    accuracy: s.accuracy, exact: false, window: s.window,
    unsettled: new Map(s.unsettled.map((u) => [u.field, u])),
    identityUnsettled: s.identityUnsettled,
    resolution: s.resolution, casts: s.casts,
  };
}
