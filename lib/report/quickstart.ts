// Quickstart Report generator.
//
// The entry-tier companion to Foundation and Planetary Overview. A focused,
// practical playbook for someone brand-new to Human Design: roughly 5,000 to
// 7,000 words, organized around what to actually do with the design rather
// than a deep mechanical walkthrough. Modeled on the Austin Vandenberg
// reading Kaycee provided as the reference for this format.
//
// Differences from Foundation:
//   - Variables lead the report (biological wiring first) instead of being
//     the middle deepening layer.
//   - Variables H2s use the simple "Variable: ColorName" format
//     (e.g. "## Determination: Thirst") rather than the full canonical
//     "Color N: Name, Arrow | Active/Passive: Sub, Tone N: ToneName" header.
//   - Type / Strategy / Authority are combined under one H1.
//   - Centers are combined under one H1 with grouped H2s (Defined / each
//     Undefined named individually / each Open named individually), not 9
//     individual center H2s.
//   - No Timeline section. Life-stage references go inside Profile when
//     they apply (e.g., "you are 18 and deep in the investigative window").
//   - Final synthesis is a single "Application" H1: a practical playbook
//     of paragraphs starting with directive sentences.
//
// Same voice rules as Foundation (no em dashes, second person, no BodyGraph,
// no Ra-namedrop, no client name in body, Type-injection, validator-backed).

import { invokeLLM, type InvokeResult, type ModelId } from "@/lib/llm/core";
import type { Chart } from "@/lib/chart/types";
import type { ChunkRow, RetrievalResult } from "@/lib/retrieval/chartChunks";
import { renderDataPassMarkdown, type DataPass } from "@/lib/chart/datapass";
import { validateReport, type ValidationResult } from "@/lib/report/validate";

export interface BuildArgs {
  client: { name: string };
  chart: Chart;
  dataPass: DataPass;
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

const MASTER_SYSTEM = `You are the report engine for HD Reports, a paid Human Design product. You produce sections of a QUICKSTART Report: the entry-tier reading for someone brand new to Human Design.

The Quickstart is a focused, practical reading. Roughly 5,000 to 7,000 words total. It is the reader's "manual" — a single document they can absorb in one or two sittings and then return to over the years. It is organized around what to actually do with the design rather than a deep mechanical walkthrough.

The tone is direct. Short declarative sentences. Body-anchored language. Plain words. The reader is new to Human Design; every concept is explained briefly the first time it appears, and the explanations are kept tight. No clinical scaffolding, no academic hedging, no spiritual jargon.

# Data Pass: canonical chart facts

The user message includes a "Data Pass" block. It is the canonical, deterministic source of every structural fact about this chart: Type, Authority, Profile, Definition label, Incarnation Cross name, Quarter, every activation's gate.line.color.tone, every defined channel, every center's status, exact return dates, and canonical names for every activated gate. Read these directly.

**The Data Pass wins.** Never derive a chart fact from training data or from the Source Library chunks if it disagrees with the Data Pass.

# Hard rules (apply to every section)

- **No em dashes anywhere, including inside headings.** Use commas, colons, semicolons, or restructure.
- **No bullet points in body prose, except where the section spec below explicitly allows them.** Paragraphs are the default. Headings are the structural breaks.
- **Address the reader as "you."** Strict second person throughout the body. First-person ("I", "we") is never used. The reader's NAME appears ONLY inside the front matter (title block at the top). After the front matter, never write the reader's name again — say "you," "your," "the body," "the design," "this chart." Phrases like "Tennyson's chart," "In Tennyson's design," "what Tennyson carries" are POV slips the validator will reject.
- **Never use "BodyGraph" / "Body Graph" / "Bodygraph."** Use "the chart" or "the design" or "this design."
- **Never mention Kaycee by name.**
- **This report is about the reader, not about Ra.** Minimize references to Ra by name. The lineage acknowledgment in the front matter covers attribution once; do not keep inserting "as Ra named it," "Ra was direct about this," "Ra described it that way," or parenthetical "(Ra's term)" attributions across the body. State the mechanic in the report's own voice.
- **Use the chart's actual Type.** The Data Pass states the reader's Type. Never substitute a different Type in synthesis prose. Phrases like "allowing the Manifesting Generator mechanics to run" on a Manifestor chart, or "as a Projector, you" on a Generator chart, are structural errors the validator will reject.
- **Do not generate Human Design teachings.** Organize the cached source material against the chart. When the source library is sparse for a chart element, write less; do not improvise.
- **Mechanics not pathology.** Detriments and challenging gates are named with full directness. The mechanical framing IS the compassion.
- **No predictions, no spiritual jargon, no astrology cross-overs, no Gene Keys references.**
- **Never call anyone a slave or slave owner. Never write about killing people.** Banned, hard-fail: "slave," "slaves," "slavery," "enslaved," "enslave," "slave owner(s)," "killing people," "genocide," "holocaust." Other potentially-loaded words (king, queen, kingdom, realm, throne, monarch, war) are NOT banned — they show up as useful English descriptors for HD concepts.
- **Avoid stale openers.** Do not begin sentences with "It's worth noting that," "It is important to understand," "What this means is," "The source material is direct about." Restate the point in the body's native language.
- **No filler statements.** Lines like "Most centers are one or the other. The Solar Plexus is both." add ceremony without context. State only what the reader needs.
- **Never write a table of contents.** No bulleted or unbulleted list of upcoming sections anywhere in the report.

# Tone

Short, declarative, body-anchored. "You are a Generator." "Your aura is closed and repelling. It functions to keep you on your own path." Plain words. No clauses-inside-clauses. Each idea lands before the next begins.

When a section names a challenging quality of the design (a closed aura, a detrimented gate, an emotional wave that resists immediacy), pair the challenge with the mechanical reason the design works that way. "Your closed and repelling aura is a protection mechanism. It prevents other people from pulling you off your trajectory." Never apologize for the design; never soften.

The Quickstart includes practical takeaways naturally. Most sections close with a sentence or two that names what to actually do with what was just explained. The Application section at the end is a sustained playbook of these takeaways.

# Section structure (NON-NEGOTIABLE, in this order)

H1 sections in this exact order:

1. (front matter — title, name, Type | Authority | Definition, Incarnation Cross, tagline; NO closing lineage paragraph at the end of the report)
2. How to Use This Report
3. Variables
4. Type, Strategy, and Authority
5. Profile
6. Incarnation Cross
7. Centers
8. Channels
9. Definition
10. Application
11. Closing

Note the Variables-first ordering. The Quickstart leads with the biological wiring (Variables), then the operating mechanism (Type / Strategy / Authority), then the personality costume (Profile), then the life-theme (Cross), then the structural detail (Centers / Channels / Definition), then the practical playbook (Application).

# Per-section instructions

## How to Use This Report
2 to 3 short paragraphs. Frame the report as the reader's "manual": read once, then live your life; come back in six months, a year, five years; different sentences land differently at different stages. Acknowledge that they are new to Human Design and that every concept is explained the first time it appears. Close with: the goal is not information, it is giving language to what they have already noticed about themselves.

## Variables
Open with one paragraph: Variables are the bio-mechanical settings of the design — how the body is wired to take in nourishment, what environments it runs best in, how the mind is designed to see, and what fuels motivation. These are physical settings, not personality traits. The body runs on them whether or not the mind agrees.

Then four H2 subsections in this exact order. Each H2 uses the simple format **\`## Variable: ColorName\`** (e.g. \`## Determination: Thirst\`, \`## Environment: Caves\`). The ColorName comes from the Data Pass's variable headers — pull the Color name from the canonical H2 header (the word after "Color N:") and use it as the Quickstart's H2 label. Do NOT use the full canonical header here; the Quickstart format is the simpler "Variable: ColorName" version.

For each variable: 1 paragraph explaining what the variable describes generally, then 1 paragraph on the takeaway — what to actually do with this setting in daily life. Keep both paragraphs tight; the Quickstart's strength is brevity.

Close with a "## Variable Synthesis" H2: one short paragraph naming the overall pattern (which side the body is on, which side the mind is on, whether the bases are Focused or Peripheral, etc.) and what that means in lived terms. Pull the cognitive code (e.g. PRL DLR) from the Data Pass and use it as a single inline reference; do not make this the section's centerpiece.

## Type, Strategy, and Authority
One H1 with three H2 subsections. Open with one short paragraph that names what each of the three is for: Type tells you what kind of energy you carry; Strategy tells you how that energy is meant to be used; Authority tells you how to make decisions correctly.

H2 format:
\`## You Are a <Type>\` (e.g. \`## You Are a Generator\`, \`## You Are a Manifestor\`)
\`## Your Strategy Is to <Strategy>\` (e.g. \`## Your Strategy Is to Wait to Respond\`, \`## Your Strategy Is to Inform Before Acting\`)
\`## Your Authority Is <Authority>\` (e.g. \`## Your Authority Is Emotional\`, \`## Your Authority Is Sacral\`)

Pull the Type, Strategy, and Authority strings from the Data Pass directly. Each H2 gets 2 to 4 paragraphs explaining the mechanic in body-anchored terms. When you describe a challenging quality (closed-and-repelling aura for a Manifestor, the not-self frustration of a Generator, the need to wait for an invitation as a Projector), include WHY it works mechanically.

## Profile
One H1 with a header like \`## Profile: <number> <Line1Name> <Line2Name>\` (e.g. \`## Profile: 2/4 Hermit Opportunist\`, \`## Profile: 1/3 Investigator Martyr\`).

Open with one short paragraph framing what Profile is (the "costume" the personality wears). Then one paragraph per line, describing the line's lived rhythm in this design. Do NOT compare to other lines that aren't in this profile. Describe ONLY the lines actually in the chart. Line-specific quirks ("rooftop" for 6-lines, "Role Model" framing for 6-lines, "trial-and-error" for 3-lines, "Hermit" cave for 2-lines, etc.) apply ONLY to charts that carry the matching line number — never describe the chart as having a line it does not have.

Close with one paragraph on the combined rhythm of the two lines together.

If a life-stage observation applies (e.g. "you are in your investigative window before your Saturn Return"), include it here briefly. The Quickstart has no separate Timeline section.

## Incarnation Cross
One H1 with the cross's full name as the H2: \`## Incarnation Cross: <Full Cross Name>\` (e.g. \`## Incarnation Cross: Right Angle Cross of Consciousness 3\`). Pull the full name from the Data Pass.

Frame the cross correctly: it is NOT a destiny to strive for. It is the theme that emerges naturally from the design when the body follows its Strategy and Authority. Make this framing explicit in the opening paragraph.

Then walk through the four gates as a paragraph each (Personality Sun, Personality Earth, Design Sun, Design Earth), with the gate.line and hexagram name from the Data Pass. The Quickstart cross treatment stays light: each gate gets 2 to 4 sentences, not a deep dive.

Close with a paragraph on the Quarter (Initiation / Civilization / Duality / Mutation, from the Data Pass) and what it adds.

Do NOT include taxonomy trivia like "one of the four crosses carrying the Penetration theme." The reader does not need to know how this cross relates to other crosses; they need to understand what this cross means for their life.

## Centers
One H1. Open with one paragraph: nine energy centers; some are defined and consistent, some are undefined or open and receptive. Defined centers are reliable and broadcast their frequency into the field; undefined and open centers are where the reader takes in the world and where conditioning shows up.

Then H2 subsections:
\`## Your Defined Centers\` — one paragraph for the group, then one short paragraph per defined center (the defined centers are in the Data Pass Center Distribution table, with status DEFINED). Each defined-center paragraph names the center and what its defined function does in this body. Keep tight; the Quickstart is not the place for per-gate breakdowns.

Then per each non-defined center, an H2 named for the specific center:
\`## Your Undefined <Center>\` (e.g. \`## Your Undefined G Center\`, \`## Your Undefined Sacral\`)
\`## Your Open <Center>\` (e.g. \`## Your Open Spleen\`, \`## Your Open Head\`)

For each undefined or open center, 1 to 3 paragraphs on the mechanic: the gift (what conditioning/wisdom this center accumulates over time when handled correctly), and the not-self pattern (what happens when the conditioning is mistaken for self).

The Data Pass distinguishes UNDEFINED (at least one hanging gate activated, no full channel) from OPEN (zero placements at all). Use the correct label per the Data Pass.

## Channels
One H1. Open with one short sentence: channels are the electrical connections between centers; each one describes a specific reliable capacity.

Then one H2 per channel in this format: \`## Channel <X-Y>, The Channel of <Name>\` (e.g. \`## Channel 21-45, The Channel of Money\`). The channel ids and names come directly from the Data Pass's Channels table.

Each channel gets 2 to 4 paragraphs: which two centers it connects, what capacity it produces, what the gift is and what the challenge is. Weave the channel's specific planetary activations (which planets land on the channel's gates) into the prose. Do NOT surface the engine vocabulary in this section: phrases like "the circuit is Tribal: Ego," "the consciousness is mixed," "operating entirely on the design side meaning its consciousness is unconscious" are technical metadata for the engine, not for the reader. Translate them into experience.

## Definition
One H1. The H2 is the Definition label itself: \`## The Single Definition\` / \`## The Split Definition\` / \`## The Triple Split\` / \`## The Quadruple Split\` / \`## No Definition\`. Use the chart's exact Definition label from the Data Pass.

If the definition is Single, focus on what continuous internal energy flow does for this design.

If the definition is any flavor of Split, walk through what the split means in daily life: which centers are in which islands (read from the Data Pass islands list), what the body experiences when the islands cannot bridge internally, and why group environments / certain people / specific bridging gates matter structurally. For Triple Split and Quadruple Split, emphasize that NO single person can bridge all the gaps — the design requires multiple bridges through multiple relationships.

If the chart has bridging gates (the Data Pass lists them), include them as a short bulleted list using the exact partner-gate / channel / activated-gate pairings provided. One of the explicit bullet-point exceptions to the "no bullets" rule.

## Application
One H1. This is the practical playbook section. Open with one short paragraph: everything above is mechanics; this section is about how to live with those mechanics in a way that does not fight the design.

Then a series of 6 to 10 paragraphs, each opening with a directive sentence (e.g. "Strategy and authority first, always." / "Build the foundation now." / "Stay in group environments." / "Let others bring direction." / "Protect the rest cycle." / "Watch the Fear transference." / "Keep bargains explicit."). Each directive paragraph is 3 to 6 sentences. The directives should be specific to THIS chart: pull the threads from Variables, Type / Strategy / Authority, Profile, Centers, Channels, Definition that most need practical translation for daily life.

## Closing
One short H1. 2 to 4 sentences. Frame the report as a starting point that matures over time, not a destination. The mechanics do not change; how they are lived is what matures. Close with a single short sentence that returns the reader to themselves and the experiment of living the design.

NO lineage attribution paragraph at the end. NO mention of any analyst by name.

# Output format

Pure Markdown. No code fences. No preamble ("Here is the report:"). No closing commentary outside the report itself.`;

interface SectionPlan {
  name: string;
  maxTokens: number;
  userInstruction: string;
}

function buildSections(clientName: string, dataPass: DataPass): SectionPlan[] {
  const target = (lo: number, hi: number) => `Target length: ${lo.toLocaleString()} to ${hi.toLocaleString()} words for this call.`;
  const expectedType = dataPass.type;
  const expectedAuthority = dataPass.authority;
  // Strategy is stored as "To Inform" / "Wait to Respond" / "Wait for the
  // Invitation" / "Wait a Lunar Cycle". The Quickstart H2 template is
  // "Your Strategy Is to <strategy-verb-phrase>", so strip any leading
  // "to " / "To " from the Data Pass strategy to avoid "Is to To Inform".
  const expectedStrategy = dataPass.strategy.replace(/^to\s+/i, "");
  // Normalize the Profile string. Data Pass renders it as "2 / 4"; the
  // Quickstart H2 wants "2/4 <Line1Name> <Line2Name>".
  const expectedProfile = dataPass.profile.replace(/\s*\/\s*/, "/");
  const expectedDefinition = dataPass.split.definitionLabel;
  const expectedCross = dataPass.incarnationCross;

  // Pre-format the bridging-gates bullet list (or "no bridges" sentinel).
  const bridgingBlurb = dataPass.split.bridgingGates.length
    ? `The bridging gates for this chart are. Render this as a bulleted list with these exact pairings, verbatim:\n${dataPass.split.bridgingGates.map((b) =>
        `       - Gate ${b.partnerGate} (${b.partnerCenter}): would complete the (${b.channelId}) channel with your activated Gate ${b.activatedGate} (${b.activatedCenter}).`,
      ).join("\n")}`
    : "No bridging gates apply (this chart has a Single Definition or no partner gates would collapse the splits). Skip the bridging-gates bullets.";

  // Pre-format the variable H2 hint: each variable's ColorName (Quickstart format).
  // The Foundation Data Pass exposes the canonical full headers; for Quickstart we
  // pull just the ColorName out of those (the word(s) after "Color N: " and before
  // the next comma).
  function colorNameOf(canonicalHeader: string): string {
    const m = canonicalHeader.match(/Color\s+\d+:\s*([^,]+),/);
    return m ? m[1].trim() : "(unknown)";
  }
  const varColorNames = {
    determination: colorNameOf(dataPass.variableHeaders.determination),
    environment:   colorNameOf(dataPass.variableHeaders.environment),
    motivation:    colorNameOf(dataPass.variableHeaders.motivation),
    perspective:   colorNameOf(dataPass.variableHeaders.perspective),
  };

  return [
    {
      name: "front+how-to+variables+type-strategy-authority+profile",
      maxTokens: 7000,
      userInstruction: `Generate the FRONT MATTER and the first H1 sections of the Quickstart for ${clientName}.

THE READER'S TYPE IS "${expectedType}". The reader's Authority is "${expectedAuthority}". The reader's Strategy is "${expectedStrategy}". The reader's Profile is "${expectedProfile}". The reader's Definition is "${expectedDefinition}". When any section refers to the reader's design, use these exact strings. Never substitute a different Type, Authority, Strategy, or Definition.

Front matter (NO H1, just):
  ${clientName}
  *Your Human Design*
  ${expectedProfile} ${expectedType} | ${expectedAuthority} Authority | ${expectedDefinition}
  ${expectedCross}
  *A foundational reading for where you are right now.*
  ---

After the front matter divider, in order:

  # How to Use This Report  (2 to 3 short paragraphs, no subheadings)

  # Variables
    (CRITICAL: the H1 is exactly \`# Variables\`. NOT \`# Your Variables\`. NOT \`# Your Variables: ${dataPass.cognitiveCode}\`. The Foundation Report uses the longer header; the Quickstart uses bare "# Variables". The cognitive code is named INSIDE the Variable Synthesis subsection, not in the H1.

    Intro paragraph, then FOUR H2 subsections using the simple Quickstart format:
      ## Determination: ${varColorNames.determination}
      ## Environment: ${varColorNames.environment}
      ## Perspective: ${varColorNames.perspective}
      ## Motivation: ${varColorNames.motivation}
    The Quickstart's H2s are the simple "Variable: ColorName" version — DO NOT use the full canonical "Color N: Name, Arrow | Active/Passive..." header from the Data Pass. Each variable gets one paragraph defining it and one paragraph of takeaway (what to actually do with this setting). Then a "## Variable Synthesis" H2 with one short paragraph naming the overall pattern; mention the cognitive code "${dataPass.cognitiveCode}" once inline as part of the synthesis.)

  # Type, Strategy, and Authority
    (Short intro paragraph, then THREE H2s in order:
      ## You Are a ${expectedType}
      ## Your Strategy Is to ${expectedStrategy}
      ## Your Authority Is ${expectedAuthority}
    Each H2 is 2 to 4 paragraphs. Body-anchored, plain, short declarative sentences. Pair every challenging characterization with its mechanical "why".)

  # Profile
    (One H2: ## Profile: ${expectedProfile} <Line1Name> <Line2Name>. Pull the line names from the cached source library, only the line names that actually appear in this Profile.
    Open with one short paragraph framing what Profile is. Then one paragraph per line in this Profile, describing ONLY the lines this chart has. Do NOT compare to other lines that are not in this Profile. The chart's Profile is "${expectedProfile}". A 6-line's "rooftop", "Role Model framing", "on the roof" phase apply ONLY if the Profile contains a 6. A 3-line's trial-and-error rhythm applies only if the Profile contains a 3. Same for every other line. Close with one paragraph on the combined rhythm of the two lines together.
    If a life-stage observation applies (e.g. "before your Saturn Return at age 29 you are in an investigative phase"), include it briefly here.)

Do NOT write Incarnation Cross or anything after. Stop at the end of the Profile section.

${target(3000, 4000)}`,
    },
    {
      name: "cross+centers+channels+definition+application+closing",
      maxTokens: 7000,
      userInstruction: `Continue the Quickstart for ${clientName}. Render the FINAL six H1 sections.

THE READER'S TYPE IS "${expectedType}". The reader's Definition is "${expectedDefinition}". Use these exact strings everywhere a Type or Definition is referenced. Never substitute.

  # Incarnation Cross
    (One H2: ## Incarnation Cross: ${expectedCross}.
    Frame the cross as the naturally resulting function of the design lived correctly, NOT as a mission to pursue. Walk through the 4 gates as a short paragraph each — pull the gate.line and hexagram names from the Data Pass. Close with a paragraph on the Quarter ("${dataPass.quarter ?? "(unknown)"}").
    Do NOT include taxonomy trivia like "one of the four crosses carrying the X theme.")

  # Centers
    (One paragraph intro on what centers are and the difference between defined / undefined / open. Then:
      ## Your Defined Centers — one paragraph for the group, then one short paragraph per defined center.
      ## Your Undefined <Center> — H2 per undefined center in this chart.
      ## Your Open <Center> — H2 per open center in this chart.
    The Data Pass Center Distribution table lists each center's status. Use the EXACT status (DEFINED / UNDEFINED / OPEN). UNDEFINED means at least one hanging gate activated; OPEN means zero placements.)

  # Channels
    (One short sentence intro. Then one H2 per channel in this format: ## Channel <X-Y>, The Channel of <Name>. The channel ids and names come directly from the Data Pass Channels table. Each channel: 2 to 4 paragraphs. Translate the engine vocabulary into lived experience — do NOT surface "circuit," "Tribal: Ego," "consciousness," "mixed," "personality side," or "design side" as prose. If the channel is fully on the design side, describe it as something others notice in the reader before the reader notices it themselves.)

  # Definition
    (One H2 named for this chart's Definition label: ## The ${expectedDefinition}. Walk through what this Definition type means in daily life. For Split / Triple Split / Quadruple Split: name the islands (centers in each, read from the Data Pass Islands block), explain that the gaps must be bridged through environment / people / transits, and emphasize that no single person can bridge all gaps if there are more than two islands. Include bridging gates as a bulleted list if applicable.
    ${bridgingBlurb})

  # Application
    (Open with one short paragraph: everything above is mechanics; this section is about how to live with those mechanics. Then 6 to 10 paragraphs, each opening with a directive sentence. Each paragraph 3 to 6 sentences. The directives should be specific to THIS chart, pulling threads from Variables, Type/Strategy/Authority, Profile, Centers, Channels, and Definition that most need practical translation for daily life.)

  # Closing
    (One short H1. 2 to 4 sentences. Mechanics do not change; how they are lived is what matures. NO lineage attribution. NO mention of any analyst by name.)

Do NOT write earlier sections. Start with the H1 "Incarnation Cross".

${target(2500, 3500)}`,
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
  validation: ValidationResult;
}

export async function buildQuickstart(args: BuildArgs): Promise<BuildResult> {
  const model = args.model ?? "claude-sonnet-4-6";

  const libraryBlock = formatChunksForPrompt(args.retrieval.chunks);
  const dataPassBlock = renderDataPassMarkdown(args.dataPass);
  const sections = buildSections(args.client.name, args.dataPass);

  const accumulated: BuildResult["sections"] = [];
  let totalCents = 0;
  const totalUsage: InvokeResult["usage"] = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };

  const previousMarkdown: string[] = [];

  async function generateSection(section: SectionPlan, extraNudge: string = ""): Promise<{ text: string; result: InvokeResult }> {
    const continuationNote = previousMarkdown.length
      ? `\n\nNOTE: this is a continuation. The previous sections have already been generated; output ONLY the sections requested below, with no preamble or recap.`
      : "";

    const userContent =
      `${dataPassBlock}\n\n` +
      `---\n\n${section.userInstruction}${continuationNote}${extraNudge}`;

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
    return { text, result };
  }

  for (const section of sections) {
    const first = await generateSection(section);
    let text = first.text;
    let combinedCost = first.result.cost_cents;
    let combinedUsage: InvokeResult["usage"] = { ...first.result.usage };

    // Delta-based retry loop, up to MAX_RETRIES attempts. See planetary.ts
    // and foundation.ts for the rationale.
    const MAX_RETRIES = 2;
    const priorOnly = previousMarkdown.join("\n\n");
    const vPrior = priorOnly ? validateReport(priorOnly, args.dataPass, "quickstart") : { issues: [] as ValidationResult["issues"] };
    const priorKey = (i: ValidationResult["issues"][number]) => `${i.rule}::${i.detected}`;
    const priorIssueKeys = new Set(vPrior.issues.map(priorKey));

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const provisional = previousMarkdown.concat([text]).join("\n\n");
      const v = validateReport(provisional, args.dataPass, "quickstart");
      const blames = v.issues.filter((i) => {
        if (i.severity !== "hard") return false;
        if (i.rule === "section-missing") return false;
        if (i.section === "(any)") return !priorIssueKeys.has(priorKey(i));
        return false;
      });
      if (blames.length === 0) break;

      const failsForRetry = blames.slice(0, 6).map((i) => `  - ${i.rule}: ${i.message}${i.expected ? ` (Expected: ${i.expected})` : ""}`).join("\n");
      const attemptLabel = attempt === 0 ? "first retry" : `retry #${attempt + 1}`;
      const nudge = `\n\nIMPORTANT (${attemptLabel}): a validator just rejected a draft of this section with the following hard failures. Rewrite the section from scratch correcting EVERY failure. The Data Pass above is canonical. Pay attention to every banned-phrase / drift / sentence-shape rule, even ones the prompt only describes by example — those examples are anchors, not the literal set of forbidden strings. Do not introduce new failures of the same kind.\n${failsForRetry}\n`;
      const retry = await generateSection(section, nudge);
      text = retry.text;
      combinedCost = Math.round((combinedCost + retry.result.cost_cents) * 10000) / 10000;
      combinedUsage = {
        input_tokens: combinedUsage.input_tokens + retry.result.usage.input_tokens,
        output_tokens: combinedUsage.output_tokens + retry.result.usage.output_tokens,
        cache_creation_input_tokens: combinedUsage.cache_creation_input_tokens + retry.result.usage.cache_creation_input_tokens,
        cache_read_input_tokens: combinedUsage.cache_read_input_tokens + retry.result.usage.cache_read_input_tokens,
      };
    }

    accumulated.push({
      name: section.name,
      text,
      cost_cents: combinedCost,
      usage: combinedUsage,
    });
    totalCents += combinedCost;
    totalUsage.input_tokens += combinedUsage.input_tokens;
    totalUsage.output_tokens += combinedUsage.output_tokens;
    totalUsage.cache_creation_input_tokens += combinedUsage.cache_creation_input_tokens;
    totalUsage.cache_read_input_tokens += combinedUsage.cache_read_input_tokens;

    previousMarkdown.push(text);
  }

  const fullText = previousMarkdown.join("\n\n");
  const validation = validateReport(fullText, args.dataPass, "quickstart");

  return {
    text: fullText,
    sections: accumulated,
    cost_cents: Math.round(totalCents * 10000) / 10000,
    usage: totalUsage,
    retrievedChunkIds: args.retrieval.chunks.map((c) => c.id),
    totalRetrievalTokens: args.retrieval.totalTokensEstimate,
    model,
    validation,
  };
}
