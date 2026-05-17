// Foundation Report generator.
//
// Body-first sequencing per Kaycee's methodology. The report is produced
// across three Claude calls so the total output exceeds a single message's
// max-tokens ceiling (Sonnet 4.6 caps at 8192). All three calls share the
// same cached system blocks (master prompt + IDENTITY + VOICE + library), so
// only the first call pays for cache writes; subsequent calls hit cache at
// ~10x cheaper input.
//
// Output target per tier (master plan):
//   short    ~1,500 words  — single call
//   standard ~3,500 words  — single call
//   long     ~6,000 words  — three calls
//
// "standard" is the default. Phase 4 milestone target: standard tier, under
// 30 cents end-to-end.

import { invokeLLM, type InvokeResult, type ModelId } from "@/lib/llm/core";
import { serializeChart } from "@/lib/chart/serialize";
import type { Chart } from "@/lib/chart/types";
import type { ChunkRow, RetrievalResult } from "@/lib/retrieval/chartChunks";

export type ReportLength = "short" | "standard" | "long";

export interface BuildArgs {
  client: { name: string };
  chart: Chart;
  retrieval: RetrievalResult;
  identityMd: string;
  voiceMd: string;
  model?: ModelId;
  length?: ReportLength;
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
    "report makes a claim about a gate, line, channel, center, variable, " +
    "definition type, profile, type, authority, cross, or quarter, that claim " +
    "must be grounded in the chunks below. Do not invent material that is not " +
    "supported by these chunks.",
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

// The master system prompt. Stable. Cached as one block. Lists the rules and
// the section structure; per-section instructions go in the user messages.
const MASTER_SYSTEM = `You are the report engine for HD Reports, a paid Human Design product. You produce sections of a Foundation Report for the chart attached to the user message.

A Foundation Report is the customer's manual: a Markdown document the customer reads now, again at thirty, again at fifty. It must:

1. Cover the structural backbone of their design in the body-first sequence below.
2. Be grounded in Ra Uru Hu's lineage as provided by the cached source library.
3. Be written in Kaycee Vandenberg's voice, per the cached VOICE specification.
4. Be re-readable at different life stages. Embed experiential markers the reader will recognize later.
5. Land as audio as well as print. Sentence rhythm matters at every paragraph.

# Hard rules (apply to every section)

- **No em dashes anywhere, including inside headings.** Use commas, colons, semicolons, or restructure. If a heading would naturally take a dash (e.g. "Profile 3/5 — The Martyr Heretic"), use a colon instead ("Profile 3/5: The Martyr Heretic").
- **No bullet points in body prose.** Paragraphs only. Headings are the only structural breaks.
- **Address the reader as "you."** First-person ("I", "we") is never used. The reader's name appears in front matter only, not in body prose.
- **Do not generate Human Design teachings.** Organize the cached source material against the chart. When the source library is sparse for a chart element, write less; do not improvise.
- **Quote sparingly.** Source material is the spine, but the prose is original. Pull a phrase of Ra's language when it lands.
- **Mechanics not pathology.** Detriments, challenging gates, open-center conditioning are named with full directness. The mechanical framing IS the compassion. No softening, no diplomatic reframing, no "growth opportunity" euphemisms.
- **No predictions.** Describe structure, not events.
- **No spiritual jargon, no astrology cross-overs, no Gene Keys cross-references.** Stay inside Ra's lineage.
- **The reader's specific chart drives everything.** Each section threads the chart's concrete details into the mechanical explanation. Generic Type-level or Profile-level descriptions that could apply to any chart of that Type/Profile do not belong here.

# The cognitive frame line in the chart spec

The chart spec includes a computed "Cognitive frame" line (e.g. "Right-Brain, Left-Mind" or "Right-Brain, Mixed-Mind"). This line is canonical. Use it directly in the Variables section. Do NOT recompute the frame from the four arrow lines yourself; the computation has already been done correctly.

# Section structure across the whole report (body-first)

The whole Foundation Report renders these H1 sections in order:

1. (front matter — title, name, date, lineage statement)
2. How to Use This Report
3. Your Variables (PHS)
4. Who You Are
5. Your Timeline
6. Your Centers
7. Your Channels
8. Patterns
9. Application
10. Closing

You may be asked for any subset of these in one call. Render exactly the sections requested. Do not preview, summarize, or transition into sections that were not requested.

# Output format

Pure Markdown. No code fences. No preamble ("Here is the report:"). No closing commentary. Output is the report content only, ready to concatenate with other sections.`;

interface SectionPlan {
  // Used in logs.
  name: string;
  // Output budget in tokens for this call.
  maxTokens: number;
  // User-message instruction enumerating what to produce.
  userInstruction: string;
}

function planForLength(length: ReportLength, clientName: string): SectionPlan[] {
  const wordTargetSuffix = (lo: number, hi: number) => `Target length: ${lo.toLocaleString()}–${hi.toLocaleString()} words for this call.`;

  if (length === "short") {
    return [
      {
        name: "all",
        maxTokens: 4096,
        userInstruction: `Generate the COMPLETE Foundation Report for ${clientName} in one call. Render the front matter (H1 title "Human Design Analysis", the client's name, date, then the lineage statement in italics, then a horizontal divider) followed by every section in order: How to Use This Report, Your Variables (PHS), Who You Are, Your Timeline, Your Centers, Your Channels, Patterns, Application, Closing. ${wordTargetSuffix(1300, 1600)} Each section should be proportionally compact.`,
      },
    ];
  }
  if (length === "standard") {
    return [
      {
        name: "front+variables+who",
        maxTokens: 7000,
        userInstruction: `Generate the FRONT MATTER and the first three H1 sections of the Foundation Report for ${clientName}.

The front matter is: "# Human Design Analysis" then the client's name on its own line, then a "Date of Birth:" line and a "Place of Birth:" line, then the lineage statement in italics ("This report is organized from a private archive of Ra Uru Hu's original lectures, interviews, and writings, assembled by Kaycee. The AI does not generate Human Design teachings. It organizes them against your specific chart."), then a horizontal divider.

Then in order:
  # How to Use This Report  (a short framing — 2 to 3 paragraphs. No headings beneath.)
  # Your Variables: <CognitiveCode>
    (Replace <CognitiveCode> with the client's exact PRR-DRR style code from the chart spec, e.g. "Your Variables: PLR DRR". The chart spec shows the cognitive code on its own line; copy it verbatim into the H1.)

    Open the section with TWO things, in this order:

    (A) The active/receptive frame — 2 to 3 paragraphs introducing left and right cognition. Left arrows are active, focused, outward, and strategic. Right arrows are passive, receptive, peripheral, and receiving. Neither is better. Together they describe whether the body and mind are oriented to drive or to receive. Variables exist to put the form in the right conditions to live out its function; the right diet, the right environment, the right angle of perception, the right driver of inquiry are the biological and frequency conditions that let the design's correct opportunities become visible.

    (B) A bulleted definitions list, in this exact order (Determination and Environment first because they set the bodily ground; Motivation and Perspective second because they describe how mind moves on that ground):

    - **Determination** (Design Sun and Earth, also called Digestion): how you should consume food and information for proper functioning of the form. The physical brain's intake spec.
    - **Environment** (Design Nodes): the ideal physical environmental conditions for proper functioning of the form. Where the body lives best.
    - **Motivation** (Personality Sun and Earth): the mind's driver. What inquiry the mind moves toward.
    - **Perspective** (Personality Nodes): how the mind is designed to see the world. The angle of perception.

    Each bullet is one short sentence. Do not expand into prose under the bullets; the per-variable detail comes in the H2 subsections below.

    ## Digestion: Color <N>: <ColorName>, <L|R> Arrow | <Active|Passive>: <SubName>, Tone <N>: <ToneName>
    ## Environment: Color <N>: <ColorName>, <L|R> Arrow | <Active|Passive>: <SubName>, Tone <N>: <ToneName>
    ## Motivation: Color <N>: <ColorName>, <L|R> Arrow | <Active|Passive>: <SubName>, Tone <N>: <ToneName>, Transference: <Name>
    ## Perspective: Color <N>: <ColorName>, <L|R> Arrow | <Active|Passive>: <SubName>, Tone <N>: <ToneName>, Distraction: <Name>
    ## How Your Variables Work Together

    Header format rules:
    - "L Arrow" means left-pointing (active). "R Arrow" means right-pointing (receptive).
    - Active and Passive are determined by the Tone, not the arrow. Tones 1, 2, 3 produce active variants; Tones 4, 5, 6 produce passive variants. The header should read "Active: <SubName>" or "Passive: <SubName>" based on the tone number from the chart spec.
    - Color name, Tone name, the per-variable SubName, and (for Motivation and Perspective) the Transference and Distraction binary partner: pull these from the cached variable source library where present. If a name is not in the cached library for this code, use the standard HD lineage name (e.g. Digestion Color 1 is "Appetite" / "Cave Diet"), and if you cannot determine a name with confidence, write "<unknown>" rather than invent one. Color and tone NUMBERS always come directly from the chart spec.
    - Use commas as separators, never em dashes or pipes. Headings never end with a period.

    Per-variable prose body (under each H2): 200 to 350 words drawing from the cached source material. State the biological / cognitive mechanic, what the specific Color + Tone combination produces, and how the active or passive expression actually lives in the body. Detriments are not present in Variables, so no fixing-state framing here. The prose must thread the specific Color name, Tone name, and SubName into the explanation, not just describe the variable generically.

    The final H2, "How Your Variables Work Together", is a synthesis: how the four work as one biological + cognitive system, what the dominant arrow direction (more right than left, more left than right, or mixed) means for this specific design, and what the form needs to land in its correct conditions.

  # Who You Are
    ## Your Type: <name>
    ## Your Strategy: <name>
    ## Your Authority: <name>
    ## Your Profile: <name>
    ## Your Definition: <name>
    ## Your Incarnation Cross: <name>

${wordTargetSuffix(3500, 4500)} Stop after the Incarnation Cross subsection. Do NOT write Timeline or anything later.`,
      },
      {
        name: "timeline+centers",
        maxTokens: 7000,
        userInstruction: `Continue the Foundation Report for ${clientName}. Render the NEXT two H1 sections:

  # Your Timeline
    ## [Profile-specific arc: e.g. "The 3/5 Across the Life Cycle"]
    ## Where You Are Now: <phase> (Age N) — compute approximate age from the birth year in the chart spec and current year 2026
    ## Your Saturn Return (~age 29)
    ## Your Uranus Opposition (~age 40 to 42)
    ## Your Chiron Return (~age 50)
    ## Your Second Saturn Return (~age 58)
  # Your Centers
    ## Defined Centers
      ### [one H3 per defined center, with mechanics specific to this chart's gate activations in that center]
    ## Undefined and Open Centers
      ### [one H3 per undefined or open center]

Do NOT write the front matter, the earlier sections, or any sections after Centers (no Channels, no Patterns, no Application, no Closing). Start directly with the H1 "Your Timeline". ${wordTargetSuffix(3500, 4500)}`,
      },
      {
        name: "channels",
        maxTokens: 6000,
        userInstruction: `Continue the Foundation Report for ${clientName}. Render the next H1 section ONLY:

  # Your Channels
    ## [one H2 per defined channel in the chart, named with the gate pair AND the channel name from the library, e.g. "The Channel of Abstraction: Gates 47 and 64"]

For each channel: 200 to 350 words. Name the two centers it connects, the consciousness side(s), what mechanic the channel produces in the body, and weave in the specific planetary activations on each of the channel's two gates from the chart spec. Quote sparingly from the source material; do not paste paragraphs verbatim. Each H2 channel section should land as a complete passage, not as a list of facts.

Do NOT write earlier sections or later sections (no Patterns, no Application, no Closing). Start directly with the H1 "Your Channels". ${wordTargetSuffix(1800, 2800)}`,
      },
      {
        name: "patterns+application+closing",
        maxTokens: 4000,
        userInstruction: `Finish the Foundation Report for ${clientName}. Render the FINAL three H1 sections:

  # Patterns
    (Gifts, Challenges, Patterns, Paradoxes woven as prose. NOT a list. Synthesize from the source material how the chart's recurring threads connect: e.g. Type + Authority interaction, profile-line concentrations across the planetary positions, open-center conditioning patterns, the way the variables shape the rest. 3 to 5 substantial paragraphs.)
  # Application
    (Practical guidance the reader can act on. Confident, mechanical, no commandments. 2 to 3 substantial paragraphs. Closes by returning them to themselves.)
  # Closing
    (One short paragraph. Repeats the lineage statement (the same wording from the front matter) and ends.)

Do NOT write earlier sections. Start directly with the H1 "Patterns". ${wordTargetSuffix(1800, 2400)}`,
      },
    ];
  }
  // "long"
  return [
    {
      name: "front+variables",
      maxTokens: 7000,
      userInstruction: `Generate the FRONT MATTER and the first two H1 sections of the Foundation Report for ${clientName}: How to Use This Report, then Your Variables (PHS) in full detail. ${wordTargetSuffix(3000, 4000)}`,
    },
    {
      name: "who+timeline",
      maxTokens: 8000,
      userInstruction: `Continue the Foundation Report for ${clientName}. Render: Who You Are (Type, Strategy, Authority, Profile, Definition, Incarnation Cross — all H2s), then Your Timeline (profile arc + planetary returns). ${wordTargetSuffix(4000, 5000)}`,
    },
    {
      name: "centers+channels",
      maxTokens: 8000,
      userInstruction: `Continue the Foundation Report for ${clientName}. Render: Your Centers (defined and undefined, one H3 per center), then Your Channels (one H2 per channel). ${wordTargetSuffix(4500, 5500)}`,
    },
    {
      name: "patterns+application+closing",
      maxTokens: 5000,
      userInstruction: `Finish the Foundation Report for ${clientName}. Render: Patterns (woven prose, no list), Application (practical, mechanical), Closing (one paragraph with the lineage statement). ${wordTargetSuffix(2000, 3000)}`,
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

export async function buildFoundationReport(args: BuildArgs): Promise<BuildResult> {
  const model = args.model ?? "claude-sonnet-4-6";
  const length = args.length ?? "standard";

  const libraryBlock = formatChunksForPrompt(args.retrieval.chunks);
  const chartBlock = serializeChart(args.client, args.chart);
  const sections = planForLength(length, args.client.name);

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
    // The user message: chart spec + section instruction + (if not the first call) a note that this is continuing.
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

    // Post-process: strip any stray em dashes (safety net for the prompt).
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

  // Concatenate sections with double-newline separators. Each section already
  // starts with the H1 it owns, so no extra divider is needed.
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
