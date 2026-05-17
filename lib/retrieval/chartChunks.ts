// Per-chart targeted retrieval. Given a Chart, fetch the library chunks for
// every element of the chart (type, authority, profile, definition, cross,
// centers, channels, variables, quarter, and every gate.line activation).
//
// This is exact-match retrieval against the kind / gate_number / line_number
// indices on the chunks table. Vector similarity is reserved for cases where
// exact matching is the wrong tool (e.g. a freeform question about the chart).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Chart } from "@/lib/chart/types";
import { shortCrossName, uniqueGates, uniqueActivations } from "@/lib/chart/serialize";

export interface ChunkRow {
  id: string;
  source_kind: string;
  source_path: string;
  slug: string | null;
  title: string;
  body: string;
  gate_number: number | null;
  line_number: number | null;
}

const SELECT_COLS = "id, source_kind, source_path, slug, title, body, gate_number, line_number";

// Look up a single chunk by kind + a substring filter on the title.
async function findByTitle(
  s: SupabaseClient,
  kind: string,
  titleSubstring: string,
): Promise<ChunkRow | null> {
  const { data, error } = await s
    .from("chunks")
    .select(SELECT_COLS)
    .eq("source_kind", kind)
    .ilike("title", `%${titleSubstring}%`)
    .limit(1);
  if (error) throw error;
  return (data?.[0] as ChunkRow) ?? null;
}

async function findManyByTitle(
  s: SupabaseClient,
  kind: string,
  titleSubstrings: string[],
): Promise<ChunkRow[]> {
  if (titleSubstrings.length === 0) return [];
  // Build an OR filter so we get them all in one query.
  const orParts = titleSubstrings.map((t) => `title.ilike.%${t.replace(/,/g, "\\,")}%`).join(",");
  const { data, error } = await s
    .from("chunks")
    .select(SELECT_COLS)
    .eq("source_kind", kind)
    .or(orParts);
  if (error) throw error;
  return (data ?? []) as ChunkRow[];
}

async function findByGateLine(
  s: SupabaseClient,
  gates: number[],
  lines: number[] | null,
): Promise<ChunkRow[]> {
  let q = s.from("chunks").select(SELECT_COLS).eq("source_kind", "line").in("gate_number", gates);
  if (lines !== null) q = q.in("line_number", lines);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ChunkRow[];
}

async function findGateChunks(
  s: SupabaseClient,
  gates: number[],
): Promise<ChunkRow[]> {
  const { data, error } = await s
    .from("chunks")
    .select(SELECT_COLS)
    .eq("source_kind", "gate")
    .in("gate_number", gates);
  if (error) throw error;
  return (data ?? []) as ChunkRow[];
}

export interface RetrievalResult {
  chunks: ChunkRow[];
  index: Map<string, ChunkRow[]>; // kind → chunks of that kind in this retrieval
  totalTokensEstimate: number; // rough; body chars / 4
  missing: string[]; // human-readable reasons (e.g. "no cross chunk for RAC of Eden 1")
}

export async function retrieveForChart(
  s: SupabaseClient,
  chart: Chart,
): Promise<RetrievalResult> {
  const missing: string[] = [];
  const chunks: ChunkRow[] = [];
  const push = (label: string, c: ChunkRow | null) => {
    if (c) chunks.push(c);
    else missing.push(label);
  };

  // Type / Strategy / Authority / Profile / Definition.
  const typeChunk = await findByTitle(s, "type", chart.type.value);
  push(`type=${chart.type.value}`, typeChunk);

  // Authority value from mybodygraph is like "Emotional - Solar Plexus"; the
  // chunk title is just "Emotional". Strip extras.
  const authShort = chart.authority.value.split(/[-(]/)[0].trim();
  const authChunk = await findByTitle(s, "authority", authShort);
  push(`authority=${authShort}`, authChunk);

  // Profile titles in Notion are like "3/5: The Martyr Heretic". The
  // chart.profile.value is "3 / 5" so collapse whitespace.
  const profileShort = chart.profile.value.replace(/\s+/g, "");
  const profileChunk = await findByTitle(s, "profile", profileShort);
  push(`profile=${chart.profile.value}`, profileChunk);

  // Definition titles include parentheticals: "Wide Split (Broad Split)";
  // mybodygraph returns the short label. Match on the leading part.
  const defShort = chart.definition.value.replace(/\s+Definition\s*$/i, "").trim();
  const defChunk = (await findByTitle(s, "definition", defShort))
    ?? (await findByTitle(s, "definition", chart.definition.value));
  push(`definition=${chart.definition.value}`, defChunk);

  // Cross.
  const crossShort = shortCrossName(chart.incarnationCross.value);
  const crossChunk = await findByTitle(s, "cross", crossShort);
  push(`cross=${crossShort}`, crossChunk);

  // Quarter. Notion title is "1: Initiation" etc; chart.quarter is
  // "Quarter of Initiation". Strip the prefix.
  if (chart.quarter) {
    const qShort = chart.quarter.replace(/^Quarter of\s+/i, "").trim();
    const qChunk = await findByTitle(s, "quarter", qShort);
    push(`quarter=${qShort}`, qChunk);
  }

  // Centers — fetch all 9 and let the prompt orient based on defined/open.
  // Title format examples: "Root", "Spleen", "Solar Plexus (Emotional)",
  // "Ego (Heart, Will)", "G Center". Match on a canonical substring.
  const centerSearchKeys = chart.centers.map((c) => {
    const n = c.name.toLowerCase();
    if (n === "solar plexus") return "Solar Plexus";
    if (n === "heart") return "Heart";
    if (n === "g") return "G ";  // trailing space to avoid matching "G ate"
    if (n === "spleen") return "Spleen";
    if (n === "sacral") return "Sacral";
    if (n === "throat") return "Throat";
    if (n === "ajna") return "Ajna";
    if (n === "head") return "Head";
    if (n === "root") return "Root";
    return c.name;
  });
  const centerChunks = await findManyByTitle(s, "center", centerSearchKeys);
  for (let i = 0; i < chart.centers.length; i++) {
    const c = chart.centers[i];
    const key = centerSearchKeys[i].trim().toLowerCase();
    const hit = centerChunks.find((x) => x.title.toLowerCase().includes(key));
    push(`center=${c.name}`, hit ?? null);
  }

  // Channels — channel chunks in Notion are titled like "5 - 15: The Channel of
  // Rhythm" or "34 -57: The Channel of Power". The chart.id is normalized
  // "lower-higher" (e.g. "47-64"). Try both spaced and unspaced variants.
  if (chart.channels.length) {
    const channelChunks = await s
      .from("chunks")
      .select(SELECT_COLS)
      .eq("source_kind", "channel");
    if (channelChunks.error) throw channelChunks.error;
    const all = (channelChunks.data ?? []) as ChunkRow[];
    for (const ch of chart.channels) {
      const [lo, hi] = ch.gates;
      const hit = all.find((x) => {
        const t = x.title;
        // Look for a match with either gate order, with or without surrounding spaces.
        return (
          new RegExp(`\\b${lo}\\s*-\\s*${hi}\\b`).test(t) ||
          new RegExp(`\\b${hi}\\s*-\\s*${lo}\\b`).test(t)
        );
      });
      push(`channel=${ch.id}`, hit ?? null);
    }
  }

  // Variables: the source library encodes variable entries by cognitive-type
  // code (e.g. "PRR DRR"), not by individual theme names. For Phase 4 first-
  // milestone we skip exact retrieval here and rely on the prompt + chart
  // serialization (which now spells out the Right/Left brain frame and the
  // theme names) for the model to write the section. When a per-theme library
  // is curated later, this is where to load it.

  // Gate entries (main hexagram) — one per unique gate in the chart.
  const gates = uniqueGates(chart);
  const gateChunks = await findGateChunks(s, gates);
  for (const g of gates) {
    const hit = gateChunks.find((x) => x.gate_number === g);
    push(`gate=${g}`, hit ?? null);
  }

  // Line chunks for every (gate, line) activation in the chart.
  // Pull both the gate's Main Hexagram chunk (line_number=0) and the line
  // chunks for activated lines.
  const activations = uniqueActivations(chart);
  const allLineNumbers = new Set<number>([0]);
  for (const a of activations) allLineNumbers.add(a.line);
  const lineChunks = await findByGateLine(s, gates, [...allLineNumbers]);
  for (const a of activations) {
    const hit = lineChunks.find((x) => x.gate_number === a.gate && x.line_number === a.line);
    push(`line=${a.gate}.${a.line}`, hit ?? null);
  }
  // Also pull each unique gate's Main Hexagram (line_number=0). Some gates
  // appear in the chart but no activation lands on line 0 specifically; the
  // Main Hexagram still belongs in the retrieval.
  for (const g of gates) {
    const hit = lineChunks.find((x) => x.gate_number === g && x.line_number === 0);
    if (hit && !chunks.includes(hit)) chunks.push(hit);
  }

  // Build index by kind for the prompt-formatter.
  const index = new Map<string, ChunkRow[]>();
  for (const c of chunks) {
    if (!index.has(c.source_kind)) index.set(c.source_kind, []);
    index.get(c.source_kind)!.push(c);
  }

  const totalTokensEstimate = chunks.reduce((acc, c) => acc + Math.ceil(c.body.length / 4), 0);

  return { chunks, index, totalTokensEstimate, missing };
}
