// Stage 1+2 of the cross re-extraction.
// Reads the 4 IHDS Quarter PDFs, slices each into per-gate sections,
// sends each gate to Sonnet 4.6 to extract structured cross/profile data,
// caches results per gate. Does NOT write to Notion (that's stage 3).
//
// Usage:
//   --gate 13     Test on one gate only (good for first run / cost validation)
//   --all         Process all 64 gates across Q1-Q4
//   --resume      Skip gates that already have a valid cache file
//
// Output: /Users/dorothygale/Desktop/HD Reports/_source/cross-extract-cache/<gate>.json

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { execSync } from "child_process";

const env = Object.fromEntries(
  readFileSync("/Users/dorothygale/delphi/.env.local", "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g, "")]; })
);

const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY missing"); process.exit(1); }

const CACHE_DIR = "/Users/dorothygale/Desktop/HD Reports/_source/cross-extract-cache";
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const QUARTER_PDFS = [
  { quarter: 1, name: "Initiation", path: "/Users/dorothygale/Desktop/HD Reports/Planetary Overview Validation/Ra Material/Incarnation Cross Quarter 1 - The Quarter Of Initiation (1).pdf" },
  { quarter: 2, name: "Civilization", path: "/Users/dorothygale/Desktop/HD Reports/Planetary Overview Validation/Ra Material/Incarnation Cross Quarter 2 - The Quarter Of Civilization (1).pdf" },
  { quarter: 3, name: "Duality", path: "/Users/dorothygale/Desktop/HD Reports/Planetary Overview Validation/Ra Material/Incarnation Cross Quarter 3 - The Quarter Of Duality (1).pdf" },
  { quarter: 4, name: "Mutation", path: "/Users/dorothygale/Desktop/HD Reports/Planetary Overview Validation/Ra Material/Incarnation Cross Quarter 4 - The Quarter Of Mutation (1).pdf" },
];

// Extract full text from PDF via python pypdf
function extractPdfText(pdfPath) {
  const py = `
import sys
from pypdf import PdfReader
r = PdfReader("${pdfPath.replace(/"/g, '\\"')}")
parts = []
for i, p in enumerate(r.pages):
    parts.append(f"\\n===PAGE {i+1}===\\n")
    parts.append(p.extract_text() or "")
print("".join(parts))
`;
  return execSync(`python3 -c '${py.replace(/'/g, `'\\''`)}'`, { maxBuffer: 50 * 1024 * 1024 }).toString();
}

// Slice into per-gate sections. Headers are like "THE 13th GATE" / "THE 24th GATE".
function sliceByGate(fullText) {
  const re = /^\s*THE\s+(\d+)(?:st|nd|rd|th)?\s+GATE\s*$/gm;
  const sections = [];
  let match;
  const matches = [];
  while ((match = re.exec(fullText)) !== null) {
    matches.push({ gate: parseInt(match[1]), start: match.index });
  }
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const end = i + 1 < matches.length ? matches[i+1].start : fullText.length;
    sections.push({ gate: m.gate, text: fullText.slice(m.start, end) });
  }
  return sections;
}

// Sonnet 4.6 extraction call via curl (bypasses Node 22 undici large-payload issues).
async function callClaude(systemPrompt, userMessage, attempt = 1) {
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  };
  // Write payload to temp file (avoids shell quoting issues with 75KB JSON)
  const payloadPath = `/tmp/claude-payload-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  writeFileSync(payloadPath, JSON.stringify(body));
  try {
    // 600s timeout, fail on HTTP error >= 400
    const out = execSync(
      `curl --max-time 600 --fail-with-body -s ` +
      `-X POST https://api.anthropic.com/v1/messages ` +
      `-H "x-api-key: ${ANTHROPIC_API_KEY}" ` +
      `-H "anthropic-version: 2023-06-01" ` +
      `-H "content-type: application/json" ` +
      `--data-binary @${payloadPath}`,
      { maxBuffer: 50 * 1024 * 1024, encoding: "utf8" }
    );
    unlinkSync(payloadPath);
    return JSON.parse(out);
  } catch (e) {
    try { unlinkSync(payloadPath); } catch {}
    // execSync throws on non-zero exit. e.stdout has the server body on --fail-with-body
    const stderr = e.stderr?.toString?.() || "";
    const stdout = e.stdout?.toString?.() || "";
    const msg = `curl exit ${e.status}: ${stdout.slice(0, 300) || stderr.slice(0, 300)}`;
    if (attempt < 3) {
      const wait = 2000 * attempt;
      console.log(`  (retry in ${wait}ms after ${msg.slice(0, 100)})`);
      await new Promise((rr) => setTimeout(rr, wait));
      return callClaude(systemPrompt, userMessage, attempt + 1);
    }
    throw new Error(msg);
  }
}

const SYSTEM_PROMPT = `You are extracting structured cross content from a Human Design "Incarnation Crosses by Profile" source text (Ra Uru Hu, IHDS, 2008). Your job is to identify each cross section and its profile sub-sections, returning a strict JSON structure.

# Input shape
You will receive ONE gate's section from the source — typically 15-25 pages of text describing the crosses that touch that gate. Each gate section contains EXACTLY three cross headers:
- ONE "The Right Angle Cross of X N" (RAC) header — followed by EXACTLY 7 profile sub-sections in this order: 1/3, 1/4, 2/4, 2/5, 3/5, 3/6, 4/6
- ONE "The Juxtaposition Cross of X" (JC) header — followed by EXACTLY 1 profile sub-section: 4/1
- ONE "The Left Angle Cross of X N" (LAC) header — followed by EXACTLY 4 profile sub-sections in this order: 5/1, 5/2, 6/2, 6/3

The "N" suffix on RAC/LAC titles is a rotation number (1, 2, 3, or 4 for RAC; 1, 2, or 3 for LAC). JC titles have no rotation number.

The gate section may begin with a Gate Introduction (general material about the gate before any cross is named). The RAC section often begins with a Cross Intro (material about the RAC theme before the 1/3 profile starts). These intros precede the first profile sub-section.

# Profile sub-section headers
Each profile sub-section is introduced by a line that's just "The X/Y" where X/Y is the profile, like "The 1/3" or "The 5/1". These headers appear on their own line. Treat them as section dividers.

# Output JSON shape (strict)
Return ONLY a JSON object — no preamble, no explanation, no markdown code fences. Shape:

{
  "gate": <number>,
  "gate_intro": "<verbatim text of gate introduction, if any, before the first cross header>",
  "crosses": [
    {
      "title": "<verbatim cross title from source, e.g. 'The Right Angle Cross of the Sphinx 1'>",
      "angle": "RAC" | "JC" | "LAC",
      "cross_intro": "<verbatim cross intro paragraphs, if any, before the first profile header>",
      "profiles": {
        "1/3": "<verbatim prose for this profile>",
        "1/4": "...",
        ...
      }
    },
    ...
  ]
}

# Validation rules
- Every gate section MUST yield exactly 3 cross entries (one RAC, one JC, one LAC).
- The RAC entry MUST have exactly 7 profile keys: "1/3", "1/4", "2/4", "2/5", "3/5", "3/6", "4/6".
- The JC entry MUST have exactly 1 profile key: "4/1".
- The LAC entry MUST have exactly 4 profile keys: "5/1", "5/2", "6/2", "6/3".
- If you cannot satisfy a validation rule, still return your best attempt with a "validation_errors" array listing the rule violations.

# Verbatim discipline
The "gate_intro", "cross_intro", and profile values must be VERBATIM prose from the source, not summarized. Preserve Ra's voice exactly, including idiosyncratic spellings and punctuation. Strip page-header noise (e.g., "INCARNATION CROSSES BY PROFILE: Quarter 1 / A Digital Book for Students / All Rights Reserved...") and page-footer noise (e.g., gate-name footer banners that repeat across pages). Strip page-break artifacts like "===PAGE N===". Strip footer markers like "LAC Clarion 1" that appear at the bottom of each page.

Within each profile body, normalize whitespace: collapse multiple spaces to one, normalize line breaks. Do not introduce any new content. Do not paraphrase. Do not skip paragraphs.`;

async function extractGate(gateNumber, gateText, quarter) {
  const cacheFile = `${CACHE_DIR}/gate-${gateNumber}.json`;
  const userMsg = `Quarter: ${quarter}\nGate: ${gateNumber}\n\nSource text (verbatim):\n\n${gateText}`;
  const startedAt = Date.now();
  const resp = await callClaude(SYSTEM_PROMPT, userMsg);
  const elapsedMs = Date.now() - startedAt;
  const text = resp.content?.[0]?.text || "";
  let parsed = null;
  let parseError = null;
  try {
    // Strip any wrapper if Claude added one
    let cleanText = text.trim();
    if (cleanText.startsWith("```json")) cleanText = cleanText.slice(7);
    if (cleanText.startsWith("```")) cleanText = cleanText.slice(3);
    if (cleanText.endsWith("```")) cleanText = cleanText.slice(0, -3);
    parsed = JSON.parse(cleanText.trim());
  } catch (e) {
    parseError = e.message;
  }
  const usage = resp.usage || {};
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheCreate = usage.cache_creation_input_tokens || 0;
  const inputFresh = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  // Sonnet 4.6 prices: input $3/M, cache write $3.75/M, cache read $0.30/M, output $15/M
  const costCents = (inputFresh * 3 + cacheCreate * 3.75 + cacheRead * 0.30 + output * 15) / 10000;

  const result = {
    gate: gateNumber,
    quarter,
    elapsed_ms: elapsedMs,
    usage: { input_fresh: inputFresh, cache_read: cacheRead, cache_create: cacheCreate, output },
    cost_cents: Math.round(costCents * 100) / 100,
    parse_error: parseError,
    parsed,
    raw_text_if_unparsed: parseError ? text.slice(0, 2000) : null,
  };
  writeFileSync(cacheFile, JSON.stringify(result, null, 2));
  return result;
}

// ---- main ----
const args = process.argv.slice(2);
const oneGate = args.includes("--gate") ? parseInt(args[args.indexOf("--gate") + 1]) : null;
const all = args.includes("--all");
const resume = args.includes("--resume");

if (!oneGate && !all) {
  console.log("usage: --gate <N> | --all [--resume]");
  process.exit(1);
}

console.log(`Extracting gate sections from ${QUARTER_PDFS.length} Quarter PDFs…`);
const allGateSections = []; // { gate, text, quarter }
for (const qp of QUARTER_PDFS) {
  const full = extractPdfText(qp.path);
  const sections = sliceByGate(full);
  console.log(`  Q${qp.quarter} (${qp.name}): ${sections.length} gate sections found`);
  for (const s of sections) allGateSections.push({ ...s, quarter: qp.quarter });
}
console.log(`Total gate sections: ${allGateSections.length}\n`);

const targets = oneGate
  ? allGateSections.filter((s) => s.gate === oneGate)
  : allGateSections;

if (oneGate && targets.length === 0) {
  console.error(`Gate ${oneGate} not found in any Quarter PDF.`);
  process.exit(1);
}

let totalCost = 0;
let processed = 0;
let validatedOk = 0;
for (const t of targets) {
  const cacheFile = `${CACHE_DIR}/gate-${t.gate}.json`;
  if (resume && existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, "utf8"));
    if (cached.parsed && !cached.parse_error) {
      console.log(`  [skip ${t.gate}] cached, OK`);
      validatedOk++;
      processed++;
      continue;
    }
  }
  process.stdout.write(`  [gate ${t.gate}, Q${t.quarter}] extracting…  `);
  try {
    const result = await extractGate(t.gate, t.text, t.quarter);
    totalCost += result.cost_cents;
    processed++;
    if (result.parse_error) {
      console.log(`PARSE ERROR: ${result.parse_error}`);
    } else if (result.parsed) {
      const crosses = result.parsed.crosses || [];
      const rac = crosses.find((c) => c.angle === "RAC");
      const jc = crosses.find((c) => c.angle === "JC");
      const lac = crosses.find((c) => c.angle === "LAC");
      const racProfiles = rac ? Object.keys(rac.profiles || {}).length : 0;
      const jcProfiles = jc ? Object.keys(jc.profiles || {}).length : 0;
      const lacProfiles = lac ? Object.keys(lac.profiles || {}).length : 0;
      const ok = racProfiles === 7 && jcProfiles === 1 && lacProfiles === 4;
      if (ok) validatedOk++;
      console.log(`${ok ? "OK" : "MISMATCH"} (RAC ${racProfiles}/7, JC ${jcProfiles}/1, LAC ${lacProfiles}/4)  ${result.elapsed_ms}ms  ${result.cost_cents.toFixed(2)}¢  RAC="${rac?.title || "—"}" LAC="${lac?.title || "—"}" JC="${jc?.title || "—"}"`);
    }
  } catch (e) {
    console.log(`API ERROR: ${e.message}`);
  }
}

console.log(`\n=== EXTRACTION COMPLETE ===`);
console.log(`  Gates processed: ${processed}/${targets.length}`);
console.log(`  Validated OK (correct profile counts): ${validatedOk}`);
console.log(`  Total cost: ${totalCost.toFixed(2)}¢ (~$${(totalCost / 100).toFixed(2)})`);
console.log(`  Cache: ${CACHE_DIR}`);
