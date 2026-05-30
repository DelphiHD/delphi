// Cross re-extraction via the anchor-slicing approach.
//
// Pipeline:
//   1. For each Quarter PDF, find every cross section by regex on the cross title.
//   2. For each cross section, slice the body text from this title to the next title.
//   3. Send the cross body to Sonnet 4.6 and ask for ONLY anchor strings —
//      not the prose. Model output is small (a few hundred tokens) so it can't
//      truncate. The prose stays verbatim from the source PDF.
//   4. Slice each profile's prose from the cross body by anchor position.
//   5. Cache each cross's structured result on disk.
//
// Usage:
//   --cross "RAC of Sphinx 1"   Test on one cross by short name. Echoes structure.
//   --all                       Process every cross found. Skips already cached.
//   --resume                    Same as --all (resume is default).

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { execSync } from "child_process";

const env = Object.fromEntries(
  readFileSync("/Users/dorothygale/delphi/.env.local", "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g, "")]; })
);

const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
const CACHE_DIR = "/Users/dorothygale/Desktop/HD Reports/_source/cross-extract-cache-v2";
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const QUARTER_PDFS = [
  "/Users/dorothygale/Desktop/HD Reports/Planetary Overview Validation/Ra Material/Incarnation Cross Quarter 1 - The Quarter Of Initiation (1).pdf",
  "/Users/dorothygale/Desktop/HD Reports/Planetary Overview Validation/Ra Material/Incarnation Cross Quarter 2 - The Quarter Of Civilization (1).pdf",
  "/Users/dorothygale/Desktop/HD Reports/Planetary Overview Validation/Ra Material/Incarnation Cross Quarter 3 - The Quarter Of Duality (1).pdf",
  "/Users/dorothygale/Desktop/HD Reports/Planetary Overview Validation/Ra Material/Incarnation Cross Quarter 4 - The Quarter Of Mutation (1).pdf",
];

const RAC_PROFILES = ["1/3", "1/4", "2/4", "2/5", "3/5", "3/6", "4/6"];
const LAC_PROFILES = ["5/1", "5/2", "6/2", "6/3"];
const JC_PROFILES  = ["4/1"];

// ────────────────────────────────────────────────────────────────────────────
// PDF text + boilerplate cleanup (adapted from the original import-crosses.ts)
// ────────────────────────────────────────────────────────────────────────────

function extractPdfText(pdfPath) {
  const py = `
from pypdf import PdfReader
import sys
r = PdfReader(sys.argv[1])
print("\\n".join((p.extract_text() or "") for p in r.pages))
`;
  return execSync(`python3 -c '${py.replace(/'/g, `'\\''`)}' '${pdfPath}'`, {
    maxBuffer: 100 * 1024 * 1024, encoding: "utf8",
  });
}

const BOILERPLATE = [
  /^INCARNATION CROSSES BY PROFILE:?/i,
  /^A Digital Book for Students/i,
  /^Incarnation Crosses by Profile is a program of/i,
  /^All Rights Reserved\.?\s+Copyright/i,
  /^Cover\/Mau Cattaneo/i,
  /^Transcribed\/Patricia Balentine/i,
  /^Layout & Proofing/i,
  /^The Rave BodyGraph/i,
  /^TABLE OF CONTENTS/i,
  /^An Encyclopedia of the Costumes of Purpose/i,
];
function cleanText(text) {
  return text.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (BOILERPLATE.some((re) => re.test(trimmed))) return false;
    if (/^\s*\d+\s*$/.test(trimmed)) return false;  // standalone page number
    return true;
  }).join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Cross section boundary detection (regex only, no AI)
// ────────────────────────────────────────────────────────────────────────────

const CROSS_TITLE_RE = /^\s*(The (?:Right Ang(?:le|el)|Left Angle|Juxtaposition) Cross of [^.\n]+?)\s*$/gim;
const TOC_TAIL = /\.{4,}\s*\d+\s*$/;

function shortName(longName) {
  // Drop "the" article after "of" so chapter-list entries and section headers
  // collapse to the same key. PDF uses both "of Clarion" and "of the Clarion".
  return longName
    .replace(/^The Right Ang(le|el)\s+Cross of\s+(?:the\s+)?/i, "RAC of ")
    .replace(/^The Left Angle Cross of\s+(?:the\s+)?/i, "LAC of ")
    .replace(/^The Juxtaposition Cross of\s+(?:the\s+)?/i, "JC of ")
    .trim();
}

function findCrossSections(cleanedText) {
  const anchors = [];
  for (const m of cleanedText.matchAll(CROSS_TITLE_RE)) {
    const line = (m[0] || "").trim();
    if (TOC_TAIL.test(line)) continue;
    if (line.length > 80) continue;
    anchors.push({ pos: m.index, longName: m[1].trim(), shortName: shortName(m[1].trim()) });
  }
  anchors.sort((a, b) => a.pos - b.pos);

  // Each anchor's body runs from its position to the next anchor.
  const all = anchors.map((a, i) => ({
    longName: a.longName,
    shortName: a.shortName,
    body: cleanedText.slice(a.pos, i + 1 < anchors.length ? anchors[i + 1].pos : cleanedText.length),
  }));

  // Dedup by shortName, keeping the longest body (real section vs TOC entry).
  const byName = new Map();
  for (const sec of all) {
    const prev = byName.get(sec.shortName);
    if (!prev || sec.body.length > prev.body.length) byName.set(sec.shortName, sec);
  }
  return [...byName.values()].filter((s) => s.body.trim().length >= 200);
}

// ────────────────────────────────────────────────────────────────────────────
// Sonnet 4.6 call via curl — asks for ONLY anchor strings, never the prose
// ────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are parsing the structural skeleton of a single incarnation cross section from Ra Uru Hu's "Incarnation Crosses By Profile" PDF (Jovian Archive, 2008). You receive ONE cross section. You return a small JSON structure identifying where each profile sub-section begins inside that body. You DO NOT return the prose itself — only short anchor strings.

PROFILE GEOMETRY (non-negotiable):
- Right Angle Cross (RAC): valid profiles are 1/3, 1/4, 2/4, 2/5, 3/5, 3/6, 4/6 (up to 7).
- Left Angle Cross (LAC): valid profiles are 5/1, 5/2, 6/2, 6/3 (up to 4).
- Juxtaposition Cross (JC): valid profile is 4/1 only (exactly 1).

If you see "The 2/4" inside an LAC body, that's incidental text inside Ra's prose, NOT a profile heading. LACs can't legally contain 2/4. Ignore it.

INTRO BLOCK (RAC and LAC only):
If there is a substantive intro paragraph BEFORE the first profile heading (more than ~40 words of standalone framing about the cross theme), emit it as the first entry with label "intro". Otherwise omit.
DO NOT emit "intro" for a JC.

GATE INTRO BLOCK (RAC only):
If the RAC section opens with general gate material (e.g., "GATE 51 / The Arousing") BEFORE the cross-specific intro, emit that as label "gate_intro" before "intro". This is HD-canonical gate-level background that precedes the cross discussion.

OUTPUT (one JSON object, no preamble, no code fences):

{
  "crossName": "The Right Angle Cross of Eden 1",
  "gateQuadrant": "(36/6 | 11/12)" | null,
  "profiles": [
    { "label": "gate_intro" | "intro" | "1/3" | "1/4" | "2/4" | "2/5" | "3/5" | "3/6" | "4/6" | "5/1" | "5/2" | "6/2" | "6/3" | "4/1",
      "startAnchor": "first ~40 chars of this block, verbatim from source" }
  ]
}

ANCHOR STRINGS:
- 40 characters target. Distinctive enough to uniquely identify the position.
- Do NOT paraphrase. Copy from the source. Whitespace and quote variations are normalized away by the downstream slicer.
- Profiles MUST appear in JSON in the same order they appear in the source.
- Each profile's body runs from its anchor to the next anchor (or end of section).

NAME CORRECTIONS:
- "Right Angel" → "Right Angle" (PDF typo)
- Otherwise preserve the exact name.

GATE QUADRANT:
- Often appears near the heading as "51 61 | 57 62" or "(51/57 | 61/62)". Normalize to "(A/B | C/D)". If absent, emit null.`;

async function callClaude(crossBody, attempt = 1) {
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Cross section text follows.\n\n<<<CROSS_SECTION>>>\n${crossBody}\n<<<END>>>` }],
  };
  const payloadPath = `/tmp/claude-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  writeFileSync(payloadPath, JSON.stringify(body));
  try {
    const out = execSync(
      `curl --max-time 120 --fail-with-body -s ` +
      `-X POST https://api.anthropic.com/v1/messages ` +
      `-H "x-api-key: ${ANTHROPIC_API_KEY}" ` +
      `-H "anthropic-version: 2023-06-01" ` +
      `-H "content-type: application/json" ` +
      `--data-binary @${payloadPath}`,
      { maxBuffer: 10 * 1024 * 1024, encoding: "utf8" }
    );
    unlinkSync(payloadPath);
    return JSON.parse(out);
  } catch (e) {
    try { unlinkSync(payloadPath); } catch {}
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return callClaude(crossBody, attempt + 1);
    }
    throw new Error(`curl exit ${e.status}: ${(e.stdout || e.stderr || "").toString().slice(0, 300)}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Anchor-tolerant slicer: finds an anchor in the source after whitespace/quote
// normalization, and returns the position in the ORIGINAL source.
// ────────────────────────────────────────────────────────────────────────────

function normalizeWithMap(s) {
  const out = [];
  const map = [];
  let lastSpace = false;
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (c === "‘" || c === "’" || c === "‚" || c === "‛" || c === "´" || c === "`") c = "'";
    else if (c === "“" || c === "”" || c === "„" || c === "‟") c = '"';
    else if (c === "—" || c === "–") c = "-";
    else if (c === "­") continue;
    if (/\s/.test(c)) {
      if (lastSpace) continue;
      out.push(" "); map.push(i); lastSpace = true;
      continue;
    }
    out.push(c.toLowerCase()); map.push(i); lastSpace = false;
  }
  return { norm: out.join(""), map };
}

function findAnchor(source, anchor) {
  const { norm: srcN, map: srcMap } = normalizeWithMap(source);
  const { norm: anchN } = normalizeWithMap(anchor);
  if (!anchN) return -1;
  const probe = anchN.slice(0, Math.min(30, anchN.length));
  const idx = srcN.indexOf(probe);
  if (idx < 0) return -1;
  return srcMap[idx];
}

// ────────────────────────────────────────────────────────────────────────────
// Main: process all cross sections, cache per cross
// ────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const targetCross = args.includes("--cross") ? args[args.indexOf("--cross") + 1] : null;
const all = args.includes("--all") || !targetCross;

console.log("Extracting all cross sections from 4 Quarter PDFs…");
const allCrosses = [];  // { quarter, longName, shortName, body }
for (let qi = 0; qi < QUARTER_PDFS.length; qi++) {
  const text = cleanText(extractPdfText(QUARTER_PDFS[qi]));
  const sections = findCrossSections(text);
  console.log(`  Q${qi+1}: ${sections.length} cross sections`);
  for (const s of sections) allCrosses.push({ quarter: qi+1, ...s });
}
console.log(`Total: ${allCrosses.length} cross sections to process\n`);

const targets = targetCross
  ? allCrosses.filter((c) => c.shortName.toLowerCase() === targetCross.toLowerCase())
  : allCrosses;
if (targetCross && targets.length === 0) {
  console.error(`No cross found matching "${targetCross}". Available short names sample:`);
  for (const c of allCrosses.slice(0, 10)) console.error(`  - "${c.shortName}"`);
  process.exit(1);
}

function expectedFor(shortName) {
  if (shortName.startsWith("RAC")) return new Set(RAC_PROFILES);
  if (shortName.startsWith("LAC")) return new Set(LAC_PROFILES);
  if (shortName.startsWith("JC")) return new Set(JC_PROFILES);
  return new Set();
}

let totalCost = 0;
let okCount = 0;
let issueCount = 0;
for (let i = 0; i < targets.length; i++) {
  const cross = targets[i];
  const cacheFile = `${CACHE_DIR}/${cross.shortName.replace(/[\/\\]/g, "_")}.json`;
  if (existsSync(cacheFile) && !targetCross) {
    try {
      const cached = JSON.parse(readFileSync(cacheFile, "utf8"));
      if (cached.profiles && cached.profiles.length > 0 && !cached.error) {
        process.stdout.write(`  [${i+1}/${targets.length}] cached: ${cross.shortName}\n`);
        okCount++;
        continue;
      }
    } catch {}
  }

  process.stdout.write(`  [${i+1}/${targets.length}] ${cross.shortName} (${cross.body.length} chars)… `);
  try {
    const resp = await callClaude(cross.body);
    const text = resp.content?.[0]?.text || "";
    const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    const parsed = JSON.parse(cleaned);

    const usage = resp.usage || {};
    const cost = ((usage.input_tokens || 0) * 3 + (usage.cache_creation_input_tokens || 0) * 3.75 +
                  (usage.cache_read_input_tokens || 0) * 0.30 + (usage.output_tokens || 0) * 15) / 10000;
    totalCost += cost;

    // Validate and slice profile bodies from the source.
    const expected = expectedFor(cross.shortName);
    const issues = [];
    const sliced = [];
    const labels = ["gate_intro", "intro", ...RAC_PROFILES, ...LAC_PROFILES, ...JC_PROFILES];
    const validLabels = new Set(labels);

    for (const p of parsed.profiles || []) {
      if (!validLabels.has(p.label)) { issues.push(`unknown label "${p.label}"`); continue; }
      if (p.label !== "gate_intro" && p.label !== "intro" && expected.size > 0 && !expected.has(p.label)) {
        issues.push(`label "${p.label}" invalid for ${cross.shortName}`); continue;
      }
      const pos = findAnchor(cross.body, p.startAnchor);
      if (pos < 0) { issues.push(`anchor for "${p.label}" not found`); continue; }
      sliced.push({ label: p.label, pos, anchor: p.startAnchor });
    }
    sliced.sort((a, b) => a.pos - b.pos);
    // Body runs from this position to next.
    const profilesOut = sliced.map((s, idx) => {
      const end = idx + 1 < sliced.length ? sliced[idx + 1].pos : cross.body.length;
      return { label: s.label, body: cross.body.slice(s.pos, end).trim() };
    });

    const cacheEntry = {
      shortName: cross.shortName,
      longName: cross.longName,
      quarter: cross.quarter,
      crossName: parsed.crossName,
      gateQuadrant: parsed.gateQuadrant,
      profiles: profilesOut,
      issues,
      cost_cents: Math.round(cost * 100) / 100,
    };
    writeFileSync(cacheFile, JSON.stringify(cacheEntry, null, 2));

    const labelList = profilesOut.map((p) => p.label).join(",");
    if (issues.length > 0) issueCount++;
    else okCount++;
    process.stdout.write(`${cost.toFixed(2)}¢  [${labelList}]${issues.length > 0 ? `  ⚠ ${issues.length} issues` : ""}\n`);
  } catch (e) {
    process.stdout.write(`ERROR: ${e.message.slice(0, 100)}\n`);
    writeFileSync(cacheFile, JSON.stringify({ shortName: cross.shortName, error: e.message }, null, 2));
    issueCount++;
  }
}

console.log(`\n=== DONE ===`);
console.log(`  Processed: ${targets.length}`);
console.log(`  Clean: ${okCount}`);
console.log(`  With issues: ${issueCount}`);
console.log(`  Total cost: ${totalCost.toFixed(2)}¢ ($${(totalCost / 100).toFixed(2)})`);
console.log(`  Cache: ${CACHE_DIR}`);
