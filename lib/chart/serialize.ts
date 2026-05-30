// Serialize a Chart into the compact text representation the report prompt
// consumes. The prompt sees Kaycee's vocabulary throughout (variable names,
// channel-consciousness language) — never the raw mybodygraph API field names.

import type { Chart, PlanetActivation } from "@/lib/chart/types";

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function planetLine(p: PlanetActivation): string {
  const fix = p.fixingState === "Exalted"
    ? " Exalted"
    : p.fixingState === "Detriment"
    ? " Detriment"
    : "";
  // Color/Tone/Base appear inline. The Sun and Earth color/tone/base drive
  // Variables (Determination, Environment, Perspective, Motivation); other
  // planets carry the same Color/Tone/Base properties and the model can use
  // them where Ra's per-planet material references them.
  return `  ${p.planet}: ${p.gate}.${p.line} color=${p.color} tone=${p.tone} base=${p.base}${fix}`;
}

export function serializeChart(client: { name: string }, chart: Chart): string {
  const lines: string[] = [];
  lines.push(`# Chart for ${client.name}`);
  lines.push("");
  lines.push(`Birth: ${chart.birth.localDate} (${chart.birth.timezone})`);
  if (chart.birth.locationQuery) lines.push(`Place: ${chart.birth.locationQuery}`);
  lines.push("");

  lines.push(`Type: ${chart.type.value}`);
  lines.push(`Strategy: ${chart.strategy.value}`);
  lines.push(`Authority: ${chart.authority.value}`);
  lines.push(`Profile: ${chart.profile.value}`);
  lines.push(`Definition: ${chart.definition.value}`);
  lines.push(`Incarnation Cross: ${chart.incarnationCross.value}`);
  lines.push(`Quarter: ${chart.quarter ?? "(unmapped)"}`);
  lines.push(`Signature: ${chart.signature.value}`);
  lines.push(`Not-Self Theme: ${chart.notSelfTheme.value}`);
  lines.push("");

  lines.push("## Centers");
  for (const c of chart.centers) {
    const state = c.defined
      ? `defined (${c.consciousness === "personality" ? "personality side" : c.consciousness === "design" ? "design side" : "both sides"})`
      : "open";
    lines.push(`  ${c.name}: ${state}`);
  }
  lines.push("");

  lines.push("## Channels");
  for (const ch of chart.channels) {
    const side =
      ch.consciousness === "personality" ? "personality side"
      : ch.consciousness === "design" ? "design side"
      : "both sides";
    lines.push(`  ${ch.id}: ${side}`);
  }
  if (chart.channels.length === 0) lines.push("  (no defined channels)");
  lines.push("");

  lines.push("## Variables (PHS)");

  // Pull the Color and Tone numbers from the planetary positions that drive
  // each variable. Standard HD: Determination ← Design Sun (color, tone, base);
  // Environment ← Design Nodes (we use Design North Node here);
  // Motivation ← Personality Sun; Perspective ← Personality North Node.
  // Sun and Earth share Color/Tone in HD geometry; we report Sun's values.
  const dSun = chart.activations.design.find((p) => p.planet === "Sun");
  const dNorth = chart.activations.design.find((p) => p.planet === "North Node");
  const pSun = chart.activations.personality.find((p) => p.planet === "Sun");
  const pNorth = chart.activations.personality.find((p) => p.planet === "North Node");

  const det = chart.variables.determination.arrow;
  const env = chart.variables.environment.arrow;
  const per = chart.variables.perspective.arrow;
  const mot = chart.variables.motivation.arrow;

  const dump = (label: string, arrow: string, theme: string, sourcePlanet: { color: number; tone: number; base: number } | undefined, source: string) => {
    const c = sourcePlanet ? `color=${sourcePlanet.color} tone=${sourcePlanet.tone} base=${sourcePlanet.base}` : "color=? tone=? base=?";
    lines.push(`  ${label}: arrow=${arrow}  theme=${theme}  ${c}  (from ${source})`);
  };
  dump("Determination", det, chart.variables.determination.theme, dSun, "Design Sun");
  dump("Environment  ", env, chart.variables.environment.theme, dNorth, "Design North Node");
  dump("Motivation   ", mot, chart.variables.motivation.theme, pSun, "Personality Sun");
  dump("Perspective  ", per, chart.variables.perspective.theme, pNorth, "Personality North Node");
  if (chart.variables.sense) lines.push(`  Sense (personality side): ${chart.variables.sense}`);
  if (chart.variables.designSense) lines.push(`  Sense (design side): ${chart.variables.designSense}`);

  // Cognitive frame, both descriptive and as the BG5/OC16 code. The cognitive
  // code is "P{Motivation}{Perspective} D{Determination}{Environment}" with
  // L for left and R for right. This matches the title encoding in the
  // HD Variables Notion database (e.g. "PLR DRR" for the cross-section of
  // motivation-left, perspective-right, determination-right, environment-right).
  const brainSide = det === env ? det : "mixed";
  const mindSide = per === mot ? per : "mixed";
  const rights = [det, env, per, mot].filter((a) => a === "right").length;
  const lefts = 4 - rights;
  const m = mot[0].toUpperCase();
  const p = per[0].toUpperCase();
  const d = det[0].toUpperCase();
  const e = env[0].toUpperCase();
  const cognitiveCode = `P${m}${p} D${d}${e}`;
  lines.push(`  → Cognitive frame: ${capitalize(brainSide)}-Brain, ${capitalize(mindSide)}-Mind (${rights}R/${lefts}L across all 4 arrows)`);
  lines.push(`  → Cognitive code: ${cognitiveCode}`);
  lines.push("");

  lines.push("## Personality activations");
  for (const p of chart.activations.personality) lines.push(planetLine(p));
  lines.push("");

  lines.push("## Design activations");
  for (const p of chart.activations.design) lines.push(planetLine(p));
  lines.push("");

  // Hanging gates: activated gates that don't participate in any defined
  // channel. The Planetary Overview's Hanging Gates section needs this list.
  const channelGateSet = new Set<number>();
  for (const ch of chart.channels) {
    channelGateSet.add(ch.gates[0]);
    channelGateSet.add(ch.gates[1]);
  }
  const gateToActivations = new Map<number, { side: "personality" | "design"; planet: string; line: number; fix: string }[]>();
  for (const p of chart.activations.personality) {
    if (!gateToActivations.has(p.gate)) gateToActivations.set(p.gate, []);
    gateToActivations.get(p.gate)!.push({ side: "personality", planet: p.planet, line: p.line, fix: p.fixingState });
  }
  for (const p of chart.activations.design) {
    if (!gateToActivations.has(p.gate)) gateToActivations.set(p.gate, []);
    gateToActivations.get(p.gate)!.push({ side: "design", planet: p.planet, line: p.line, fix: p.fixingState });
  }
  const hangingGates = [...gateToActivations.keys()].filter((g) => !channelGateSet.has(g)).sort((a, b) => a - b);
  if (hangingGates.length > 0) {
    lines.push("## Hanging gates (activated but not in any defined channel)");
    for (const g of hangingGates) {
      const acts = gateToActivations.get(g)!;
      const descriptions = acts.map((a) => {
        const fix = a.fix === "Exalted" ? " Exalted" : a.fix === "Detriment" ? " Detriment" : "";
        return `${a.side[0].toUpperCase()}-${a.planet} at ${g}.${a.line}${fix}`;
      }).join(", ");
      lines.push(`  Gate ${g}: ${descriptions}`);
    }
  }

  return lines.join("\n");
}

// Reduce the cross's value string to its short form so it can be used for
// chunk lookups. mybodygraph returns "Right Angle Cross of Consciousness 2
// (35/5 | 63/64)" — we need "RAC of Consciousness 2".
export function shortCrossName(crossValue: string): string {
  const cleaned = crossValue.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return cleaned
    .replace(/^The\s+Right Ang(le|el)\s+Cross of\s+/i, "RAC of ")
    .replace(/^Right Ang(le|el)\s+Cross of\s+/i, "RAC of ")
    .replace(/^The\s+Left Angle Cross of\s+/i, "LAC of ")
    .replace(/^Left Angle Cross of\s+/i, "LAC of ")
    .replace(/^The\s+Juxtaposition Cross of\s+/i, "JC of ")
    .replace(/^Juxtaposition Cross of\s+/i, "JC of ")
    .trim();
}

// Collect every (gate, line) activation across both sides as a flat list.
// Deduplicated by gate.line pair — when the same gate.line appears on both
// sides (e.g. a fixed planet from a previous transit), it appears once.
export function uniqueActivations(chart: Chart): { gate: number; line: number }[] {
  const seen = new Set<string>();
  const out: { gate: number; line: number }[] = [];
  for (const p of [...chart.activations.personality, ...chart.activations.design]) {
    const k = `${p.gate}.${p.line}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ gate: p.gate, line: p.line });
  }
  return out;
}

export function uniqueGates(chart: Chart): number[] {
  const set = new Set<number>();
  for (const p of [...chart.activations.personality, ...chart.activations.design]) set.add(p.gate);
  return [...set].sort((a, b) => a - b);
}
