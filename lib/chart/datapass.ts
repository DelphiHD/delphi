// Data Pass / Activation Filter
//
// Deterministic, pure-data emit. Given a Chart (from mybodygraph) and the
// synced HD chunks (with their structured metadata from Notion), produces the
// canonical structural facts every report should consume. Mirrors the
// "## Data Pass / Activation Filter" section of Kaycee's manual reference
// files: planetary activation tables, center status, hanging gates by center,
// channel listing, split-island detection, exact return dates.
//
// The output is the source of truth for chart structure. Reports MUST read
// centers/channels/circuits/quarters from here, never derive them from prose
// or guess.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Chart, PlanetActivation } from "@/lib/chart/types";
import type { Cycles } from "@/lib/chart/cycles";
import { computeCycles } from "@/lib/chart/cycles";
import { buildVariableHeader, type VariableName } from "@/lib/chart/variables";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CenterName =
  | "head" | "ajna" | "throat" | "g" | "heart"
  | "solar plexus" | "sacral" | "spleen" | "root";

export type CenterStatus = "defined" | "undefined" | "open";

export interface ActivationRow {
  planet: PlanetActivation["planet"];
  side: "personality" | "design";
  gate: number;
  line: number;
  color: number;
  tone: number;
  base: number;
  fixingState: PlanetActivation["fixingState"];
  centerName: string;        // "Heart" | "Throat" | ... resolved from the gate's Notion metadata
  channelStatus: string;     // "channel 21-45" | "hanging"
  channelName: string | null; // "21 - 45: The Channel of Money" if in a defined channel
}

export interface CenterEntry {
  name: string;                   // "Heart" | "Throat" | etc. (proper case, matches Notion)
  canonical: CenterName;          // lowercase canonical key
  status: CenterStatus;
  activatedGates: number[];       // gates from this chart that live in this center
  definedChannelIds: string[];    // channels in the chart that pass through this center
  hangingGates: number[];         // activated gates that don't form a complete channel
}

export interface ChannelEntry {
  id: string;                     // "21-45" (lower-higher gate)
  name: string;                   // "Money" or full Notion title
  centers: [string, string];      // ["Heart", "Throat"]
  channelType: string | null;     // "MANIFESTED" | "GENERATED" | "PROJECTED" | "MANIFESTING GENERATED"
  circuit: string | null;         // "Tribal: Ego"
  consciousness: "personality" | "design" | "mixed";
}

export interface IslandEntry {
  centers: string[];              // center names in this island
  channels: string[];             // channel ids forming the island
}

export interface SplitAnalysis {
  definitionLabel: string;        // "Single" | "Split (Simple)" | "Split (Wide)" | etc.
  islandCount: number;
  islands: IslandEntry[];
  bridgingGates: BridgingGate[];  // partner gates that, if activated by transit/another person, would bridge two islands
}

// One bridging opportunity: a partner gate (NOT in the chart) whose activation
// would close a channel with an already-activated hanging gate, joining two
// islands. The activated end of the bridge is the gate the client already has;
// the unactivated end is the partner gate Kaycee wants reported.
export interface BridgingGate {
  // The unactivated partner gate. This is what gets listed.
  partnerGate: number;
  // The center the partner gate lives in.
  partnerCenter: string;
  // The activated gate in the client's chart that the partner would complete.
  activatedGate: number;
  // The center the activated gate lives in.
  activatedCenter: string;
  // The channel id (lower-higher) that would form, e.g. "21-45".
  channelId: string;
}

export interface DataPass {
  client: { name: string };
  birth: {
    localDate: string;
    utcDate: string;
    designUtcDate: string;
    timezone: string;
    place: string | undefined;
  };

  // Top-level chart properties (verbatim from mybodygraph).
  type: string;
  strategy: string;
  authority: string;
  profile: string;
  definition: string;
  incarnationCross: string;
  quarter: string | null;
  signature: string;
  notSelfTheme: string;

  // Activation tables.
  personalityActivations: ActivationRow[];
  designActivations: ActivationRow[];

  // Aggregates.
  uniqueGates: number[];
  doubleActivations: { gate: number; activations: string[] }[]; // human-readable list per gate

  // Canonical names for each activated gate. The hexagram name (e.g.
  // "Gathering Together" for Gate 45) is what appears in bullet headers
  // and centered-block labels — it's the gate's primary identity. The
  // keynote (e.g. "The Gate of the Gatherer") is the role/archetype
  // name; it may show up in prose when the wording reinforces a point,
  // but never substitutes for the hexagram name in a heading.
  gateNames: Record<number, { hexagram: string; keynote: string | null }>;

  lineDistribution: { line: number; count: number; pct: number }[];
  centerDistribution: { name: string; status: CenterStatus; gates: number[]; activationCount: number }[];
  circuitDistribution: { circuit: string; gates: number[]; activationCount: number; pct: number }[];

  // Per-element entries with full structured detail.
  centers: CenterEntry[];
  channels: ChannelEntry[];
  hangingGatesByCenter: { center: string; gates: { gate: number; activations: string[] }[] }[];

  // Split / island analysis.
  split: SplitAnalysis;

  // Exact return dates.
  cycles: Cycles;

  // ── Variables (PHS / cognitive code) ──────────────────────────────────────
  // Computed once from chart geometry. The Foundation prompt injects the
  // pre-built H2 headers verbatim; the validator confirms the rendered report
  // contains them word-for-word. Never let the model guess these.
  variableSources: {
    determination: VariableSource;
    environment: VariableSource;
    motivation: VariableSource;
    perspective: VariableSource;
  };
  variableHeaders: {
    determination: string;
    environment: string;
    motivation: string;
    perspective: string;
  };
  // 4-arrow cognitive code, e.g. "PLR DRR" — P{Motivation}{Perspective} D{Determination}{Environment}.
  cognitiveCode: string;

  // Structural justification for THIS chart's Type. Deterministic, computed
  // from the centers + channels + island analysis. Injected into the prompt
  // verbatim so the model can't pattern-match Gate 34 (or any other gate)
  // into a Type the chart doesn't actually have.
  typeJustification: string;

  // Audit warnings: cases where the metadata didn't resolve cleanly.
  warnings: string[];
}

// The source-planet position that drives one of the four variables.
export interface VariableSource {
  variable: VariableName;
  arrow: "left" | "right";
  colorNumber: number;
  toneNumber: number;
  baseNumber: number;
  sourcePlanet: "Personality Sun" | "Personality North Node" | "Design Sun" | "Design North Node";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CANONICAL_CENTER_BY_LOWER: Record<string, CenterName> = {
  "head": "head",
  "ajna": "ajna",
  "throat": "throat",
  "g": "g",
  "g center": "g",
  "heart": "heart",
  "ego": "heart",            // some Notion titles use "Ego (Heart, Will)"
  "ego (heart, will)": "heart",
  "solar plexus": "solar plexus",
  "solar plexus (emotional)": "solar plexus",
  "sacral": "sacral",
  "spleen": "spleen",
  "splenic": "spleen",
  "root": "root",
};

function canonicalCenter(name: string): CenterName | null {
  const k = name.trim().toLowerCase();
  if (k in CANONICAL_CENTER_BY_LOWER) return CANONICAL_CENTER_BY_LOWER[k];
  // Try matching by prefix word.
  for (const prefix of Object.keys(CANONICAL_CENTER_BY_LOWER)) {
    if (k.startsWith(prefix)) return CANONICAL_CENTER_BY_LOWER[prefix];
  }
  return null;
}

// Presentation form for center names in reports. Notion stores forms like
// "Ego (Heart, Will)" and "G (Identity)" that leak into placement headers;
// Kaycee's spec is to display only the canonical short name. Maps the
// canonical lowercase key to the user-facing display form.
const CENTER_DISPLAY: Record<CenterName, string> = {
  "head": "Head",
  "ajna": "Ajna",
  "throat": "Throat",
  "g": "G",
  "heart": "Heart",
  "solar plexus": "Solar Plexus",
  "sacral": "Sacral",
  "spleen": "Spleen",
  "root": "Root",
};

function centerDisplayName(rawName: string): string {
  const canonical = canonicalCenter(rawName);
  return canonical ? CENTER_DISPLAY[canonical] : rawName;
}

// Side abbreviation for activation list strings.
function sideAbbr(side: "personality" | "design"): string {
  return side === "personality" ? "P" : "D";
}

function formatActivationDescriptor(a: ActivationRow): string {
  const fix = a.fixingState === "Exalted" ? " Exalted"
            : a.fixingState === "Detriment" ? " Detriment"
            : "";
  return `${sideAbbr(a.side)} ${a.planet} ${a.gate}.${a.line}${fix}`;
}

// ─── Main entry: build the Data Pass from chart + structured chunks ─────────

interface GateMetadata {
  gateNumber: number;
  title: string;
  centerName: string | null;
  channelTitles: { id: string; title: string }[]; // resolved channel relations
  channelPartnerGates: number[];                  // resolved gate numbers
  quarter: string | null;
  circuit: string | null;
  keynote: string | null;
}

interface ChannelMetadata {
  notionPageId: string;
  title: string;
  gateNumbers: [number, number];
  centerNames: [string, string];
  channelType: string | null;
  circuit: string | null;
  keynote: string | null;
}

type RelationLink = { id: string; title?: string | null; kind?: string | null };

function parseGateNumberFromTitle(title: string): number | null {
  const m = title.match(/^(\d+)\b/);
  return m ? parseInt(m[1], 10) : null;
}

function asRelationArray(v: unknown): RelationLink[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is RelationLink => !!x && typeof x === "object");
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

async function fetchChunkMetadata(
  supabase: SupabaseClient,
): Promise<{ gates: Map<number, GateMetadata>; channels: Map<string, ChannelMetadata>; warnings: string[] }> {
  const warnings: string[] = [];

  // Gates.
  const { data: gateRows, error: gateErr } = await supabase
    .from("chunks")
    .select("notion_page_id, gate_number, title, metadata")
    .eq("source_kind", "gate");
  if (gateErr) throw gateErr;

  const gates = new Map<number, GateMetadata>();
  for (const row of gateRows ?? []) {
    if (row.gate_number == null) continue;
    const m = (row.metadata ?? {}) as Record<string, unknown>;
    const centerRel = asRelationArray(m["Center"]);
    const channelRel = asRelationArray(m["Channel"]);
    const partnerRel = asRelationArray(m["Channel Partner Gate"]);
    const quarter = asString(m["Quarter"]);
    const circuitRel = asRelationArray(m["Human Design Circuits"]);
    const keynote = asString(m["Keynote"]);

    gates.set(row.gate_number, {
      gateNumber: row.gate_number,
      title: row.title,
      centerName: centerRel[0]?.title ?? null,
      channelTitles: channelRel.map((r) => ({ id: r.id, title: r.title ?? "" })),
      channelPartnerGates: partnerRel
        .map((r) => (r.title ? parseGateNumberFromTitle(r.title) : null))
        .filter((n): n is number => n !== null),
      quarter,
      circuit: circuitRel[0]?.title ?? null,
      keynote,
    });
  }

  // Channels.
  const { data: channelRows, error: channelErr } = await supabase
    .from("chunks")
    .select("notion_page_id, title, metadata")
    .eq("source_kind", "channel");
  if (channelErr) throw channelErr;

  const channels = new Map<string, ChannelMetadata>();
  for (const row of channelRows ?? []) {
    const m = (row.metadata ?? {}) as Record<string, unknown>;
    const gatesRel = asRelationArray(m["Gates"]);
    const gateNumbers = gatesRel
      .map((r) => (r.title ? parseGateNumberFromTitle(r.title) : null))
      .filter((n): n is number => n !== null);
    if (gateNumbers.length !== 2) {
      warnings.push(`channel "${row.title}" has ${gateNumbers.length} gate relations; expected 2`);
      continue;
    }
    const [lo, hi] = gateNumbers.sort((a, b) => a - b);
    const centersRel = asRelationArray(m["Centers"]);
    const centerNames = centersRel.map((r) => r.title ?? "").filter(Boolean);
    if (centerNames.length !== 2) {
      warnings.push(`channel "${row.title}" has ${centerNames.length} center relations; expected 2`);
    }
    const channelType = asString(m["Channel Type"]);
    const circuitRel = asRelationArray(m["Circuit"]);

    channels.set(`${lo}-${hi}`, {
      notionPageId: row.notion_page_id,
      title: row.title,
      gateNumbers: [lo, hi],
      centerNames: [centerNames[0] ?? "?", centerNames[1] ?? "?"],
      channelType,
      circuit: circuitRel[0]?.title ?? null,
      keynote: asString(m["Keynote"]),
    });
  }

  return { gates, channels, warnings };
}

// The standard 13 HD planets per side. Chiron and Lilith are returned by
// mybodygraph because they're real points in the birth chart, but they DO
// NOT define anything on the Human Design bodygraph. Per Kaycee, 2026-05-19:
// "The placements are valid in the birth chart, but these placements DO NOT
// define anything on the human design bodygraph so we don't include them in
// the reports. The official reasoning behind that is that these are not
// astrological bodies that have a significant neutrino imprint so they
// can't define anything in a human design sense. They will be relevant if
// we start branching out into astrology products, but not here."
//
// So: every consumer of activations — activation tables, Center
// Distribution, uniqueGates, bridging-gate analysis, hanging gates — must
// filter by this set. Skipping the filter in any one of those produces a
// gate that "exists" for one purpose (e.g. bridging) but doesn't appear
// anywhere else in the report, which is what surfaced as the phantom
// "Gate 37" in Tennyson v7.
const STANDARD_PLANETS = new Set([
  "Sun", "Earth", "North Node", "South Node", "Moon",
  "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
  "Uranus", "Neptune", "Pluto",
]);

// Compute Personality + Design activation rows by joining chart activations
// with structured gate metadata.
function buildActivationRows(
  chart: Chart,
  gates: Map<number, GateMetadata>,
  activeChannelIds: Set<string>,
  warnings: string[],
): { personality: ActivationRow[]; design: ActivationRow[] } {
  function buildRow(
    p: PlanetActivation,
    side: "personality" | "design",
  ): ActivationRow {
    const meta = gates.get(p.gate);
    if (!meta) {
      warnings.push(`no gate metadata for gate ${p.gate} (${side} ${p.planet})`);
    }
    // Use the display form for the center name ("Heart" not "Ego (Heart,
    // Will)", "G" not "G (Identity)"). The canonical-key lookup elsewhere
    // in the data pass uses canonicalCenter() which still tolerates the
    // raw Notion form, so this normalization is safe.
    const centerName = meta?.centerName ? centerDisplayName(meta.centerName) : "?";

    // Find which channel (if any) this gate is participating in among the
    // chart's defined channels. A gate's channel partner is in gate.channels;
    // we cross-reference with active channels.
    let channelStatus = "hanging";
    let channelName: string | null = null;
    const partners = meta?.channelPartnerGates ?? [];
    for (const partnerGate of partners) {
      const [lo, hi] = [Math.min(p.gate, partnerGate), Math.max(p.gate, partnerGate)];
      const id = `${lo}-${hi}`;
      if (activeChannelIds.has(id)) {
        channelStatus = `in ${id}`;
        // Find the matching channel meta for the name.
        const chMeta = meta?.channelTitles.find((c) => c.title?.includes(`${lo}`) && c.title?.includes(`${hi}`));
        channelName = chMeta?.title ?? null;
        break;
      }
    }

    return {
      planet: p.planet,
      side,
      gate: p.gate,
      line: p.line,
      color: p.color,
      tone: p.tone,
      base: p.base,
      fixingState: p.fixingState,
      centerName,
      channelStatus,
      channelName,
    };
  }

  return {
    personality: chart.activations.personality
      .filter((p) => STANDARD_PLANETS.has(p.planet))
      .map((p) => buildRow(p, "personality")),
    design: chart.activations.design
      .filter((p) => STANDARD_PLANETS.has(p.planet))
      .map((p) => buildRow(p, "design")),
  };
}

// Detect split definition by graph-walking defined centers connected via
// defined channels. Returns the islands, the bridging gates (gates that
// belong to channels which would connect two islands if activated), and a
// human-readable definition label.
function analyzeSplit(
  chart: Chart,
  channels: Map<string, ChannelMetadata>,
  gates: Map<number, GateMetadata>,
): SplitAnalysis {
  // Build a set of defined centers and the adjacency map between them.
  const definedCenters = new Set(
    chart.centers
      .filter((c) => c.defined)
      .map((c) => canonicalCenter(c.name))
      .filter((c): c is CenterName => c !== null),
  );
  const activeChannelIds = new Set(chart.channels.map((c) => c.id));

  // Adjacency: center -> set of other defined centers it connects to.
  const adj = new Map<CenterName, Set<CenterName>>();
  for (const c of definedCenters) adj.set(c, new Set());

  for (const chId of activeChannelIds) {
    const meta = channels.get(chId);
    if (!meta) continue;
    const [ca, cb] = meta.centerNames.map(canonicalCenter);
    if (!ca || !cb) continue;
    if (!definedCenters.has(ca) || !definedCenters.has(cb)) continue;
    adj.get(ca)!.add(cb);
    adj.get(cb)!.add(ca);
  }

  // Connected components.
  const visited = new Set<CenterName>();
  const islandRaw: CenterName[][] = [];
  for (const start of definedCenters) {
    if (visited.has(start)) continue;
    const stack = [start];
    const component: CenterName[] = [];
    while (stack.length) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      component.push(cur);
      for (const n of adj.get(cur) ?? []) {
        if (!visited.has(n)) stack.push(n);
      }
    }
    islandRaw.push(component.sort());
  }

  // Map island centers -> proper case from chart.centers.
  const properName = new Map<CenterName, string>();
  for (const c of chart.centers) {
    const k = canonicalCenter(c.name);
    if (k) properName.set(k, c.name);
  }

  // Compute which channels (by id) are inside each island.
  const islands: IslandEntry[] = islandRaw.map((centers) => {
    const centersSet = new Set(centers);
    const includedChannels: string[] = [];
    for (const chId of activeChannelIds) {
      const meta = channels.get(chId);
      if (!meta) continue;
      const [a, b] = meta.centerNames.map(canonicalCenter);
      if (a && b && centersSet.has(a) && centersSet.has(b)) {
        includedChannels.push(chId);
      }
    }
    return {
      centers: centers.map((c) => properName.get(c) ?? c),
      channels: includedChannels,
    };
  });

  // Bridging gates: each entry is a PARTNER gate (NOT in the chart) whose
  // activation would close a channel with one of the client's hanging gates
  // and join two islands. Kaycee wants the unactivated partner reported —
  // that's the gate someone would carry to "bridge" the client's splits, or
  // that a transit would deliver to temporarily collapse them.
  const bridging: BridgingGate[] = [];
  if (islands.length > 1) {
    const islandIdOfCenter = new Map<CenterName, number>();
    for (let i = 0; i < islandRaw.length; i++) {
      for (const c of islandRaw[i]) islandIdOfCenter.set(c, i);
    }
    // Build the set of activated gates from the STANDARD 13 planets only.
    // mybodygraph also returns Chiron and Lilith, but the rest of the Data
    // Pass (activation tables, Center Distribution, uniqueGates) filters
    // those out. The bridging-gate analysis must use the same filter, or
    // it'll report a gate as "activated" that doesn't appear anywhere else
    // in the report.
    const activatedGates = new Set<number>();
    for (const p of [...chart.activations.personality, ...chart.activations.design]) {
      if (!STANDARD_PLANETS.has(p.planet)) continue;
      activatedGates.add(p.gate);
    }
    // Iterate every activated gate (don't skip gates already in defined
    // channels — Integration-circuit gates 10/20/34/57 are partner-rich:
    // Gate 34 sits in the 34-57 defined channel AND has unactivated
    // partners 10 and 20 that would form NEW channels bridging the
    // islands. Old version skipped Gate 34 entirely when ANY of its
    // partners were activated; now we evaluate each partner individually.
    const seen = new Set<string>();
    for (const g of activatedGates) {
      const meta = gates.get(g);
      if (!meta) continue;
      const myCenter = meta.centerName ? canonicalCenter(meta.centerName) : null;
      if (!myCenter) continue;
      const myIsland = islandIdOfCenter.get(myCenter);
      if (myIsland === undefined) continue;

      for (const pg of meta.channelPartnerGates) {
        // Skip activated partners — the channel they form is already
        // defined in the chart (so not a "bridging" opportunity), or the
        // partner sits in the same island.
        if (activatedGates.has(pg)) continue;
        // Defensive: skip if this specific channel is somehow already
        // active (shouldn't happen since pg is unactivated).
        const [lo0, hi0] = [Math.min(g, pg), Math.max(g, pg)];
        if (activeChannelIds.has(`${lo0}-${hi0}`)) continue;
        const pgMeta = gates.get(pg);
        if (!pgMeta?.centerName) continue;
        const pgCenter = canonicalCenter(pgMeta.centerName);
        if (!pgCenter) continue;
        const pgIsland = islandIdOfCenter.get(pgCenter);
        // The partner's center may not be in any island (open center). That
        // still counts as a bridge IF activating the partner would also pull
        // its center into definition — which it does (one channel always
        // defines both endpoints). For now we require the partner's center to
        // be in a different defined island; this is the strict case Kaycee
        // wants reported first.
        if (pgIsland !== undefined && pgIsland !== myIsland) {
          const [lo, hi] = [Math.min(g, pg), Math.max(g, pg)];
          const key = `${pg}|${g}`;
          if (seen.has(key)) continue;
          seen.add(key);
          bridging.push({
            partnerGate: pg,
            partnerCenter: pgMeta.centerName,
            activatedGate: g,
            activatedCenter: meta.centerName ?? "?",
            channelId: `${lo}-${hi}`,
          });
        }
      }
    }
  }

  // Definition label is whatever mybodygraph reports it as. We don't try to
  // refine "Split Definition" into Simple vs Wide ourselves; that's a HD
  // distinction Kaycee can make based on the bridging-gate list below.
  return {
    definitionLabel: chart.definition.value,
    islandCount: islands.length,
    islands,
    bridgingGates: bridging.sort((a, b) => a.partnerGate - b.partnerGate),
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

// Raised when the data pass detects state that would produce a garbage report:
// empty Notion metadata, unresolved chart channels, or singleton "islands"
// (one per defined center) — the failure signature of a broken sync. Callers
// should surface these as fatal errors BEFORE any LLM call is made.
export class DataPassIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataPassIntegrityError";
  }
}

export async function buildDataPass(args: {
  supabase: SupabaseClient;
  client: { name: string };
  chart: Chart;
  nowUtcIso?: string;
}): Promise<DataPass> {
  const { supabase, client, chart } = args;
  const warnings: string[] = [];

  const { gates, channels, warnings: metaWarnings } = await fetchChunkMetadata(supabase);
  warnings.push(...metaWarnings);

  // ─── Sanity check #1: metadata populated at all ───────────────────────────
  // If ALL 36 channels or ALL 64 gates have empty metadata, the Notion sync
  // never populated the metadata JSON column (as happened 2026-07 after a
  // silent-fail resync). Every downstream feature — island counting, hanging
  // gates, bridging analysis, per-activation center resolution — will be
  // wrong. Refuse to build the pass rather than let a bad report ship.
  if (channels.size === 0) {
    throw new DataPassIntegrityError(
      "Channel metadata is empty (0 of 36 channels loaded). The Notion sync populated bodies but not metadata. Run: npx tsx scripts/sync-notion.ts",
    );
  }
  if (gates.size === 0) {
    throw new DataPassIntegrityError(
      "Gate metadata is empty (0 of 64 gates loaded). The Notion sync populated bodies but not metadata. Run: npx tsx scripts/sync-notion.ts",
    );
  }

  // ─── Sanity check #2: every chart channel resolves ────────────────────────
  // If ANY of the client's defined channels is missing from the metadata map,
  // the graph-walking will silently drop that edge and the island count will
  // be inflated. Refuse rather than emit misleading data.
  const unresolved = chart.channels.filter((ch) => !channels.get(ch.id));
  if (unresolved.length > 0) {
    throw new DataPassIntegrityError(
      `${unresolved.length} of this chart's ${chart.channels.length} defined channel(s) have no metadata row: ${unresolved.map((c) => c.id).join(", ")}. The metadata for those channels is missing or malformed in Notion. Fix in Notion, then re-run: npx tsx scripts/sync-notion.ts`,
    );
  }

  const activeChannelIds = new Set(chart.channels.map((c) => c.id));

  // Activations.
  const { personality, design } = buildActivationRows(chart, gates, activeChannelIds, warnings);

  // Unique gates + double activations.
  const allActivations = [...personality, ...design];
  const gateOccurrences = new Map<number, ActivationRow[]>();
  for (const a of allActivations) {
    if (!gateOccurrences.has(a.gate)) gateOccurrences.set(a.gate, []);
    gateOccurrences.get(a.gate)!.push(a);
  }
  const uniqueGates = [...gateOccurrences.keys()].sort((a, b) => a - b);

  // Canonical gate names. The chunk's title is "<num>: <Hexagram Name>"
  // (e.g. "45: Gathering Together"). Strip the prefix to get the hexagram
  // name proper. The keynote ("The Gate of the Gatherer") is the role
  // archetype, separate.
  function stripGatePrefix(title: string): string {
    return title.replace(/^\s*\d+\s*[:\-]\s*/, "").trim();
  }
  const gateNames: Record<number, { hexagram: string; keynote: string | null }> = {};
  for (const g of uniqueGates) {
    const meta = gates.get(g);
    gateNames[g] = {
      hexagram: meta ? stripGatePrefix(meta.title) : "(unknown)",
      keynote: meta?.keynote ?? null,
    };
  }
  const doubleActivations = uniqueGates
    .filter((g) => (gateOccurrences.get(g)?.length ?? 0) > 1)
    .map((g) => ({
      gate: g,
      activations: gateOccurrences.get(g)!.map(formatActivationDescriptor),
    }));

  // Line distribution.
  const lineCounts = new Map<number, number>();
  for (const a of allActivations) lineCounts.set(a.line, (lineCounts.get(a.line) ?? 0) + 1);
  const total = allActivations.length;
  const lineDistribution = [...lineCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([line, count]) => ({ line, count, pct: total > 0 ? (count / total) * 100 : 0 }));

  // Center entries with strict status.
  // - defined  = chart says center is defined (has at least one full channel passing through it)
  // - undefined = at least one activated gate in the center, but no full channel — i.e. only hanging gates
  // - open      = no activated gates in the center at all
  const centerEntries: CenterEntry[] = chart.centers.map((c) => {
    const canonical = canonicalCenter(c.name);
    const activatedGates = uniqueGates.filter((g) => {
      const meta = gates.get(g);
      const k = meta?.centerName ? canonicalCenter(meta.centerName) : null;
      return k !== null && k === canonical;
    });
    const definedChannelIds = chart.channels.filter((ch) => {
      const meta = channels.get(ch.id);
      if (!meta) return false;
      return meta.centerNames.some((n) => canonicalCenter(n) === canonical);
    }).map((ch) => ch.id);
    const hangingGates = activatedGates.filter((g) => {
      const meta = gates.get(g);
      const inDefinedChannel = (meta?.channelPartnerGates ?? []).some((pg) => {
        const [lo, hi] = [Math.min(g, pg), Math.max(g, pg)];
        return activeChannelIds.has(`${lo}-${hi}`);
      });
      return !inDefinedChannel;
    });

    let status: CenterStatus;
    if (c.defined) status = "defined";
    else if (activatedGates.length === 0) status = "open";
    else status = "undefined";

    return {
      name: c.name,
      canonical: canonical ?? "head", // shouldn't fail; "head" as a safe default
      status,
      activatedGates,
      definedChannelIds,
      hangingGates,
    };
  });

  // Center distribution table (for back-compat with manual data-pass shape).
  const centerDistribution = centerEntries.map((c) => ({
    name: c.name,
    status: c.status,
    gates: c.activatedGates,
    activationCount: allActivations.filter((a) => canonicalCenter(a.centerName) === c.canonical).length,
  }));

  // Circuit distribution.
  const circuitCounts = new Map<string, { gates: Set<number>; count: number }>();
  for (const a of allActivations) {
    const meta = gates.get(a.gate);
    const circuit = meta?.circuit ?? "(unknown)";
    if (!circuitCounts.has(circuit)) circuitCounts.set(circuit, { gates: new Set(), count: 0 });
    const e = circuitCounts.get(circuit)!;
    e.gates.add(a.gate);
    e.count += 1;
  }
  const circuitDistribution = [...circuitCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([circuit, e]) => ({
      circuit,
      gates: [...e.gates].sort((a, b) => a - b),
      activationCount: e.count,
      pct: total > 0 ? (e.count / total) * 100 : 0,
    }));

  // Hanging gates organized by center.
  const hangingGatesByCenter = centerEntries
    .filter((c) => c.hangingGates.length > 0)
    .map((c) => ({
      center: c.name,
      gates: c.hangingGates.map((g) => ({
        gate: g,
        activations: allActivations
          .filter((a) => a.gate === g)
          .map(formatActivationDescriptor),
      })),
    }));

  // Channel entries: enrich each chart channel with structured metadata.
  const channelEntries: ChannelEntry[] = chart.channels.map((ch) => {
    const meta = channels.get(ch.id);
    if (!meta) {
      warnings.push(`no channel metadata for ${ch.id}`);
      return {
        id: ch.id,
        name: ch.id,
        centers: ["?", "?"],
        channelType: null,
        circuit: null,
        consciousness: ch.consciousness === "mixed" ? "mixed" : ch.consciousness,
      };
    }
    return {
      id: ch.id,
      name: meta.title.replace(/^\s*\d+\s*-\s*\d+:\s*/, "").trim() || meta.title,
      centers: meta.centerNames as [string, string],
      channelType: meta.channelType,
      circuit: meta.circuit,
      consciousness: ch.consciousness === "mixed" ? "mixed" : ch.consciousness,
    };
  });

  // Split analysis.
  const split = analyzeSplit(chart, channels, gates);

  // ─── Sanity check #3: island count reflects channel connectivity ─────────
  // If the chart has at least one channel AND every defined center is its
  // own singleton "island", the graph-walking added zero edges — the same
  // failure signature as an empty metadata map. This is an assertion of last
  // resort: if #1 and #2 pass but the split still looks like singletons,
  // something subtler is broken (e.g. center-name mismatch). Fail loud.
  const definedCenterCount = chart.centers.filter((c) => c.defined).length;
  if (
    chart.channels.length > 0 &&
    definedCenterCount > 1 &&
    split.islandCount === definedCenterCount
  ) {
    throw new DataPassIntegrityError(
      `Island count (${split.islandCount}) equals defined-center count (${definedCenterCount}) with ${chart.channels.length} defined channel(s). This means channel edges are not being added to the connectivity graph — the split analysis will be wrong. Likely cause: center-name mismatch between chart.centers and channel metadata.`,
    );
  }

  // Cycles (exact returns).
  const cycles = await computeCycles(chart.birth.utcDate, args.nowUtcIso);

  // Variables: pull the source planets and compute the canonical H2 headers.
  // Determination ← Design Sun, Environment ← Design North Node,
  // Motivation ← Personality Sun, Perspective ← Personality North Node.
  const dSun = chart.activations.design.find((p) => p.planet === "Sun");
  const dNorth = chart.activations.design.find((p) => p.planet === "North Node");
  const pSun = chart.activations.personality.find((p) => p.planet === "Sun");
  const pNorth = chart.activations.personality.find((p) => p.planet === "North Node");

  function sourceOf(variable: VariableName, arrow: "left" | "right", planet: PlanetActivation | undefined, label: VariableSource["sourcePlanet"]): VariableSource {
    if (!planet) {
      warnings.push(`variable ${variable}: source planet ${label} missing from chart activations`);
      return { variable, arrow, colorNumber: 1, toneNumber: 1, baseNumber: 1, sourcePlanet: label };
    }
    return { variable, arrow, colorNumber: planet.color, toneNumber: planet.tone, baseNumber: planet.base, sourcePlanet: label };
  }

  const variableSources = {
    determination: sourceOf("Determination", chart.variables.determination.arrow, dSun, "Design Sun"),
    environment:   sourceOf("Environment",   chart.variables.environment.arrow,   dNorth, "Design North Node"),
    motivation:    sourceOf("Motivation",    chart.variables.motivation.arrow,    pSun, "Personality Sun"),
    perspective:   sourceOf("Perspective",   chart.variables.perspective.arrow,   pNorth, "Personality North Node"),
  };

  const variableHeaders = {
    determination: buildVariableHeader({ variable: "Determination", colorNumber: variableSources.determination.colorNumber, toneNumber: variableSources.determination.toneNumber, arrow: variableSources.determination.arrow }),
    environment:   buildVariableHeader({ variable: "Environment",   colorNumber: variableSources.environment.colorNumber,   toneNumber: variableSources.environment.toneNumber,   arrow: variableSources.environment.arrow }),
    motivation:    buildVariableHeader({ variable: "Motivation",    colorNumber: variableSources.motivation.colorNumber,    toneNumber: variableSources.motivation.toneNumber,    arrow: variableSources.motivation.arrow }),
    perspective:   buildVariableHeader({ variable: "Perspective",   colorNumber: variableSources.perspective.colorNumber,   toneNumber: variableSources.perspective.toneNumber,   arrow: variableSources.perspective.arrow }),
  };

  // Cognitive code: P{Motivation}{Perspective} D{Determination}{Environment},
  // with L/R for the arrow. Matches the title encoding in the HD Variables
  // Notion database (e.g. "PLR DRR").
  const arrowLetter = (a: "left" | "right") => a === "left" ? "L" : "R";
  const cognitiveCode =
    `P${arrowLetter(variableSources.motivation.arrow)}${arrowLetter(variableSources.perspective.arrow)} ` +
    `D${arrowLetter(variableSources.determination.arrow)}${arrowLetter(variableSources.environment.arrow)}`;

  // Type Justification: deterministic structural explanation of WHY this
  // chart is the Type it is. Computed from defined centers + channels —
  // the same source the Type itself is derived from. The model reads this
  // verbatim and uses it to anchor against pattern-match drift like
  // "Gate 34 → Manifesting Generator" or "Channel 21-45 → Manifestor."
  function buildTypeJustification(): string {
    const sacralEntry = centerEntries.find((c) => c.canonical === "sacral");
    const throatEntry = centerEntries.find((c) => c.canonical === "throat");
    const heartEntry = centerEntries.find((c) => c.canonical === "heart");
    const spEntry = centerEntries.find((c) => c.canonical === "solar plexus");
    const rootEntry = centerEntries.find((c) => c.canonical === "root");
    const sacralDefined = sacralEntry?.status === "defined";
    const throatDefined = throatEntry?.status === "defined";
    const heartDefined = heartEntry?.status === "defined";
    const spDefined = spEntry?.status === "defined";
    const rootDefined = rootEntry?.status === "defined";
    const anyDefined = centerEntries.some((c) => c.status === "defined");

    // Use the island structure to determine connectivity: which centers
    // sit in the same defined-channel-connected component as which?
    const islandIdOf = new Map<string, number>();
    for (let i = 0; i < split.islands.length; i++) {
      for (const cn of split.islands[i].centers) {
        const k = canonicalCenter(cn);
        if (k) islandIdOf.set(k, i);
      }
    }
    const sacralIsland = islandIdOf.get("sacral");
    const throatIsland = islandIdOf.get("throat");
    const heartIsland = islandIdOf.get("heart");
    const spIsland = islandIdOf.get("solar plexus");
    const rootIsland = islandIdOf.get("root");
    const sacralToThroat = sacralDefined && throatDefined && sacralIsland !== undefined && sacralIsland === throatIsland;
    const motorToThroat =
      (heartDefined && throatDefined && heartIsland !== undefined && heartIsland === throatIsland) ||
      (spDefined    && throatDefined && spIsland !== undefined && spIsland === throatIsland) ||
      (rootDefined  && throatDefined && rootIsland !== undefined && rootIsland === throatIsland) ||
      sacralToThroat;

    const lines: string[] = [];
    lines.push(`Type: **${chart.type.value}**`);
    lines.push("");

    if (chart.type.value === "Reflector") {
      lines.push(`Why this Type: zero defined centers. All nine centers are open or undefined. Reflector status is determined by complete openness; no other Type can be assigned to a chart with no defined centers.`);
    } else if (chart.type.value === "Projector") {
      lines.push(`Why this Type: BOTH conditions must hold for Projector — (1) the Sacral is NOT defined, AND (2) no motor center connects to the Throat. This chart meets both.`);
      lines.push(`Sacral: ${sacralDefined ? "DEFINED — would make this a Generator or Manifesting Generator, contradiction" : "NOT defined ✓"}.`);
      lines.push(`Motor centers (Heart, Solar Plexus, Root): Heart is ${heartDefined ? "defined" : "not defined"}; Solar Plexus is ${spDefined ? "defined" : "not defined"}; Root is ${rootDefined ? "defined" : "not defined"}. Throat is ${throatDefined ? "defined" : "not defined"}.`);
      lines.push(`Motor-to-Throat path: NONE in this chart. ${heartDefined ? "Heart is defined but does not reach Throat through a defined channel chain. " : ""}${spDefined ? "Solar Plexus is defined but does not reach Throat through a defined channel chain. " : ""}${rootDefined ? "Root is defined but does not reach Throat through a defined channel chain. " : ""}If any of those motors DID reach the Throat, the chart would be a Manifestor instead.`);
      lines.push(`A Projector is the chart Type for any human design with at least one defined center where the Sacral is not defined AND no other motor connects to the Throat.`);
    } else if (chart.type.value === "Manifestor") {
      lines.push(`Why this Type: a non-Sacral motor (Heart, Solar Plexus, or Root) connects directly to the Throat, AND the Sacral is NOT defined.`);
      lines.push(`Sacral: ${sacralDefined ? "DEFINED — would make this a Generator or MG, contradiction" : "NOT defined ✓"}.`);
      if (heartDefined && throatDefined && heartIsland === throatIsland) lines.push(`Heart ↔ Throat: connected through a defined channel in the same island ✓.`);
      if (spDefined && throatDefined && spIsland === throatIsland) lines.push(`Solar Plexus ↔ Throat: connected through a defined channel in the same island ✓.`);
      if (rootDefined && throatDefined && rootIsland === throatIsland) lines.push(`Root ↔ Throat: connected through a defined channel in the same island ✓.`);
    } else if (chart.type.value === "Generator") {
      lines.push(`Why this Type: defined Sacral, but NO motor connected to the Throat. None of the four motors (Sacral, Heart, Solar Plexus, Root) reaches the Throat through any chain of defined channels in this chart — that absence is what makes it a pure Generator rather than a Manifesting Generator.`);
      lines.push(`Sacral: ${sacralDefined ? "DEFINED ✓" : "NOT defined (would make this not a Generator)"}.`);
      lines.push(`Motor-to-Throat path: NONE. Sacral is in island ${sacralIsland !== undefined ? sacralIsland + 1 : "(undefined)"}; Throat is in island ${throatIsland !== undefined ? throatIsland + 1 : "(undefined / not defined)"}; no other defined motor shares the Throat's island either.`);
      // Pattern-match trap notes — added per-gate when the chart has the
      // gate that triggers the trap. Paul v1 surfaced the Gate 34 trap.
      // Future traps can be added here as observed (e.g. Gate 20 in
      // Throat + Sacral via 34-20 in a half-defined chart, etc.).
      const hasGate34 = uniqueGates.includes(34);
      const hasGate20 = uniqueGates.includes(20);
      if (hasGate34) {
        lines.push(`Pattern-match trap (this chart has Gate 34): do NOT call this person a Manifesting Generator just because they have Gate 34 activated. Gate 34 alone is not enough. Gate 34 has to be in a DEFINED CHANNEL reaching the Throat (typically the 34-20 channel: Sacral to Throat directly) for the chart to be MG. In this chart, Gate 34 is NOT in a Sacral-to-Throat channel — the chart's actual Sacral channels are listed in the Channels table above.`);
      }
      if (hasGate20 && !hasGate34) {
        // Gate 20 in the Throat without 34 means MG via 20-34 is not the
        // path; check 20-57 (Brainwave, Throat-to-Spleen) instead.
        lines.push(`Pattern-match trap (this chart has Gate 20 in the Throat): the 20-34 channel is one of the classic Sacral-to-Throat paths that would make a chart Manifesting Generator. But the chart does NOT have Gate 34, so that channel cannot complete here. Type stays Generator.`);
      }
    } else if (chart.type.value === "Manifesting Generator") {
      // MG = defined Sacral AND at least one of the four motors (Sacral, Heart,
      // Solar Plexus, Root) reaches the Throat through any chain of defined
      // channels (same defined island). The connecting motor need NOT be the
      // Sacral — a chart is still MG when the Sacral is islanded elsewhere and a
      // different motor carries the Throat connection (e.g. Root → Spleen →
      // Throat). We report the actual connecting motor(s) rather than assuming
      // the Sacral, which was the bug that told the model to fabricate a
      // Sacral-to-Throat path.
      const motorsToThroat: string[] = [];
      if (sacralDefined && sacralIsland !== undefined && sacralIsland === throatIsland) motorsToThroat.push("Sacral");
      if (heartDefined && heartIsland !== undefined && heartIsland === throatIsland) motorsToThroat.push("Heart");
      if (spDefined && spIsland !== undefined && spIsland === throatIsland) motorsToThroat.push("Solar Plexus");
      if (rootDefined && rootIsland !== undefined && rootIsland === throatIsland) motorsToThroat.push("Root");
      lines.push(`Why this Type: defined Sacral AND at least one motor connected to the Throat through a chain of defined channels (in the same defined island). The connecting motor need NOT be the Sacral, and the path may run through several channels/centers.`);
      lines.push(`Sacral: ${sacralDefined ? "DEFINED ✓" : "NOT defined (contradiction)"}.`);
      lines.push(`Motor(s) reaching the Throat: ${motorsToThroat.length ? motorsToThroat.join(", ") : "(a motor — see the Channels table)"} — in the same defined island as the Throat.`);
      if (sacralIsland !== undefined && throatIsland !== undefined && sacralIsland !== throatIsland) {
        const others = motorsToThroat.filter((m) => m !== "Sacral");
        lines.push(`IMPORTANT — do NOT describe the Sacral as connecting to the Throat in this chart: the Sacral sits in island ${sacralIsland + 1} and the Throat in island ${throatIsland + 1}, so they are NOT connected. This chart is a Manifesting Generator because ${others.length ? others.join(", ") : "another motor"} reaches the Throat while the Sacral is separately defined. Describe the actual path, not a Sacral-to-Throat one.`);
      }
    } else {
      lines.push(`(Custom Type label: ${chart.type.value}. Verify against chart geometry manually.)`);
    }
    void anyDefined; void motorToThroat;

    lines.push("");
    lines.push(`Strategy: **${chart.strategy.value}**`);
    lines.push(`Authority: **${chart.authority.value}** (the body's decision-making mechanism — defined ${chart.authority.value.toLowerCase()} center, or lunar if no authority center is defined)`);
    return lines.join("\n");
  }
  const typeJustification = buildTypeJustification();

  return {
    client,
    birth: {
      localDate: chart.birth.localDate,
      utcDate: chart.birth.utcDate,
      designUtcDate: chart.birth.designUtcDate,
      timezone: chart.birth.timezone,
      place: chart.birth.locationQuery,
    },
    type: chart.type.value,
    strategy: chart.strategy.value,
    authority: chart.authority.value,
    profile: chart.profile.value,
    definition: chart.definition.value,
    incarnationCross: chart.incarnationCross.value,
    quarter: chart.quarter,
    signature: chart.signature.value,
    notSelfTheme: chart.notSelfTheme.value,

    personalityActivations: personality,
    designActivations: design,

    uniqueGates,
    doubleActivations,

    lineDistribution,
    centerDistribution,
    circuitDistribution,

    centers: centerEntries,
    channels: channelEntries,
    hangingGatesByCenter,

    split,
    cycles,

    variableSources,
    variableHeaders,
    cognitiveCode,
    typeJustification,
    gateNames,

    warnings,
  };
}

// ─── Markdown rendering ─────────────────────────────────────────────────────

// Renders the Data Pass as a Markdown block to inject into the report prompt
// as canonical facts. Mirrors the format Kaycee uses in her manual Notion
// reference files (## Data Pass / Activation Filter).
export function renderDataPassMarkdown(dp: DataPass): string {
  const lines: string[] = [];
  lines.push(`# Data Pass for ${dp.client.name}`);
  lines.push("");
  lines.push("> Canonical structural facts. The report engine reads these directly. Never derive a center for a gate, a center-pair for a channel, a circuit, or a definition island from elsewhere; everything you need is below.");
  lines.push("");

  // ── CHART FACTS HEADER (top-of-message canonical block) ─────────────────
  // Visually distinct, repeated emphasis on the chart's identity facts. The
  // model reads this FIRST. Designed so a quick attention scan picks up
  // Type, Profile, Authority, Strategy, Definition, Channels — the facts
  // most likely to be drifted from when the model pattern-matches against
  // training data (e.g. assuming Gate 34 → Manifesting Generator).
  lines.push("=".repeat(72));
  lines.push(`CHART FACTS — copy these verbatim into the report. Do NOT substitute.`);
  lines.push("=".repeat(72));
  lines.push(`CLIENT:        ${dp.client.name}`);
  lines.push(`TYPE:          ${dp.type}`);
  lines.push(`STRATEGY:      ${dp.strategy}`);
  lines.push(`AUTHORITY:     ${dp.authority}`);
  lines.push(`PROFILE:       ${dp.profile}`);
  lines.push(`DEFINITION:    ${dp.split.definitionLabel}`);
  lines.push(`CROSS:         ${dp.incarnationCross}`);
  lines.push(`CHANNELS:      ${dp.channels.map((c) => c.id).join(", ") || "(none)"}`);
  lines.push(`COGNITIVE:     ${dp.cognitiveCode}`);
  lines.push("=".repeat(72));
  lines.push("");

  // ── TYPE JUSTIFICATION (anti-drift anchor) ──────────────────────────────
  // Deterministic structural explanation of WHY this chart is the Type it
  // is. Reading this should make it impossible for the model to fabricate
  // a different Type by pattern-matching on individual gates (the v1
  // failure mode: Gate 34 → assumed Manifesting Generator, then invented a
  // Sacral-to-Throat connection to match).
  lines.push("## Type Justification (structural, deterministic — read before writing Your Type section)");
  lines.push(dp.typeJustification);
  lines.push("");

  lines.push("## Chart Summary");
  lines.push(`${dp.profile} | ${dp.type} | ${dp.authority} Authority | ${dp.definition}`);
  lines.push(`**Birth**: ${dp.birth.localDate} (${dp.birth.timezone})${dp.birth.place ? `, ${dp.birth.place}` : ""}`);
  lines.push(`**Design**: ${dp.birth.designUtcDate} UTC`);
  lines.push(`**Incarnation Cross**: ${dp.incarnationCross}`);
  lines.push(`**Quarter**: ${dp.quarter ?? "(unmapped)"}`);
  lines.push(`**Signature**: ${dp.signature}    **Not-Self Theme**: ${dp.notSelfTheme}`);
  lines.push(`**Cognitive code**: ${dp.cognitiveCode}`);
  lines.push("");

  // ── Variable headers (USE VERBATIM) ─────────────────────────────────────
  lines.push("## Variables — Canonical H2 Headers (USE VERBATIM)");
  lines.push("> The Variables section of the report MUST use these exact H2 headers, word-for-word, including punctuation and capitalization. Do not paraphrase, do not abbreviate, do not reorder. Validator enforces verbatim match.");
  lines.push("");
  lines.push(`H1: \`Your Variables: ${dp.cognitiveCode}\``);
  lines.push("");
  const variableLines: [string, string, { sourcePlanet: string; colorNumber: number; toneNumber: number; arrow: string }][] = [
    ["Digestion",   dp.variableHeaders.determination, dp.variableSources.determination],
    ["Environment", dp.variableHeaders.environment,   dp.variableSources.environment],
    ["Motivation",  dp.variableHeaders.motivation,    dp.variableSources.motivation],
    ["Perspective", dp.variableHeaders.perspective,   dp.variableSources.perspective],
  ];
  for (const [label, header, src] of variableLines) {
    lines.push(`H2 (${label}): \`${header}\``);
    lines.push(`  source: ${src.sourcePlanet} — color ${src.colorNumber}, tone ${src.toneNumber}, ${src.arrow} arrow`);
    lines.push("");
  }

  function renderActivationTable(label: string, rows: ActivationRow[]): void {
    lines.push(`## ${label}`);
    lines.push("Planet | Gate.Line | E/D | Center | Channel/Hanging");
    lines.push("-------|-----------|-----|--------|-----------------");
    for (const r of rows) {
      const ed = r.fixingState === "Exalted" ? "Exalted"
              : r.fixingState === "Detriment" ? "Detriment"
              : "—";
      lines.push(`${r.planet} | ${r.gate}.${r.line} | ${ed} | ${r.centerName} | ${r.channelStatus}`);
    }
    lines.push("");
  }
  renderActivationTable("Personality Activations", dp.personalityActivations);
  renderActivationTable("Design Activations", dp.designActivations);

  lines.push(`## Unique Gates (${dp.uniqueGates.length} from ${dp.personalityActivations.length + dp.designActivations.length} positions)`);
  lines.push(dp.uniqueGates.join(", "));
  lines.push("");

  // Canonical gate names. The model uses the HEXAGRAM NAME in bullet
  // headers (e.g. "Gathering Together" for Gate 45). The keynote ("The
  // Gate of the Gatherer") is the role archetype — usable in PROSE
  // when it directly supports a point, never as the gate's label.
  lines.push(`## Activated Gate Names (canonical)`);
  lines.push(`> Use the hexagram name in bullet headers (e.g. "Gate 45: Gathering Together"). The keynote is the role archetype; use it only in prose when the wording reinforces a specific point. Never swap the keynote in as the gate's label.`);
  lines.push("");
  lines.push("Gate | Hexagram Name | Keynote");
  lines.push("-----|---------------|---------");
  for (const g of dp.uniqueGates) {
    const n = dp.gateNames[g];
    lines.push(`${g} | ${n?.hexagram ?? "(unknown)"} | ${n?.keynote ?? "—"}`);
  }
  lines.push("");

  if (dp.doubleActivations.length) {
    lines.push(`## Double Activations (${dp.doubleActivations.length} gates)`);
    for (const d of dp.doubleActivations) {
      lines.push(`- **Gate ${d.gate}**: ${d.activations.join(" + ")}`);
    }
    lines.push("");

    // Rank by activation count so "most heavily activated gate" claims are
    // verifiable. The most activated gate is the top of this list.
    const ranked = [...dp.doubleActivations].sort((a, b) => b.activations.length - a.activations.length);
    const top = ranked[0];
    const topCount = top.activations.length;
    const tied = ranked.filter((d) => d.activations.length === topCount);
    lines.push(`## Most Heavily Activated Gate(s)`);
    lines.push(`> Use this exact ranking when the report makes any "most activated" / "most heavily activated" / "the chart's most active gate" claim. Do not infer from the prose; copy from here.`);
    if (tied.length === 1) {
      lines.push(`- Gate ${top.gate} (${topCount} activations): ${top.activations.join(", ")}`);
    } else {
      lines.push(`Tied at ${topCount} activations each:`);
      for (const t of tied) lines.push(`- Gate ${t.gate}: ${t.activations.join(", ")}`);
    }
    lines.push("");
  }

  // Per-gate activations roll-up. The Centers section's gate-bullet header
  // expects "<P/D Planet Line>(s)" — ALL the activations on that gate. The
  // model sometimes drops one (Paul v1: missed 13.5 D-Earth in the G center
  // because gate 13 had two activations and only one made it into the
  // bullet). This roll-up gives the model a single canonical line to copy.
  lines.push("## Gate Activations Roll-up (canonical, copy verbatim into Centers bullets)");
  lines.push("> Every activated gate listed once with ALL its activations. When you write the bullet header `Gate <N>: <Hexagram Name> | <activations> | ...`, the `<activations>` part is the exact string from this table. Drop nothing.");
  lines.push("Gate | All Activations on This Gate");
  lines.push("-----|-----------------------------");
  const allActs = [...dp.personalityActivations, ...dp.designActivations];
  for (const g of dp.uniqueGates) {
    const onThisGate = allActs.filter((a) => a.gate === g);
    const formatted = onThisGate.map((a) => {
      const side = a.side === "personality" ? "P" : "D";
      const fix = a.fixingState === "Exalted" ? " Exalted"
                : a.fixingState === "Detriment" ? " Detriment"
                : "";
      return `${side} ${a.planet} ${a.gate}.${a.line}${fix}`;
    }).join(", ");
    lines.push(`${g} | ${formatted}`);
  }
  lines.push("");

  lines.push("## Line Distribution");
  lines.push("Line | Count | %");
  lines.push("-----|-------|---");
  for (const l of dp.lineDistribution) {
    lines.push(`${l.line} | ${l.count} | ${l.pct.toFixed(1)}%`);
  }
  lines.push("");

  lines.push("## Center Distribution");
  lines.push("Center | Status | Gates | Activations");
  lines.push("-------|--------|-------|------------");
  for (const c of dp.centerDistribution) {
    lines.push(`${c.name} | ${c.status.toUpperCase()} | ${c.gates.join(", ") || "—"} | ${c.activationCount}`);
  }
  lines.push("");

  lines.push("## Circuit Distribution");
  lines.push("Circuit | Activations | %");
  lines.push("--------|-------------|---");
  for (const c of dp.circuitDistribution) {
    lines.push(`${c.circuit} | ${c.activationCount} | ${c.pct.toFixed(1)}%`);
  }
  lines.push("");

  lines.push("## Channels");
  lines.push("ID | Name | Centers | Type | Circuit | Consciousness");
  lines.push("---|------|---------|------|---------|--------------");
  for (const ch of dp.channels) {
    lines.push(`${ch.id} | ${ch.name} | ${ch.centers.join(" ↔ ")} | ${ch.channelType ?? "?"} | ${ch.circuit ?? "?"} | ${ch.consciousness}`);
  }
  lines.push("");

  lines.push(`## Definition: ${dp.split.definitionLabel} (${dp.split.islandCount} island${dp.split.islandCount === 1 ? "" : "s"})`);
  for (let i = 0; i < dp.split.islands.length; i++) {
    const is = dp.split.islands[i];
    lines.push(`- Island ${i + 1}: centers [${is.centers.join(", ")}] connected by channels [${is.channels.join(", ") || "—"}]`);
  }
  if (dp.split.bridgingGates.length) {
    lines.push(`### Bridging Gates`);
    lines.push(`> Gates the client does NOT carry but which, if activated by transit or another person, would close a channel with one of their hanging gates and collapse two islands together. List the partner gate (the one they're missing), not the gate they already have.`);
    for (const b of dp.split.bridgingGates) {
      lines.push(`- Gate ${b.partnerGate} (${b.partnerCenter}) — would complete channel ${b.channelId} with the client's activated gate ${b.activatedGate} (${b.activatedCenter})`);
    }
  }
  lines.push("");

  if (dp.hangingGatesByCenter.length) {
    lines.push("## Hanging Gates by Center");
    for (const c of dp.hangingGatesByCenter) {
      lines.push(`### ${c.center}`);
      for (const g of c.gates) {
        lines.push(`- Gate ${g.gate}: ${g.activations.join(", ")}`);
      }
    }
    lines.push("");
  }

  lines.push("## Important Dates / Life Cycle (UTC)");
  const fmtCycle = (label: string, cy: { firstPass: string; status: string; allPasses: string[] }) => {
    if (!cy.firstPass) return `- ${label}: unknown`;
    const window = cy.allPasses.length > 1
      ? `  (full window: ${cy.allPasses[0]} → ${cy.allPasses[cy.allPasses.length - 1]}, ${cy.allPasses.length} passes)`
      : "";
    return `- ${label}: ${cy.firstPass} | ${cy.status}${window}`;
  };
  lines.push(fmtCycle("Saturn Return",       dp.cycles.saturnReturn));
  lines.push(fmtCycle("Uranus Opposition",   dp.cycles.uranusOpposition));
  lines.push(fmtCycle("Chiron Return",       dp.cycles.chironReturn));
  lines.push(fmtCycle("2nd Saturn Return",   dp.cycles.secondSaturnReturn));
  lines.push("");

  if (dp.warnings.length) {
    lines.push("## Audit Warnings");
    for (const w of dp.warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  return lines.join("\n");
}
