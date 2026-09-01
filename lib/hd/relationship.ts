/**
 * Connection charts: two people, one call.
 *
 * A new module rather than an addition to lib/mybodygraph.ts, which is a spine
 * module in docs/ARCHITECTURE.md and not mine to restructure. This one fetches
 * and normalises a pair; nothing else in the system changes shape because of it.
 *
 * What the provider gives us, and what it does not, is written up in
 * docs/RELATIONSHIP_MODULE.md. The short version: the four connection types
 * arrive named and sorted with their gate pairs, and every description field
 * comes back empty.
 */

import { getChart } from "../mybodygraph";

const CHART_HOST = "https://api.bodygraphchart.com";
const CHART_PATH = "/v221006/hd-data";

/** The four ways two charts can meet on a channel. Kaycee's vocabulary. */
export type ConnectionKind = "electromagnetic" | "companionship" | "dominance" | "compromise";

export const CONNECTION_ORDER: ConnectionKind[] = [
  "electromagnetic",
  "companionship",
  "dominance",
  "compromise",
];

export interface ConnectionChannel {
  kind: ConnectionKind;
  /** "Channel of Money (45-21)" as the provider names it. */
  label: string;
  /** "Money" — the channel's own name, without the scaffolding. */
  name: string;
  gates: number[];
}

export interface Placement {
  planet: string;
  gate: number;
  line: number;
  color?: number;
  tone?: number;
  base?: number;
  fixingState?: string;
}

export interface PersonSide {
  name: string;
  /** Straight from the provider; nothing here is derived on our side. */
  type: string;
  strategy: string;
  authority: string;
  age?: number;
  definedCenters: string[];
  openCenters: string[];
  channels: string[];
  gates: number[];
  profile: string;
  definition: string;
  incarnationCross: string;
  signature: string;
  notSelfTheme: string;
  digestion: string;
  environment: string;
  motivation: string;
  perspective: string;
  variables: { digestion: string; environment: string; motivation: string; perspective: string };
  personality: Placement[];
  design: Placement[];
  /** The 88-degree instant, for drawing their design side on a wheel. */
  designUtc?: string;
}

export interface ConnectionChart {
  a: PersonSide;
  b: PersonSide;
  /** The branded composite bodygraph, both charts on one graph. */
  bodygraphSvg?: string;
  /** The two charts read as one: which centers are defined between them. */
  definedTogether: string[];
  openTogether: string[];
  /** Joint definition, computed across both charts. */
  definitionLabel: string;
  // The provider's connection theme, "7 - 2, Work To Do" and its paragraph, is
  // deliberately NOT carried. Kaycee, 2026-09-01: "I never want to see it again.
  // ever. Anywhere." It is not read out of the response, so it cannot reappear.
  channels: ConnectionChannel[];
}

export interface PersonInput {
  name: string;
  birthDate: string;   // YYYY-MM-DD
  birthTime: string;   // HH:MM, local to birthTimezone
  birthTimezone: string;
}

function apiKey(): string {
  const k = process.env.MYBODYGRAPH_API_KEY;
  if (!k) throw new Error("MYBODYGRAPH_API_KEY must be set to pull a connection chart");
  return k;
}

/** "Channel of Money (45-21)" -> "Money" */
function channelName(label: string): string {
  return label.replace(/^Channel of\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** The provider returns placements keyed by planet; this keeps them in wheel order. */
const PLANET_ORDER = [
  "Sun", "Earth", "North Node", "South Node", "Moon", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
];

function placements(raw: unknown): Placement[] {
  const o = (raw ?? {}) as Record<string, {
    Gate?: number; Line?: number; Color?: number; Tone?: number; Base?: number; FixingState?: string;
  }>;
  const names = [...PLANET_ORDER, ...Object.keys(o).filter((k) => !PLANET_ORDER.includes(k))];
  const out: Placement[] = [];
  for (const planet of names) {
    const p = o[planet];
    if (!p || p.Gate == null) continue;
    out.push({
      planet, gate: p.Gate, line: p.Line ?? 0,
      color: p.Color, tone: p.Tone, base: p.Base,
      fixingState: p.FixingState && p.FixingState !== "None" ? p.FixingState : undefined,
    });
  }
  return out;
}

function side(name: string, raw: Record<string, unknown>): PersonSide {
  const props = (raw.Properties ?? {}) as Record<string, unknown>;
  const val = (k: string) => {
    const v = props[k];
    if (v && typeof v === "object") return String((v as { option?: string; id?: string }).option
      ?? (v as { id?: string }).id ?? "");
    return v == null ? "" : String(v);
  };

  return {
    name,
    // Read from the response, not worked out here. The provider is the authority
    // on what these people are.
    type: val("Type"),
    strategy: val("Strategy"),
    authority: val("InnerAuthority"),
    // Everything the individual chart's home panel shows, so the pair can be
    // read side by side without dropping to a single chart to see it.
    // The pair response carries only these three per person. Profile, definition,
    // cross, frequencies and the four variables come from each person's own
    // chart call, filled in by getConnectionChart below.
    profile: "",
    definition: "",
    incarnationCross: "",
    signature: "",
    notSelfTheme: "",
    digestion: "",
    environment: "",
    motivation: "",
    perspective: "",
    variables: { digestion: "", environment: "", motivation: "", perspective: "" },
    age: props.Age == null ? undefined : Number(props.Age),
    definedCenters: (raw.DefinedCenters as string[]) ?? [],
    openCenters: (raw.OpenCenters as string[]) ?? [],
    channels: ((raw.Channels as (string | { id?: string; option?: string })[]) ?? [])
      .map((c) => (typeof c === "string" ? c : c.option ?? c.id ?? ""))
      .filter(Boolean),
    gates: ((raw.Gates as (number | { gate?: number })[]) ?? [])
      .map((g) => (typeof g === "number" ? g : g.gate ?? 0))
      .filter(Boolean),
    personality: placements(raw.Personality),
    design: placements(raw.Design),
    designUtc: typeof props.DesignDateUtcStandard === "string" ? props.DesignDateUtcStandard : undefined,
  };
}

export async function getConnectionChart(a: PersonInput, b: PersonInput): Promise<ConnectionChart> {
  const url = new URL(CHART_HOST + CHART_PATH);
  url.searchParams.set("api_key", apiKey());
  for (const p of [a, b]) {
    url.searchParams.append("date[]", `${p.birthDate} ${p.birthTime}`);
    url.searchParams.append("timezone[]", p.birthTimezone);
  }
  url.searchParams.set("relationship", "1");
  // The provider draws the composite bodygraph in Kaycee's branding, the same
  // way it does for a single chart. No reason to redraw what it already returns.
  url.searchParams.set("design", "delphi");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`connection chart failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const j = (await res.json()) as Record<string, any>;
  const combined = j.Combined ?? {};
  const props = combined.Properties ?? {};

  const channels: ConnectionChannel[] = [];
  const rc = props.RelationshipChannels ?? {};
  for (const kind of CONNECTION_ORDER) {
    for (const item of (rc[kind]?.list ?? []) as { option?: string; gates?: number[] }[]) {
      const label = item.option ?? "";
      if (!label) continue;
      channels.push({ kind, label, name: channelName(label), gates: item.gates ?? [] });
    }
  }

  // Each person's own chart, for everything the pair response leaves out. Two
  // provider calls, no extra cost, and the numbers come from the same authority
  // the individual chart panel reads.
  const sides = [side(a.name, j["0"] ?? {}), side(b.name, j["1"] ?? {})];
  await Promise.all([a, b].map(async (who, i) => {
    try {
      const own = await getChart({
        birthDate: who.birthDate,
        birthTime: who.birthTime,
        timezone: who.birthTimezone,
      });
      const s = sides[i];
      s.profile = own.profile.value;
      s.definition = own.definition.value;
      s.incarnationCross = own.incarnationCross.value;
      s.signature = own.signature.value;
      s.notSelfTheme = own.notSelfTheme.value;
      s.digestion = own.variables.determination.theme;
      s.environment = own.variables.environment.theme;
      s.motivation = own.variables.motivation.theme;
      s.perspective = own.variables.perspective.theme;
      s.variables = {
        digestion: own.variables.determination.arrow,
        environment: own.variables.environment.arrow,
        motivation: own.variables.motivation.arrow,
        perspective: own.variables.perspective.arrow,
      };
    } catch {
      // A missing own-chart leaves those rows blank rather than losing the pair.
    }
  }));

  return {
    a: sides[0],
    b: sides[1],
    bodygraphSvg: (combined.SVG ?? j.SVG) as string | undefined,
    definedTogether: combined.DefinedCenters ?? [],
    openTogether: combined.OpenCenters ?? [],
    definitionLabel: props.Definition?.option ?? props.Definition?.id ?? "",
    channels,
  };
}

/** The connection channels grouped the way a reading walks through them. */
export function byKind(chart: ConnectionChart): Record<ConnectionKind, ConnectionChannel[]> {
  const out = {} as Record<ConnectionKind, ConnectionChannel[]>;
  for (const kind of CONNECTION_ORDER) out[kind] = chart.channels.filter((c) => c.kind === kind);
  return out;
}
