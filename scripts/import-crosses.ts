/**
 * Phase 4 bulk import of the 192 named Incarnation Crosses from the IHDS Quarter
 * PDFs into Kaycee's `HD Incarnation Crosses` Notion database.
 *
 * Pipeline:
 *   1. Extract text per PDF page via Python's pypdf.
 *   2. Use the cross-name regex (reliable) to find each cross section.
 *   3. Send each cross section to Claude Haiku 4.5 with the system prompt
 *      cached. Claude returns structured JSON with the corrected cross name,
 *      gate quadrant, and per-profile boundary markers (NOT the bodies
 *      themselves; we slice the source text by markers so Ra's words land
 *      verbatim in Notion).
 *   4. Validate each cross against HD profile geometry:
 *        - RAC supports only 1/3, 1/4, 2/4, 2/5, 3/5, 3/6, 4/6
 *        - LAC supports only 5/1, 5/2, 6/2, 6/3
 *        - JC supports only 4/1 (single-profile cross)
 *      Crosses that violate these are written to .cache/cross-rejects.json
 *      for manual review and not pushed to Notion.
 *   5. For each valid cross, look up the existing Notion page by short name.
 *      Skip if it already has a callout (Kaycee curated). Fill if empty.
 *
 * Run:
 *   npx tsx scripts/import-crosses.ts <pdf-path> [<pdf-path> ...]
 *   npx tsx scripts/import-crosses.ts <pdf-path> --dry   (parse + validate; no Notion writes)
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { Client as NotionClient, isFullPage, isFullBlock } from "@notionhq/client";
import Anthropic from "@anthropic-ai/sdk";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";

const CROSSES_DB_ID = "26ce3fad-caaa-8025-849d-d0f4c27b1e50";
const NOTION_THROTTLE_MS = 400;
const ANTHROPIC_MODEL = "claude-haiku-4-5";

const notion = new NotionClient({
  auth: must("NOTION_TOKEN"),
  timeoutMs: 120_000,
});
const claude = new Anthropic({ apiKey: must("ANTHROPIC_API_KEY") });

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

let lastNotion = 0;
async function throttle() {
  const wait = NOTION_THROTTLE_MS - (Date.now() - lastNotion);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNotion = Date.now();
}

// ─────────────────────────────────────────────────────────────────────────────
// HD geometry constraint (docs/CONTEXT.md "Incarnation Cross profile geometry")
// ─────────────────────────────────────────────────────────────────────────────

const RAC_PROFILES = new Set(["1/3", "1/4", "2/4", "2/5", "3/5", "3/6", "4/6"]);
const LAC_PROFILES = new Set(["5/1", "5/2", "6/2", "6/3"]);
const JC_PROFILES = new Set(["4/1"]);

function expectedProfilesFor(shortName: string): Set<string> {
  if (shortName.startsWith("RAC")) return RAC_PROFILES;
  if (shortName.startsWith("LAC")) return LAC_PROFILES;
  if (shortName.startsWith("JC")) return JC_PROFILES;
  return new Set();
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF extraction (pypdf subprocess; the wrapper around pypdf is already on disk)
// ─────────────────────────────────────────────────────────────────────────────

function extractPdfText(pdfPath: string): string[] {
  const script = `
import sys, json, pypdf
with open(sys.argv[1], 'rb') as f:
    r = pypdf.PdfReader(f)
    print(json.dumps([p.extract_text() or '' for p in r.pages]))
`;
  const out = execFileSync("python3", ["-c", script, pdfPath], {
    maxBuffer: 200 * 1024 * 1024,
  });
  return JSON.parse(out.toString()) as string[];
}

// Remove the boilerplate page headers and footers that the PDF extractor copies
// onto every page. Profile-detection downstream is more reliable when the
// repeated headers aren't sitting between cross sections.
const BOILERPLATE_PATTERNS = [
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
  /^The Fellowship of Man/i,
  /^\s*\d+\s*$/, // standalone page number
];

function cleanPage(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      kept.push("");
      continue;
    }
    if (BOILERPLATE_PATTERNS.some((p) => p.test(line))) continue;
    kept.push(raw);
  }
  return kept.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-section boundary detection (regex; this part is reliable)
// ─────────────────────────────────────────────────────────────────────────────

const CROSS_NAME_GLOBAL_RE =
  /^\s*(The (?:Right Ang(?:le|el)|Left Angle|Juxtaposition) Cross of [^.\n]+?)\s*$/gim;
const TOC_TAIL_RE = /\.{4,}\s*\d+\s*$/;

function shortName(longName: string): string {
  return longName
    .replace(/^The Right Ang(le|el)\s+Cross of\s+/i, "RAC of ")
    .replace(/^The Left Angle Cross of\s+/i, "LAC of ")
    .replace(/^The Juxtaposition Cross of\s+/i, "JC of ")
    .trim();
}

interface RawCrossSection {
  longName: string;
  shortName: string;
  body: string;
}

function findCrossSections(pages: string[]): RawCrossSection[] {
  const cleaned = pages.map(cleanPage).join("\n");

  // Every regex match becomes a potential section start. We keep ALL anchors
  // (not just unique-by-name), because the PDF often has the cross name
  // appearing once in the table-of-contents and again at the actual section,
  // and the dedup-by-first-occurrence pattern in the old version was picking
  // the TOC entry whose body is empty.
  const anchors: { pos: number; longName: string; shortName: string }[] = [];
  for (const m of cleaned.matchAll(CROSS_NAME_GLOBAL_RE)) {
    const line = (m[0] || "").trim();
    if (TOC_TAIL_RE.test(line)) continue;
    if (line.length > 80) continue;
    const long = m[1].trim();
    anchors.push({ pos: m.index!, longName: long, shortName: shortName(long) });
  }
  anchors.sort((a, b) => a.pos - b.pos);

  // Build candidate sections: each anchor's body is from its pos to the next
  // anchor (regardless of cross name).
  const all: RawCrossSection[] = anchors.map((a, i) => ({
    longName: a.longName,
    shortName: a.shortName,
    body: cleaned.slice(a.pos, i + 1 < anchors.length ? anchors[i + 1].pos : cleaned.length),
  }));

  // Dedup by shortName, keeping the section with the LONGEST body. (The TOC
  // entries are usually < 100 chars; real cross sections are 1k-10k chars.)
  const byName = new Map<string, RawCrossSection>();
  for (const sec of all) {
    const prev = byName.get(sec.shortName);
    if (!prev || sec.body.length > prev.body.length) {
      byName.set(sec.shortName, sec);
    }
  }
  // Drop sections that are still tiny (TOC fragments where the same name
  // doesn't appear elsewhere). A real cross section is at least ~500 chars.
  // 200 is a generous lower bound.
  const filtered = [...byName.values()].filter((s) => s.body.trim().length >= 200);
  return filtered.sort((a, b) =>
    cleaned.indexOf(a.body.slice(0, 40)) - cleaned.indexOf(b.body.slice(0, 40)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude extraction (per-cross structural pass)
// ─────────────────────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM = `You are parsing the structural skeleton of a single incarnation cross section from Ra Uru Hu's "Incarnation Crosses By Profile" PDF (Jovian Archive). For the cross section provided, identify the cross name, the gate quadrant, and the start position of each profile-specific block of Ra's writing.

PROFILE GEOMETRY — non-negotiable:

- Right Angle Cross (RAC): valid profiles are 1/3, 1/4, 2/4, 2/5, 3/5, 3/6, 4/6. Up to 7 profile blocks per cross.
- Left Angle Cross (LAC): valid profiles are 5/1, 5/2, 6/2, 6/3. Up to 4 profile blocks per cross.
- Juxtaposition Cross (JC): valid profile is 4/1 only. A JC is a single-block cross. Always emit exactly one entry for a JC with label "4/1" containing the entire body.

If you see a substring like "The 2/4" inside an LAC body, that is NOT a profile section start (the LAC cannot legally contain 2/4). It is incidental text inside Ra's prose. Ignore it.

INTRO BLOCKS (RAC and LAC only):

A RAC or LAC section may have a brief intro paragraph before the first profile heading. If there is substantive intro material (more than ~40 words of standalone framing), emit it as the first profile entry with label "intro". Otherwise, omit the intro entry entirely and let the first emitted entry be the first valid profile.

DO NOT emit "intro" for a JC. JCs have one body labeled "4/1".

OUTPUT — one JSON object only, no prose, no fences:

{
  "crossName": "The Right Angle Cross of Eden 1",
  "gateQuadrant": "(36/6 | 11/12)" | null,
  "profiles": [
    {
      "label": "intro" | "1/3" | "1/4" | "2/4" | "2/5" | "3/5" | "3/6" | "4/6" | "5/1" | "5/2" | "6/2" | "6/3" | "4/1",
      "startAnchor": "the first ~40 characters of this profile's body, copied as exactly as possible from the source"
    }
  ]
}

ABOUT startAnchor — read carefully:

- The downstream slicer locates each profile body by searching the source text for startAnchor (with whitespace and quote variations normalized away). Each anchor must be unique enough within the cross section to identify exactly one position.
- 40 characters is the target. If a profile body is unusually short, emit whatever distinctive prefix you can.
- It does NOT need to be byte-for-byte identical to the source. Whitespace, smart-quote-vs-straight-quote, and hyphenated-line-break differences are normalized away by the slicer. But the words and their order must match. Do not paraphrase or "clean up" the anchor.
- Profiles appear in the source in the order they are emitted in the JSON. The body of one profile runs from its startAnchor until the next profile's startAnchor (or the end of the section).

NAME CORRECTION:

- The PDF occasionally renders "Right Angel Cross" instead of "Right Angle Cross". Correct that typo in crossName.
- Otherwise preserve the exact name as it appears in the source.

GATE QUADRANT:

- The cross's gate quadrant appears near the heading as something like "36 6 | 11 12" or "(36/6 | 11/12)". Normalize to the format "(36/6 | 11/12)". If you can't find one, emit null.`;

interface ExtractionResult {
  crossName: string;
  gateQuadrant: string | null;
  profiles: { label: string; startAnchor: string }[];
  // Token usage for cost reporting:
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}

async function extractCrossWithClaude(body: string, attempt = 0): Promise<ExtractionResult> {
  let resp;
  for (let tries = 0; tries < 5; tries++) {
    try {
      resp = await claude.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        system: [
          { type: "text", text: EXTRACTION_SYSTEM, cache_control: { type: "ephemeral" } },
        ],
        messages: [
          {
            role: "user",
            content: `Cross section text follows. Extract the structural skeleton per the system instructions.

<<<CROSS_SECTION>>>
${body}
<<<END>>>`,
          },
        ],
      });
      break;
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      const isRetriable = status === 429 || (status && status >= 500) || e?.code === "ECONNRESET";
      if (!isRetriable || tries === 4) throw e;
      const waitMs = 5000 * Math.pow(2, tries); // 5s, 10s, 20s, 40s
      process.stdout.write(`(${status} retry in ${waitMs / 1000}s) `);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  if (!resp) throw new Error("unreachable: resp not set");

  const text = (resp.content[0] as any).text as string;
  // Strip code fences if Claude added them despite instructions.
  const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      crossName: parsed.crossName,
      gateQuadrant: parsed.gateQuadrant ?? null,
      profiles: parsed.profiles ?? [],
      usage: {
        input_tokens: resp.usage.input_tokens ?? 0,
        output_tokens: resp.usage.output_tokens ?? 0,
        cache_creation_input_tokens: (resp.usage as any).cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: (resp.usage as any).cache_read_input_tokens ?? 0,
      },
    };
  } catch (e) {
    if (attempt < 1) {
      console.warn(`    ⚠ JSON parse failed, retrying once`);
      return extractCrossWithClaude(body, attempt + 1);
    }
    throw new Error(`Claude returned non-JSON after retry. First 200 chars: ${cleaned.slice(0, 200)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Slice the original text by anchor (preserves source; tolerant of PDF artifacts)
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedCross {
  longName: string;
  shortName: string;
  gateQuadrant: string | null;
  profiles: { profile: string; body: string }[];
  validationIssues: string[];
  rawBody: string;
}

// Normalize for fuzzy comparison: collapse all whitespace, drop smart-quote
// substitutions, lowercase. Returns both the normalized string and a mapping
// from each index in the normalized string back to an index in the original.
function normalizeWithMap(s: string): { norm: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    // Smart-quote / fancy-quote / em-dash / hyphenation-break normalization.
    if (c === "‘" || c === "’" || c === "‚" || c === "‛" || c === "´" || c === "`") c = "'";
    else if (c === "“" || c === "”" || c === "„" || c === "‟") c = '"';
    else if (c === "—" || c === "–") c = "-";
    else if (c === "­") continue; // soft hyphen
    // Collapse runs of whitespace.
    if (/\s/.test(c)) {
      if (lastWasSpace) continue;
      out.push(" ");
      map.push(i);
      lastWasSpace = true;
      continue;
    }
    out.push(c.toLowerCase());
    map.push(i);
    lastWasSpace = false;
  }
  return { norm: out.join(""), map };
}

// Find startAnchor in source using a normalized comparison. Returns the
// position of the first character of the match in the ORIGINAL source (so
// downstream slicing returns Ra's actual prose, not the normalized version).
function findAnchorPosition(source: string, anchor: string): number {
  const { norm: srcN, map: srcMap } = normalizeWithMap(source);
  const { norm: anchorN } = normalizeWithMap(anchor);
  if (anchorN.length === 0) return -1;
  // Trim anchor to the first ~30 normalized chars for tolerance (Claude
  // sometimes emits 40+; the PDF may have inserted a page break in the middle).
  const probe = anchorN.slice(0, Math.min(30, anchorN.length));
  const idx = srcN.indexOf(probe);
  if (idx < 0) return -1;
  return srcMap[idx];
}

function buildParsedCross(raw: RawCrossSection, ext: ExtractionResult): ParsedCross {
  const issues: string[] = [];
  const expected = expectedProfilesFor(raw.shortName);
  const valid: { profile: string; pos: number }[] = [];

  for (const p of ext.profiles) {
    // JC sections may only contain 4/1. Reject everything else.
    if (raw.shortName.startsWith("JC")) {
      if (p.label !== "4/1") {
        issues.push(`JC contains invalid profile label "${p.label}"`);
        continue;
      }
    } else if (p.label !== "intro" && !expected.has(p.label)) {
      issues.push(`profile "${p.label}" not valid for ${raw.shortName}`);
      continue;
    }

    const pos = findAnchorPosition(raw.body, p.startAnchor);
    if (pos < 0) {
      issues.push(`startAnchor for "${p.label}" not located in source`);
      continue;
    }
    valid.push({ profile: p.label, pos });
  }

  // Sort by position so we can compute end-of-body as next-start.
  valid.sort((a, b) => a.pos - b.pos);

  // Dedup by profile label (keep first occurrence).
  const seen = new Set<string>();
  const ordered = valid.filter((p) => {
    if (seen.has(p.profile)) {
      issues.push(`duplicate profile "${p.profile}" — kept first occurrence`);
      return false;
    }
    seen.add(p.profile);
    return true;
  });

  const profiles: { profile: string; body: string }[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const start = ordered[i].pos;
    const end = i + 1 < ordered.length ? ordered[i + 1].pos : raw.body.length;
    const body = raw.body.slice(start, end).trim();
    if (!body) {
      issues.push(`empty body extracted for "${ordered[i].profile}"`);
      continue;
    }
    profiles.push({ profile: ordered[i].profile, body });
  }

  // JC sanity check.
  if (raw.shortName.startsWith("JC")) {
    if (profiles.length === 0) {
      issues.push("JC has zero profiles after extraction");
    } else if (profiles.length > 1) {
      issues.push(`JC has ${profiles.length} profile entries; expected 1`);
    }
  }

  return {
    longName: raw.longName,
    shortName: raw.shortName,
    gateQuadrant: ext.gateQuadrant,
    profiles,
    validationIssues: issues,
    rawBody: raw.body,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Notion writing
// ─────────────────────────────────────────────────────────────────────────────

const dsCache = new Map<string, string>();
async function getDataSourceId(databaseId: string): Promise<string> {
  if (dsCache.has(databaseId)) return dsCache.get(databaseId)!;
  await throttle();
  const db = await notion.databases.retrieve({ database_id: databaseId });
  const sources = (db as any).data_sources ?? [];
  if (!sources.length) throw new Error(`no data source for ${databaseId}`);
  dsCache.set(databaseId, sources[0].id);
  return sources[0].id;
}

interface ExistingPage {
  id: string;
  hasCallout: boolean;
  currentCross: string | null;
}

async function fetchExistingByShortName(): Promise<Map<string, ExistingPage>> {
  const dsId = await getDataSourceId(CROSSES_DB_ID);
  const result = new Map<string, ExistingPage>();
  let cursor: string | undefined;
  do {
    await throttle();
    const resp = await notion.dataSources.query({
      data_source_id: dsId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const row of resp.results) {
      if (!isFullPage(row)) continue;
      const titleProp: any = Object.values(row.properties).find((p: any) => p?.type === "title");
      const title = (titleProp?.title ?? []).map((t: any) => t.plain_text).join("").trim();
      if (!title) continue;
      const crossProp: any = row.properties["Cross"];
      const currentCross = crossProp?.rich_text?.[0]?.plain_text ?? null;
      result.set(title, { id: row.id, hasCallout: false, currentCross });
    }
    cursor = resp.next_cursor || undefined;
  } while (cursor);

  // Second pass: probe block contents to mark which pages already have a callout.
  // This is O(n) but only runs once per import; 192 pages × 400ms ≈ 75 seconds.
  let idx = 0;
  for (const [name, p] of result) {
    idx++;
    await throttle();
    try {
      const blocks = await notion.blocks.children.list({ block_id: p.id, page_size: 50 });
      for (const b of blocks.results) {
        if (isFullBlock(b) && b.type === "callout") {
          // Only count a callout as "filled" if it has children — empty callouts
          // shouldn't block re-import.
          if (b.has_children) {
            const kids = await notion.blocks.children.list({ block_id: b.id, page_size: 5 });
            if (kids.results.length > 0) p.hasCallout = true;
          }
          break;
        }
      }
    } catch (e) {
      console.warn(`    probe failed for "${name}": ${(e as any).message}`);
    }
    if (idx % 25 === 0) {
      process.stdout.write(`  probed ${idx}/${result.size}\r`);
    }
  }
  process.stdout.write("\n");
  return result;
}

// Notion limits a single rich_text block to ~2000 chars and a single create-call
// to ~100 child blocks. Split long bodies into paragraph-sized chunks.
function chunkParagraphs(body: string, maxLen = 1800): string[] {
  const paras = body.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: string[] = [];
  let buf = "";
  for (const p of paras) {
    if ((buf + "\n\n" + p).length > maxLen && buf) {
      out.push(buf);
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function buildToggles(parsed: ParsedCross): any[] {
  return parsed.profiles.map((p) => {
    const label = p.profile === "intro" ? "Cross Intro" : p.profile;
    const paragraphs = chunkParagraphs(p.body);
    return {
      object: "block",
      type: "toggle",
      toggle: {
        rich_text: [{ type: "text", text: { content: label } }],
        children: paragraphs.map((para) => ({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: para.slice(0, 1990) } }],
          },
        })),
      },
    };
  });
}

async function fillExistingPage(pageId: string, parsed: ParsedCross): Promise<void> {
  const toggles = buildToggles(parsed);
  const calloutChildren = [
    { object: "block", type: "divider", divider: {} },
    ...toggles,
  ];

  // Append a single callout block to the page; the callout holds all toggles.
  // Notion's "append" endpoint is `blocks.children.append` against the page id.
  await throttle();
  await notion.blocks.children.append({
    block_id: pageId,
    children: [
      {
        object: "block",
        type: "callout",
        callout: {
          rich_text: [{ type: "text", text: { content: parsed.shortName } }],
          children: calloutChildren,
        },
      } as any,
    ],
  });

  // Update the Cross property if it's empty and we have a quadrant.
  if (parsed.gateQuadrant) {
    await throttle();
    await notion.pages.update({
      page_id: pageId,
      properties: {
        Cross: {
          rich_text: [{ type: "text", text: { content: parsed.gateQuadrant } }],
        } as any,
      },
    });
  }
}

async function createMissingPage(parsed: ParsedCross): Promise<void> {
  const toggles = buildToggles(parsed);

  const properties: any = {
    Name: { title: [{ type: "text", text: { content: parsed.shortName } }] },
  };
  if (parsed.gateQuadrant) {
    properties.Cross = {
      rich_text: [{ type: "text", text: { content: parsed.gateQuadrant } }],
    };
  }

  await throttle();
  await notion.pages.create({
    parent: { database_id: CROSSES_DB_ID } as any,
    properties,
    children: [
      {
        object: "block",
        type: "callout",
        callout: {
          rich_text: [{ type: "text", text: { content: parsed.shortName } }],
          children: [
            { object: "block", type: "divider", divider: {} },
            ...toggles,
          ],
        },
      } as any,
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost tracking
// ─────────────────────────────────────────────────────────────────────────────

// Haiku 4.5 pricing per million tokens (matches Anthropic's published rates).
const HAIKU_INPUT_PER_M = 0.80;
const HAIKU_OUTPUT_PER_M = 4.00;
const HAIKU_CACHE_WRITE_PER_M = 1.00;
const HAIKU_CACHE_READ_PER_M = 0.08;

function costInCents(u: ExtractionResult["usage"]): number {
  // Anthropic API: input_tokens is already non-cached. Cache write/read are
  // separate columns and are NOT included in input_tokens. So input_tokens is
  // used directly as the "fresh" input count.
  const fresh = u.input_tokens / 1_000_000;
  const wrote = u.cache_creation_input_tokens / 1_000_000;
  const read = u.cache_read_input_tokens / 1_000_000;
  const out = u.output_tokens / 1_000_000;
  const dollars =
    fresh * HAIKU_INPUT_PER_M +
    wrote * HAIKU_CACHE_WRITE_PER_M +
    read * HAIKU_CACHE_READ_PER_M +
    out * HAIKU_OUTPUT_PER_M;
  return dollars * 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const resumeOnly = args.includes("--resume");
  const pdfPaths = args.filter((a) => !a.startsWith("--"));
  if (pdfPaths.length === 0 && !resumeOnly) {
    console.error("usage: npx tsx scripts/import-crosses.ts <pdf> [<pdf> ...] [--dry] [--resume]");
    process.exit(1);
  }

  mkdirSync(".cache", { recursive: true });

  let allParsed: ParsedCross[] = [];
  const CHECKPOINT = ".cache/parsed-crosses.json";

  if (resumeOnly && existsSync(CHECKPOINT)) {
    console.log(`Resuming from ${CHECKPOINT}…`);
    allParsed = JSON.parse(readFileSync(CHECKPOINT, "utf8"));
    console.log(`  ${allParsed.length} crosses already parsed`);
  } else {
    let totalCents = 0;
    let claudeCalls = 0;

    for (const path of pdfPaths) {
      console.log(`\n─── ${basename(path)} ───`);
      const pages = extractPdfText(path);
      console.log(`  ${pages.length} pages`);
      const sections = findCrossSections(pages);
      console.log(`  ${sections.length} cross sections detected`);

      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        process.stdout.write(`  [${i + 1}/${sections.length}] ${s.shortName.padEnd(40)} … `);
        try {
          const ext = await extractCrossWithClaude(s.body);
          const parsed = buildParsedCross(s, ext);
          allParsed.push(parsed);
          claudeCalls++;
          const cents = costInCents(ext.usage);
          totalCents += cents;
          const status = parsed.validationIssues.length
            ? `${parsed.profiles.length}p (${parsed.validationIssues.length} issues)`
            : `${parsed.profiles.length}p`;
          console.log(`${status}  $${(cents / 100).toFixed(4)}`);
        } catch (e: any) {
          console.log(`FAIL: ${e?.message?.slice(0, 80) ?? e}`);
        }
      }
    }

    console.log(`\n${claudeCalls} Claude calls, total cost $${(totalCents / 100).toFixed(2)}`);
    writeFileSync(CHECKPOINT, JSON.stringify(allParsed, null, 2));
    console.log(`Wrote checkpoint to ${CHECKPOINT}`);
  }

  // Validate + report.
  const valid: ParsedCross[] = [];
  const rejected: ParsedCross[] = [];
  for (const p of allParsed) {
    if (p.validationIssues.length === 0 && p.profiles.length > 0) {
      valid.push(p);
    } else {
      rejected.push(p);
    }
  }

  console.log(`\nParsed: ${allParsed.length}  valid: ${valid.length}  rejected: ${rejected.length}`);
  if (rejected.length) {
    writeFileSync(".cache/cross-rejects.json", JSON.stringify(rejected, null, 2));
    console.log("Rejects written to .cache/cross-rejects.json for review.");
    for (const r of rejected.slice(0, 10)) {
      console.log(`  ✗ ${r.shortName}: ${r.validationIssues.join("; ")}`);
    }
  }

  // Geometry summary: per-type profile coverage.
  const racCounts = new Map<string, number>();
  const lacCounts = new Map<string, number>();
  for (const p of valid) {
    if (p.shortName.startsWith("RAC")) racCounts.set(p.shortName, p.profiles.filter((x) => x.profile !== "intro").length);
    if (p.shortName.startsWith("LAC")) lacCounts.set(p.shortName, p.profiles.filter((x) => x.profile !== "intro").length);
  }
  const racHist = new Map<number, number>();
  const lacHist = new Map<number, number>();
  for (const v of racCounts.values()) racHist.set(v, (racHist.get(v) ?? 0) + 1);
  for (const v of lacCounts.values()) lacHist.set(v, (lacHist.get(v) ?? 0) + 1);
  console.log(`\nRAC profile coverage (count → number of crosses):`);
  for (const k of [...racHist.keys()].sort((a, b) => a - b)) console.log(`  ${k} profile(s): ${racHist.get(k)} crosses`);
  console.log(`LAC profile coverage:`);
  for (const k of [...lacHist.keys()].sort((a, b) => a - b)) console.log(`  ${k} profile(s): ${lacHist.get(k)} crosses`);

  if (dryRun) {
    console.log("\n--dry mode: not pushing to Notion.");
    return;
  }

  // Map to existing Notion pages.
  console.log("\nFetching existing Notion pages (with content probe)…");
  const existing = await fetchExistingByShortName();
  console.log(`  ${existing.size} cross pages in Notion (${[...existing.values()].filter((p) => p.hasCallout).length} already curated)`);

  // Plan the writes.
  const fillJobs: { page: ExistingPage; parsed: ParsedCross }[] = [];
  const createJobs: ParsedCross[] = [];
  const skipped: ParsedCross[] = [];

  for (const p of valid) {
    const ex = existing.get(p.shortName);
    if (!ex) createJobs.push(p);
    else if (ex.hasCallout) skipped.push(p);
    else fillJobs.push({ page: ex, parsed: p });
  }

  console.log(`\nPlan: fill=${fillJobs.length}  create=${createJobs.length}  skip-curated=${skipped.length}`);

  let ok = 0;
  let failed = 0;
  for (const j of fillJobs) {
    try {
      await fillExistingPage(j.page.id, j.parsed);
      ok++;
      if (ok % 10 === 0) process.stdout.write(`  filled ${ok}/${fillJobs.length}\r`);
    } catch (e: any) {
      failed++;
      console.error(`\n  ✗ fill ${j.parsed.shortName}: ${e?.message ?? e}`);
    }
  }
  for (const c of createJobs) {
    try {
      await createMissingPage(c);
      ok++;
    } catch (e: any) {
      failed++;
      console.error(`\n  ✗ create ${c.shortName}: ${e?.message ?? e}`);
    }
  }

  console.log(`\nDone. written=${ok}  failed=${failed}  skipped=${skipped.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
