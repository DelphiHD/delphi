// Server-only by virtue of reading MYBODYGRAPH_API_KEY (no NEXT_PUBLIC_ prefix
// means it never reaches the client bundle). Intentionally no `import "server-only"`
// guard so scripts/test-chart.ts can exercise this code under tsx.
import {
  CENTERS,
  PLANET_ORDER,
  type Arrow,
  type Center,
  type CenterConsciousness,
  type CenterName,
  type Channel,
  type ChannelConsciousness,
  type Chart,
  type ChartProperty,
  type FixingState,
  type PlanetActivation,
  type PlanetName,
  type Variable,
  type Variables,
} from "@/lib/chart/types";

const API_BASE = "https://api.bodygraphchart.com";
const CHART_PATH = "/v221006/hd-data";
const LOCATIONS_PATH = "/v210502/locations";

function apiKey(): string {
  const key = process.env.MYBODYGRAPH_API_KEY;
  if (!key) {
    throw new Error(
      "MYBODYGRAPH_API_KEY is not set. Set it in .env.local and (for the deployed app) in Vercel env vars."
    );
  }
  return key;
}

// Quarter assignments by Personality Sun gate. Source: Ra Uru Hu's Rave
// Cosmology / Differentiation Degree Lines. Each quarter holds 16 gates aligned
// with one cardinal point of the wheel. If Kaycee ever corrects a gate
// placement here, update this table and the gate→quarter section in
// docs/CONTEXT.md in the same commit.
const QUARTER_BY_GATE: Record<number, string> = {};
const QUARTERS: Record<string, number[]> = {
  "Quarter of Initiation": [
    13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24,
  ],
  "Quarter of Civilization": [
    2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56, 31, 33,
  ],
  "Quarter of Duality": [
    7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44,
  ],
  "Quarter of Mutation": [
    1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60, 41, 19,
  ],
};
for (const [name, gates] of Object.entries(QUARTERS)) {
  for (const g of gates) QUARTER_BY_GATE[g] = name;
}

export async function getTimezoneForLocation(query: string): Promise<string> {
  const url = new URL(API_BASE + LOCATIONS_PATH);
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("query", query);
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`mybodygraph locations failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as Array<{ value: string; timezone: string }>;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`mybodygraph: no location match for "${query}"`);
  }
  return data[0].timezone;
}

export interface GetChartArgs {
  // YYYY-MM-DD
  birthDate: string;
  // HH:MM (24-hour, local to the birth timezone)
  birthTime: string;
  // IANA timezone, e.g. "America/Denver". Use getTimezoneForLocation() if the
  // operator only has a free-text city.
  timezone: string;
  latitude?: number;
  longitude?: number;
  locationQuery?: string;
  // Set true to populate chart.chartImageUrl with the API's SVG.
  includeChartImage?: boolean;
}

export async function getChart(args: GetChartArgs): Promise<Chart> {
  const { birthDate, birthTime, timezone } = args;
  const url = new URL(API_BASE + CHART_PATH);
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("date", `${birthDate} ${birthTime}`);
  url.searchParams.set("timezone", timezone);
  if (args.latitude !== undefined) url.searchParams.set("lat", String(args.latitude));
  if (args.longitude !== undefined) url.searchParams.set("long", String(args.longitude));
  if (args.includeChartImage) url.searchParams.set("design", "1");

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`mybodygraph hd-data failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as MybodygraphResponse;
  return mapResponseToChart(raw, args);
}

// ─── translation layer ──────────────────────────────────────────────────────

interface MybodygraphPlanet {
  Gate: number;
  Line: number;
  Color: number;
  Tone: number;
  Base: number;
  FixingState: FixingState;
}

interface MybodygraphProperty {
  id?: string;
  option?: string;
  description?: string;
}

interface MybodygraphResponse {
  Properties: {
    BirthDateLocalStandard: string;
    BirthDateUtcStandard: string;
    DesignDateUtcStandard: string;
    Type: MybodygraphProperty;
    Strategy: MybodygraphProperty;
    InnerAuthority: MybodygraphProperty;
    Definition: MybodygraphProperty;
    Profile: MybodygraphProperty;
    IncarnationCross: MybodygraphProperty;
    Signature: MybodygraphProperty;
    NotSelfTheme: MybodygraphProperty;
    // PHS theme labels (Cold, Kitchens, Desire, Wanting, Security, Touch).
    Digestion: MybodygraphProperty;
    Environment: MybodygraphProperty;
    Motivation: MybodygraphProperty;
    Perspective: MybodygraphProperty;
    Sense: MybodygraphProperty;
    DesignSense: MybodygraphProperty;
  };
  ChartUrl?: string;
  Personality: Record<string, MybodygraphPlanet>;
  Design: Record<string, MybodygraphPlanet>;
  DefinedCenters: string[];
  OpenCenters: string[];
  ConsciousCenters: string[];
  UnconsciousCenters: string[];
  Channels: string[];
  // Arrow directions (left/right) for the four variables.
  Variables: {
    Digestion: Arrow;
    Environment: Arrow;
    Awareness: Arrow;
    Perspective: Arrow;
  };
}

function propertyOf(p: MybodygraphProperty | undefined): ChartProperty {
  return {
    value: p?.option ?? p?.id ?? "",
    description: p?.description ?? "",
  };
}

// API center strings look like "sacral center", "g center", "solar plexus center",
// "splenic center". Strip the trailing " center" and map "splenic" → "spleen"
// so we match the standard 9-center vocabulary.
function normalizeCenterName(raw: string): CenterName | null {
  const base = raw.toLowerCase().replace(/\s+center$/, "").trim();
  const canonical = base === "splenic" ? "spleen" : base;
  return (CENTERS as readonly string[]).includes(canonical)
    ? (canonical as CenterName)
    : null;
}

function normalizeChannelId(raw: string): { id: string; gates: [number, number] } {
  const parts = raw.split("-").map((s) => parseInt(s.trim(), 10));
  if (parts.length !== 2 || parts.some(Number.isNaN)) {
    throw new Error(`mybodygraph: cannot parse channel id "${raw}"`);
  }
  const [a, b] = parts;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return { id: `${lo}-${hi}`, gates: [lo, hi] };
}

// For a gate, return which sides activate it.
function sidesForGate(
  gate: number,
  personalityGates: Set<number>,
  designGates: Set<number>
): Set<"personality" | "design"> {
  const sides = new Set<"personality" | "design">();
  if (personalityGates.has(gate)) sides.add("personality");
  if (designGates.has(gate)) sides.add("design");
  return sides;
}

function consciousnessFromSides(
  ...sideSets: Array<Set<"personality" | "design">>
): ChannelConsciousness {
  const all = new Set<"personality" | "design">();
  for (const s of sideSets) for (const v of s) all.add(v);
  if (all.has("personality") && all.has("design")) return "mixed";
  if (all.has("personality")) return "personality";
  return "design";
}

function mapPlanets(
  raw: Record<string, MybodygraphPlanet>
): PlanetActivation[] {
  const result: PlanetActivation[] = [];
  for (const planet of PLANET_ORDER) {
    const p = raw[planet];
    if (!p) continue;
    result.push({
      planet: planet as PlanetName,
      gate: p.Gate,
      line: p.Line,
      color: p.Color,
      tone: p.Tone,
      base: p.Base,
      fixingState: p.FixingState,
    });
  }
  return result;
}

function mapResponseToChart(
  raw: MybodygraphResponse,
  args: GetChartArgs
): Chart {
  const personality = mapPlanets(raw.Personality);
  const design = mapPlanets(raw.Design);

  const personalityGates = new Set(personality.map((a) => a.gate));
  const designGates = new Set(design.map((a) => a.gate));

  const channels: Channel[] = raw.Channels.map((raw) => {
    const { id, gates } = normalizeChannelId(raw);
    const s1 = sidesForGate(gates[0], personalityGates, designGates);
    const s2 = sidesForGate(gates[1], personalityGates, designGates);
    return { id, gates, consciousness: consciousnessFromSides(s1, s2) };
  });

  const consciousCenters = new Set(
    raw.ConsciousCenters.map(normalizeCenterName).filter(
      (c): c is CenterName => c !== null
    )
  );
  const unconsciousCenters = new Set(
    raw.UnconsciousCenters.map(normalizeCenterName).filter(
      (c): c is CenterName => c !== null
    )
  );
  const definedSet = new Set(
    raw.DefinedCenters.map(normalizeCenterName).filter(
      (c): c is CenterName => c !== null
    )
  );

  const centers: Center[] = CENTERS.map((name) => {
    const defined = definedSet.has(name);
    let consciousness: CenterConsciousness;
    if (!defined) {
      consciousness = "open";
    } else {
      const isConscious = consciousCenters.has(name);
      const isUnconscious = unconsciousCenters.has(name);
      if (isConscious && isUnconscious) consciousness = "mixed";
      else if (isConscious) consciousness = "personality";
      else if (isUnconscious) consciousness = "design";
      else consciousness = "mixed"; // defined but not in either list → both sides
    }
    return { name, defined, consciousness };
  });

  const variables: Variables = {
    determination: {
      arrow: raw.Variables.Digestion,
      theme: raw.Properties.Digestion?.option ?? "",
    },
    environment: {
      arrow: raw.Variables.Environment,
      theme: raw.Properties.Environment?.option ?? "",
    },
    motivation: {
      arrow: raw.Variables.Awareness,
      theme: raw.Properties.Motivation?.option ?? "",
    } satisfies Variable,
    perspective: {
      arrow: raw.Variables.Perspective,
      theme: raw.Properties.Perspective?.option ?? "",
    },
    sense: raw.Properties.Sense?.option ?? "",
    designSense: raw.Properties.DesignSense?.option ?? "",
  };

  const personalitySun = personality.find((p) => p.planet === "Sun");
  const quarter = personalitySun
    ? QUARTER_BY_GATE[personalitySun.gate] ?? null
    : null;

  return {
    birth: {
      localDate: raw.Properties.BirthDateLocalStandard,
      utcDate: raw.Properties.BirthDateUtcStandard,
      designUtcDate: raw.Properties.DesignDateUtcStandard,
      timezone: args.timezone,
      locationQuery: args.locationQuery,
      latitude: args.latitude,
      longitude: args.longitude,
    },
    type: propertyOf(raw.Properties.Type),
    strategy: propertyOf(raw.Properties.Strategy),
    authority: propertyOf(raw.Properties.InnerAuthority),
    profile: propertyOf(raw.Properties.Profile),
    definition: propertyOf(raw.Properties.Definition),
    incarnationCross: propertyOf(raw.Properties.IncarnationCross),
    signature: propertyOf(raw.Properties.Signature),
    notSelfTheme: propertyOf(raw.Properties.NotSelfTheme),
    quarter,
    centers,
    channels,
    variables,
    activations: { personality, design },
    chartImageUrl: args.includeChartImage ? raw.ChartUrl : undefined,
  };
}
