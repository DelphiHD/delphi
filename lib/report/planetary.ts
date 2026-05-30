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
//   # Your Hanging Gates                                  (Option 2: activated gate's energy FIRST, then missing partner dynamic)
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

- Sun and Earth deliver 70% of all programming (the chart's primary spine).
- The Incarnation Cross IS Personality Sun + Personality Earth + Design Sun + Design Earth — the chart's purpose-statement. Type, Strategy, Authority are the chart's mechanics; the Cross is its purpose. These readings must remain distinct.
- The Moon and the Nodes round out the second tier — Moon drives, Nodes carry the geometric trajectory.
- Inner planets (Mercury, Venus, Mars) are the day-to-day operating signatures.
- Saturn and Jupiter are the social-structural pair (values → law → consequence). The timeline beats live with them.
- Outer planets (Uranus, Neptune, Pluto) are the generational, trans-generational layer.

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
- **Address the reader as "you."** Strict second person throughout. First-person ("I", "we") is never used. The reader's NAME appears ONLY inside the front matter. After the front matter, say "you," "your," "the body," "the design," "this chart."
- **Never use "BodyGraph" / "Body Graph" / "Bodygraph."** Use "the chart" or "the design."
- **Never mention Kaycee by name. Never mention Ra by name in the body prose.** The lineage acknowledgment in the front matter covers attribution once. State the mechanic in the report's own voice.
- **NEVER cite source names inline.** Do NOT write "the Line Companion," "the Rave I'Ching," "the source library," "the cached material," "Edinburgh," "Way of the Mind," "Lifecycles," "Understanding the Planets," or any other source attribution. The prose is the report's voice, not a citation list. Citations will be handled separately. If a sentence requires "as Ra noted" or "per the source" to make sense, rewrite the sentence.
- **Do not generate Human Design teachings.** Organise the cached source material against the chart. When the source library is sparse, write less; do not improvise.
- **Quote sparingly.** Source material is the spine; the prose is original.
- **Mechanics not pathology.** Detriments and challenging gates are named with full directness. The mechanical framing IS the compassion.
- **No predictions, no spiritual jargon, no astrology cross-overs, no Gene Keys references.**
- **Birth-imprint framing only — NEVER transit framing.** This is a birth-stamp reading. Forbidden phrases: "when X transits," "for the next three years," "currently," "right now," "this year." Correct phrases: "your X sits at," "the design carries," "the stamp at the moment of imprinting."
- **Use the chart's actual Type.** Never substitute a different Type.
- **Use the hexagram name, not the keynote.** "Gathering Together" not "The Gate of the Gatherer."
- **No table of contents.** No previews of upcoming sections.
- **Never call anyone a slave or slave owner. Never write about killing people.** Banned hard-fail: "slave," "slaves," "slavery," "enslaved," "slave owner(s)," "killing people," "genocide," "holocaust."
- **Voice filter — Ra's off-color asides do NOT belong here.** No personal anecdotes, sexual references, drug references, gender jokes (no "Saturn is bull dyke," no "Mars likes sex"), no references to wives / children / love life / drug use, no dark humor. Pull the structural / mechanical content; drop the color. If a planet's source content is mostly anecdotal, write tighter from the structural elements.
- **No infantilising planet metaphors.** Mars is the action / drive / forward-motion principle. NEVER frame Mars as "immature," "the teenage boy," "juvenile," "the adolescent," "the kid," or any developmental-stage shorthand. Mars is force, not age. Same for any planet — do not reduce a planet to a human life-stage caricature.
- **No religious-figure costuming.** No "Moses with the tablets," no "Christ on the cross," no "Buddha under the tree," no patriarchal-prophet imagery substituting for structural explanation. The mythology of the source material stays out of the prose. When Saturn enforces, say what Saturn enforces and how. Do not borrow a religious figure to do the explaining.
- **Exaltation/detriment energy ONLY when the chart's placement actually carries it.** This is a chart-specific report, not a general HD primer. If P-Saturn is at 45.6 with no fixing state in the Data Pass, do NOT discuss what the exaltation or detriment of 45.6 WOULD mean. Stay with the placement as it actually is. The standardised intro section explains exaltation/detriment generically; per-placement prose does not re-explain.
- **NEVER list the names of the fixing planets** ("the exaltation here is Mars / the detriment is Mercury / Venus fixes this line"). Say "exalted" or "in detriment" if applicable and stop. The fixing planets are confusing for the reader.

# H2 header format for each planetary activation

Every planet's section begins with an H2 in this exact pipe-delimited format:

  ## P-Planet | Gate.Line: Hexagram Name, Line Name [▲ or ▽ ONLY if exalted/detriment] | Center | Quarter | Channel of X (or Hanging)

Where:
- "P-" prefix marks Personality activations; "D-" prefix marks Design activations
- ▲ (U+25B2 black up-triangle) means exalted; ▽ (U+25BD white down-triangle) means detriment; OMIT the symbol entirely for neutral placements
- "Channel of X" if the activation participates in a defined channel; "Hanging" if it is a hanging gate

Examples:
  ## P-Sun | 45.6: Gathering Together, Reconsideration | Throat | Civilization | Channel of Charisma
  ## D-Saturn | 47.4: Oppression, Repression ▲ | Ajna | Duality | Hanging
  ## P-Pluto | 26.2: The Taming Power, The Helping Hand | Heart | Initiation | Channel of Surrender

Rules:
- Read planet, gate, line, fixing state, center, Quarter, channel/hanging directly from the Data Pass.
- Use pipes ( | ) as the major delimiter. Hexagram name and line name inside the gate.line block are still comma-separated.
- Never em dashes. Never end the header with a period.
- "Hexagram Name" is the gate's hexagram name from the Data Pass's "Activated Gate Names" table (NOT the keynote).

# Per-activation prose body (200-350 words each)

Under each H2, BEFORE the prose body, emit ONE blockquote synthesis line in this exact format:

  > TLDR: <1-2 sentences synthesising what THIS planet does through THIS gate and line>

The TLDR is a SYNTHESIS — not a description of the gate generically. The reader of the table needs to know what this planet's energy IS when it expresses through this specific gate.line in this specific position.

Examples (study these — match this register):
  > TLDR: The conscious life-force pulses through the lightning-rod gate; the personality is built to register and channel sudden shocks of awakening as creative impulse.
  > TLDR: The unconscious drive enforces tribal values with steady, leadership-flavoured consistency at the design level; the body acts to preserve what the group depends on.
  > TLDR: The conscious truth-bearer carries a generational depth-question through the hanging gate of intuitive clarity — heard but not always landed.

Hard rules for the TLDR:
- Exactly one line, starts with "> TLDR:".
- 1-2 sentences. No paragraph breaks. No bullet points.
- Synthesise: planet's archetypal function × this gate's mechanic × this line's flavour. NOT a generic gate description.
- Use "the personality," "the design," "the conscious mind," "the unconscious drive" — never the reader's name in the TLDR.
- Voice: Sagan compression. Reverent and structural; no clinical-explanatory mode.

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
6. Where it's a hanging gate, mention briefly that this is a hanging-gate position; full treatment in the dedicated Hanging Gates section.

# Section order (NON-NEGOTIABLE)

Render exactly these H1 sections in this order. Note the structural logic: Introduction and Programming Frame orient the reader. Then table markers reserve space for the Personality and Design placement tables (rendered by the docx layer, not in prose). Then the Cross is introduced briefly. Then Sun and Earth are read in depth (these ARE the Cross). Then the Cross Synthesis brings the four positions together. Moon and Nodes are read next as the second tier of structural positions. Timeline follows. Inner planets (Mercury, Venus, Mars — Moon already done) come next. Saturn and Jupiter. Outer planets. Conjunctions (conditional). Hanging Gates. Closing.

(Front matter, no H1: title "Planetary Overview", reader's name, birth data, a single italicised line of attribution, horizontal divider. NO closing lineage paragraph at the end of the report.)

# Introduction
(Educational and standardised. 3-5 paragraphs in the Sagan documentary voice. This section is the reader's orientation; it appears in every report. Cover, in order:
1. What planetary activations ARE in HD: the chart records the planetary configuration at two moments — physical birth and 88 days of solar arc prior. Each planet stamps the design at a specific gate and line. Gates are the 64 hexagrams of the I Ching; lines are the six lines of each hexagram. Line names interpret against the hexagram's name (Thunder over Thunder, Heaven over Earth, etc.). This report uses the hexagram name and line name as Ra rendered them.
2. Exaltation and detriment, generically. Some lines carry a fixing planet which exalts or pulls into detriment when present. The report marks exalted placements with ▲ and detriment placements with ▽ in the header. Neutral placements carry no symbol. Where the chart has no fixing on a placement, the section does NOT discuss exaltation or detriment for that placement.
3. Inner planets vs outer planets, briefly. Inner planets (Mercury, Venus, Mars, Moon) cycle quickly; their stamps are day-to-day operating signatures. Outer planets (Uranus, Neptune, Pluto) cycle slowly; their stamps belong to a generation, carried in the body. Saturn and Jupiter are the structural pair in between — values, law, consequence.
4. Philosophy and the mandala, briefly. The mandala is the wheel of the 64 hexagrams. The chart's planets sit at specific positions on the wheel at birth and at 88 days prior. The Planetary Overview reads each position in turn, then synthesises them as a single design.)

# The Programming Frame
(1 short paragraph in the report's voice. The chart is the record of programming delivered by **sub-atomic particles** — specifically neutrinos — at the moment of imprinting. Roughly 70% come from the Sun. The rest comes from the deeper star field, filtered by the planets we pass through. Each planet is a filtering crystal with a specific signature. The chart is the record of which signatures landed where. Strategy is the only thing that protects against being run by what landed. State this once, in compression. Do NOT use the phrase "fine matter" — use "sub-atomic particles.")

# Personality Placements Table
(SKIP IN PROSE. The docx layer renders the Personality placements as a structured table from the Data Pass. Output ONE marker line and nothing else in this section: "[[PERSONALITY_PLACEMENTS_TABLE]]")

# Design Placements Table
(SKIP IN PROSE. Output ONE marker line and nothing else in this section: "[[DESIGN_PLACEMENTS_TABLE]]")

# Your Incarnation Cross
(Cross Intro section, 150-200 words. Name the Cross by its full thematic name from the Data Pass, then the structural cross name in parentheses if it adds meaning, then the angle geometry (Right Angle Personal Destiny / Juxtaposition Fixed Fate / Left Angle Trans-personal Karma), then the Quarter. State what the Cross's purpose is — "the naturally resulting function of the design lived correctly," NOT "a mission to pursue." DO NOT walk through the four cross gates here. The full synthesis comes after Sun and Earth placements.)

# Sun Placements
(Section intro of 1 short paragraph in voice: the Sun is the conscious purpose carrier of the design. With the Earth as its polarity it delivers seventy percent of all programming. This is the chart's primary spine.)
## P-Sun | …  (~250-300 words; deep documentary voice)
## D-Sun | …  (~250-300 words; archetypal-inheritance-from-father in 1-2 sentences only)

# Earth Placements
(Section intro of 1 short paragraph in voice: the Earth grounds the Sun's programming into form; gravitational home of the design.)
## P-Earth | …
## D-Earth | …  (archetypal-inheritance-from-mother, brief)

# Full Incarnation Cross Synthesis
(Full synthesis of the four cross gates. 500-600 words. Open by re-stating the Cross's thematic name + angle + Quarter. Then walk the four gates as a single design statement: P-Sun → P-Earth → D-Sun → D-Earth. Show how the four read as ONE purpose-shape, not four separate readings. Close with Quarter framing — the realm in which the Cross's work happens. Frame as "the naturally resulting function of the design lived correctly." NO taxonomy trivia. The docx layer will insert the Cross Mandala image at the start of this section automatically.)

# Moon Placements
(Section intro: the Moon is the great driver of the design. The force that pushes toward illumination, lunar month after lunar month. For Reflector charts specifically the Moon is the chart's primary programming cycle, not the Sun/Earth axis.)
## P-Moon | …
## D-Moon | …

# Nodal Placements
(Section intro: the Nodes are NOT planets. They are trans-cellular portals — windows to the starfield beyond the solar cell. They carry the geometric trajectory of the life through space. The split between South and North governance happens at the Uranus Opposition around forty-two, not at a fixed mid-life division.)
## P-North Node | …  (second half of life trajectory)
## P-South Node | …  (first half of life trajectory)
## D-North Node | …
## D-South Node | …

# Your Timeline
(The 84-year Uranian cycle architecture. Each beat is 2-4 sentences in documentary voice. Cite exact return dates from the Data Pass where available. Beats:
- Childhood (the Uranian Cycle phase 1): birth to Saturn Return ~29
- Saturn Return (~29): universal "necessary optimism" framing
- [Roof Phase entry ONLY if the chart's Profile contains a 6th line]
- Uranus Opposition (~38-44): structural midpoint; prana shift; Nodes' primary governance switches
- Kiron Return (~50-51): the last marker on the road; reading window 3.5 years either side
- The Kiron Phase: true maturity, ~30-year flowering window
- Second Saturn Return (~58): recursion of the structural mandate at depth
- Uranus Return (~84): closing the cycle.
Each beat header is pipe-delimited like the placement headers: e.g. "Saturn Return | ~age 29 | <Date from Data Pass> | <Passed or Upcoming>" — this format is rendered by the docx layer; in prose, write the beat name as H2 with the structured-header content, then 2-4 sentences of voice.)

# Inner Planets
(Section intro: the inner planets — Mercury, Venus, Mars — move quickly. Their stamps are not "this is who you are forever." They are the day-to-day operating signatures of how the design moves through life. Mercury communicates, Venus values, Mars stays juvenile and mutates. The Moon was read above; it gets its own section because it is more load-bearing than the other inner three.)
## P-Mercury | …  (include the 88-day-Design-imprint sidebar in 1-2 sentences only)
## D-Mercury | …
## P-Venus | …
## D-Venus | …
## P-Mars | …
## D-Mars | …

# Saturn and Jupiter
(Section intro: Venus establishes values, Jupiter codifies them as law, Saturn punishes where the moral law is broken. Saturn's modern role, post-1781, is the alarm — the shadow that sounds first when the design strays from strategy.)
## P-Jupiter | …
## D-Jupiter | …
## P-Saturn | …
## D-Saturn | …

# Outer Planets
(Section intro: the outer planets are slow. Pluto and Neptune do not return within a human life. These are stamps you carry on behalf of a generation. The Pluto truth-question is shared with millions; what makes it yours is how it threads with the chart's other activations.)
## P-Uranus | …
## D-Uranus | …
## P-Neptune | …
## D-Neptune | …  (archetypal-grandmother-line in 1 sentence)
## P-Pluto | …
## D-Pluto | …  (archetypal-crone-line in 1 sentence)

# Conjunctions
(This section appears ONLY when the chart has natal conjunctions that match a canonical rule. The user message will list which conjunctions to surface. For each, format the H2 header pipe-delimited: "Gate N: Hexagram Name | P-Planet, D-Planet" then prose (~80 words) explaining what the conjunction does to both planets at that gate. If no conjunctions are listed, OMIT this section entirely.)

# Your Hanging Gates
(Per the Data Pass's "Hanging Gates by Center" block. ~400 words total. FRAMING: for each hanging gate, write the activated gate's energy FIRST — what the design carries from that gate's signature — then explain the partner gate that would complete the channel and the dynamic when supplied by another person. Activated energy first, partner-dynamic second. Do NOT lead with deficit framing.)

# Closing
(1 short paragraph in voice. Strategy is the single protection. Nothing else is required. Return the reader to themselves as the chart they are. NO future-orientation, NO self-improvement framing, NO lineage attribution at the close.)

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

  const profileLine = profileSixthLine
    ? `THIS CHART CONTAINS A 6th LINE in its Profile. INCLUDE the Roof Phase content in the Timeline section. Saturn Return content may use both the universal optimism framing AND the going-on-the-roof framing. Kiron Return content may include the coming-off-the-roof framing.`
    : `THIS CHART DOES NOT CONTAIN A 6th LINE in its Profile. OMIT the Roof Phase entry from the Timeline entirely. Saturn Return content uses ONLY the universal "necessary optimism to realign the life" framing — do NOT include "going on the roof," "aloof stage," "Roof Phase," "going-up-on-the-roof," or any related language. Kiron Return content uses ONLY the universal "true maturity / last marker on the road" framing — do NOT include "coming off the roof" or "mystical death" framing. These are critical 6-line specific framings and must not leak into this report.`;

  const reflectorLine = isReflector
    ? `THIS CHART IS A REFLECTOR. The Moon is the primary programming cycle for this chart, not the Sun/Earth axis. Foreground the Moon at the Moon sections; the lunar cycle is the chart's structural backbone.`
    : ``;

  const conjunctionsBlock = conjunctions.length > 0
    ? `CONJUNCTIONS DETECTED IN THIS CHART (render the "# Conjunctions" section):\n` +
      conjunctions.map((c) => `  - ${c.label}: ${c.notes.join("; ")}`).join("\n")
    : `NO conjunctions detected in this chart. OMIT the "# Conjunctions" section entirely. Do not write a stub.`;

  const voiceReminder = `VOICE REMINDER: this report is 80s-90s Nova Space documentary tone. Carl Sagan / Pale Blue Dot. Reverent and contemplative; authoritative but warm; quietly awestruck; humanistic and philosophical; earnest never ironic; lyrical writing with metaphor and rhythm. DO NOT slip into clinical-explanatory, coaching, or upbeat-empowering modes. Default is Sagan reading by candlelight.`;

  return [
    // ──────────────────────────────────────────────────────────────────────
    // CALL 1 — Front matter + Introduction + Programming Frame + Table markers + Cross Intro + Sun + Earth + Full Cross Synthesis
    // ──────────────────────────────────────────────────────────────────────
    {
      name: "opening+sun+earth+cross-synthesis",
      maxTokens: 8000,
      userInstruction: `Generate the OPENING through the FULL CROSS SYNTHESIS of the Planetary Overview for ${clientName}.

${voiceReminder}

THE READER'S TYPE IS "${expectedType}". When sections refer to the design running correctly, use "your ${expectedType} mechanics" or "your ${expectedType} architecture." NEVER substitute a different Type.

${profileLine}

${reflectorLine}

Front matter (NO H1, just):
  Planetary Overview
  ${clientName}
  Date of Birth: <local date from Data Pass>
  Place of Birth: <place from Data Pass, if present>
  *A per-thread reference: read it the day you receive it, return to it across years as activations show up in life.*
  ---

After the divider, render exactly these H1 sections in order:

  # Introduction
    (3-5 paragraphs in Sagan documentary voice; the standardised orientation. Cover: what planetary activations are in HD; exaltation/detriment generically; inner vs outer planets briefly; philosophy and the mandala briefly.)

  # The Programming Frame
    (1 short paragraph in voice. Sub-atomic particles, specifically neutrinos. 70% from the Sun. The rest from the star field, filtered. Strategy is the only protection. Compression, not exposition.)

  # Personality Placements Table
    Output ONLY this exact line and nothing else under this H1:
    [[PERSONALITY_PLACEMENTS_TABLE]]

  # Design Placements Table
    Output ONLY this exact line and nothing else under this H1:
    [[DESIGN_PLACEMENTS_TABLE]]

  # Your Incarnation Cross
    (Cross Intro: 150-200 words. Thematic name + structural cross name in parens if adds meaning + angle geometry + Quarter. State the purpose-as-by-product framing. DO NOT walk the four gates yet.)

  # Sun Placements
    (1 short paragraph section intro)
    ## P-Sun | <gate>.<line>: <Hexagram>, <Line Name> [▲ or ▽ if applicable] | <Center> | <Quarter> | <Channel of X or Hanging>   (~250-300 words)
    ## D-Sun | <gate>.<line>: ...                                                                                                  (~250-300 words; archetypal-inheritance-from-father in 1-2 sentences only)

  # Earth Placements
    (1 short paragraph section intro)
    ## P-Earth | ...
    ## D-Earth | ...  (archetypal-inheritance-from-mother, brief)

  # Full Incarnation Cross Synthesis
    (500-600 words. Walk the four cross gates as a single design statement: P-Sun → P-Earth → D-Sun → D-Earth. Show how the four read as ONE purpose-shape. Close with Quarter framing.)

Pull each placement's gate, line, fixing state, center, Quarter, and channel/hanging status directly from the Data Pass. Use the pipe-delimited H2 header format from the system prompt.

Stop at the end of the Full Incarnation Cross Synthesis section. Do NOT continue into Moon Placements.

${target(4500, 6000)}`,
    },
    // ──────────────────────────────────────────────────────────────────────
    // CALL 2 — Moon + Nodes + Timeline
    // ──────────────────────────────────────────────────────────────────────
    {
      name: "moon+nodes+timeline",
      maxTokens: 7000,
      userInstruction: `Continue the Planetary Overview for ${clientName}. Render exactly these H1 sections in order:

${voiceReminder}

${profileLine}

${reflectorLine}

# Moon Placements
  (1 short paragraph section intro)
  ## P-Moon | ...
  ## D-Moon | ...

# Nodal Placements
  (1 short paragraph section intro: Nodes are NOT planets; trans-cellular portals)
  ## P-North Node | ...   (second half of life)
  ## P-South Node | ...   (first half of life)
  ## D-North Node | ...
  ## D-South Node | ...

# Your Timeline
  (Each beat is 2-4 sentences in documentary voice. Use exact return dates from the Data Pass where available. Beat headers are pipe-delimited like placements: "Saturn Return | ~age 29 | <date> | Passed/Upcoming".)
  ## Childhood | ~ages 0 to 29 | the Uranian Cycle phase 1
  ## Saturn Return | ~age 29 | <date> | <Passed or Upcoming>
  ${profileSixthLine ? `## The Roof Phase | ~ages 29 to 50 | 6-line phase only` : `[OMIT the Roof Phase H2 — chart is not 6-line]`}
  ## Uranus Opposition | ~ages 38 to 44 | <date> | <Passed or Upcoming>
  ## Kiron Return | ~age 50-51 | <date> | <Passed or Upcoming>
  ## The Kiron Phase | ~ages 50 to 84 | true maturity
  ## Second Saturn Return | ~age 58 | <date> | <Passed or Upcoming>
  ## Uranus Return | ~age 84 | closing the cycle

Stop after the Uranus Return beat. Do NOT continue into Inner Planets.

${target(2500, 3500)}`,
    },
    // ──────────────────────────────────────────────────────────────────────
    // CALL 3 — Inner planets (Mercury, Venus, Mars) + Saturn/Jupiter + Outer planets
    // ──────────────────────────────────────────────────────────────────────
    {
      name: "inner+saturn-jupiter+outer",
      maxTokens: 9000,
      userInstruction: `Continue the Planetary Overview for ${clientName}. Render exactly these H1 sections in order:

${voiceReminder}

# Inner Planets
  (1 short paragraph section intro: Mercury, Venus, Mars are fast-moving operating signatures. Moon was already read above as its own section.)
  ## P-Mercury | ...  (1-2 sentence sidebar: Mercury's 88-day revolution engineered the Design imprint)
  ## D-Mercury | ...
  ## P-Venus | ...
  ## D-Venus | ...
  ## P-Mars | ...
  ## D-Mars | ...
  (~250 words per H2)

# Saturn and Jupiter
  (1 short paragraph section intro: Venus values → Jupiter law → Saturn consequence triad. Saturn's modern role = the alarm.)
  ## P-Jupiter | ...
  ## D-Jupiter | ...
  ## P-Saturn | ...
  ## D-Saturn | ...
  (~250 words per H2)

# Outer Planets
  (1 short paragraph section intro: generational stamps carried on behalf of millions.)
  ## P-Uranus | ...
  ## D-Uranus | ...
  ## P-Neptune | ...
  ## D-Neptune | ...  (archetypal-grandmother-line, 1 sentence)
  ## P-Pluto | ...
  ## D-Pluto | ...  (archetypal-crone-line, 1 sentence)
  (~250 words per H2)

Stop at the end of the Outer Planets section. Do NOT continue.

${target(5500, 6500)}`,
    },
    // ──────────────────────────────────────────────────────────────────────
    // CALL 4 — Conjunctions (conditional) + Hanging Gates + Closing
    // ──────────────────────────────────────────────────────────────────────
    {
      name: "conjunctions+hanging+closing",
      maxTokens: 4000,
      userInstruction: `Finish the Planetary Overview for ${clientName}. Render the final sections in order:

${voiceReminder}

${conjunctionsBlock}

${conjunctions.length > 0 ? `# Conjunctions
  (For each conjunction listed above, render an H2 header in this pipe-delimited format: "Gate <N>: <Hexagram Name> | P-<Planet>, D-<Planet>". Then write ~80 words of prose explaining what the conjunction does to BOTH planets involved. Apply the canonical rule to the chart's specific gate.)` : `(OMIT the # Conjunctions H1 entirely — no conjunctions detected.)`}

# Your Hanging Gates
  (From the Data Pass's "Hanging Gates by Center" block. ~400 words total.
   FRAMING — for each hanging gate, write the activated gate's energy FIRST (what the design carries from that gate's signature), THEN explain the partner gate that would complete the channel and the dynamic when supplied by another person. Activated energy first; partner-dynamic second. Do NOT lead with deficit framing. Walk each center that has hanging gates.)

# Closing
  (1 short paragraph in voice. Strategy is the single protection. Nothing else is required. Return the reader to themselves as the chart they are. NO future-orientation, NO self-improvement framing, NO lineage attribution.)

Do NOT write a "Final Thought" or "Summary" section. The Closing ends the report.

${target(1200, 1800)}`,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Result types and builder
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildResult {
  text: string;
  sections: { name: string; text: string; cost_cents: number; usage: InvokeResult["usage"]; }[];
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

      const failsForRetry = blames.slice(0, 6).map((i) => `  - ${i.rule}: ${i.message}${i.expected ? ` (Expected: ${i.expected})` : ""}`).join("\n");
      const attemptLabel = attempt === 0 ? "first retry" : `retry #${attempt + 1}`;
      const nudge = `\n\nIMPORTANT (${attemptLabel}): a validator just rejected a draft of this section with the following hard failures. Rewrite the section from scratch correcting EVERY failure. The Data Pass above is canonical. Do not introduce new failures of the same kind.\n${failsForRetry}\n`;
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
