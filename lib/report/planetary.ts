// Planetary Overview generator.
//
// The companion to the Foundation Report. Where the Foundation Report covers
// the structural backbone, the Planetary Overview is the per-planet deep dive:
// each planetary activation gets a standardized H3 header (Planet, Gate.Line,
// Main Gate Name, Line Name, Exalted/Detriment if any, Center, Quarter)
// followed by prose drawing from the gate + line companion source material.
//
// Section order from .claude/skills/hd-analysis/SKILL.md:
//   1. Front matter
//   2. How to Use This Report
//   3. Introduction (brief framing of the report's purpose)
//   4. Personality Activations (13 planets: Sun, Earth, Moon, NN, SN, Mercury, Mars, Venus, Jupiter, Saturn, Uranus, Neptune, Pluto)
//   5. Design Activations (13 planets, same order)
//   6. Incarnation Cross deep dive
//   7. Moon Placements (P Moon + D Moon)
//   8. Nodal Analysis (4 nodes)
//   9. Hanging Gates (organized by center)
//  10. Closing synthesis
//
// Target length: 8,000–10,000 words per the master plan's standard tier.
// Architecture: four cached Sonnet 4.6 calls sharing the same system + library
// blocks as the Foundation Report (so if both reports run for the same chart
// back-to-back, the second pays cache-read prices for the library block).

import { invokeLLM, type InvokeResult, type ModelId } from "@/lib/llm/core";
import { serializeChart } from "@/lib/chart/serialize";
import type { Chart } from "@/lib/chart/types";
import type { ChunkRow, RetrievalResult } from "@/lib/retrieval/chartChunks";

export interface BuildArgs {
  client: { name: string };
  chart: Chart;
  retrieval: RetrievalResult;
  identityMd: string;
  voiceMd: string;
  model?: ModelId;
  apiKey: string;
  hardCostCeilingCents?: number;
}

function orderChunks(chunks: ChunkRow[]): ChunkRow[] {
  const kindOrder = [
    "type", "strategy", "authority", "profile", "definition", "quarter", "cross",
    "center", "channel", "circuit", "channel_type", "variable", "planet",
    "gate", "line", "profile_line", "geometry",
  ];
  return [...chunks].sort((a, b) => {
    const ai = kindOrder.indexOf(a.source_kind);
    const bi = kindOrder.indexOf(b.source_kind);
    if (ai !== bi) return ai - bi;
    if ((a.gate_number ?? 999) !== (b.gate_number ?? 999)) {
      return (a.gate_number ?? 999) - (b.gate_number ?? 999);
    }
    return (a.line_number ?? -1) - (b.line_number ?? -1);
  });
}

function formatChunksForPrompt(chunks: ChunkRow[]): string {
  const lines: string[] = [];
  lines.push("# HD Source Library — relevant chunks for this chart");
  lines.push("");
  lines.push(
    "Each chunk below is verbatim source material from Ra Uru Hu's lectures or " +
    "Kaycee's analytical reference, mirrored from her Notion library. When the " +
    "report makes a claim about a gate, line, channel, center, planet, cross, " +
    "or quarter, that claim must be grounded in the chunks below. Do not " +
    "invent material that is not supported by these chunks.",
  );
  lines.push("");

  for (const c of orderChunks(chunks)) {
    const tag = c.gate_number != null
      ? c.line_number != null
        ? `[${c.source_kind} ${c.gate_number}.${c.line_number}]`
        : `[${c.source_kind} gate ${c.gate_number}]`
      : `[${c.source_kind}]`;
    lines.push(`## ${tag} ${c.title}`);
    lines.push("");
    lines.push(c.body.trim());
    lines.push("");
  }
  return lines.join("\n");
}

const MASTER_SYSTEM = `You are the report engine for HD Reports, a paid Human Design product. You produce sections of a Planetary Overview Report for the chart attached to the user message.

The Planetary Overview is the per-planet deep dive companion to the Foundation Report. Where the Foundation Report covers the structural backbone (Type, Authority, Profile, Centers, Channels), the Planetary Overview walks through each of the 26 planetary activations (13 personality + 13 design) one at a time and shows what each activation is doing in this design. It also synthesizes the Incarnation Cross's 4 gates, the Moon placements, the Nodal arc, and the Hanging Gates.

A Planetary Overview is the customer's per-thread reference: a 8,000–10,000 word Markdown document they return to when a specific planet or gate shows up in their life. Each H3 section is a complete passage about one activation, grounded in Ra's per-gate and per-line material.

# Hard rules (apply to every section)

- **No em dashes anywhere, including inside headings.** Use commas, colons, semicolons, or restructure.
- **No bullet points in body prose.** Paragraphs only. Headings are the only structural breaks.
- **Address the reader as "you."** First-person ("I", "we") is never used.
- **Do not generate Human Design teachings.** Organize the cached source material against the chart. When the source library is sparse for a chart element, write less; do not improvise.
- **Quote sparingly.** Source material is the spine; the prose is original. Pull a phrase of Ra's language when it lands.
- **Mechanics not pathology.** Detriments and challenging gates are named with full directness. The mechanical framing IS the compassion.
- **No predictions, no spiritual jargon, no astrology cross-overs, no Gene Keys references.**

# The standardized H3 header format for each planetary activation

Every planet's section begins with an H3 in this exact format:

  Planet, Gate#.Line#: Main Gate Name, Line Name, [Exalted | Detriment if present], Center, Quarter

Examples:
  Sun, 45.6: Gathering Together, Reconsideration, Throat, Civilization
  Saturn, 47.4: Oppression, Repression, Exalted, Ajna, Duality
  Neptune, 58.4: The Joyous, Focusing, Detriment, Root, Mutation

Rules for the header:
- The chart spec lists each planetary activation with its gate, line, color, tone, base, and fixing state (Exalted / Detriment / None).
- Only include "Exalted" or "Detriment" if the activation carries one. Omit for neutral placements.
- Use the full Main Gate Name and Line Name from the cached source library (the "[gate gate N]" and "[line N.M]" chunks).
- Center is the center that gate sits in. Cross-reference the cached Centers chunks or the Gates database to determine which center each gate belongs to.
- Quarter is the chart's overall Quarter, drawn from the chart spec.

Use commas as separators in the header, never em dashes or pipes. Never end headings with a period.

# Per-activation prose body

Under each H3, write 200–350 words of prose:

1. State the mechanic of the gate in this body, drawing from the cached gate-level material.
2. Name what the specific line adds, drawing from the cached line-companion material.
3. If the activation is in Exalted or Detriment, name what that does specifically. Detriments stay direct; the mechanical framing IS the compassion.
4. Connect to the planet's archetype: a Saturn placement reads structurally as the lesson + reorganization the design is here to meet; a Venus placement reads as the design's mode of valuing and relating; a Pluto placement as the deep generational pressure carried in the body.
5. Where the activation lands in a defined channel, mention which channel and what the channel produces. Where it's a hanging gate, mention that briefly.

Do not paste source material verbatim. Pull a phrase of Ra's language when it sharpens the point; otherwise the prose is original.

# Section order (NON-NEGOTIABLE)

Render exactly these H1 sections in this order:

# Planetary Overview
(front matter — title, name, birth data, lineage statement, brief framing)

# How to Use This Report
(2 to 3 short paragraphs. This is a per-thread reference, not a single read. Return to it when an activation shows up in life. Audio works too.)

# Introduction
(1 to 2 paragraphs. This report walks through the 26 planetary activations as 26 distinct threads in your design.)

# Personality Activations
## [H3 for each of the 13 personality planets in order: Sun, Earth, North Node, South Node, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto]

# Design Activations
## [H3 for each of the 13 design planets, same order]

# Your Incarnation Cross
(Synthesis section drawing the 4 cross gates together. Around 400 to 600 words. Names the cross by its full name, then walks through the dynamic between the four gates as a single design statement.)

# Your Moon Placements
(Synthesis of personality Moon + design Moon as a pair. Around 250 to 400 words. The Moon describes the unconscious emotional needs and the design's relationship to fluctuation.)

# Your Nodal Analysis
(Synthesis of the 4 nodes as a karmic arc. Around 400 to 600 words. The South Nodes describe the design's familiar territory; the North Nodes describe what it grows into.)

# Your Hanging Gates
(Synthesis of the unactivated channel gates, organized by center. The chart spec includes a Hanging gates section listing each. Around 300 to 500 words. These are gates the design carries but which don't form a complete channel internally; they're the design's points of conditioning openness through transits and other people.)

# Closing
(One short paragraph. Repeats the lineage statement and ends.)

You may be asked for any subset of these in one call. Render exactly the sections requested. Do not preview or transition into sections that were not requested.

# Output format

Pure Markdown. No code fences. No preamble ("Here is the report:"). No closing commentary outside the report itself.`;

interface SectionPlan {
  name: string;
  maxTokens: number;
  userInstruction: string;
}

function buildSections(clientName: string): SectionPlan[] {
  const target = (lo: number, hi: number) => `Target length: ${lo.toLocaleString()}–${hi.toLocaleString()} words for this call.`;

  return [
    {
      name: "front+how-to+intro+personality",
      maxTokens: 8000,
      userInstruction: `Generate the FRONT MATTER and the first H1 sections of the Planetary Overview for ${clientName}.

Front matter: "# Planetary Overview" then the client's name on its own line, then "Date of Birth:" and "Place of Birth:" lines, then the lineage statement in italics ("This report is organized from a private archive of Ra Uru Hu's original lectures, interviews, and writings, assembled by Kaycee. The AI does not generate Human Design teachings. It organizes them against your specific chart."), then a horizontal divider.

Then in order:
  # How to Use This Report  (2 to 3 short paragraphs, no subheadings)
  # Introduction  (1 to 2 paragraphs framing the per-planet structure)
  # Personality Activations
    ## Sun, <gate>.<line>: <full header per format>
    ## Earth, ...
    ## North Node, ...
    ## South Node, ...
    ## Moon, ...
    ## Mercury, ...
    ## Venus, ...
    ## Mars, ...
    ## Jupiter, ...
    ## Saturn, ...
    ## Uranus, ...
    ## Neptune, ...
    ## Pluto, ...
  Each H3 is 200 to 350 words of prose per the format described in the system prompt.

Do NOT write Design Activations or anything after. Stop at the end of the Personality Pluto section.

${target(4500, 5500)}`,
    },
    {
      name: "design",
      maxTokens: 8000,
      userInstruction: `Continue the Planetary Overview for ${clientName}. Render the next H1 section ONLY:

  # Design Activations
    ## Sun, <gate>.<line>: ...
    ## Earth, ...
    ## North Node, ...
    ## South Node, ...
    ## Moon, ...
    ## Mercury, ...
    ## Venus, ...
    ## Mars, ...
    ## Jupiter, ...
    ## Saturn, ...
    ## Uranus, ...
    ## Neptune, ...
    ## Pluto, ...

Each H3 is 200 to 350 words of prose. Do NOT write the front matter, Personality Activations, or anything after Design Pluto. Start directly with the H1 "Design Activations".

${target(4500, 5500)}`,
    },
    {
      name: "cross+moon+nodes",
      maxTokens: 4000,
      userInstruction: `Continue the Planetary Overview for ${clientName}. Render the next three H1 sections:

  # Your Incarnation Cross
    (Synthesis of the 4 cross gates as a single design statement. 400 to 600 words.)
  # Your Moon Placements
    (Synthesis of personality Moon + design Moon. 250 to 400 words.)
  # Your Nodal Analysis
    (Synthesis of the 4 nodes as a karmic arc. South Nodes are familiar territory; North Nodes are what the design grows into. 400 to 600 words.)

Do NOT write Personality Activations, Design Activations, or anything after Nodal Analysis. Start directly with the H1 "Your Incarnation Cross".

${target(1200, 1700)}`,
    },
    {
      name: "hanging+closing",
      maxTokens: 3000,
      userInstruction: `Finish the Planetary Overview for ${clientName}. Render the final two H1 sections:

  # Your Hanging Gates
    (The chart spec lists hanging gates by center. Walk through each, organizing by center. Each hanging gate gets at most a short paragraph describing the mechanic and what it does in this body. 300 to 500 words total.)
  # Closing
    (One short paragraph. Repeats the lineage statement (same wording from the front matter) and ends.)

Do NOT write earlier sections. Start directly with the H1 "Your Hanging Gates".

${target(400, 700)}`,
    },
  ];
}

export interface BuildResult {
  text: string;
  sections: { name: string; text: string; cost_cents: number; usage: InvokeResult["usage"]; }[];
  cost_cents: number;
  usage: InvokeResult["usage"];
  retrievedChunkIds: string[];
  totalRetrievalTokens: number;
  model: ModelId;
}

export async function buildPlanetaryOverview(args: BuildArgs): Promise<BuildResult> {
  const model = args.model ?? "claude-sonnet-4-6";

  const libraryBlock = formatChunksForPrompt(args.retrieval.chunks);
  const chartBlock = serializeChart(args.client, args.chart);
  const sections = buildSections(args.client.name);

  const accumulated: BuildResult["sections"] = [];
  let totalCents = 0;
  const totalUsage: InvokeResult["usage"] = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };

  const previousMarkdown: string[] = [];

  for (const section of sections) {
    const continuationNote = previousMarkdown.length
      ? `\n\nNOTE: this is a continuation. The previous sections have already been generated; output ONLY the sections requested below, with no preamble or recap.`
      : "";

    const userContent =
      `${chartBlock}\n\n` +
      `---\n\n${section.userInstruction}${continuationNote}`;

    const result = await invokeLLM(
      {
        model,
        max_tokens: section.maxTokens,
        system: MASTER_SYSTEM,
        cache_blocks: [
          { name: "IDENTITY", text: `# IDENTITY (lineage and brand)\n\n${args.identityMd}` },
          { name: "VOICE", text: `# VOICE (how to write)\n\n${args.voiceMd}` },
          { name: "LIBRARY", text: libraryBlock },
        ],
        messages: [{ role: "user", content: userContent }],
      },
      {
        apiKey: args.apiKey,
        hardCostCeilingCents: args.hardCostCeilingCents,
      },
    );

    const text = result.text.replace(/—/g, ", ");

    accumulated.push({
      name: section.name,
      text,
      cost_cents: result.cost_cents,
      usage: result.usage,
    });
    totalCents += result.cost_cents;
    totalUsage.input_tokens += result.usage.input_tokens;
    totalUsage.output_tokens += result.usage.output_tokens;
    totalUsage.cache_creation_input_tokens += result.usage.cache_creation_input_tokens;
    totalUsage.cache_read_input_tokens += result.usage.cache_read_input_tokens;

    previousMarkdown.push(text);
  }

  const fullText = previousMarkdown.join("\n\n");

  return {
    text: fullText,
    sections: accumulated,
    cost_cents: Math.round(totalCents * 10000) / 10000,
    usage: totalUsage,
    retrievedChunkIds: args.retrieval.chunks.map((c) => c.id),
    totalRetrievalTokens: args.retrieval.totalTokensEstimate,
    model,
  };
}
