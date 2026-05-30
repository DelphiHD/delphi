// Variable header construction — the deterministic part.
//
// Given a chart's (Variable, Color, Tone, Arrow) tuple, build the exact
// H2 header string Kaycee specified. Read names from the lookup JSON the
// extractor wrote (lib/chart/variables-lookup.json). Output is verbatim;
// the Foundation prompt injects it as a hard fact, the validator confirms
// the rendered report contains it word-for-word.

import lookupRaw from "@/lib/chart/variables-lookup.json";

export type VariableName = "Determination" | "Environment" | "Motivation" | "Perspective";

interface ColorRecord {
  variable: VariableName;
  colorNumber: number;
  colorName: string;
  // Per-direction sub-variants. Determination examples: left=Hot, right=Cold.
  // Environment Color 1: left=Selective, right=Blending. Perspective Color 5:
  // left=Conditioner, right=Conditioned. Etc. Source: Kaycee, 2026-05-19.
  leftSubVariant: string | null;
  rightSubVariant: string | null;
  // Legacy aliases for Determination, kept for any caller still reading them.
  activeVariant: string | null;
  passiveVariant: string | null;
  transference: string | null;
  distraction: string | null;
  description: string;
}

interface Lookup {
  bodyToneNames: string[];   // index 0 = Tone 1
  mindToneNames: string[];
  // Per-variable mode label pair. Determination: {left: "Active", right: "Passive"}.
  // Environment: {left: "Observed", right: "Observer"}. Perspective: {left:
  // "Focused", right: "Peripheral"}. Motivation: {left: "Strategic", right:
  // "Receptive"}. Source: Kaycee, 2026-05-19.
  modeLabels: Record<VariableName, { left: string; right: string }>;
  byVariable: Record<VariableName, ColorRecord[]>;
}

const lookup = lookupRaw as unknown as Lookup;

function colorOf(v: VariableName, colorNumber: number): ColorRecord | null {
  return lookup.byVariable[v]?.find((c) => c.colorNumber === colorNumber) ?? null;
}

function toneName(v: VariableName, toneNumber: number): string {
  const idx = toneNumber - 1;
  if (idx < 0 || idx > 5) return "(unknown tone)";
  // Body-brain variables use sensory tone names; mind-brain use cognitive.
  if (v === "Determination" || v === "Environment") return lookup.bodyToneNames[idx];
  return lookup.mindToneNames[idx];
}

function arrowLabel(arrow: "left" | "right"): "Left Arrow" | "Right Arrow" {
  return arrow === "left" ? "Left Arrow" : "Right Arrow";
}

// External display name for Determination in Kaycee's convention is "Digestion".
function displayVariableName(v: VariableName): string {
  return v === "Determination" ? "Digestion" : v;
}

// Build the H2 header verbatim per Kaycee's spec. Examples (Tennyson, 2/4
// PRL DLR):
//   Digestion - Color 3: Thirst, Left Arrow | Active: Hot, Tone 3: Outer Vision
//   Environment - Color 1: Caves, Right Arrow | Observer: Blending, Tone 6: Touch
//   Motivation - Color 2: Hope, Right Arrow | Receptive: Anti-Theist, Tone 4: Meditation, Transference: Guilt
//   Perspective - Color 5: Probability, Left Arrow | Focused: Conditioner, Tone 2: Uncertainty, Distraction: Possibility
export function buildVariableHeader(args: {
  variable: VariableName;
  colorNumber: number;
  toneNumber: number;
  arrow: "left" | "right";
}): string {
  const { variable, colorNumber, toneNumber, arrow } = args;
  const c = colorOf(variable, colorNumber);
  const colorName = c?.colorName ?? "(unknown)";
  const tName = toneName(variable, toneNumber);

  const displayName = displayVariableName(variable);
  const arrowStr = arrowLabel(arrow);

  // Mode label per variable + arrow direction.
  const modeLabel = lookup.modeLabels?.[variable]?.[arrow] ?? "(unknown mode)";
  // Sub-variant per color + arrow.
  const subVariant = c
    ? (arrow === "left" ? c.leftSubVariant : c.rightSubVariant)
    : null;
  const modeStr = subVariant ? `${modeLabel}: ${subVariant}` : modeLabel;

  let header = `${displayName} - Color ${colorNumber}: ${colorName}, ${arrowStr} | ${modeStr}, Tone ${toneNumber}: ${tName}`;

  // Motivation appends Transference; Perspective appends Distraction.
  if (variable === "Motivation" && c?.transference) {
    header += `, Transference: ${c.transference}`;
  } else if (variable === "Perspective" && c?.distraction) {
    header += `, Distraction: ${c.distraction}`;
  }

  return header;
}

// For prompts and Data Pass: also expose the raw lookup so we can hand the
// model the per-color descriptive content (lecture bullets).
export function getColor(variable: VariableName, colorNumber: number): ColorRecord | null {
  return colorOf(variable, colorNumber);
}

export function getToneName(variable: VariableName, toneNumber: number): string {
  return toneName(variable, toneNumber);
}

export function getAllToneNames(brain: "body" | "mind"): string[] {
  return brain === "body" ? lookup.bodyToneNames : lookup.mindToneNames;
}
