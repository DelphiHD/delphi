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
  lines.push(`  Determination: arrow=${chart.variables.determination.arrow}  theme=${chart.variables.determination.theme}`);
  lines.push(`  Environment:   arrow=${chart.variables.environment.arrow}  theme=${chart.variables.environment.theme}`);
  lines.push(`  Perspective:   arrow=${chart.variables.perspective.arrow}  theme=${chart.variables.perspective.theme}`);
  lines.push(`  Motivation:    arrow=${chart.variables.motivation.arrow}  theme=${chart.variables.motivation.theme}`);
  if (chart.variables.sense) lines.push(`  Sense (personality side): ${chart.variables.sense}`);
  if (chart.variables.designSense) lines.push(`  Sense (design side): ${chart.variables.designSense}`);

  // Brain/Mind cognitive frame — computed from the four arrow directions per
  // Ra's BG5/cognitive-type teaching. The Determination + Environment arrows
  // form the body (right brain). The Perspective + Motivation arrows form
  // the mind. A "right" brain means both body arrows point right; "left"
  // means both left; "mixed" means one of each. Same for the mind.
  const det = chart.variables.determination.arrow;
  const env = chart.variables.environment.arrow;
  const per = chart.variables.perspective.arrow;
  const mot = chart.variables.motivation.arrow;
  const brainSide = det === env ? det : "mixed";
  const mindSide = per === mot ? per : "mixed";
  const rights = [det, env, per, mot].filter((a) => a === "right").length;
  const lefts = 4 - rights;
  lines.push(`  → Cognitive frame: ${capitalize(brainSide)}-Brain, ${capitalize(mindSide)}-Mind (${rights}R/${lefts}L across all 4 arrows)`);
  lines.push("");

  lines.push("## Personality activations");
  for (const p of chart.activations.personality) lines.push(planetLine(p));
  lines.push("");

  lines.push("## Design activations");
  for (const p of chart.activations.design) lines.push(planetLine(p));

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
