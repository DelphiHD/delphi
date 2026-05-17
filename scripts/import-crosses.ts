/**
 * One-time bulk import of Incarnation Cross source material from the IHDS
 * Quarter PDFs into Kaycee's `HD Incarnation Crosses` Notion database.
 *
 * The 4 PDFs (Q1-Q4) are huge and Kaycee has been hand-entering one cross
 * per client reading. This script does the bulk import in minutes.
 *
 * Behavior
 *   1. Extracts text from each PDF via Python's pypdf (called as a subprocess
 *      so we don't have to maintain a TypeScript PDF parser).
 *   2. Finds every cross section by regex on Ra's heading patterns.
 *   3. Within each cross, splits into per-profile sections.
 *   4. Maps the long form ("The Right Angle Cross of Eden 1") to Kaycee's
 *      short form ("RAC of Eden 1") — RAC / LAC / JC abbreviations.
 *   5. Looks up each target in Notion; skips if it already exists so
 *      Kaycee's hand-curated entries are preserved.
 *   6. Creates new pages with a callout-wrapped set of profile toggles,
 *      matching her existing structure (see LAC of Cycles 1).
 *
 * Run:    npx tsx scripts/import-crosses.ts <pdf-path> [<pdf-path> ...]
 * Pilot:  npx tsx scripts/import-crosses.ts "/Users/dorothygale/Downloads/Incarnation Cross Quarter 1 - The Quarter Of Initiation.pdf"
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { Client as NotionClient, isFullPage } from "@notionhq/client";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const CROSSES_DB_ID = "26ce3fad-caaa-8025-849d-d0f4c27b1e50";
const NOTION_THROTTLE_MS = 400;

const notion = new NotionClient({
  auth: must("NOTION_TOKEN"),
  timeoutMs: 120_000,
});

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
// PDF extraction (via Python because pypdf is already installed)
// ─────────────────────────────────────────────────────────────────────────────

function extractPdfText(pdfPath: string): string[] {
  // Returns one string per page.
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

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────

// Lines that appear as boilerplate page headers/footers in every PDF.
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
      kept.push(""); // preserve paragraph breaks
      continue;
    }
    if (BOILERPLATE_PATTERNS.some((p) => p.test(line))) continue;
    kept.push(raw);
  }
  return kept.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Section parsing
// ─────────────────────────────────────────────────────────────────────────────

const CROSS_NAME_RE =
  /^\s*(The (?:Right Ang(?:le|el)|Left Angle|Juxtaposition) Cross of [^.\n]+?)\s*$/im;
const CROSS_NAME_GLOBAL_RE =
  /^\s*(The (?:Right Ang(?:le|el)|Left Angle|Juxtaposition) Cross of [^.\n]+?)\s*$/gim;
const PROFILE_LABEL_RE = /^\s*The (\d\/\d)\s*$/m;
const PROFILE_LABEL_GLOBAL_RE = /^\s*The (\d\/\d)\s*$/gim;
const GATE_QUADRANT_RE = /^\s*(\d+)\s+(\d+)\s*\n?\s*(\d+)\s+(\d+)\s*$/m;
const TOC_TAIL_RE = /\.{4,}\s*\d+\s*$/;

function shortName(longName: string): string {
  // "The Right Angle Cross of Eden 1" → "RAC of Eden 1"
  // "The Right Angel Cross of Eden 1" → "RAC of Eden 1" (typo in source)
  return longName
    .replace(/^The Right Ang(le|el)\s+Cross of\s+/i, "RAC of ")
    .replace(/^The Left Angle Cross of\s+/i, "LAC of ")
    .replace(/^The Juxtaposition Cross of\s+/i, "JC of ")
    .trim();
}

interface ProfileSection {
  profile: string; // "1/3"
  body: string;
}

interface CrossSection {
  longName: string; // "The Right Angle Cross of Eden 1"
  shortName: string; // "RAC of Eden 1"
  gateQuadrant: string | null; // "(36/6 | 11/12)" or null if not detected
  profiles: ProfileSection[];
}

function parsePdf(pages: string[]): CrossSection[] {
  const cleaned = pages.map(cleanPage).join("\n");

  // Find every non-TOC cross-name anchor.
  const anchors: { pos: number; name: string }[] = [];
  for (const m of cleaned.matchAll(CROSS_NAME_GLOBAL_RE)) {
    const line = (m[0] || "").trim();
    if (TOC_TAIL_RE.test(line)) continue; // skip TOC entries
    if (line.length > 80) continue; // safety: section headers are short
    anchors.push({ pos: m.index!, name: m[1].trim() });
  }

  // Group adjacent anchors that point to the same cross. PDFs sometimes
  // repeat the name (e.g. as a sub-header on the next page).
  const unique = new Map<string, { pos: number; name: string }>();
  for (const a of anchors) {
    if (!unique.has(a.name)) unique.set(a.name, a);
  }
  const ordered = [...unique.values()].sort((a, b) => a.pos - b.pos);

  const sections: CrossSection[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const start = ordered[i].pos;
    const end = i + 1 < ordered.length ? ordered[i + 1].pos : cleaned.length;
    const body = cleaned.slice(start, end);

    const longName = ordered[i].name;

    // Try to extract the gate quadrant from the first ~600 chars of the
    // section (it's usually inline near the heading).
    const head = body.slice(0, 800);
    const gm = head.match(GATE_QUADRANT_RE);
    const gateQuadrant = gm ? `(${gm[1]}/${gm[3]} | ${gm[2]}/${gm[4]})` : null;

    // Find profile boundaries within this cross.
    const profileAnchors: { pos: number; profile: string }[] = [];
    for (const pm of body.matchAll(PROFILE_LABEL_GLOBAL_RE)) {
      profileAnchors.push({ pos: pm.index!, profile: pm[1] });
    }

    const profiles: ProfileSection[] = [];
    if (profileAnchors.length === 0) {
      // No profile boundaries detected; keep whole body as a single "cross
      // intro" entry so we don't lose the content.
      const cleanedBody = body.replace(CROSS_NAME_RE, "").trim();
      if (cleanedBody) profiles.push({ profile: "intro", body: cleanedBody });
    } else {
      // Optional "intro" between cross name and first profile.
      const introEnd = profileAnchors[0].pos;
      const intro = body.slice(0, introEnd).replace(CROSS_NAME_RE, "").trim();
      if (intro && intro.length > 80) {
        profiles.push({ profile: "intro", body: intro });
      }
      for (let j = 0; j < profileAnchors.length; j++) {
        const pStart = profileAnchors[j].pos;
        const pEnd =
          j + 1 < profileAnchors.length ? profileAnchors[j + 1].pos : body.length;
        const profileBody = body
          .slice(pStart, pEnd)
          .replace(PROFILE_LABEL_RE, "") // strip the "The 1/3" header
          .trim();
        if (profileBody) {
          profiles.push({
            profile: profileAnchors[j].profile,
            body: profileBody,
          });
        }
      }
    }

    sections.push({
      longName,
      shortName: shortName(longName),
      gateQuadrant,
      profiles,
    });
  }

  return sections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notion writing
// ─────────────────────────────────────────────────────────────────────────────

async function existingCrossNames(): Promise<Set<string>> {
  const dsId = await getDataSourceId(CROSSES_DB_ID);
  const names = new Set<string>();
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
      const titleProp = Object.values(row.properties ?? {}).find(
        (p: any) => p?.type === "title",
      ) as any;
      const title = (titleProp?.title ?? [])
        .map((t: any) => t.plain_text)
        .join("")
        .trim();
      if (title) names.add(title);
    }
    cursor = resp.next_cursor || undefined;
  } while (cursor);
  return names;
}

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

// Notion limits a single rich_text block to ~2000 chars, and a single page
// create call to ~100 children blocks. Split long profile bodies into
// paragraph chunks of ~1800 chars each so we stay under both limits.
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

function buildTogglesForSection(section: CrossSection): any[] {
  return section.profiles.map((p) => {
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

async function createCrossPage(section: CrossSection): Promise<void> {
  const toggles = buildTogglesForSection(section);

  const properties: any = {
    Name: {
      title: [{ type: "text", text: { content: section.shortName } }],
    },
  };
  if (section.gateQuadrant) {
    properties.Cross = {
      rich_text: [{ type: "text", text: { content: section.gateQuadrant } }],
    };
  }

  await throttle();
  const created = await notion.pages.create({
    parent: { database_id: CROSSES_DB_ID } as any,
    properties,
    children: [
      {
        object: "block",
        type: "callout",
        callout: {
          rich_text: [
            { type: "text", text: { content: section.shortName } },
          ],
          children: toggles,
        },
      },
    ],
  });

  console.log(
    `  ✓ ${section.shortName.padEnd(40)} (${section.profiles.length} profile${section.profiles.length === 1 ? "" : "s"})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const pdfPaths = args.filter((a) => !a.startsWith("--"));
  if (pdfPaths.length === 0) {
    console.error("usage: npx tsx scripts/import-crosses.ts <pdf> [<pdf> ...] [--dry]");
    process.exit(1);
  }

  console.log("Fetching existing crosses from Notion (so we skip duplicates)…");
  const existing = await existingCrossNames();
  console.log(`  ${existing.size} already in database`);

  const allParsed: CrossSection[] = [];
  for (const path of pdfPaths) {
    console.log(`\nExtracting ${path}…`);
    const pages = extractPdfText(path);
    console.log(`  ${pages.length} pages`);
    const sections = parsePdf(pages);
    console.log(`  ${sections.length} unique crosses parsed`);
    allParsed.push(...sections);
  }

  console.log(`\nTotal parsed: ${allParsed.length} crosses`);

  // Optional: dump to disk so we can spot-check before pushing.
  mkdirSync(".cache", { recursive: true });
  writeFileSync(
    ".cache/parsed-crosses.json",
    JSON.stringify(allParsed, null, 2),
  );
  console.log("Wrote .cache/parsed-crosses.json for inspection.");

  const toCreate = allParsed.filter((s) => !existing.has(s.shortName));
  const skipping = allParsed.filter((s) => existing.has(s.shortName));
  console.log(
    `\nCreating ${toCreate.length} new pages; skipping ${skipping.length} that already exist.`,
  );
  for (const s of skipping) console.log(`  skip: ${s.shortName}`);

  if (dryRun) {
    console.log("\n--dry mode: not pushing to Notion.");
    return;
  }

  console.log("\nWriting to Notion…");
  let ok = 0;
  let failed = 0;
  for (const s of toCreate) {
    try {
      await createCrossPage(s);
      ok += 1;
    } catch (e: any) {
      failed += 1;
      console.error(`  ✗ ${s.shortName}: ${e?.message ?? e}`);
    }
  }
  console.log(`\nDone. created=${ok}  failed=${failed}  skipped=${skipping.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
