// Cross re-extraction via pure regex slicing.
//
// Insight: the PDF structure is regular enough that we don't need an LLM at all
// for the profile-section boundaries. The headers are literally "The N/M" on
// their own line. We:
//   1. Find each cross section by cross-title regex.
//   2. Within each cross body, find every "The N/M" header.
//   3. Slice profile bodies between consecutive headers.
//   4. Validate counts per angle (RAC=7, JC=1, LAC=4).
//   5. Optionally use Claude only for cleanup of the intro/gate-intro split at the top.
//
// No truncation risk. No per-cross API cost. Reliable.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { execSync } from "child_process";

const CACHE_DIR = "/Users/dorothygale/Desktop/HD Reports/_source/cross-extract-cache-v3";
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

// Cross title regex. Multi-line; matches both "Cross of X" and "Cross of the X".
const CROSS_TITLE_RE = /^\s*(The (?:Right Ang(?:le|el)|Left Angle|Juxtaposition) Cross of [^.\n]+?)\s*$/gim;
const TOC_TAIL = /\.{4,}\s*\d+\s*$/;

// Profile sub-section header. Most common: "The N/M" on its own line.
// Variants observed in IHDS: "The N/M & A/B" (combined sub-section).
const PROFILE_HEADER_RE = /^\s*The\s+(\d)\s*\/\s*(\d)(?:\s*[&,]\s*(\d)\s*\/\s*(\d))?\s*$/gm;

// Strip page header/footer boilerplate from sliced profile bodies.
function stripBoilerplate(text) {
  let t = text;
  // Strip multi-line PDF footer/header blocks
  t = t.replace(/\n\s*INCARNATION CROSSES BY PROFILE.*?(?:\n\s*\d+\s*\n|\n[A-Z][^\n]*\n)/gms, "\n");
  t = t.replace(/\n\s*A Digital Book for Students[^\n]*\n/g, "\n");
  t = t.replace(/\n\s*Incarnation Crosses by Profile is a program of[^\n]*\n/g, "\n");
  t = t.replace(/\n\s*All Rights Reserved\.?[^\n]*Copyright[^\n]*\n/g, "\n");
  t = t.replace(/\n\s*Jovian Archive Corporation[^\n]*\n/g, "\n");
  t = t.replace(/\n\s*This transcription has not been proofed\.?\s*\n/g, "\n");
  t = t.replace(/\n\s*The Quarter of (?:Initiation|Civilization|Duality|Mutation)\s*\n/g, "\n");
  t = t.replace(/\n\s*The Realm of (?:Alcyone|Jupiter|Mercury|Venus)\s*\n/g, "\n");
  t = t.replace(/\n\s*THE \d+(?:st|nd|rd|th)?\s+GATE\s*\n[^\n]+\n/g, "\n");
  // GATE N - <NAME> footer (e.g. "GATE 51   The Arousing")
  t = t.replace(/\n\s*GATE\s+\d+\s*\n\s*[A-Z][^\n]*\n/g, "\n");
  // Short cross-id footer that appears at bottom of every PDF page (e.g., "LAC Clarion 1", "RAC Sphinx 1")
  t = t.replace(/\n\s*(?:RAC|LAC|JC)\s+[A-Za-z][A-Za-z ]{2,30}?\s*\d?\s*\n/g, "\n");
  // Strip standalone page numbers (between content)
  t = t.replace(/\n\s*\d{1,3}\s*\n/g, "\n");
  // Trailing unicode glyphs (gate symbols, arrows from PDF rendering)
  t = t.replace(/[∀-⏿-]+/g, "");
  // Collapse runs of whitespace-only lines
  t = t.replace(/(?:\n\s*){3,}/g, "\n\n");
  // Strip residual unicode bullet/arrow glyphs near gate symbols
  t = t.replace(/[]\s*\d+\s*/g, "");
  return t.trim();
}

function shortName(longName) {
  return longName
    .replace(/^The Right Ang(le|el)\s+Cross of\s+(?:the\s+)?/i, "RAC of ")
    .replace(/^The Left Angle Cross of\s+(?:the\s+)?/i, "LAC of ")
    .replace(/^The Juxtaposition Cross of\s+(?:the\s+)?/i, "JC of ")
    .trim();
}

function findCrossSections(text) {
  const anchors = [];
  for (const m of text.matchAll(CROSS_TITLE_RE)) {
    const line = (m[0] || "").trim();
    if (TOC_TAIL.test(line)) continue;
    if (line.length > 80) continue;
    anchors.push({ pos: m.index, longName: m[1].trim(), shortName: shortName(m[1].trim()) });
  }
  anchors.sort((a, b) => a.pos - b.pos);

  const all = anchors.map((a, i) => ({
    longName: a.longName,
    shortName: a.shortName,
    pos: a.pos,
    body: text.slice(a.pos, i + 1 < anchors.length ? anchors[i + 1].pos : text.length),
  }));

  // Dedup by shortName keeping LONGEST body.
  const byName = new Map();
  for (const sec of all) {
    const prev = byName.get(sec.shortName);
    if (!prev || sec.body.length > prev.body.length) byName.set(sec.shortName, sec);
  }
  return [...byName.values()].filter((s) => s.body.trim().length >= 500);
}

function expectedFor(shortName) {
  if (shortName.startsWith("RAC")) return RAC_PROFILES;
  if (shortName.startsWith("LAC")) return LAC_PROFILES;
  if (shortName.startsWith("JC")) return JC_PROFILES;
  return [];
}

// Within a cross body, find profile sub-section headers and slice.
function sliceProfiles(crossBody, expected) {
  // Each header may declare one or two profiles (combined sections "The 6/2 & 6/3").
  const headers = [];
  for (const m of crossBody.matchAll(PROFILE_HEADER_RE)) {
    const profiles = [`${m[1]}/${m[2]}`];
    if (m[3] && m[4]) profiles.push(`${m[3]}/${m[4]}`);
    headers.push({ profiles, pos: m.index, headerEnd: m.index + m[0].length });
  }
  const expectedSet = new Set(expected);
  // Filter: at least one profile in the header must be expected for this angle.
  const valid = headers.filter((h) => h.profiles.some((p) => expectedSet.has(p)));

  // Dedup by header position; keep ordered.
  valid.sort((a, b) => a.pos - b.pos);

  // Slice each header's content body.
  const sliced = [];
  const seenProfiles = new Set();
  for (let i = 0; i < valid.length; i++) {
    const h = valid[i];
    const start = h.headerEnd;
    const end = i + 1 < valid.length ? valid[i + 1].pos : crossBody.length;
    const body = stripBoilerplate(crossBody.slice(start, end).trim());
    for (const p of h.profiles) {
      if (!expectedSet.has(p)) continue;
      if (seenProfiles.has(p)) continue;
      seenProfiles.add(p);
      sliced.push({ profile: p, body });
    }
  }

  // Intro = everything before the first profile header. Strip the cross title line.
  const intro = valid.length > 0
    ? crossBody.slice(0, valid[0].pos).trim()
    : crossBody.trim();
  const introWithoutTitle = intro.replace(/^The (?:Right Ang(?:le|el)|Left Angle|Juxtaposition) Cross of [^\n]+?\n/i, "").trim();

  return { profileBodies: sliced, intro: introWithoutTitle };
}

// Find gate quadrant pattern near the start of the body.
function findGateQuadrant(body) {
  // Look for patterns like "(51/57 | 61/62)" or "51 61 / 57 62"
  const m1 = body.match(/\((\d+)\/(\d+)\s*\|\s*(\d+)\/(\d+)\)/);
  if (m1) return `(${m1[1]}/${m1[2]} | ${m1[3]}/${m1[4]})`;
  const m2 = body.match(/\b(\d+)\s+(\d+)\s*\|\s*(\d+)\s+(\d+)\b/);
  if (m2) return `(${m2[1]}/${m2[3]} | ${m2[2]}/${m2[4]})`;
  return null;
}

// ────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const targetCross = args.includes("--cross") ? args[args.indexOf("--cross") + 1] : null;
const verbose = args.includes("--verbose");

console.log("Extracting cross sections from 4 Quarter PDFs…");
const allCrosses = [];
for (let qi = 0; qi < QUARTER_PDFS.length; qi++) {
  const text = extractPdfText(QUARTER_PDFS[qi]);
  const sections = findCrossSections(text);
  console.log(`  Q${qi+1}: ${sections.length} cross sections`);
  for (const s of sections) allCrosses.push({ quarter: qi+1, ...s });
}
console.log(`Total: ${allCrosses.length} cross sections\n`);

const targets = targetCross
  ? allCrosses.filter((c) => c.shortName.toLowerCase() === targetCross.toLowerCase())
  : allCrosses;
if (targetCross && targets.length === 0) {
  console.error(`No cross matching "${targetCross}". Available sample:`);
  for (const c of allCrosses.slice(0, 15)) console.error(`  - "${c.shortName}"`);
  process.exit(1);
}

let okCount = 0, partialCount = 0, missingProfiles = 0;
for (let i = 0; i < targets.length; i++) {
  const cross = targets[i];
  const expected = expectedFor(cross.shortName);
  const { profileBodies, intro } = sliceProfiles(cross.body, expected);
  const found = profileBodies.map((p) => p.profile);
  const missing = expected.filter((p) => !found.includes(p));
  const gateQuadrant = findGateQuadrant(cross.body);

  const cacheEntry = {
    shortName: cross.shortName,
    longName: cross.longName,
    quarter: cross.quarter,
    gateQuadrant,
    intro,
    profiles: profileBodies,
    expected,
    missing,
    body_length: cross.body.length,
  };

  const cacheFile = `${CACHE_DIR}/${cross.shortName.replace(/[\/\\]/g, "_")}.json`;
  writeFileSync(cacheFile, JSON.stringify(cacheEntry, null, 2));

  const status = missing.length === 0 ? "OK" : `MISSING:${missing.join(",")}`;
  if (missing.length === 0) okCount++;
  else { partialCount++; missingProfiles += missing.length; }
  if (verbose || targetCross || missing.length > 0) {
    console.log(`  [${i+1}/${targets.length}] ${cross.shortName}  body=${cross.body.length}  intro=${intro.length}  profiles=[${found.join(",")}]  ${status}`);
  }
}

console.log(`\n=== SUMMARY ===`);
console.log(`  Total crosses: ${targets.length}`);
console.log(`  Complete (all expected profiles present): ${okCount}`);
console.log(`  Partial (some profiles missing): ${partialCount}`);
console.log(`  Total missing profile sections across all crosses: ${missingProfiles}`);
console.log(`  Cache: ${CACHE_DIR}`);
