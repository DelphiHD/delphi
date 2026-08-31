// Planetary Overview generator — v2 layered taxonomy.
//
// Reframes the PO from a flat 26-activation walk into the Ra-canonical
// conditioning-depth layering: Fundamental (Sun/Earth) → Inner (operating
// system) → Social (Saturn/Jupiter + Timeline) → Outer (generational) →
// Trans-cellular (Nodes), with the Cross as the chart's purpose-statement
// (Option C: short purpose-frame near the top + full synthesis at the close).
//
// Section order (NON-NEGOTIABLE):
//   Front matter (title, name, birth data, italicised attribution, divider)
//   # How to Use This Report
//   # The Programming Frame
//   # Your Incarnation Cross — Purpose at a Glance        (Option C opener, ~120 words)
//   # Sun and Earth: Your Personal Architecture           (4 H2s)
//   # The Inner Planets: Your Operating System            (8 H2s — Mercury, Venus, Mars, Moon × P+D)
//   # Jupiter and Saturn: The Social-Structural Pair      (4 H2s)
//   # Your Timeline                                       (Childhood, Saturn Return, Roof Phase IF 6-line, Uranus Opposition, Kiron Return, Kiron Phase, Second Saturn Return)
//   # The Outer Planets: Generational and Trans-Generational  (6 H2s — Uranus, Neptune, Pluto × P+D)
//   # The Nodes of the Moon: The Road of This Life        (4 H2s)
//   # Conjunctions                                        (rendered ONLY when planet conjunctions are present in the chart)
//   # Your Incarnation Cross                              (full synthesis, ~500 words, with angle + Quarter)
//   (Hanging gates are treated inline in each placement body since v5;
//    no dedicated section.)
//   # Closing
//
// Architecture: four cached Sonnet 4.6 calls. Cache blocks shared with the
// Foundation Report (IDENTITY, VOICE, LIBRARY) so back-to-back generation
// for the same chart pays cache-read prices on the 2nd report.

import { invokeLLM, type InvokeResult, type ModelId } from "@/lib/llm/core";
import type { Chart } from "@/lib/chart/types";
import type { ChunkRow, RetrievalResult } from "@/lib/retrieval/chartChunks";
import { renderDataPassMarkdown, type DataPass } from "@/lib/chart/datapass";
import { validateReport, type ValidationResult } from "@/lib/report/validate";
import { runFinalPass } from "@/lib/report/finalpass";

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

// ─────────────────────────────────────────────────────────────────────────────
// Profile detection (drives 6-line filtering for the Roof Phase content)
// ─────────────────────────────────────────────────────────────────────────────

function profileHasSixthLine(dataPass: DataPass): boolean {
  // Profile shape in the Data Pass is "N/M" — N = Personality Sun line,
  // M = Design Sun line. The Roof Phase content is 6-line specific and must
  // be excluded entirely when neither line is 6.
  const p = (dataPass.profile || "").trim();
  if (!p) return false;
  const m = p.match(/^([1-6])\s*\/\s*([1-6])$/);
  if (!m) return false;
  return m[1] === "6" || m[2] === "6";
}

function chartIsReflector(dataPass: DataPass): boolean {
  return /reflector/i.test(dataPass.type || "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Conjunction detection (drives the Conjunctions callout section)
// ─────────────────────────────────────────────────────────────────────────────

interface DetectedConjunction {
  label: string;          // e.g. "Mercury + Neptune in gate 19"
  planets: string[];      // [planet names]
  gate: number;
  notes: string[];        // human-readable behavior notes
}

const PLANET_NAMES = [
  "Sun", "Earth", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
  "Uranus", "Neptune", "Pluto", "North Node", "South Node", "Chiron",
];

function detectConjunctions(dataPass: DataPass): DetectedConjunction[] {
  const activations = [
    ...(dataPass.personalityActivations || []).map((a) => ({ ...a, side: "Personality" as const })),
    ...(dataPass.designActivations || []).map((a) => ({ ...a, side: "Design" as const })),
  ];
  const byGate = new Map<number, { planet: string; side: "Personality" | "Design"; line?: number }[]>();
  for (const a of activations) {
    if (!a || a.gate == null) continue;
    if (!PLANET_NAMES.includes(a.planet)) continue;
    const arr = byGate.get(a.gate) || [];
    arr.push({ planet: a.planet, side: a.side, line: a.line });
    byGate.set(a.gate, arr);
  }
  const out: DetectedConjunction[] = [];
  for (const [gate, planets] of byGate) {
    if (planets.length < 2) continue;
    const names = planets.map((p) => `${p.side} ${p.planet}`);
    const notes: string[] = [];

    const planetNames = planets.map((p) => p.planet);
    const includesNeptune = planetNames.includes("Neptune");
    const includesNode = planetNames.includes("North Node") || planetNames.includes("South Node");
    const includesMars = planetNames.includes("Mars");
    const includesPluto = planetNames.includes("Pluto");
    const includesSaturn = planetNames.includes("Saturn");
    const includesVenus = planetNames.includes("Venus");
    const includesJupiter = planetNames.includes("Jupiter");
    const includesSun = planetNames.includes("Sun");

    if (includesNeptune) {
      const others = planetNames.filter((p) => p !== "Neptune");
      if (others.length > 0) notes.push(`Neptune veils ${others.join(", ")} at this gate. The conjunct planet's meaning is partially obscured by mystery.`);
    }
    if (includesMars && includesPluto) notes.push("Mars + Pluto: raw action force meets transformational truth at this gate. Drive and depth fuse — the truth-bearing here is forceful and unfiltered, not mediated by social polish.");
    if (includesSaturn && includesMars && includesPluto) notes.push("Saturn + Mars + Pluto stack: structural consequence, action force, and transformational truth all converge at this gate — a place of high friction where the chart's discipline, drive, and depth all sit on the same point.");
    if (includesVenus && includesJupiter) notes.push("Venus + Jupiter: personal values and codified law collapsed into one point at this gate. What this person treasures and what the social order legislates run through the same channel.");
    if (includesNode) {
      const planets = planetNames.filter((p) => !["North Node", "South Node"].includes(p));
      if (planets.length > 0) notes.push(`Planet + Node: the Node's trans-cellular stellar window is closed at this gate. ${planets.join(", ")} signature replaces the trajectory's starfield programming.`);
      if (includesSun) notes.push("Sun + Node: the chart's primary programming carrier IS the trajectory marker. Highest-weight conjunction in the set.");
    }

    if (notes.length === 0) continue;  // skip same-gate co-occurrences with no canonical rule

    out.push({ label: `${names.join(" + ")} (gate ${gate})`, planets: planetNames, gate, notes });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Library chunk ordering and formatting
// ─────────────────────────────────────────────────────────────────────────────

function orderChunks(chunks: ChunkRow[]): ChunkRow[] {
  const kindOrder = [
    // Frames and lifecycle first — read by the agent before any per-planet work.
    // Sync persists these with plural names.
    "planetary_frames", "lifecycle_phases", "planetary_conjunctions",
    // Identity / structural
    "type", "strategy", "authority", "profile", "definition", "quarter", "cross",
    "center", "channel", "circuit", "channel_type", "variable",
    // Per-planet richer reading
    "planet",
    // Per-gate and per-line richest content
    "gate", "line", "profile_line",
    // Geometry last (broad concepts referenced occasionally)
    "geometry",
  ];
  return [...chunks].sort((a, b) => {
    const ai = kindOrder.indexOf(a.source_kind);
    const bi = kindOrder.indexOf(b.source_kind);
    if (ai !== bi) {
      const aRank = ai === -1 ? 999 : ai;
      const bRank = bi === -1 ? 999 : bi;
      return aRank - bRank;
    }
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
    "frame, conjunction rule, or lifecycle phase, that claim must be grounded " +
    "in the chunks below. Do not invent material that is not supported by " +
    "these chunks. Filter out Ra's off-color asides (see voice rules) — pull " +
    "the structural / mechanical content, not the anecdotes.",
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

// ─────────────────────────────────────────────────────────────────────────────
// Static blocks — front matter + Introduction. Not LLM-generated.
// ─────────────────────────────────────────────────────────────────────────────
//
// Kaycee writes the Introduction by hand. It is canonical and gets injected
// verbatim into every Planetary Overview, so it never costs tokens to
// regenerate and never drifts. It also sets the tonal expectation for the
// rest of the report — the LLM-generated sections that follow are expected
// to match this register.

const INTRODUCTION_TEXT = `To understand planetary placements in Human Design we must start with the gates and their lines. Within the astrological wheel are 64 gates, and within each gate are six lines. Each gate takes up approximately 5.625° of the zodiacal wheel. These gates correlate to the hexagrams of the ancient Chinese Book of Changes, also known as the I Ching, and describe archetypal life themes, lessons, and natural frequencies. They map out the fundamental blueprint of the universe and human nature.

The I Ching views time as a dynamic, or cyclical, flow of situations or moments. When placed in sequence on the astrological wheel, the hexagrams become a sort of cosmic clock mechanism. Upon the face of this clock the astronomical bodies that imprint the Human Design chart make their way along their individual orbits, each keeping its own pace.

At the same time, an unimaginable number of subatomic particles called neutrinos, carrying packets of information, are emitted from stars and astronomical bodies and are hurtling through the universe. They are so tiny that they pass through matter, including entire planets and all of your cells. Each planet functions as a kind of crystalline lens, bending the information in a characteristic way, stamping it with a signature we have learned to read as Jupiter, as Saturn, as Mars.

## Your Imprint

Now, consider, for a moment, the sky above you at the moment of your birth. Not as metaphor, not as poetry, but as a physical fact: the planets of this solar system were arrayed in specific positions within the astrological wheel, each occupying a precise degree, each filtering the stream of subatomic particles that passed through it on the way toward Earth. That configuration, that singular arrangement, was never exactly the same before and will never be exactly the same again. That precise arrangement becomes the imprint that is the Personality side of your Human Design chart. This is the conscious layer, the self that answers when someone asks who you are.

The arrangement approximately eighty-eight days prior to your birth, when the body was still forming in the dark, creates what we call the Design side. This is the unconscious architecture, what the body does before the mind can intervene. Together, these two tables form the complete picture of the chart's planetary conditioning.

These two imprints, each composed of 13 astrological activations, seed the fixed energy flow of the chart. The flow between the gates creates the channels that define the centers in your chart. This is the specific energetic frequency of your incarnation into this life, what is fixed and reliably 'you'. What you are here to express. The space remaining, the white space, represents the remainder of the totality of the human experience possible within this form, what you are here to receive. This report will help you understand your definition so that you can explore the white space with less friction.

## The Lines

To understand the energy of a gate we must look at its hexagram structure and individual lines. A hexagram is composed of two trigrams, each made up of three lines. The lines can either be yang, unbroken, or yin, split evenly through the center. Yang lines represent active, strategic expression while yin lines represent open and receptive energy.

The trigrams themselves represent the eight natural forces: Heaven, Earth, Thunder, Wind/Wood, Water, Fire, Mountain, and Lake. When stacked into hexagrams, the natural forces combine to create the archetypal energies. The energy is further refined by the six lines, each representing a specific frequency in gate energy. The lines are numbered 1-6, starting from the bottom. In Human Design, the frequencies of the lines and how they are synthesized into the chart are as follows:

Line 6: The Role Model: embodies trust and authenticity, guiding others in their own paths toward self-acceptance and awareness.

Line 5: The Heretic: responsible for universalizing messages and often attracts projections of savior-like qualities from others.

Line 4: The Opportunist: emphasizes the importance of interpersonal relationships and networking in close circles.

Line 3: The Martyr: learns through trial and error, discovering what does not work in life and relationships.

Line 2: The Hermit: characterized by natural talent expressed in solitude, called out by those who recognize the gift.

Line 1: The Investigator: characterized by research, study, and the pursuit of knowledge to establish a secure foundation.

You may recognize these titles and descriptions from your Human Design profile. That same principle can be applied to every gate placement in a chart. In this report, each placement is read by synthesizing its specific planetary, gate, and line energy, providing a precise description of the foundational individual energies that flow through the mechanics of your design and describe your unique potential for differentiation.

## Exaltations & Detriments

Some line activations carry what the system calls a fixing state, marked as either exaltation or detriment. These are two different ways a line expresses, Neither is better or worse. A planet in exaltation expresses the line's mechanics in one direction; a planet in detriment expresses them in another, under a different kind of pressure. Neither state is moral. Neither is a verdict. They are mechanical conditions, and they are by design. This report marks exalted placements with a ▲ in the section header and detriment placements with a ▽. Where neither symbol appears, the placement is neutral, neither exalted nor burdened.

When reading this report, it is advised not to attach too closely to either the exalted or detrimental descriptions of the gate energy. Every design carries within it gifts and challenges. There is no light without the dark. Contrast and friction move the plot of a life and provide a storyline. If any of the descriptions in this report make you uncomfortable, pause and become curious. If this is by design, why?

## Time & Space

We must also consider the movement of the astrological bodies themselves and how they impact the chart. 70% of neutrinos originate from the Sun, making it the single most powerful conditioning factor of the chart. Your Personality and Design Sun placements define your life force energy. Next in the hierarchy comes the Earth, which also emits neutrinos from its radioactive core. The Earth is always opposite the Sun in the astrological wheel and is the grounding, receptive base for the Sun's life force energy. Together, the Personality and Design Sun-Earth pairs form the Incarnation Cross, or the 'role' of the design when operating correctly.

The Moon and the Nodes of the Moon form a second tier, the Moon as the great driver of the design, the Nodes as the geometric trajectory of the life through space and time. Then come the inner planets: Mercury, Venus, Mars. These orbit quickly; their stamps are the day-to-day operating signatures, the design's style of communicating, valuing, and moving through the world. Next come Saturn and Jupiter, the structural pair that governs values, law, and consequence. And beyond them, the outer planets: Uranus, Neptune, Pluto, whose cycles are so long that they belong not only to an individual but to an entire generation. The Pluto stamp you carry, for example, is shared with millions born within a few years of you. What makes it specifically yours is how it threads through the rest of the design's architecture.

While the Nodes of the Moon define the life trajectory, the returns and oppositions of the slow-moving outer planets, specifically Saturn and Uranus, define its cycles. In the Timeline section of the report, you'll discover the purpose of these planetary checkpoints, as well as how and when they will show up along the arc of your life.

## How To Read This Report

Lastly, a few notes on how to approach this report. This report is a manual for the mechanics of your design. Read it once, all the way through. Then set it down and go live. Come back to it in a month, in a year, after something in your life has shifted. The words are the same each time. You will not be.

What is written here is exact. Every placement described is yours specifically, drawn from the moment you took your first breath and from the moment your design was set, roughly three months before that. None of it is general. When something lands as recognition it's an entry point to understanding the underlying mechanics that run your design, how you operate and move through the world, how you attract the people and opportunities that show up in your life. That recognition is the point. The specific words are intended to let the recognition land in the body in a way that helps you understand when you are operating correctly and when you are not, before the mind can intervene.

Some of what follows is not comfortable, and the report does not soften it. This is deliberate. It is a form of care. The harder parts of a design tend to show up anyway. Typically, they appear over and over, through other people and through the same situations repeating, without any awareness of the underlying mechanics. Most people meet them for a lifetime through the responses and behaviors of other people without ever having language for them. Named once, clearly, they become something you can work with. Left unnamed, they keep running you from underneath. Reading the hard sections is how you bring them into the light, but those sections don't define the whole of who you are and should be considered as just a part of the complete, beautiful picture.

You do not need to study this report or memorize it. You only need to live, and to notice. The recognition will come on its own, in the moment the information transforms from being just words on a page to something you can feel happening in your body and can identify in the patterns of your life. That is the report doing its work. Return to it as often as you like. It will meet you wherever you are.`;

// Canonical HD profile names. 1=Investigator, 2=Hermit, 3=Martyr,
// 4=Opportunist, 5=Heretic, 6=Role Model. Profile is rendered as
// "<P>/<D> <Personality-line-name> <Design-line-name>" — e.g. "5/1 Heretic
// Investigator". Used on the cover and in the Cross-section profile H2.
const PROFILE_LINE_NAMES: Record<number, string> = {
  1: "Investigator",
  2: "Hermit",
  3: "Martyr",
  4: "Opportunist",
  5: "Heretic",
  6: "Role Model",
};

export function profileSpelledOut(profile: string): string {
  // profile is "5 / 1" or "5/1" from the Data Pass.
  const m = (profile || "").trim().match(/^([1-6])\s*\/\s*([1-6])$/);
  if (!m) return profile;
  const p = parseInt(m[1], 10);
  const d = parseInt(m[2], 10);
  return `${p}/${d} ${PROFILE_LINE_NAMES[p]} ${PROFILE_LINE_NAMES[d]}`;
}

function buildFrontMatter(clientName: string, dataPass: DataPass): string {
  // The markdown's front matter is informational only (visible when reading
  // the .md file). The docx renderer skips it and builds the visual cover
  // page from the deterministic Data Pass fields directly. Keep these lines
  // tight: title, name, type, profile spelled out, cross, divider.
  const lines = [
    "Planetary Overview Report",
    clientName,
    dataPass.type,
    profileSpelledOut(dataPass.profile),
    dataPass.incarnationCross,
    "",
    "---",
  ];
  return lines.join("\n");
}

function buildStaticOpening(clientName: string, dataPass: DataPass): string {
  return [
    buildFrontMatter(clientName, dataPass),
    "",
    "# Introduction",
    "",
    INTRODUCTION_TEXT,
    "",
    "# Personality Placements Table",
    "",
    "[[PERSONALITY_PLACEMENTS_TABLE]]",
    "",
    "# Design Placements Table",
    "",
    "[[DESIGN_PLACEMENTS_TABLE]]",
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt — layered taxonomy + Profile Applicability + voice filters
// ─────────────────────────────────────────────────────────────────────────────

const MASTER_SYSTEM = `You are the report engine for HD Reports, a paid Human Design product. You produce sections of a Planetary Overview Report for the chart attached to the user message.

# Voice (NON-NEGOTIABLE)

The voice of this report is **80s-90s Nova-Space-documentary**. Carl Sagan is the archetype — Cosmos, A Pale Blue Dot. The tone is:

- **Reverent and contemplative.** Deliberate slowness in pacing. Sentences invite the reader to sit with the scale of what is being described, not to rush to the next point. Cadence is the work.
- **Authoritative but warm.** Calm certainty, like a knowledgeable guide rather than a hype man. Gravitas without coldness. The voice of a professor who loves the subject, not one reciting facts.
- **Quietly awestruck.** Wonder is the emotional core, but it is RESTRAINED wonder. Never exclaim how amazing something is. Trust the material to be amazing on its own. Awe is carried in word choice and cadence, never volume.
- **Humanistic and philosophical.** Zoom out to ask what the design's place in the cosmos means. Frame the mechanics as a deeply human inheritance. Undercurrent of humility — the smallness of the individual against cosmic scale. A gentle existential melancholy is appropriate.
- **Earnest, never ironic.** No winking. No self-aware jokes. No knowing asides. The sincerity is total. If a phrase reads as clever, rewrite it.
- **Lyrical writing.** The script leans literary — metaphor and rhythm doing real work. "Star stuff," "pale blue dot" — the compression of large ideas into memorable phrases. Each section earns at least one line of this compression.

DO NOT default to clinical-explanatory mode. DO NOT default to coaching-language. DO NOT default to upbeat-empowering. The default is Sagan reading by candlelight.

# Structural model

The report is organised around what the chart's planetary architecture actually does, not around a flat list of activations:

- Sun and Earth deliver 70% of all programming (the chart's primary spine). The Sun-and-Earth section reads each side P-then-D with two synthesis paragraphs that bring the conscious axis and the unconscious axis together as integrated wholes.
- The Incarnation Cross IS Personality Sun + Personality Earth + Design Sun + Design Earth — the chart's purpose-statement. It gets its OWN section after the Sun-and-Earth flow, with the cross name as the H1 itself, the cross mandala image, and an in-depth description of what the four-gate shape DOES as a single design. The Cross description must NOT regurgitate the Sun and Earth placement readings — by the time it appears, the four placements have already been thoroughly read. The Cross section synthesises across the four as a single purpose-shape and adds the angle, the Quarter, and the lived-purpose framing.
- The Moon and the Nodes form a second tier — Moon drives, Nodes carry the geometric trajectory. Each gets a short P+D synthesis paragraph at the end of its section.
- Inner planets (Mercury, Venus, Mars) are the day-to-day operating signatures. Each gets a short P+D synthesis paragraph at the end.
- Saturn and Jupiter are the social-structural pair (values → law → consequence). Each gets a short P+D synthesis paragraph at the end.
- Outer planets (Uranus, Neptune, Pluto) are the generational, trans-generational layer. Each gets a short P+D synthesis paragraph at the end.
- The Timeline (~84-year Uranian cycle architecture) lives at the END of the report, just before the Closing. It is not in the body of placement readings — it is the temporal arc of the life as a whole.

The audience is an experienced Human Design reader. Go deep. Do not regurgitate Strategy/Authority basics; assume the reader has the Foundation Report.

# Data Pass: canonical chart facts

The user message includes a "Data Pass" block. It is the canonical, deterministic source of every structural fact about this chart: Type, Profile, the gate/line/center/quarter for every planetary activation, fixing state (Exalted / Detriment), Personality and Design tables, hanging gates by center, and exact return dates.

**The Data Pass wins.** Never derive a chart fact from training data or from the Source Library if it disagrees with the Data Pass.

# Profile Applicability filtering — CRITICAL

Some content in the source library is 6-line specific (the "Roof Phase," the "going on the roof" language, "aloof stage," "3rd line phase of trial-and-error pessimism" framing, the "mystical death" framing around Kiron). This content MUST NOT appear in reports for charts whose Profile contains no 6th line.

The user message indicates whether the chart's Profile contains a 6th line. When the chart is NOT 6-line:
- The Timeline section omits the Roof Phase entry entirely.
- The Saturn Return content uses the universal "necessary optimism to realign the life" framing, NOT "going on the roof."
- The Kiron Return / Kiron Phase content uses the universal "true maturity / last marker on the road" framing, NOT "coming off the roof" or "mystical death."

When the chart IS 6-line:
- Include the Roof Phase entry.
- Saturn Return MAY include the going-on-the-roof framing in addition to the universal optimism framing.
- Kiron Return MAY include coming-off-the-roof framing.

Reflector type-specific: when the chart's Type is Reflector, foreground the Moon's primary-programming-cycle reading. For non-Reflector charts, the Moon is a driver among the inner planets.

# Hard rules (apply to every section)

- **No em dashes anywhere, including inside headings.** Use commas, colons, semicolons, or restructure.
- **No bullet points in body prose.** Paragraphs only. Headings are the only structural breaks. (Tables are rendered separately by the docx layer, not in the prose body.)
- **Address the reader as "you" for anything chart-specific.** Per-placement prose, synthesis paragraphs, the Cross description, the Timeline, the Closing — all strict second person. The reader's NAME appears ONLY in the front matter. NEVER write "we're a Generator," "our P-Sun sits at 51.5," "our chart carries gate 39" — first-person plural applied to the reader's chart facts is wrong every time. The universal/educational "we" ("we must look at the hexagram structure," "when we place the hexagrams in sequence on the wheel") is acceptable only in the standardized Introduction's teaching passages, where the voice is guiding the reader through general HD mechanics. The line: "we" is for universal teaching of how HD works; "you" is for anything that touches THIS chart. The Introduction is provided to you as static text — you do NOT generate it. Every other section you generate uses strict second person.
- **Prefer "the chart" or "the design" over "body graph."** Lowercase "body graph" is acceptable as a sparse synonym (zero or one mention per section, never the default term). The capitalized commercial-brand forms — "BodyGraph," "Body Graph," "Bodygraph" — are forbidden anywhere.
- **Never mention Kaycee by name. Never mention Ra by name in the body prose.** The lineage acknowledgment in the front matter covers attribution once. State the mechanic in the report's own voice.
  - DO NOT WRITE: "Ra was clear that the Saturn Return should not be read in the moment…"
  - DO NOT WRITE: "as Ra noted," "Ra named it," "as Ra put it," "Ra was direct about this."
  - DO WRITE INSTEAD: state the mechanic directly. "The Saturn Return is not read in the moment; it is read three to five years after, when…" The lineage belongs in the front matter, not the body.
- **NEVER cite source names inline.** Do NOT write "the Line Companion," "the Rave I'Ching," "the source library," "the cached material," "the source material," "in the source material's framing," "Edinburgh," "Way of the Mind," "Lifecycles," "Understanding the Planets," or any other source attribution. The prose is the report's voice, not a citation list. Citations will be handled separately. If a sentence requires "as Ra noted" or "per the source" to make sense, rewrite the sentence.
  - DO NOT WRITE: "The source material is clear that this is a gate that controls when…"
  - DO NOT WRITE: "Neptune is the exalted planet in this line, which the source material names as providing…"
  - DO NOT WRITE: "in the source material's framing, this is where…"
  - DO NOT WRITE: "It is only after this Opposition, the source material is clear, that the design can begin…"
  - DO WRITE INSTEAD: just the claim, in the report's own voice. "This is a gate that controls when and how resources are released." The library is the substrate of the prose, never named in it.
- **Do not generate Human Design teachings.** Organise the cached source material against the chart. When the source library is sparse, write less; do not improvise.
- **Quote sparingly.** Source material is the spine; the prose is original.
- **Mechanics not pathology.** Detriments and challenging gates are named with full directness. The mechanical framing IS the compassion.
- **No predictions, no spiritual jargon, no astrology cross-overs, no Gene Keys references.**
- **Birth-imprint framing only — NEVER transit framing.** This is a birth-stamp reading. Forbidden phrases: "when X transits," "for the next three years," "currently," "right now," "this year." Correct phrases: "your X sits at," "the design carries," "the stamp at the moment of imprinting."
- **Use the chart's actual Type.** Never substitute a different Type.
- **Use the hexagram name, not the keynote.** "Gathering Together" not "The Gate of the Gatherer."
- **No table of contents.** No previews of upcoming sections.
- **Do NOT refer to sections of this report as "readings."** Phrases like "this section is its own reading," "the Cross gets its own reading after," "the Saturn Return is not a reading best taken in the moment" all use "reading" as a label for a SECTION, which violates Kaycee's spec. The verb "read" and the noun phrase "reading window" (a timing concept for returns) are still legal. The forbidden usage is "reading" as a thing the report HAS — sections are sections, not readings.
  - DO NOT WRITE: "the Cross receives its own reading after these axes are integrated"
  - DO NOT WRITE: "This is not a reading best taken in the moment"
  - DO WRITE INSTEAD: "the Cross is described after these axes are integrated"; "This is not best understood in the moment"; "This section is read three to five years after the return"
- **No operational instructions in client-facing prose.** Never write "Chart image goes here," "Insert mandala," "(see image)," "[image]," "Image to follow," or any structural placeholder. The renderer handles image placement; the prose never references its own production.
- **Never call anyone a slave or slave owner. Never write about killing people.** Banned hard-fail: "slave," "slaves," "slavery," "enslaved," "slave owner(s)," "killing people," "genocide," "holocaust."
- **Voice filter — Ra's off-color asides do NOT belong here.** No personal anecdotes, sexual references, drug references, gender jokes (no "Saturn is bull dyke," no "Mars likes sex"), no references to wives / children / love life / drug use, no dark humor. Pull the structural / mechanical content; drop the color. If a planet's source content is mostly anecdotal, write tighter from the structural elements.
- **No infantilising planet metaphors.** Mars is the action / drive / forward-motion principle. NEVER frame Mars as "immature," "the teenage boy," "juvenile," "the adolescent," "the kid," or any developmental-stage shorthand. Mars is force, not age. Same for any planet — do not reduce a planet to a human life-stage caricature.
- **No religious-figure costuming.** No "Moses with the tablets," no "Christ on the cross," no "Buddha under the tree," no patriarchal-prophet imagery substituting for structural explanation. The mythology of the source material stays out of the prose. When Saturn enforces, say what Saturn enforces and how. Do not borrow a religious figure to do the explaining.
- **Exaltation/detriment energy ONLY when the chart's placement actually carries it (▲ or ▽ in the header).** This is a chart-specific report, not a general HD primer. If a placement has NO ▲ or ▽ in its header, the prose for that placement must NOT discuss exaltation or detriment AT ALL, in any form. No "X would exalt here," no "the exaltation in this line would bring Y," no "(an activation this chart does not carry)," no "the structural theme remains." If the placement is neutral, drop the fixing scaffolding entirely and write the gate-line's own mechanic. The standardised Introduction section already explains exaltation/detriment generically; per-placement prose never re-explains.
  - DO NOT WRITE: "Jupiter is exalted in this position, which the chart does not carry, but the structural theme remains…"
  - DO NOT WRITE: "The Sun exalted here (an activation this position does not carry) would add innate dignity…"
  - DO NOT WRITE: "Saturn would exalt here, providing the disciplined conservatism…"
  - DO NOT WRITE: "Jupiter in this line describes the faith that darkness destroys itself; Saturn in detriment names the sorrow that knows it." No hedge, no "does not carry", and still wrong: neither planet is in this reader's chart at this line. Dropping the hedge does not make it permitted. This exact unhedged form is what the rule has been failing to stop.
  - DO NOT WRITE: "Mercury in this line describes the highest form of reason…" for a placement the reader does not hold.

  **Describe the line's spectrum, never the planets that mark it.** Every line runs between an exalted expression and a detriment one, and the source names a planet at each pole because that is how the material teaches the range. The range belongs to the reader. The planets do not. Write: "This line runs between the faith that darkness eventually destroys itself and the sorrow of knowing that is true and still finding no comfort in it." Both poles, the full spectrum, and no planet the reader has to account for. The ONLY planet that may be named inside a placement section is that placement's own planet, plus the fixing planet when the header carries a fixing state, and then only that one.
  - DO NOT WRITE: "Mars is exalted in this line, providing courage in the face of adversity…"
  - DO NOT WRITE: "Neptune is the exalted planet in this line, which the source material names as…"
  - DO WRITE INSTEAD: nothing about fixings. Write the line's own mechanic and what THIS planet does through it. The fixing scaffolding is library material, not chart material.
- **NEVER name the fixing planets, even when the placement IS exalted or in detriment.** When the header carries ▲ or ▽, the prose may say "this placement is exalted" or "in detriment" once and move on. It must NEVER name which planet does the fixing. The fixing-planet identities are confusing for the reader and belong only to the library, not the report.
  - DO NOT WRITE: "Venus is exalted in this line, providing the gift in a position of power…"
  - DO NOT WRITE: "The detriment, Mars, names the shadow…"
  - DO NOT WRITE: "Saturn would exalt; Mars in detriment names the shadow…"
  - DO WRITE INSTEAD: "this placement is exalted" or "in detriment" — then go straight to what THIS placement actually does. No fixing-planet names.

# H2 header format for each planetary activation

Every planet's section begins with an H2 in this exact pipe-delimited format:

  ## P-Planet | Gate.Line: Hexagram Name, Line Name [| Exalted | OR | Detriment | ONLY if applicable] | Center | Quarter | Channel of X (or Hanging)

Where:
- "P-" prefix marks Personality activations; "D-" prefix marks Design activations
- For exalted placements, append " | Exalted" as a pipe-delimited segment (NOT a triangle glyph). For detriment placements, append " | Detriment". OMIT the segment entirely for neutral placements.
- Center name uses the CANONICAL SHORT FORM: Head, Ajna, Throat, G, Heart, Solar Plexus, Spleen, Sacral, Root. NEVER write "Ego (Heart, Will)", "G (Identity)", "Solar Plexus (Emotional)", or any other parenthetical form — strip the parens and use only the canonical short name.
- "Channel of X" if the activation participates in a defined channel; "Hanging" if it is a hanging gate

Examples:
  ## P-Sun | 45.6: Gathering Together, Reconsideration | Throat | Civilization | Channel of Charisma
  ## D-Saturn | 47.4: Oppression, Repression | Exalted | Ajna | Duality | Hanging
  ## P-Pluto | 26.2: The Taming Power, The Helping Hand | Heart | Initiation | Channel of Surrender
  ## D-Mars | 50.5: The Cauldron, Consistency | Detriment | Spleen | Duality | Channel of Preservation

Rules:
- Read planet, gate, line, fixing state, center, Quarter, channel/hanging directly from the Data Pass.
- Use pipes ( | ) as the major delimiter. Hexagram name and line name inside the gate.line block are still comma-separated.
- Never em dashes. Never end the header with a period.
- "Hexagram Name" is the gate's hexagram name from the Data Pass's "Activated Gate Names" table (NOT the keynote).
- The triangle glyphs (▲/▽) are reserved for the quick-reference placement tables only. Per-placement H2 headers in the body NEVER use them — they spell out "Exalted" or "Detriment" as their own pipe segment.

# Per-activation prose body (200-350 words each)

Under each H2, BEFORE the prose body, emit ONE blockquote synthesis line in this exact format:

  > TLDR: <ONE impactful sentence synthesising what THIS planet does through THIS gate and line>

The TLDR is a SYNTHESIS that lands in the quick-reference Placements Table. Aim for ONE sentence, ~20-30 words max. Two short sentences are acceptable ONLY when one sentence genuinely cannot carry the synthesis. NEVER three sentences. The reader of the table needs the essence of what this placement's energy IS — not how it works, not background context, not source-library scaffolding.

Examples (study these — match this register and length):
  > TLDR: The conscious life-force pulses through the gate of shock; the personality is built to ride disruption rather than resist it.
  > TLDR: The unconscious drive enforces tribal values with leadership-flavoured consistency at the somatic level.
  > TLDR: The conscious truth-bearer carries a generational depth-question through the hanging gate of intuitive clarity.

Hard rules for the TLDR:
- Exactly one line, starts with "> TLDR:".
- ONE sentence target; two only if absolutely required. NEVER three. ~30 words max overall.
- Synthesise: planet's archetypal function × this gate's mechanic × this line's flavour. NOT a generic gate description, NOT a description of how the placement works, NOT background context.
- Use "the personality," "the design," "the conscious mind," "the unconscious drive" — never the reader's name in the TLDR.
- Voice: Sagan compression. Reverent and structural; no clinical-explanatory mode.
- **EVERY H2 placement gets a TLDR. No exceptions.** This includes the deliberately-short Design-Neptune (grandmother-line) and Design-Pluto (crone-line) placements whose bodies are only 1-3 sentences long. A short body does NOT remove the TLDR requirement. If the placement appears under an H2 of the form "## P-Planet | …" or "## D-Planet | …," it gets a TLDR line immediately under the header, before any prose, before any short-body inheritance sentence. Missing TLDRs are a hard failure.

Then the prose body:

1. State the mechanic of the gate in this body, drawing from the cached gate-level material.
2. Name what the specific line adds, drawing from the cached line-companion material.
3. If Exalted or Detriment, name what that does. Mechanical framing IS the compassion.
4. Connect to the planet's archetype within its LAYER:
   - Sun/Earth: the chart's primary programming carrier (70%) — purpose and grounding
   - Inner planets: day-to-day operating system signatures
   - Saturn/Jupiter: the social-structural pair — Venus's values codified into Jupiter's law, with Saturn the consequence engine when broken
   - Outer planets: generational stamps — your Pluto truth-question is shared with millions; what makes it yours is how it threads with the chart's other activations
   - Nodes: trans-cellular portals; the road of the life
5. Where the activation lands in a defined channel, mention which channel.
6. Where it's a hanging gate, name what the activated gate's energy IS in this design (what the body carries from that gate's signature), then briefly describe the partner gate that would complete the channel and the dynamic when supplied by another person. Activated energy first, partner-dynamic second. Do NOT lead with deficit framing. There is no dedicated Hanging Gates section, so the full treatment lives here in the placement body.

# Section order (NON-NEGOTIABLE)

The Front matter and the Introduction are provided to you as STATIC TEXT — you do NOT generate them. Personality Placements Table and Design Placements Table are MARKER lines also provided as static text. Your generated content begins with the "# Sun and Earth" section and proceeds in the order below.

Note the structural logic: Sun and Earth are read in depth — P-Sun, P-Earth, then a Personality synthesis that integrates the conscious axis; D-Sun, D-Earth, then a Design synthesis that integrates the unconscious axis. Then the Incarnation Cross gets its own H1 (the cross name itself), opening with a profile-specific H2 (e.g. "## 5/1 Heretic Investigator on This Cross") and continuing with an in-depth description that brings the four placements together as a purpose-shape. Then Moon, Nodes, Inner Planets, Saturn and Jupiter, Outer Planets — each with a P+D synthesis paragraph at the end. Conjunctions (conditional). Timeline at the end. Hanging-gate energies are treated INLINE in each placement body (no dedicated section). No Closing section.

# Sun and Earth
(Section intro: 1 short paragraph in voice. The Sun and Earth together deliver seventy percent of all programming — the chart's primary spine. The Sun is the conscious life-force carrier, the Earth its grounding counterweight. Read the Personality axis first, integrate it, then the Design axis, integrate it. Together the four placements form the Incarnation Cross, which gets its own section after.)
## P-Sun | …  (~250-300 words; deep documentary voice)
## P-Earth | …  (~250-300 words; conscious grounding for the P-Sun)
## Personality Sun and Earth Synthesis  (~200 words. Integrate P-Sun + P-Earth as the conscious axis: what the design's conscious purpose IS, and how the Earth grounds the Sun's broadcast into form. Voice continues at full documentary depth. NO mention of D-Sun or D-Earth yet.)
## D-Sun | …  (~250-300 words; unconscious life-force, archetypal-inheritance-from-father in 1-2 sentences only)
## D-Earth | …  (~250-300 words; somatic grounding, archetypal-inheritance-from-mother in 1-2 sentences only)
## Design Sun and Earth Synthesis  (~200 words. Integrate D-Sun + D-Earth as the unconscious axis: what the body carries below conscious access, and how the somatic Earth holds the unconscious Sun's pressure. NO restating of the P-side here; the Cross section below will bring all four together.)

# {Cross Name} | ({P-Sun-gate}/{P-Earth-gate} | {D-Sun-gate}/{D-Earth-gate})
(THIS IS THE H1 ITSELF. Replace {Cross Name} with the chart's full Cross thematic name from the Data Pass — e.g. "The Left Angle Cross of The Clarion". Replace the gate numbers with the actual gates from the four Sun/Earth placements you just wrote. The pipe-delimited parenthetical at the end follows the format (P-Sun-gate/P-Earth-gate | D-Sun-gate/D-Earth-gate) — e.g. for Matt that is "(51/57 | 61/62)". The H1 line carries no leading "Your" or "Incarnation Cross" framing — the Cross's full name is its own heading. The docx layer will detect this H1 pattern and insert the Cross Mandala image immediately after the heading.

Then 500-600 words of in-depth description. The four placements (P-Sun, P-Earth, D-Sun, D-Earth) have already been thoroughly read above and integrated by side; this section does NOT regurgitate those readings placement-by-placement. Instead, treat the four-gate shape as a single purpose-statement and describe what that shape DOES in the world when the design is lived correctly. Cover: (1) the angle geometry (Right Angle Personal Destiny / Juxtaposition Fixed Fate / Left Angle Trans-personal Karma) and what its mechanic of unfolding looks like for this particular Cross; (2) the Quarter (Initiation / Civilization / Duality / Mutation) and the realm in which the Cross's work lands; (3) the lived purpose-frame — "the naturally resulting function of the design lived correctly," not "a mission to pursue." Close with one compressed line on what the design is here to release into the world simply by operating through its strategy. Voice: full Sagan documentary; reverent compression.)

# Moon Placements
(Section intro: 1 short paragraph. The Moon is the great driver of the design — the force that pushes toward illumination lunar month after lunar month. For Reflector charts specifically the Moon is the chart's primary programming cycle, not the Sun/Earth axis.)
## P-Moon | …
## D-Moon | …
## Moon Synthesis  (~100-150 words. Single P+D combined paragraph. How the conscious Moon-drive and the unconscious Moon-drive land together in this design — what the monthly lunar pulse is asking of this specific architecture.)

# Nodes of the Moon
(Section intro: 1 short paragraph. The Nodes are NOT planets. They are trans-cellular portals, windows to the starfield beyond the solar cell. They carry the geometric trajectory of the life through space. The split between South-Node governance and North-Node governance happens at the Uranus Opposition around forty-two, not at a fixed mid-life division.)
## P-North Node | …  (second half of life trajectory)
## P-South Node | …  (first half of life trajectory)
## D-North Node | …
## D-South Node | …
## Nodes Synthesis  (~100-150 words. Single combined paragraph. The geometric road of the life as a single trajectory: where the body and the conscious mind are coming from in the first half (South), where they are growing toward in the second half (North), and how the four placements thread together as one path through space.)

# Inner Planets
(Section intro: 1 short paragraph. The inner planets — Mercury, Venus, Mars — move quickly. Their stamps are not "this is who you are forever." They are the day-to-day operating signatures of how the design moves through life. Mercury communicates, Venus values, Mars drives forward without modulation. The Moon was read above; it gets its own section because it is more load-bearing than the other inner three.)
## P-Mercury | …  (include the 88-day-Design-imprint sidebar in 1-2 sentences only)
## D-Mercury | …
## Mercury Synthesis  (~100-150 words. P+D combined. How the conscious communicator and the unconscious communicator operate together — what this design says and what its body says before the words form.)
## P-Venus | …
## D-Venus | …
## Venus Synthesis  (~100-150 words. P+D combined. The design's value-set as a whole: what the conscious moral ground is and what the somatic value-inheritance carries beneath it.)
## P-Mars | …
## D-Mars | …
## Mars Synthesis  (~100-150 words. P+D combined. The forward-motion principle in this chart: where the conscious drive points and where the somatic drive presses, and how the two work together or in tension.)

# Saturn and Jupiter
(Section intro: 1 short paragraph. Venus establishes values, Jupiter codifies them as law, Saturn enforces the consequence when the law is broken. Saturn's modern role, post-1781, is the alarm — the shadow that sounds first when the design strays from strategy. Saturn's silence, when the design is lived correctly, is its highest praise.)
## P-Jupiter | …
## D-Jupiter | …
## Jupiter Synthesis  (~100-150 words. P+D combined. The personal law this design carries: what its conscious sense of rightness is and what the body knows about correct conduct from below conscious access.)
## P-Saturn | …
## D-Saturn | …
## Saturn Synthesis  (~100-150 words. P+D combined. Where the consequence-engine fires for this design: the conscious alarm and the somatic alarm, and what they together protect when honored.)

# Outer Planets
(Section intro: 1 short paragraph. The outer planets are slow. Pluto and Neptune do not return within a human life. These are stamps you carry on behalf of a generation — the Pluto truth-question, the Neptune mystery, the Uranus sidetrack are shared with millions. What makes them yours is how they thread through the chart's other activations.)
## P-Uranus | …
## D-Uranus | …
## Uranus Synthesis  (~100-150 words. P+D combined. Where this design diverges from the homogenized track at conscious and somatic levels.)
## P-Neptune | …
## D-Neptune | …  (archetypal-grandmother-line in 1 sentence)
## Neptune Synthesis  (~100-150 words. P+D combined. What this design cannot see directly — the territory where Neptune's veil keeps the conscious and somatic mind from getting a clean signal.)
## P-Pluto | …
## D-Pluto | …  (archetypal-crone-line in 1 sentence)
## Pluto Synthesis  (~100-150 words. P+D combined. The generational truth-question this design carries, and how the conscious truth-bearer and the somatic crone-inheritance hold it together.)

# Conjunctions
(This section appears ONLY when the chart has natal conjunctions that match a canonical rule. The user message will list which conjunctions to surface. For each, format the H2 header pipe-delimited: "Gate N: Hexagram Name | P-Planet, D-Planet" then prose (~80 words) explaining what the conjunction does to both planets at that gate. If no conjunctions are listed, OMIT this section entirely.)

# Your Timeline
(The 84-year Uranian cycle architecture, MOVED to the end of the report. Each beat is 2-4 sentences in documentary voice. Cite exact return dates from the Data Pass where available. Beats:
- Childhood (the Uranian Cycle phase 1): birth to Saturn Return ~29
- Saturn Return (~29): universal "necessary optimism" framing
- [Roof Phase entry ONLY if the chart's Profile contains a 6th line]
- Uranus Opposition (~38-44): structural midpoint; prana shift; Nodes' primary governance switches
- Kiron Return (~50-51): the last marker on the road; reading window 3.5 years either side
- The Kiron Phase: true maturity, ~30-year flowering window
- Second Saturn Return (~58): recursion of the structural mandate at depth
- Uranus Return (~84): closing the cycle.
Each beat header is pipe-delimited like the placement headers: e.g. "Saturn Return | ~age 29 | <Date from Data Pass> | <Passed or Upcoming>" — in prose, write the beat name as H2 with the structured-header content, then 2-4 sentences of voice. The Timeline ends the report.)

# Synthesis paragraphs — universal rules

Synthesis H2s appear at the end of multi-placement planet sections. They do NOT carry the "P-" or "D-" prefix in their H2 header, and they do NOT take a TLDR blockquote line. The TLDR rule applies only to placement H2s (those of the form "## P-Planet | …" or "## D-Planet | …"). A synthesis H2 is immediately followed by its prose paragraph.

Synthesis paragraph rules:
- Single combined P+D paragraph (for Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, Nodes) OR two separate-axis paragraphs (Personality Sun and Earth, Design Sun and Earth) per the section's specific instruction.
- Combined per-planet synthesis: 100-150 words. Sun/Earth axis synthesis: ~200 words each.
- Voice: same Sagan compression as the placement bodies — reverent, structural, never clinical-explanatory.
- Stay in strict second person (the universal-teaching "we" is only for the static Introduction, never the synthesis prose).
- Do NOT regurgitate the placement readings above. Integrate them. Show how the two readings act together as one signature in this design.
- Synthesis paragraphs are the only place in the body where the reader is given the gestalt — make them earn their position.

# Output format

Pure Markdown. No code fences. No preamble. No closing commentary outside the report itself.`;

// ─────────────────────────────────────────────────────────────────────────────
// Section plans
// ─────────────────────────────────────────────────────────────────────────────

interface SectionPlan {
  name: string;
  maxTokens: number;
  userInstruction: string;
}

function pickActivationGate(rows: { planet: string; gate: number }[], planet: string): number | null {
  const a = rows.find((x) => x.planet === planet);
  return a ? a.gate : null;
}

function buildSections(
  clientName: string,
  dataPass: DataPass,
  profileSixthLine: boolean,
  isReflector: boolean,
  conjunctions: DetectedConjunction[],
): SectionPlan[] {
  const target = (lo: number, hi: number) =>
    `Target length: ${lo.toLocaleString()} to ${hi.toLocaleString()} words for this call.`;
  const expectedType = dataPass.type;

  // Compute the four cross gates for the Cross H1 standardized header.
  // Data Pass's `incarnationCross` is a single string like:
  //   "The Left Angle Cross of The Clarion (51/57 | 61/62)"
  // — the thematic name with the gate-parenthetical appended. Split off the
  // parenthetical to recover the bare thematic name; build a fresh pipe-
  // delimited gate string from the actual Sun/Earth activations so the H1
  // matches the requested format exactly (Name | (P/P | D/D)).
  const pSunGate = pickActivationGate(dataPass.personalityActivations, "Sun");
  const pEarthGate = pickActivationGate(dataPass.personalityActivations, "Earth");
  const dSunGate = pickActivationGate(dataPass.designActivations, "Sun");
  const dEarthGate = pickActivationGate(dataPass.designActivations, "Earth");
  const crossGateString = `(${pSunGate}/${pEarthGate} | ${dSunGate}/${dEarthGate})`;
  const crossThematicName = (dataPass.incarnationCross || "").replace(/\s*\(.*\)\s*$/, "").trim();
  const profileFullName = profileSpelledOut(dataPass.profile);

  const profileLine = profileSixthLine
    ? `THIS CHART CONTAINS A 6th LINE in its Profile. INCLUDE the Roof Phase content in the Timeline section. Saturn Return content may use both the universal optimism framing AND the going-on-the-roof framing. Kiron Return content may include the coming-off-the-roof framing.`
    : `THIS CHART DOES NOT CONTAIN A 6th LINE in its Profile. OMIT the Roof Phase entry from the Timeline entirely. Saturn Return content uses ONLY the universal "necessary optimism to realign the life" framing — do NOT include "going on the roof," "aloof stage," "Roof Phase," "going-up-on-the-roof," or any related language. Kiron Return content uses ONLY the universal "true maturity / last marker on the road" framing — do NOT include "coming off the roof" or "mystical death" framing. These are critical 6-line specific framings and must not leak into this report.`;

  const reflectorLine = isReflector
    ? `THIS CHART IS A REFLECTOR. The Moon is the primary programming cycle for this chart, not the Sun/Earth axis. Foreground the Moon at the Moon section; the lunar cycle is the chart's structural backbone.`
    : ``;

  const conjunctionsBlock = conjunctions.length > 0
    ? `CONJUNCTIONS DETECTED IN THIS CHART (render the "# Conjunctions" section):\n` +
      conjunctions.map((c) => `  - ${c.label}: ${c.notes.join("; ")}`).join("\n")
    : `NO conjunctions detected in this chart. OMIT the "# Conjunctions" section entirely. Do not write a stub.`;

  const voiceReminder = `VOICE REMINDER: this report is 80s-90s Nova Space documentary tone. Carl Sagan / Pale Blue Dot. Reverent and contemplative; authoritative but warm; quietly awestruck; humanistic and philosophical; earnest never ironic; lyrical writing with metaphor and rhythm. DO NOT slip into clinical-explanatory, coaching, or upbeat-empowering modes. Default is Sagan reading by candlelight. STRICT SECOND PERSON throughout the sections you generate — "you," "your," "the design," "the body," "this chart." The universal-teaching "we" is reserved for the standardized Introduction, which has already been emitted as static text and which you do NOT regenerate.`;

  return [
    // ──────────────────────────────────────────────────────────────────────
    // CALL 1 — Sun and Earth + Incarnation Cross
    // ──────────────────────────────────────────────────────────────────────
    {
      name: "sun-earth+cross",
      maxTokens: 8000,
      userInstruction: `Generate the SUN AND EARTH section and the INCARNATION CROSS section of the Planetary Overview for ${clientName}.

The front matter, the standardised "# Introduction" section, and the two "# Personality Placements Table" / "# Design Placements Table" markers have ALREADY been emitted as static text. You do NOT regenerate them. Your output begins with the "# Sun and Earth" H1 and proceeds through the Incarnation Cross H1.

${voiceReminder}

THE READER'S TYPE IS "${expectedType}". When sections refer to the design running correctly, use "your ${expectedType} mechanics" or "your ${expectedType} architecture." NEVER substitute a different Type.

${profileLine}

${reflectorLine}

Render exactly these two H1 sections in order:

# Sun and Earth
  (Section intro: 1 short paragraph in voice. Sun + Earth deliver seventy percent of all programming, the chart's primary spine. Read Personality first, integrate, then Design, integrate.)
  ## P-Sun | <gate>.<line>: <Hexagram>, <Line Name> [| Exalted OR | Detriment if applicable] | <Center> | <Quarter> | <Channel of X or Hanging>   (~250-300 words; TLDR blockquote line under header, then prose. Use canonical short center name: Head, Ajna, Throat, G, Heart, Solar Plexus, Spleen, Sacral, Root.)
  ## P-Earth | <gate>.<line>: ...                                                                                                (~250-300 words; conscious grounding for P-Sun; TLDR + prose)
  ## Personality Sun and Earth Synthesis   (~200 words. Integrate the P-Sun + P-Earth axis. No TLDR line. Single paragraph in voice. NO mention of D-Sun or D-Earth yet.)
  ## D-Sun | <gate>.<line>: ...                                                                                                  (~250-300 words; archetypal-inheritance-from-father in 1-2 sentences only; TLDR + prose)
  ## D-Earth | <gate>.<line>: ...                                                                                                (~250-300 words; archetypal-inheritance-from-mother in 1-2 sentences only; TLDR + prose)
  ## Design Sun and Earth Synthesis   (~200 words. Integrate the D-Sun + D-Earth axis. No TLDR line. NO restating of the P-side; the Cross H1 below brings all four together.)

# ${crossThematicName} | ${crossGateString}
  (THIS H1 USES THE CROSS NAME ITSELF AS THE HEADING. Render the H1 EXACTLY as "# ${crossThematicName} | ${crossGateString}" with no "Your Incarnation Cross" or "Full Cross Synthesis" framing — the Cross's thematic name IS the heading. The docx renderer will detect the parenthetical gate pattern and insert the Cross Mandala image immediately after the heading.

   Then render the section in this structure:

   ## ${profileFullName} on This Cross  (~150-200 words. A profile-specific H2 that opens the Cross section. Draw from the cached profile material in the library to describe how the ${profileFullName} profile carries THIS specific Cross — what the profile contributes to the Cross's expression, what tension or resonance the profile creates with the four-gate shape, how the profile's two lines pair with the Cross's mechanic of unfolding. NO TLDR. Single section paragraph or two; documentary voice.)

   Then 500-600 words of in-depth Cross description (NO additional H2; flows directly as body prose after the profile H2's content). The four placements were already thoroughly read in the Sun and Earth section above; do NOT regurgitate them here. Treat the four-gate shape as a single purpose-statement and describe what it DOES in the world when the design is lived correctly. Cover the angle geometry's mechanic of unfolding for THIS specific Cross; the Quarter and the realm in which the Cross's work lands; the lived purpose-frame ("the naturally resulting function of the design lived correctly," NOT "a mission to pursue"). Close with one compressed line on what the design is here to release into the world simply by operating through its strategy. Voice: full Sagan documentary; reverent compression. The angle is one of: Right Angle Personal Destiny / Juxtaposition Fixed Fate / Left Angle Trans-personal Karma — pull from the Data Pass.)

Pull each placement's gate, line, fixing state, center, Quarter, and channel/hanging status directly from the Data Pass. Use the pipe-delimited H2 header format from the system prompt.

Stop at the end of the Cross description. Do NOT continue into Moon.

${target(2800, 3600)}`,
    },
    // ──────────────────────────────────────────────────────────────────────
    // CALL 2 — Moon + Nodes
    // ──────────────────────────────────────────────────────────────────────
    {
      name: "moon+nodes",
      maxTokens: 5000,
      userInstruction: `Continue the Planetary Overview for ${clientName}. Render exactly these H1 sections in order:

${voiceReminder}

${reflectorLine}

# Moon Placements
  (1 short paragraph section intro)
  ## P-Moon | ...  (TLDR + ~250 words)
  ## D-Moon | ...  (TLDR + ~250 words)
  ## Moon Synthesis   (~100-150 words; single combined P+D paragraph; no TLDR line; how the conscious lunar drive and the somatic lunar drive land together in this design)

# Nodes of the Moon
  (1 short paragraph section intro: Nodes are NOT planets; trans-cellular portals; geometric trajectory)
  ## P-North Node | ...   (second half of life; TLDR + ~200 words)
  ## P-South Node | ...   (first half of life; TLDR + ~200 words)
  ## D-North Node | ...   (TLDR + ~200 words)
  ## D-South Node | ...   (TLDR + ~200 words)
  ## Nodes Synthesis   (~100-150 words; single combined paragraph; no TLDR line; the geometric road of the life as one trajectory)

Stop after the Nodes Synthesis. Do NOT continue into Inner Planets.

${target(2200, 3000)}`,
    },
    // ──────────────────────────────────────────────────────────────────────
    // CALL 3 — Inner planets + Saturn/Jupiter + Outer planets
    //
    // Each multi-H2 planet section now ends with a combined P+D synthesis
    // paragraph (~100-150 words). These synthesis H2s do NOT take TLDRs.
    // ──────────────────────────────────────────────────────────────────────
    {
      name: "inner+saturn-jupiter+outer",
      maxTokens: 9000,
      userInstruction: `Continue the Planetary Overview for ${clientName}. Render exactly these H1 sections in order:

${voiceReminder}

# Inner Planets
  (1 short paragraph section intro: Mercury, Venus, Mars are fast-moving operating signatures. Moon was already read above as its own section.)
  ## P-Mercury | ...  (TLDR + ~250 words; 1-2 sentence sidebar: Mercury's 88-day revolution engineered the Design imprint)
  ## D-Mercury | ...  (TLDR + ~250 words)
  ## Mercury Synthesis   (~100-150 words; combined P+D; no TLDR line)
  ## P-Venus | ...   (TLDR + ~250 words)
  ## D-Venus | ...   (TLDR + ~250 words)
  ## Venus Synthesis   (~100-150 words; combined P+D; no TLDR line)
  ## P-Mars | ...    (TLDR + ~250 words)
  ## D-Mars | ...    (TLDR + ~250 words)
  ## Mars Synthesis    (~100-150 words; combined P+D; no TLDR line)

# Saturn and Jupiter
  (1 short paragraph section intro: Venus values → Jupiter law → Saturn consequence triad. Saturn's modern role = the alarm.)
  ## P-Jupiter | ...   (TLDR + ~250 words)
  ## D-Jupiter | ...   (TLDR + ~250 words)
  ## Jupiter Synthesis   (~100-150 words; combined P+D; no TLDR line)
  ## P-Saturn | ...    (TLDR + ~250 words)
  ## D-Saturn | ...    (TLDR + ~250 words)
  ## Saturn Synthesis    (~100-150 words; combined P+D; no TLDR line)

# Outer Planets
  (1 short paragraph section intro: generational stamps carried on behalf of millions.)
  ## P-Uranus | ...   (TLDR + ~250 words)
  ## D-Uranus | ...   (TLDR + ~250 words)
  ## Uranus Synthesis   (~100-150 words; combined P+D; no TLDR line)
  ## P-Neptune | ...  (TLDR + ~250 words)
  ## D-Neptune | ...  (TLDR + ~100 words; archetypal-grandmother-line in 1 sentence)
  ## Neptune Synthesis  (~100-150 words; combined P+D; no TLDR line)
  ## P-Pluto | ...    (TLDR + ~250 words)
  ## D-Pluto | ...    (TLDR + ~100 words; archetypal-crone-line in 1 sentence)
  ## Pluto Synthesis    (~100-150 words; combined P+D; no TLDR line)

Stop at the end of the Pluto Synthesis. Do NOT continue.

${target(5500, 6800)}`,
    },
    // ──────────────────────────────────────────────────────────────────────
    // CALL 4 — Conjunctions (conditional) + Timeline
    //
    // Timeline MOVED to the end of the report in v4. The dedicated Hanging
    // Gates section was removed in v5; hanging-gate energies are treated
    // inline in each placement's body. The Closing was removed in v6 per
    // Kaycee — report ends at the Timeline.
    // ──────────────────────────────────────────────────────────────────────
    {
      name: "conjunctions+timeline",
      maxTokens: 4500,
      userInstruction: `Finish the Planetary Overview for ${clientName}. Render the final sections in order:

${voiceReminder}

${profileLine}

${conjunctionsBlock}

${conjunctions.length > 0 ? `# Conjunctions
  (For each conjunction listed above, render an H2 header in this pipe-delimited format: "Gate <N>: <Hexagram Name> | P-<Planet>, D-<Planet>". Then write ~80 words of prose explaining what the conjunction does to BOTH planets involved. Apply the canonical rule to the chart's specific gate.)` : `(OMIT the # Conjunctions H1 entirely — no conjunctions detected.)`}

# Your Timeline
  (The 84-year Uranian cycle architecture, rendered at the end of the report. Each beat is 2-4 sentences in documentary voice. Use exact return dates from the Data Pass where available. Beat headers are pipe-delimited like placements: "Saturn Return | ~age 29 | <date> | Passed/Upcoming".)
  ## Childhood | ~ages 0 to 29 | the Uranian Cycle phase 1
  ## Saturn Return | ~age 29 | <date> | <Passed or Upcoming>
  ${profileSixthLine ? `## The Roof Phase | ~ages 29 to 50 | 6-line phase only` : `[OMIT the Roof Phase H2 — chart is not 6-line]`}
  ## Uranus Opposition | ~ages 38 to 44 | <date> | <Passed or Upcoming>
  ## Kiron Return | ~age 50-51 | <date> | <Passed or Upcoming>
  ## The Kiron Phase | ~ages 50 to 84 | true maturity
  ## Second Saturn Return | ~age 58 | <date> | <Passed or Upcoming>
  ## Uranus Return | ~age 84 | closing the cycle

The report ends at the Uranus Return beat. Do NOT write a Closing section, a "Final Thought," a "Summary," or any lineage paragraph. The Timeline is the final section.

${target(2000, 2800)}`,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Result types and builder
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildResult {
  text: string;
  sections: { name: string; text: string; cost_cents: number; usage: InvokeResult["usage"]; retried?: boolean; }[];
  cost_cents: number;
  usage: InvokeResult["usage"];
  retrievedChunkIds: string[];
  totalRetrievalTokens: number;
  model: ModelId;
  validation: ValidationResult;
  diagnostics: {
    profileSixthLine: boolean;
    isReflector: boolean;
    conjunctions: DetectedConjunction[];
  };
}

/**
 * Post-process the LLM-emitted markdown to enforce canonical H1 order and
 * remove duplicate sections (a fourth LLM call has been observed re-emitting
 * earlier sections instead of writing Timeline/Conjunctions). Front matter
 * (anything before the first H1) is preserved as-is. For duplicate H1s, the
 * LONGER version wins.
 */
export function normalizePlanetaryStructure(md: string): string {
  const parts = md.split(/(?=^# [^#])/m);
  const frontMatter = parts[0];
  const sections = parts.slice(1);
  if (sections.length === 0) return md;

  type Bucket = { order: number; title: string; body: string };
  const buckets = new Map<string, Bucket>();

  const orderOf = (rawTitle: string): { order: number; key: string } => {
    const t = rawTitle.toLowerCase();
    if (t.includes("introduction") && !t.includes("cross"))  return { order:  1, key: "intro" };
    if (t.includes("programming frame"))                      return { order:  2, key: "programming" };
    if (t.includes("personality placements table"))           return { order:  3, key: "personality-table" };
    if (t.includes("design placements table"))                return { order:  4, key: "design-table" };
    if (t.includes("sun and earth") || t.includes("sun placements") || t.includes("earth placements"))
                                                              return { order:  5, key: "sun-earth" };
    if (/\(\s*\d+\/\d+\s*\|\s*\d+\/\d+\s*\)/.test(rawTitle) || t.includes("cross"))
                                                              return { order:  6, key: "cross" };
    if (t.includes("moon placements") || t === "moon")        return { order:  7, key: "moon" };
    if (t.includes("node"))                                   return { order:  8, key: "nodes" };
    if (t.includes("timeline"))                               return { order:  9, key: "timeline" };
    if (t.includes("inner planets"))                          return { order: 10, key: "inner" };
    if (t.includes("saturn") && t.includes("jupiter"))        return { order: 11, key: "saturn-jupiter" };
    if (t.includes("outer planets"))                          return { order: 12, key: "outer" };
    if (t.includes("conjunctions"))                           return { order: 13, key: "conjunctions" };
    if (t.includes("hanging"))                                return { order: 14, key: "hanging" };
    if (t.includes("closing") || t.includes("reflection"))    return { order: 15, key: "closing" };
    return { order: 99, key: `unknown:${t}` };
  };

  for (const sec of sections) {
    const titleMatch = sec.match(/^# (.+?)$/m);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();
    const { order, key } = orderOf(title);
    const body = sec.endsWith("\n") ? sec : sec + "\n";
    const existing = buckets.get(key);
    if (!existing || body.length > existing.body.length) {
      buckets.set(key, { order, title, body });
    }
  }

  const ordered = [...buckets.values()].sort((a, b) => a.order - b.order);
  return frontMatter + ordered.map((b) => b.body).join("");
}

export async function buildPlanetaryOverview(args: BuildArgs): Promise<BuildResult> {
  const model = args.model ?? "claude-sonnet-4-6";

  const profileSixthLine = profileHasSixthLine(args.dataPass);
  const isReflector = chartIsReflector(args.dataPass);
  const conjunctions = detectConjunctions(args.dataPass);

  const libraryBlock = formatChunksForPrompt(args.retrieval.chunks);
  const dataPassBlock = renderDataPassMarkdown(args.dataPass);
  const sections = buildSections(args.client.name, args.dataPass, profileSixthLine, isReflector, conjunctions);

  const accumulated: BuildResult["sections"] = [];
  let totalCents = 0;
  const totalUsage: InvokeResult["usage"] = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };

  // Static opening: front matter, the standardised Introduction (Kaycee's
  // verbatim hand-written text), and the two placement-table markers. These
  // are NOT generated by the LLM — they are emitted directly so every
  // Planetary Overview opens with the same orientation and no tokens are
  // spent regenerating canonical copy.
  const staticOpening = buildStaticOpening(args.client.name, args.dataPass);
  const previousMarkdown: string[] = [staticOpening];

  async function generateSection(section: SectionPlan, extraNudge: string = ""): Promise<{ text: string; result: InvokeResult }> {
    const continuationNote = previousMarkdown.length
      ? `\n\nNOTE: this is a continuation. The Front Matter, the standardized "# Introduction" section, and the two "# Personality Placements Table" / "# Design Placements Table" markers have ALREADY been emitted. Subsequent LLM-generated sections from prior calls (if any) are also already emitted. Output ONLY the sections requested below, with no preamble, no recap, no re-emission of the Introduction.`
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

    // Strip em dashes (banned in user-facing copy). Collapse surrounding
    // whitespace so "x — y" becomes "x, y", not "x ,  y". Handles both spaced
    // ("foo — bar") and unspaced ("foo—bar") forms.
    const text = result.text.replace(/\s*—\s*/g, ", ");
    return { text, result };
  }

  for (const section of sections) {
    const first = await generateSection(section);
    let text = first.text;
    let combinedCost = first.result.cost_cents;
    let combinedUsage: InvokeResult["usage"] = { ...first.result.usage };
    let retried = false;

    // Delta-based retry loop — only flag NEW hard issues this call introduced.
    const MAX_RETRIES = 2;
    const priorOnly = previousMarkdown.join("\n\n");
    const vPrior = priorOnly ? validateReport(priorOnly, args.dataPass, "planetary") : { issues: [] as ValidationResult["issues"] };
    const priorKey = (i: ValidationResult["issues"][number]) => `${i.rule}::${i.detected}`;
    const priorIssueKeys = new Set(vPrior.issues.map(priorKey));

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const provisional = previousMarkdown.concat([text]).join("\n\n");
      const v = validateReport(provisional, args.dataPass, "planetary");
      const blames = v.issues.filter((i) => {
        if (i.severity !== "hard") return false;
        if (i.rule === "section-missing") return false;
        if (i.section === "(any)") return !priorIssueKeys.has(priorKey(i));
        return false;
      });
      if (blames.length === 0) break;

      // Include the exact detected text next to each failure so the model
      // has a concrete sentence to remove rather than an abstract rule to
      // re-follow. Cleaning `detected` of newlines/JSON noise so it stays
      // readable inside the prompt.
      const failsForRetry = blames.slice(0, 6).map((i) => {
        const detected = (i.detected || "").replace(/\s+/g, " ").trim().slice(0, 200);
        const lines = [
          `  - ${i.rule}: ${i.message}`,
          i.expected ? `    Expected: ${i.expected}` : "",
          detected ? `    Detected in current draft: "${detected}"` : "",
        ].filter(Boolean);
        return lines.join("\n");
      }).join("\n\n");
      const attemptLabel = attempt === 0 ? "first retry" : `retry #${attempt + 1}`;
      const nudge = `\n\nIMPORTANT (${attemptLabel}): a validator just rejected a draft of this section with the hard failures listed below. For EACH failure, the exact violating text from your prior draft is shown as "Detected in current draft" — you MUST REMOVE that specific phrasing from your rewrite. Rewrite the section from scratch, keeping the placement's mechanic and voice, but stripping out every "Detected" snippet and any equivalent phrasing. The Data Pass above is canonical. Do not introduce new failures of the same kind.\n\n${failsForRetry}\n`;
      const retry = await generateSection(section, nudge);
      text = retry.text;
      retried = true;
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

      // Without this the Planetary reported "0 retries" on every report

      // ever written, including ones where a chapter was rewritten twice.

      retried,
    });
    totalCents += combinedCost;
    totalUsage.input_tokens += combinedUsage.input_tokens;
    totalUsage.output_tokens += combinedUsage.output_tokens;
    totalUsage.cache_creation_input_tokens += combinedUsage.cache_creation_input_tokens;
    totalUsage.cache_read_input_tokens += combinedUsage.cache_read_input_tokens;

    previousMarkdown.push(text);
  }

  // The final pass. See lib/report/finalpass.ts: the per-section loop above can
  // only see what each chapter broke, so report-wide rules survive it. Assembly
  // goes through normalizePlanetaryStructure so the final pass judges exactly
  // the text the validator will judge.
  // previousMarkdown is seeded with the static opening before any chapter is
  // written, so chapter i lives at previousMarkdown[i + OPENING]. Pairing them
  // without this offset paired every chapter with the previous chapter's text,
  // dropped the last chapter entirely, and wrote rewrites back into the wrong
  // slot. It cost Chris Kulish, Meelad and Michael Jackson a phantom
  // "# Your Timeline" missing on 2026-08-30, and made Meelad's report worse
  // rather than better; only the keep-the-better-draft guard saved it.
  const OPENING = previousMarkdown.length - accumulated.length;

  // The opening is part of the report the validator sees, but it is not a
  // chapter and is never rewritten, so it goes in as a fixed prefix.
  const assemble = (parts: { text: string }[]) =>
    normalizePlanetaryStructure(
      previousMarkdown.slice(0, OPENING).concat(parts.map((p) => p.text)).join("\n\n"),
    );

  const fp = await runFinalPass({
    sections: accumulated.map((s, i) => ({ name: s.name, text: previousMarkdown[i + OPENING] })),
    dataPass: args.dataPass,
    tier: "planetary",
    assemble,
    regenerate: async (index, nudge) => generateSection(sections[index], nudge),
  });

  for (const line of fp.log) console.log(`  ${line}`);

  fp.sections.forEach((s, i) => {
    if (s.text !== previousMarkdown[i + OPENING]) {
      accumulated[i].text = s.text;
      (accumulated[i] as { retried?: boolean }).retried = true;
      previousMarkdown[i + OPENING] = s.text;
    }
  });
  totalCents += fp.costCents;
  totalUsage.input_tokens += fp.usage.input_tokens;
  totalUsage.output_tokens += fp.usage.output_tokens;
  totalUsage.cache_creation_input_tokens += fp.usage.cache_creation_input_tokens;
  totalUsage.cache_read_input_tokens += fp.usage.cache_read_input_tokens;

  const rawText = previousMarkdown.join("\n\n");
  const fullText = normalizePlanetaryStructure(rawText);

  // Always validate the text that is actually written, never whatever the final
  // pass happened to assemble. Validation is a pure function and costs nothing,
  // and when those two drifted apart on 2026-08-30 three reports were rejected
  // for a section that was present in the file the whole time. A reported
  // failure must always be checkable against the delivered report.
  const validation = validateReport(fullText, args.dataPass, "planetary");

  return {
    text: fullText,
    sections: accumulated,
    cost_cents: Math.round(totalCents * 10000) / 10000,
    usage: totalUsage,
    retrievedChunkIds: args.retrieval.chunks.map((c) => c.id),
    totalRetrievalTokens: args.retrieval.totalTokensEstimate,
    model,
    validation,
    diagnostics: {
      profileSixthLine,
      isReflector,
      conjunctions,
    },
  };
}
