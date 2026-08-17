// Daily transit report — narrative layer.
//
// The script hands this module a fully-computed, deterministic transit brief
// (exact gates, lines, shift times, and per-person impact). This module writes
// only the interpretive prose around those facts, in Kaycee's collective voice,
// with a single Haiku 4.5 call (short output, cost-sensitive, per CLAUDE.md).
//
// Numbers are never invented here: the exact tables are rendered by the script
// and appended verbatim, so any gate.line the model names is decorative around
// facts the reader can check against the appendix.

import { invokeLLM, type InvokeResult, type ModelId } from "@/lib/llm/core";

export interface BuildTransitArgs {
  /** Local date the report covers, e.g. "2026-07-13". */
  date: string;
  /** Human-readable timezone label, e.g. "Mountain (America/Denver)". */
  timezoneLabel: string;
  /**
   * The deterministic transit brief: active sky, the day's shift timeline, and
   * the ranked roster impact. Plain text / markdown, assembled by the script.
   */
  brief: string;
  /**
   * The actual body text of the gates, lines, and channels active today, pulled
   * from Kaycee's synced library. The model interprets ONLY from this material.
   */
  sourceMaterial: string;
  identityMd: string;
  voiceMd: string;
  model?: ModelId;
  apiKey: string;
  hardCostCeilingCents?: number;
}

export interface BuildTransitResult {
  text: string;
  cost_cents: number;
  model: ModelId;
  usage: InvokeResult["usage"];
}

// Hard no-em-dash rule (CLAUDE.md): prompt-only enforcement leaks, so we also
// strip em dashes from every model output. An em dash between words becomes a
// comma; the rare leading/trailing one collapses to a space. En dashes (used in
// time ranges like 08:00-17:00) are left alone.
function stripEmDashes(s: string): string {
  return s.replace(/\s*[—―]\s*/g, ", ").replace(/,\s*,/g, ",");
}

// HD 101, non-negotiable: every gate has exactly six lines. Models occasionally
// invent a different count ("gate 40 has five lines"). Prompt rules reduce this
// but do not eliminate it, so we deterministically rewrite any "<n> lines" that
// is not six to "six lines". This targets the line-COUNT phrasing only; valid
// references to specific line numbers ("line 5", "lines 2 through 6") are left
// untouched because they never take the "<number> lines" shape.
function fixLineCounts(s: string): string {
  return s
    .replace(/\b(one|two|three|four|five|seven|eight|nine|ten|eleven|twelve)\s+lines\b/gi, "six lines")
    .replace(/\b(?!6\b)\d+\s+lines\b/gi, "six lines");
}

// Every model output passes through here before it reaches a file.
function sanitize(s: string): string {
  return fixLineCounts(stripEmDashes(s));
}

// Backstop for model degeneration: a smaller model can finish the real report
// and then loop, appending sign-off / attribution / disclaimer boilerplate
// ("Human Design reading by ...", "reading complete", a made-up author name)
// until it exhausts the token budget. The prompt tells it to stop, but this
// guarantees none of that trailing junk reaches the reader. Conservative: only
// TRAILING paragraphs matching the boilerplate signature are dropped, so real
// content (including the opening framing paragraph) is never touched.
function stripDegeneration(s: string): string {
  const paras = s.split(/\n{2,}/);
  const isSignoff = (p: string): boolean => {
    const t = p.trim();
    if (!t) return true;
    return (
      /^(human design (reading|by|transit report|system|lineage|is (a system|not|weather))|collective transit report|human design reading)/i.test(t) ||
      /\b(reading (complete|delivered|by)\b|kaycee clark|source material:|lineage:\s|transit report\.?\s*complete)/i.test(t)
    );
  };
  let end = paras.length;
  while (end > 0 && isSignoff(paras[end - 1])) end--;
  return paras.slice(0, end).join("\n\n").trimEnd();
}

const SYSTEM = `You are the transit engine for HD Reports, a Human Design product in the lineage of Ra Uru Hu. You write a DAILY COLLECTIVE TRANSIT REPORT: what the transiting planets are activating in the shared field today, how it moves through the day, and who it touches most.

AUDIENCE: this is a collective read, written for readers as a group. Speak to the field and to "we / us / the collective," not to one person's chart.

HARD RULES:
- GROUNDING: A section titled SOURCE MATERIAL is provided in the user message. It contains the actual library write-ups for the gates, lines, and channels active today. Every interpretation you give MUST come from that SOURCE MATERIAL. Do NOT use Human Design knowledge from your own training. If the SOURCE MATERIAL does not cover something, do not describe it, say nothing rather than invent. This is the single most important rule.
- Never use em dashes. Use a comma, a period, or "and". This is enforced by a linter downstream; an em dash fails the report.
- Use ONLY the gates, lines, channels, planets, times, and names given in the transit brief. Never invent a gate number, a line, a channel, or a person. If a fact is not in the brief, do not state it.
- EVERY gate has exactly six lines, numbered 1 to 6. This is true of all 64 gates, always. Never state that a gate has any other number of lines. Do not count or enumerate a gate's lines, and do not say a planet moved through "all" of a gate's lines. Refer to a specific line only by the number given in the brief (for example "line 5").
- Do not soften the mechanics. Human Design is a mechanical system. Describe how energy actually moves, not how it "might make someone feel special."
- Plain, grounded English. No hedging, no horoscope filler, no "the universe wants you to." Concrete and observable.
- FRAME AS CONDITIONING TO OBSERVE, NOT EVENTS TO EXPECT. Each transit is energy coloring the shared field right now, something to notice as it shows up in your own experience and in the words and actions of the people around you. Write so a reader learning to feel the gates can recognize this energy when it appears in real interactions and situations. Describe what it looks and feels like when it lands, not what will happen.
- SHOW BOTH EDGES. Every gate energy has a constructive expression and a shadow. Name both where the source supports it, the field carries the whole spectrum, and which edge shows up depends on the person.
- SLOW TRANSITS ARE A PASSING CURRENT. Treat the outer planets and the Nodes as a background current that is present now and will move on, note roughly how long when the brief gives it. Never frame any transit as a fixed verdict or something to act on; it is weather to notice, not an instruction.
- When you name a person from the roster, describe the mechanic (which channel a transit completes for them, whether it bridges their split, which open center it lights) and what that tends to look like in behavior. Keep it respectful and mechanical, never diagnostic about their personal life.

STRUCTURE (use these headings exactly; ## for the two top-level sections, ### for the sub-sections):

## The Weather Today
Open with ONE short framing paragraph: this is the energy frequency the neutrino field is tuning to today, the shared program impacting everyone on Earth. Frame it around two questions, how might this energy be perceived, and how might it be apparent in the words and actions of the people around us.

Then present the bodies in the groups below. FORMAT, follow it exactly: under each ### group heading, give EACH body its own level-4 heading written with four hashes and the body's name and NOTHING else, for example "#### Sun" or "#### North Node" or "#### Mercury". Do NOT add the gate number, gate name, or line to that #### heading yourself, write only the body's name; a standardized header is filled in automatically after you. Under each #### heading write one or two grounded sentences from the SOURCE MATERIAL describing that placement's meaning. After any group that has more than one body, add ONE short synthesis paragraph tying its bodies together. Ground everything only in the SOURCE MATERIAL.

### Sun and Earth
"#### Sun" then its description, "#### Earth" then its description, then a synthesis paragraph of the two. This is the background program everyone shares.

### The Moon
"#### Moon" then its description. Gate-level theme ONLY, the Moon moves too fast for line detail.

### The Nodes
"#### North Node" then its description, "#### South Node" then its description, then a synthesis paragraph. The trajectory of the collective field.

### The Inner Planets
"#### Mercury", "#### Venus", "#### Mars", each with its description, then a synthesis paragraph. Line-level detail is welcome for these.

### Saturn and Jupiter
"#### Saturn", "#### Jupiter", each with its description, then a synthesis paragraph. The social and structural pair.

### The Outer Planets
"#### Uranus", "#### Neptune", "#### Pluto", each with its description, then a synthesis paragraph. The slow generational current.

### Conjunctions
Include this sub-section ONLY if the brief's "Conjunctions" line lists one or more. Otherwise omit this heading entirely.

### Defined Centers
The brief's "Centers the transiting sky defines today" line is the ONLY authority for this. List exactly those centers and no others. If it says "none", omit this heading entirely. Never infer a defined center from anything else.

### Channels
The brief's "Channels the transiting sky completes today" line is the ONLY authority for this. For EACH active channel, give it its own level-4 heading written with four hashes in the EXACT form "#### Channel {id}" where {id} is the channel's gate pair exactly as in the brief, for example "#### Channel 44-26", and NOTHING else on that heading line; a standardized header (name, type, centers, keynote) is filled in automatically after you. Under each #### heading write one or two grounded sentences from the SOURCE MATERIAL on that channel's theme in the collective today. Write about exactly those channels and NO others. If it says "none", omit this heading entirely. CRITICAL: the channels in the roster impact are per-person completions (a transit gate plus one person's natal gate), they are NOT collective sky channels and must NEVER appear here. Only a channel whose BOTH gates are occupied by transiting planets counts, and the brief already tells you which those are.

### The Thread
A synthesis of everything above: the single throughline of today's field, three or four sentences.

Keep the whole report tight and readable. Quality over length.

WHERE TO STOP: the report ENDS with "### The Thread". Output NOTHING after it. Do NOT write a "Who Feels It Most" section or anything about specific people, that section is assembled separately. No closing line, no summary, no sign-off, no byline or author name, no "reading by" anyone, no lineage or source citation, no disclaimer, no "reading complete", no repetition of anything. This report is for the operator's own eyes, so it needs no attribution and no citations. When The Thread is written, stop.`;

const BABY_SYSTEM = `You are the transit engine for HD Reports, a Human Design product in the lineage of Ra Uru Hu. You write a short, warm OVERVIEW of the Human Design of a person born on this date at a specific time of day.

AUDIENCE: prospective parents, or the curious, reading about "what kind of design is being born today." Speak about "a child born at this time" and "they."

HARD RULES:
- GROUNDING: a SOURCE MATERIAL section (the library write-ups for this chart's type, authority, profile, definition, cross, and outer-planet gates) is provided in the user message. Base every interpretation ONLY on that source and the chart facts. Do NOT use Human Design knowledge from your own training. If the source does not cover something, say nothing rather than invent.
- Never use em dashes. Use a comma, a period, or "and".
- Use ONLY the chart facts given. Never invent gates, channels, or centers.
- EVERY gate has exactly six lines (1 to 6). Never state a gate has any other number of lines, and do not count or enumerate a gate's lines.
- Do not soften the mechanics. Describe how the design actually works.
- Plain, grounded English. No fate-talk, no "destined to." This is mechanics, not prophecy.
- Note gently that birth time matters: a child born a few hours earlier or later can carry a different Profile or Definition. Keep this to one sentence.

Write 210 to 300 words, no headings, 4 short paragraphs:
1. Open with the Type and Strategy (the single most important thing), then Authority (how they are built to decide).
2. Profile and the shape of their definition, and one line on the Incarnation Cross as life theme.
3. A dedicated paragraph on the OUTER PLANET influences (Uranus, Neptune, Pluto) from the facts: these are the slow, generational current this child shares with everyone born around this time, not personal but the collective backdrop they inherit. Name the outer-planet gates given and the themes they carry for this generation, and make clear it is shared, not individual.
4. A short closing that ties it together, including the one-sentence birth-time caveat.

Keep it inviting and clear.

WHERE TO STOP: end after the closing paragraph. Output NOTHING after it: no sign-off, no author name or byline, no "reading by" anyone, no source or lineage citation, no disclaimer, no repetition. When the closing paragraph is done, stop.`;

export async function buildBabyOverview(args: {
  date: string;
  time: string;
  timezoneLabel: string;
  facts: string;
  sourceMaterial: string;
  identityMd: string;
  voiceMd: string;
  model?: ModelId;
  apiKey: string;
  hardCostCeilingCents?: number;
}): Promise<BuildTransitResult> {
  const model = args.model ?? "claude-haiku-4-5";
  const result = await invokeLLM(
    {
      model,
      max_tokens: 800,
      system: BABY_SYSTEM,
      cache_blocks: [
        { name: "IDENTITY", text: `# IDENTITY (lineage and brand)\n\n${args.identityMd}` },
        { name: "VOICE", text: `# VOICE (how to write)\n\n${args.voiceMd}` },
      ],
      messages: [{ role: "user", content: `Write the overview for a child born on ${args.date} at about ${args.time} (${args.timezoneLabel}).\n\nCHART FACTS (the only facts you may use):\n\n${args.facts}\n\n============================================================\nSOURCE MATERIAL (interpret ONLY from what appears below):\n============================================================\n\n${args.sourceMaterial}` }],
    },
    { apiKey: args.apiKey, hardCostCeilingCents: args.hardCostCeilingCents ?? 40 },
  );
  return { text: sanitize(stripDegeneration(result.text)), cost_cents: result.cost_cents, model, usage: result.usage };
}

// Batched, grounded one-liners: given a list of items each with its own SOURCE,
// return a map of key -> a one or two sentence synthesis of that item, drawn
// ONLY from its source. Used for the shift-table synthesis columns and the
// clickable placement popups. One Haiku call for the whole set.
export async function buildSyntheses(args: {
  items: { key: string; label: string; source: string }[];
  identityMd: string;
  voiceMd: string;
  model?: ModelId;
  apiKey: string;
  hardCostCeilingCents?: number;
}): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (!args.items.length) return map;
  const model = args.model ?? "claude-haiku-4-5";
  const system = `You write ONE grounded sentence (two at most) per numbered item for a Human Design daily TRANSIT report, synthesizing how that item's theme is showing up in the COLLECTIVE FIELD today. This is a TRANSIT read, not a personal birth-chart analysis: describe how the energy moves through the shared field and how it looks in people and the environment right now. Do NOT address the reader as "you" and do NOT use "your"; speak to the collective ("the field", "the collective", "today", "people"). HARD RULES: use ONLY the SOURCE given for each item, never Human Design knowledge from your own training; if the source does not cover it, write a short neutral line rather than invent; never use em dashes; plain grounded English. Output EXACTLY one line per item in the form:  N ||| synthesis  where N is the item's number exactly as shown in brackets. Output every number once, nothing else. Keep each synthesis under 40 words.`;

  // Chunk the items into small batches. One big call over 30+ numbered items
  // reliably drops the tail (the model loses track / the output truncates),
  // leaving most placements with "No source synthesis". Small batches each
  // return in full. Batches run sequentially to stay under the API rate limit.
  const CHUNK = 8;
  for (let start = 0; start < args.items.length; start += CHUNK) {
    const batch = args.items.slice(start, start + CHUNK);
    const body = batch.map((it, i) => `[${i + 1}] ${it.label}\nSOURCE:\n${it.source}\n---`).join("\n\n");
    let text = "";
    try {
      const result = await invokeLLM(
        {
          model,
          max_tokens: 2048,
          system,
          cache_blocks: [
            { name: "IDENTITY", text: `# IDENTITY (lineage and brand)\n\n${args.identityMd}` },
            { name: "VOICE", text: `# VOICE (how to write)\n\n${args.voiceMd}` },
          ],
          messages: [{ role: "user", content: body }],
        },
        { apiKey: args.apiKey, hardCostCeilingCents: args.hardCostCeilingCents ?? 60 },
      );
      text = result.text;
    } catch { continue; } // one bad batch should not lose the others
    // Parse "N ||| synthesis"; N is the item's position WITHIN this batch.
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*\[?(\d+)\]?\s*\|\|\|\s*(.+)$/);
      if (!m) continue;
      const idx = parseInt(m[1], 10) - 1;
      if (idx < 0 || idx >= batch.length) continue;
      const syn = sanitize(m[2].trim());
      if (syn) map[batch[idx].key] = syn;
    }
  }
  return map;
}

// Per-person "Who Feels It Most" reads: one short grounded paragraph per person
// describing how today's transit field lands on THEIR chart, following their
// U-shape read rule (bridge a simple split, else read through the open center
// a transit lights). Batched like buildSyntheses so the tail never truncates.
// Returns key -> paragraph; callers pair it with the deterministic ranking data.
export async function buildPersonReads(args: {
  people: { key: string; label: string; source: string }[];
  identityMd: string;
  voiceMd: string;
  model?: ModelId;
  apiKey: string;
  hardCostCeilingCents?: number;
}): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (!args.people.length) return map;
  const model = args.model ?? "claude-haiku-4-5";
  const system = `You write ONE grounded, vivid paragraph per numbered person for a Human Design daily TRANSIT report's "Who Feels It Most" section. This prose must match the quality and register of the rest of the report (The Weather Today, the Babies overviews): full, flowing, concrete, and impactful enough to stand on its own when shared. For each person you are given their definition, the exact transit completions landing on their chart today, and a READ rule telling you how their conditioning lands. A SOURCE MATERIAL section (the library write-ups for every channel and gate active today) is provided as shared context; each person's completions name which channels and gates apply to them, so match each person to the relevant write-ups in SOURCE MATERIAL.

WRITE, per person, 3 to 5 flowing sentences (roughly 70 to 130 words) that:
- Open by naming the strongest mechanic in plain, grounded language: which channel a transit completes for them, and whether it bridges their split (temporarily closing the gap in their definition) or lights a specific open center (where the field is coloring them today). Follow the person's READ rule for which mechanic leads.
- Draw the meaning ONLY from the SOURCE MATERIAL write-ups for that person's named channels and gates, in a grounded voice. Show both edges where the source supports it, the constructive expression and the shadow, since which one shows up depends on the person.
- Frame it as conditioning to OBSERVE: energy coloring their field right now that they can notice as it shows up in how they move and relate today, not an event to expect or a verdict about their life.
- Land on one concrete, observable image of what this tends to look like when it arrives.

VOICE, strict: write in the THIRD PERSON about the person, using their NAME (given at the start of each item) and they/them/their. NEVER use the words "you" or "your" ANYWHERE, not to address the person, not in a general observation, and not when paraphrasing the source: recast every such phrase in the third person. For example write "the split that defines Paul" and "how they say yes to experience" (not "how you say yes"), and turn a source line like "simply by being yourself, you inspire others" into "simply by being themselves, they inspire others". This matches the rest of the report and is not optional.

HARD RULES: interpret ONLY from the SOURCE MATERIAL provided, matching each person's named channels and gates, never Human Design knowledge from your own training; if the matching source is thin, stay grounded and brief rather than invent; mechanical and respectful, never diagnostic or predictive about their personal life; never use em dashes; plain, grounded, evocative English, no horoscope filler and no hedging; do not invent gates, channels, or centers beyond those listed. Follow each person's READ rule exactly.

Output EXACTLY one line per person in the form:  id ||| paragraph  where id is that person's bracketed id token copied EXACTLY as shown at the start of their item (for example if an item begins "[talia] Talia Quartuccio ..." the id is talia), and the paragraph is a single line with no hard line breaks inside it. Copy each id character for character from its own item; never renumber, reorder, or reuse another person's id. Output every person's id exactly once, nothing else.`;

  // Dedupe every source block across ALL people into ONE shared pool. On a given
  // day the roster shares most transiting channels/gates, so embedding each
  // person's full source in every prompt is hugely redundant: a single batch of 6
  // heavy people once reached 212k tokens and blew past the model's 200k context
  // limit, so the top batch failed every time and the TOP names lost their
  // synthesis. Send the pool ONCE (cached across batches); each person's prompt
  // then carries only their completion facts, which already name the channels and
  // gates to look up in the shared SOURCE MATERIAL.
  const pool = new Map<string, string>();
  for (const p of args.people) {
    for (const block of p.source.split("\n\n")) {
      const b = block.trim();
      if (!b || b === "(no additional source)") continue;
      const keyline = b.split("\n")[0]; // e.g. "CHANNEL 30-41 ..." / "GATE 30 ..."
      if (!pool.has(keyline)) pool.set(keyline, b);
    }
  }
  const sharedSource = [...pool.values()].join("\n\n") || "(no source material)";

  const CHUNK = 6;
  for (let start = 0; start < args.people.length; start += CHUNK) {
    const batch = args.people.slice(start, start + CHUNK);
    const body = batch.map((it) => `[${it.key.replace(/^person:/, "")}] ${it.label}`).join("\n\n");
    let lastErr = "";
    let lastRespLen = -1;
    // Retry the batch until every person in it has a read, or attempts run out.
    // A batch is ranked, so batch 0 is the top-ranked people; silently skipping a
    // failed batch (the old behavior) is exactly why the TOP names lost their
    // synthesis while everyone else kept theirs. Retry on a thrown error AND on a
    // partial/empty parse (a transient API blip or a truncated response).
    for (let attempt = 0; attempt < 4; attempt++) {
      const filled = batch.every((it) => map[it.key]);
      if (filled) break;
      if (attempt > 0) await new Promise((r) => setTimeout(r, 700 * attempt));
      let text = "";
      try {
        const result = await invokeLLM(
          {
            model,
            max_tokens: 3000,
            system,
            cache_blocks: [
              { name: "IDENTITY", text: `# IDENTITY (lineage and brand)\n\n${args.identityMd}` },
              { name: "VOICE", text: `# VOICE (how to write)\n\n${args.voiceMd}` },
              { name: "SOURCE", text: `# SOURCE MATERIAL (library write-ups for the channels and gates active today; match each person's named channels/gates to these)\n\n${sharedSource}` },
            ],
            messages: [{ role: "user", content: body }],
          },
          { apiKey: args.apiKey, hardCostCeilingCents: args.hardCostCeilingCents ?? 60 },
        );
        text = result.text;
        lastRespLen = text.length;
      } catch (e) { lastErr = e instanceof Error ? e.message : String(e); continue; } // retry
      // Match each returned paragraph to its person by the slug id token the
      // model echoes, NOT by ordinal position. The old ordinal scheme silently
      // misassigned prose whenever the model's [N] numbering drifted (it labeled
      // Meelad's paragraph [4] instead of [3], so Talia's slot got Meelad's
      // read). Slug matching is drift-proof: a garbled id just leaves that
      // person unfilled for the retry loop to refill, never on the wrong person.
      const byId = new Map(batch.map((it) => [it.key.replace(/^person:/, ""), it.key]));
      for (const line of text.split("\n")) {
        const m = line.match(/^\s*\[?([a-z0-9_-]+)\]?\s*\|\|\|\s*(.+)$/i);
        if (!m) continue;
        const key = byId.get(m[1].toLowerCase());
        if (!key) continue; // unknown/garbled id -> leave unfilled; retry loop refills
        const syn = sanitize(m[2].trim());
        if (syn) map[key] = syn;
      }
    }
    const stillMissing = batch.filter((it) => !map[it.key]).map((it) => it.key.replace(/^person:/, ""));
    if (stillMissing.length) {
      console.warn(`  ⚠ person-reads batch ${Math.floor(start / CHUNK)} unfilled: ${stillMissing.join(", ")} (input ${Math.round(body.length / 1000)}k chars, lastErr=${lastErr || "none"}, lastRespLen=${lastRespLen})`);
    }
  }
  return map;
}

export async function buildTransitReport(args: BuildTransitArgs): Promise<BuildTransitResult> {
  const model = args.model ?? "claude-haiku-4-5";

  const userMessage = `Write today's collective transit report.

Date: ${args.date}
Timezone for all times below: ${args.timezoneLabel}

TRANSIT BRIEF (the only facts you may use):

${args.brief}

============================================================
SOURCE MATERIAL (interpret ONLY from what appears below; this is the library for the gates, lines, and channels active today):
============================================================

${args.sourceMaterial}`;

  const result = await invokeLLM(
    {
      model,
      max_tokens: 3500,
      system: SYSTEM,
      cache_blocks: [
        { name: "IDENTITY", text: `# IDENTITY (lineage and brand)\n\n${args.identityMd}` },
        { name: "VOICE", text: `# VOICE (how to write)\n\n${args.voiceMd}` },
      ],
      messages: [{ role: "user", content: userMessage }],
    },
    { apiKey: args.apiKey, hardCostCeilingCents: args.hardCostCeilingCents ?? 40 },
  );

  return { text: sanitize(stripDegeneration(result.text)), cost_cents: result.cost_cents, model, usage: result.usage };
}
