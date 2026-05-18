// Extract the HD Variable Color/Tone lookup table from Kaycee's
// "Differentiation Lectures" Notion page. The lectures use consistent
// bold-tagged patterns that we can pull out via regex, then merge with the
// hardcoded Tone names Kaycee provided in chat for the rows the lecture
// page doesn't enumerate explicitly.
//
// Output: lib/chart/variables-lookup.json
//
// This is a ONE-SHOT extractor. Run it whenever the lectures page changes.
// The Foundation Report engine reads from the JSON; the JSON IS the
// canonical source for variable header construction.
//
// Usage:
//   npx tsx scripts/build-variables-lookup.ts

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { Client as Notion } from "@notionhq/client";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const LECTURES_PAGE_ID = "32de3fadcaaa80cb89e6ddbb8dd09112";
const OUT_PATH = "lib/chart/variables-lookup.json";
// If a cached MCP fetch exists at this path, parse it instead of hitting the
// API. Useful when the Notion integration doesn't have direct access to the
// page yet but the operator has already viewed it via the MCP tool.
const CACHED_MCP_PATH = "/Users/dorothygale/.claude/projects/-Users-dorothygale-delphi--claude-worktrees-funny-lehmann-e57a70/ca63a968-5f76-48d5-bfe2-b5b23f688d0b/tool-results/mcp-26173fac-395d-418a-a2a6-efb1809e25ae-notion-fetch-1779137684526.txt";

const notion = new Notion({ auth: process.env.NOTION_TOKEN! });

// ─── Hardcoded knowledge ────────────────────────────────────────────────────

// Tones 1-6 are the same underlying frequency expressed differently on the
// body-brain vs mind-brain sides. Per Kaycee, 2026-05-18:
const BODY_TONES = ["Smell", "Taste", "Outer Vision", "Inner Vision", "Feeling", "Touch"];
const MIND_TONES = ["Security", "Uncertainty", "Action", "Meditation", "Judgement", "Acceptance"];

// Active/Passive split: Tones 1-3 are Active, Tones 4-6 are Passive.
function activePassive(tone: number): "Active" | "Passive" {
  return tone <= 3 ? "Active" : "Passive";
}

// ─── Notion page text fetch ─────────────────────────────────────────────────

// The Differentiation Lectures page is structured as deeply-nested toggles
// inside a callout inside a details block inside a meeting-notes block.
// Rather than walk the block tree, we use the Notion MCP-fetched markdown
// (which the extractor agent confirmed flattens it all into readable prose).
// We fetch via the same path: blocks.children.list recursively, render as
// markdown, then regex-match the bold-tagged patterns.

async function fetchPageMarkdown(pageId: string): Promise<string> {
  const parts: string[] = [];
  async function walk(blockId: string, depth = 0): Promise<void> {
    let cursor: string | undefined;
    do {
      const r = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
      for (const b of r.results) {
        // deno-lint-ignore no-explicit-any
        const block = b as any;
        const t = block.type;
        const rich = (block[t]?.rich_text ?? []).map((rt: { plain_text?: string; annotations?: { bold?: boolean } }) => {
          const txt = rt.plain_text ?? "";
          return rt.annotations?.bold ? `**${txt}**` : txt;
        }).join("");
        if (rich) {
          let prefix = "  ".repeat(depth);
          if (t === "heading_1") prefix += "# ";
          else if (t === "heading_2") prefix += "## ";
          else if (t === "heading_3") prefix += "### ";
          else if (t === "heading_4") prefix += "#### ";
          else if (t === "bulleted_list_item" || t === "numbered_list_item") prefix += "- ";
          parts.push(prefix + rich);
        }
        if (block.has_children && depth < 8) {
          await walk(block.id, depth + 1);
        }
      }
      cursor = r.next_cursor || undefined;
    } while (cursor);
  }
  await walk(pageId);
  return parts.join("\n");
}

// ─── Regex extractors ───────────────────────────────────────────────────────

interface ColorRecord {
  variable: "Determination" | "Environment" | "Motivation" | "Perspective";
  colorNumber: number;             // 1-6
  colorName: string;               // "Cave Diet", "Thirst", etc.
  activeVariant: string | null;    // for Determination: the "Active" mode name
  passiveVariant: string | null;   // for Determination: the "Passive" mode name
  transference: string | null;     // for Motivation only
  distraction: string | null;      // for Perspective only
  description: string;             // bullet content
}

function extractDeterminationColors(md: string): ColorRecord[] {
  // Determination section: ### The Six Colors of Digestion
  const section = sliceBetween(md, /### The Six Colors of Digestion/, /^###\s/m);
  if (!section) return [];
  const records: ColorRecord[] = [];
  // Pattern: **Color N - Name (PolA/PolB):**
  const re = /\*\*Color (\d) - ([^(*]+?)\s*\(([^)/]+)\/([^)]+)\):\*\*/g;
  for (const m of section.matchAll(re)) {
    const colorNumber = parseInt(m[1], 10);
    const colorName = m[2].trim();
    const polA = m[3].trim();
    const polB = m[4].trim();
    const desc = captureBulletsAfter(section, m.index! + m[0].length);
    records.push({
      variable: "Determination",
      colorNumber,
      colorName,
      activeVariant: polA,
      passiveVariant: polB,
      transference: null,
      distraction: null,
      description: desc,
    });
  }
  return records;
}

function extractEnvironmentColors(md: string): ColorRecord[] {
  // Two sections: ### Six Environment Types: Hardscape (Indoor/Urban) and
  // ### Six Environment Types: Landscape (Outdoor/Natural)
  const records: ColorRecord[] = [];
  const sections = [
    sliceBetween(md, /### Six Environment Types: Hardscape/, /^###\s/m),
    sliceBetween(md, /### Six Environment Types: Landscape/, /^###\s/m),
  ];
  // Pattern: **Name (Color N)**:
  const re = /\*\*([A-Za-z ]+?)\s*\(Color (\d)\)\*\*:?/g;
  for (const section of sections) {
    if (!section) continue;
    for (const m of section.matchAll(re)) {
      const colorName = m[1].trim();
      const colorNumber = parseInt(m[2], 10);
      const desc = captureBulletsAfter(section, m.index! + m[0].length);
      records.push({
        variable: "Environment",
        colorNumber,
        colorName,
        activeVariant: null,
        passiveVariant: null,
        transference: null,
        distraction: null,
        description: desc,
      });
    }
  }
  return records;
}

function extractPerspectiveColors(md: string): ColorRecord[] {
  const section = sliceBetween(md, /### The Six Views/, /^###\s/m);
  if (!section) return [];
  // Pattern: **N. Name (Nth color)**
  const re = /\*\*(\d)\.\s+([A-Za-z]+)\s*\(\d+(?:st|nd|rd|th) color\)\*\*/g;
  const records: ColorRecord[] = [];
  for (const m of section.matchAll(re)) {
    const colorNumber = parseInt(m[1], 10);
    const colorName = m[2].trim();
    const desc = captureBulletsAfter(section, m.index! + m[0].length);
    records.push({
      variable: "Perspective",
      colorNumber,
      colorName,
      activeVariant: null,
      passiveVariant: null,
      transference: null,
      distraction: null,
      description: desc,
    });
  }
  // Distraction: per HD canon, distraction is the color N+3 mod 6 (or similar).
  // The lectures may state it explicitly elsewhere. For now, leave null; the
  // Color Transference and Distraction section can be parsed in a follow-up.
  return records;
}

function extractMotivationColors(md: string): ColorRecord[] {
  const section = sliceBetween(md, /### The Six Motivational Colors/, /^###\s/m);
  if (!section) return [];
  // Pattern: **N. Name** (transfers to Other)
  const re = /\*\*(\d)\.\s+([A-Za-z]+)\*\*\s*\(transfers to ([A-Za-z]+)\)/g;
  const records: ColorRecord[] = [];
  for (const m of section.matchAll(re)) {
    const colorNumber = parseInt(m[1], 10);
    const colorName = m[2].trim();
    const transference = m[3].trim();
    const desc = captureBulletsAfter(section, m.index! + m[0].length);
    records.push({
      variable: "Motivation",
      colorNumber,
      colorName,
      activeVariant: null,
      passiveVariant: null,
      transference,
      distraction: null,
      description: desc,
    });
  }
  return records;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Return the text between the first match of `startRe` and the next `endRe`
// (or end of string). Useful for slicing one ### section at a time.
function sliceBetween(text: string, startRe: RegExp, endRe: RegExp): string | null {
  const start = text.match(startRe);
  if (!start || start.index === undefined) return null;
  const afterStart = text.slice(start.index + start[0].length);
  const end = afterStart.match(endRe);
  return end && end.index !== undefined
    ? afterStart.slice(0, end.index)
    : afterStart;
}

// After a bold-anchored entry, capture all bullet lines that follow until the
// next bold anchor or section break. Returns clean prose, footnote refs stripped.
function captureBulletsAfter(section: string, startIdx: number): string {
  const remainder = section.slice(startIdx);
  // Stop at the next "**..." bold marker or "### " heading or end of section.
  const stopRe = /(?:\*\*|###\s)/g;
  stopRe.lastIndex = 1; // skip the closing ** of the anchor we're after
  const stop = stopRe.exec(remainder);
  const slice = stop ? remainder.slice(0, stop.index) : remainder;
  const bullets = slice
    .split("\n")
    .map((l) => l.replace(/^\s*-\s*/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("**"));
  return bullets
    .join(" ")
    .replace(/\s*\[\^[^\]]+\]/g, "") // strip footnote refs like [^abc]
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Assemble the lookup ────────────────────────────────────────────────────

interface VariableLookup {
  generatedAt: string;
  source: string;
  bodyToneNames: string[];   // index 0 = Tone 1, etc.
  mindToneNames: string[];
  colors: ColorRecord[];
  // Quick-access tables for the Data Pass to use.
  byVariable: Record<string, ColorRecord[]>;
}

async function main() {
  let md: string;
  if (existsSync(CACHED_MCP_PATH)) {
    console.log(`Using cached MCP fetch at ${CACHED_MCP_PATH}…`);
    md = readFileSync(CACHED_MCP_PATH, "utf8");
    console.log(`  ${md.length} chars loaded from cache`);
  } else {
    console.log("Fetching Differentiation Lectures page from Notion API…");
    md = await fetchPageMarkdown(LECTURES_PAGE_ID);
    console.log(`  ${md.length} chars of markdown extracted`);
  }

  console.log("\nExtracting colors per variable…");
  const dets = extractDeterminationColors(md);
  console.log(`  Determination: ${dets.length} colors`);
  const envs = extractEnvironmentColors(md);
  console.log(`  Environment: ${envs.length} colors`);
  const pers = extractPerspectiveColors(md);
  console.log(`  Perspective: ${pers.length} colors`);
  const mots = extractMotivationColors(md);
  console.log(`  Motivation: ${mots.length} colors`);

  // Dedup by (variable, colorNumber). The Environment section appears twice
  // in the source (Hardscape colors 1-3, Landscape colors 4-6); a generic
  // re-traversal can pick up the same colors more than once. Keep the first
  // occurrence per pair — it has the most authoritative position.
  const dedupKey = (c: ColorRecord) => `${c.variable}|${c.colorNumber}`;
  const seen = new Set<string>();
  const colors: ColorRecord[] = [];
  for (const c of [...dets, ...envs, ...pers, ...mots]) {
    const k = dedupKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    colors.push(c);
  }

  // Perspective's Distraction is the C+3 (mod 6) pairing, same structural
  // pattern as Motivation's Transference. The lectures state this explicitly
  // in 'Color Transference and Distraction' but it's also derivable.
  // 1↔4, 2↔5, 3↔6.
  const perspectiveColorsByNum = new Map<number, string>();
  for (const c of colors) if (c.variable === "Perspective") perspectiveColorsByNum.set(c.colorNumber, c.colorName);
  for (const c of colors) {
    if (c.variable !== "Perspective") continue;
    const distractionNum = ((c.colorNumber - 1 + 3) % 6) + 1;
    c.distraction = perspectiveColorsByNum.get(distractionNum) ?? null;
  }

  const byVariable: Record<string, ColorRecord[]> = {};
  for (const c of colors) {
    if (!byVariable[c.variable]) byVariable[c.variable] = [];
    byVariable[c.variable].push(c);
  }
  for (const v of Object.keys(byVariable)) byVariable[v].sort((a, b) => a.colorNumber - b.colorNumber);

  const lookup: VariableLookup = {
    generatedAt: new Date().toISOString(),
    source: `notion://${LECTURES_PAGE_ID}`,
    bodyToneNames: BODY_TONES,
    mindToneNames: MIND_TONES,
    colors,
    byVariable,
  };

  writeFileSync(OUT_PATH, JSON.stringify(lookup, null, 2));
  console.log(`\n✓ Wrote ${OUT_PATH} (${colors.length} colors, ${BODY_TONES.length + MIND_TONES.length} tone names)`);

  // Sanity check: should be 4 × 6 = 24 colors.
  if (colors.length !== 24) {
    console.warn(`  ⚠ expected 24 colors total, got ${colors.length}. Check the extractor against the source page.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
