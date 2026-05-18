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
  activeVariant: string | null;
  passiveVariant: string | null;
  transference: string | null;
  distraction: string | null;
  description: string;
}

interface Lookup {
  bodyToneNames: string[];   // index 0 = Tone 1
  mindToneNames: string[];
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

function activePassive(toneNumber: number): "Active" | "Passive" {
  return toneNumber <= 3 ? "Active" : "Passive";
}

function arrowLabel(arrow: "left" | "right"): "Left Arrow" | "Right Arrow" {
  return arrow === "left" ? "Left Arrow" : "Right Arrow";
}

// External display name for Determination in Kaycee's convention is "Digestion".
function displayVariableName(v: VariableName): string {
  return v === "Determination" ? "Digestion" : v;
}

// Build the H2 header verbatim per Kaycee's spec:
//   Digestion - Color 3: Thirst, Left Arrow | Active: Hot, Tone 3: Outer Vision
//   Motivation - Color 1: Fear, Left Arrow | Active, Tone 3: Action, Transference: Need
//   Perspective - Color 1: Survival, Right Arrow | Passive, Tone 4: Meditation, Distraction: Wanting
//   Environment - Color 1: Caves, Right Arrow | Passive, Tone 4: Inner Vision
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
  const ap = activePassive(toneNumber);

  const displayName = displayVariableName(variable);
  const arrowStr = arrowLabel(arrow);

  // The active/passive descriptor. Determination uses the polarity-pair name
  // (Hot/Cold, Consecutive/Alternating, etc.); the others use just the
  // Active/Passive marker on its own.
  let modeStr: string = ap;
  if (variable === "Determination" && c) {
    const subVariant = ap === "Active" ? c.activeVariant : c.passiveVariant;
    if (subVariant) modeStr = `${ap}: ${subVariant}`;
  }

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
