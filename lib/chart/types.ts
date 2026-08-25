// Internal Chart type. Source-of-truth for chart data downstream of the
// mybodygraph wrapper. The wrapper is responsible for translating API field
// names into Kaycee's analysis vocabulary (see lib/mybodygraph.ts and
// docs/CONTEXT.md "Variable name mapping"). Nothing past lib/mybodygraph.ts
// should ever see the raw API field names.

export type Arrow = "left" | "right";
export type FixingState = "None" | "Exalted" | "Detriment";
export type Side = "personality" | "design";
export type ChannelConsciousness = "personality" | "design" | "mixed";
export type CenterConsciousness = ChannelConsciousness | "open";

export const CENTERS = [
  "head",
  "ajna",
  "throat",
  "g",
  "heart",
  "solar plexus",
  "sacral",
  "spleen",
  "root",
] as const;
export type CenterName = (typeof CENTERS)[number];

// Order matches Kaycee's session-reference convention. The first 13 are the
// standard planets in Ra's per-planet narrative order; Chiron and Lilith are
// included because the API returns them and Kaycee references them in some
// readings.
export const PLANET_ORDER = [
  "Sun",
  "Earth",
  "North Node",
  "South Node",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
  "Chiron",
  "Lilith",
] as const;
export type PlanetName = (typeof PLANET_ORDER)[number];

export interface PlanetActivation {
  planet: PlanetName;
  gate: number;
  line: number;
  color: number;
  tone: number;
  base: number;
  fixingState: FixingState;
}

export interface Center {
  name: CenterName;
  defined: boolean;
  // When a center is open, consciousness is "open". When defined, it reflects
  // whether the gates that define it activate from personality, design, or a
  // mix of both sides. The API exposes ConsciousCenters / UnconsciousCenters
  // which we collapse into this single field.
  consciousness: CenterConsciousness;
}

export interface Channel {
  // Normalized "lower-higher" gate id, e.g. "10-20". The API sometimes emits
  // "20 - 10" or "10-20"; the wrapper normalizes.
  id: string;
  gates: [number, number];
  consciousness: ChannelConsciousness;
}

// Each of the four variables in Kaycee's vocabulary. The `arrow` is the
// directional cue on the chart; the `theme` is the named PHS label
// (e.g. determination.theme = "Cold", environment.theme = "Kitchens").
export interface Variable {
  arrow: Arrow;
  theme: string;
}

export interface Variables {
  determination: Variable; // API arrow: Variables.Digestion, theme: Properties.Digestion
  environment: Variable;   // API arrow: Variables.Environment, theme: Properties.Environment
  motivation: Variable;    // API arrow: Variables.Awareness,   theme: Properties.Motivation
  perspective: Variable;   // API arrow: Variables.Perspective, theme: Properties.Perspective
  // Additional PHS labels Ra calls Sense (personality side) and Design Sense.
  // Kaycee uses these verbatim in session references.
  sense: string;
  designSense: string;
}

export interface ChartProperty {
  // Human-readable value, e.g. "Manifesting Generator", "4 / 6",
  // "Right Angle Cross of Eden (12/11 | 36/6)".
  value: string;
  // The API also bundles a short description per property. Kept for parity
  // with the API response but the report engine should rely on the Notion
  // library for narrative, not these strings.
  description: string;
}

export interface BirthInput {
  // ISO-8601 local-time string with timezone offset (e.g. "1983-06-17T06:29:00-06:00").
  localDate: string;
  // ISO-8601 UTC string (e.g. "1983-06-17T12:29:00+00:00").
  utcDate: string;
  // Design transit UTC, ~88 solar degrees before birth.
  designUtcDate: string;
  timezone: string;
  // Location query string the operator typed (e.g. "Ogden, Utah, United States").
  // Optional because callers can pass lat/long directly and skip the locations
  // helper.
  locationQuery?: string;
  latitude?: number;
  longitude?: number;
}

export interface Chart {
  birth: BirthInput;
  type: ChartProperty;
  strategy: ChartProperty;
  authority: ChartProperty;
  profile: ChartProperty;
  definition: ChartProperty;
  incarnationCross: ChartProperty;
  signature: ChartProperty;
  notSelfTheme: ChartProperty;
  // The HD geometric quarter (Initiation / Civilization / Duality / Mutation),
  // derived from the Personality Sun gate. Null if the gate falls outside the
  // known table (should never happen; null is a guardrail).
  quarter: string | null;

  centers: Center[];
  channels: Channel[];
  variables: Variables;
  activations: {
    personality: PlanetActivation[];
    design: PlanetActivation[];
  };

  // Optional SVG of the bodygraph for portal display, populated only when the
  // wrapper is called with { includeChartImage: true }.
  chartImageUrl?: string;

  // Inline branded (design=delphi) bodygraph SVG string, populated when the
  // wrapper is called with { brandedSvg: true } (or { includeChartImage: true }).
  // Used to render the transit sky / mandala / composite as a bodygraph image.
  // Both field names carry the same SVG; callers may read either.
  bodygraphSvg?: string;
  chartImageSvg?: string;
}
