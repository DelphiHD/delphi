// Stage 3: write extracted cross content (v3 cache) to Notion as callout + toggle blocks.
//
// Usage:
//   --dry              Plan: report matches, unmatched extractions, unmatched pages. No writes.
//   --commit           Write to ALL matched pages.
//   --only <name>      Process only one cross by short name (e.g. "LAC of Clarion 1").
//   --include-partial  Also write the 10 partial crosses (will skip missing profiles).
//                      Default skips them so we don't pollute pages with incomplete content.

import { readFileSync, readdirSync } from "fs";
import { execSync } from "child_process";

const env = Object.fromEntries(
  readFileSync("/Users/dorothygale/delphi/.env.local", "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g, "")]; })
);

const NOTION_TOKEN = env.NOTION_TOKEN;
const DB_ID = "26ce3fad-caaa-8025-849d-d0f4c27b1e50";
const HEADERS = {
  "Authorization": `Bearer ${NOTION_TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};
const CACHE_DIR = "/Users/dorothygale/Desktop/HD Reports/_source/cross-extract-cache-v3";

const args = process.argv.slice(2);
const mode = args.includes("--commit") ? "commit" : "dry";
const onlyOne = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const includePartial = args.includes("--include-partial");

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function throttle() { return sleep(400); }

function plain(richArr) {
  return (richArr || []).map((x) => x.plain_text || "").join("").trim();
}

async function listAllPages() {
  const pages = [];
  let cursor = null;
  while (true) {
    const body = cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 };
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: "POST", headers: HEADERS, body: JSON.stringify(body),
    });
    const j = await r.json();
    for (const p of j.results) pages.push({ id: p.id, title: plain(p.properties?.Name?.title) });
    if (!j.has_more) break;
    cursor = j.next_cursor;
    await throttle();
  }
  return pages;
}

function normalizeForMatch(title) {
  if (!title) return "";
  return title.toLowerCase()
    .replace(/^(rac|lac|jc)\s+of\s+the\s+/, "$1 of ")
    .replace(/\s+/g, " ")
    .trim();
}

// Match key VARIANTS to try in order — handles the "X 1" ↔ "X" rotation-suffix
// ambiguity (Notion uses no-suffix for first rotation, PDF chapter lists
// sometimes use "1").
function matchKeyVariants(title) {
  const n = normalizeForMatch(title);
  const variants = [n];
  // Drop trailing " 1"
  if (/ 1$/.test(n)) variants.push(n.replace(/ 1$/, ""));
  // Add trailing " 1" if missing
  if (!/ \d$/.test(n)) variants.push(n + " 1");
  // Try with "the" added
  const withThe = n.replace(/^(rac|lac|jc)\s+of\s+/, "$1 of the ");
  if (withThe !== n) variants.push(withThe);
  return variants;
}

// Build paragraph blocks from a long prose string, splitting at \n\n and
// chunking each paragraph at 2000 chars (Notion's max rich_text content).
function paragraphsFromProse(text) {
  const paragraphs = (text || "").split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p);
  const blocks = [];
  for (const p of paragraphs) {
    let remaining = p;
    while (remaining.length > 0) {
      const piece = remaining.slice(0, 1900);
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: piece } }] },
      });
      remaining = remaining.slice(1900);
    }
  }
  return blocks;
}

function buildToggleBlock(summary, prose) {
  const children = paragraphsFromProse(prose);
  // Notion limits children to 100 per block in a single create call.
  // If the toggle has more than 100 paragraph blocks, we'd need to append in
  // chunks. Most profiles fit easily.
  return {
    object: "block",
    type: "toggle",
    toggle: {
      rich_text: [{ type: "text", text: { content: summary } }],
      children: children.slice(0, 100),
    },
  };
}

function buildCalloutBlock(crossTitle, intro, profiles) {
  const toggles = [];
  if (intro && intro.length > 50) {
    toggles.push(buildToggleBlock("Cross Intro", intro));
  }
  for (const p of profiles) {
    if (!p.body || p.body.length < 30) continue;
    toggles.push(buildToggleBlock(p.profile, p.body));
  }
  return {
    object: "block",
    type: "callout",
    callout: {
      icon: { type: "emoji", emoji: "💡" },
      rich_text: [{ type: "text", text: { content: crossTitle } }],
      children: toggles,
    },
  };
}

async function appendBlock(pageId, block) {
  // First call adds the callout shell; if the callout has more children than
  // Notion allows in one call (we keep it under 100), this single call works.
  const r = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: "PATCH", headers: HEADERS,
    body: JSON.stringify({ children: [block] }),
  });
  if (!r.ok) {
    const txt = await r.text();
    return { ok: false, error: `${r.status}: ${txt.slice(0, 400)}` };
  }
  return { ok: true };
}

// ---- main ----

console.log(`Mode: ${mode}${onlyOne ? ` (only: "${onlyOne}")` : ""}${includePartial ? " (including partial)" : ""}`);
const cacheFiles = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
console.log(`Cache files: ${cacheFiles.length}`);

const extractions = [];
for (const f of cacheFiles) {
  const cached = JSON.parse(readFileSync(`${CACHE_DIR}/${f}`, "utf8"));
  if (!cached.shortName) continue;
  const isPartial = (cached.missing || []).length > 0;
  if (isPartial && !includePartial) continue;
  if (onlyOne && cached.shortName.toLowerCase() !== onlyOne.toLowerCase()) continue;
  extractions.push(cached);
}
console.log(`Eligible: ${extractions.length}\n`);

console.log("Loading Notion pages…");
const pages = await listAllPages();
console.log(`  ${pages.length} pages\n`);

const byKey = new Map();
for (const p of pages) byKey.set(normalizeForMatch(p.title), p);

const matched = [];
const unmatchedExtracts = [];
for (const e of extractions) {
  let hit = null;
  for (const v of matchKeyVariants(e.shortName)) {
    hit = byKey.get(v);
    if (hit) break;
  }
  if (hit) matched.push({ extract: e, page: hit });
  else unmatchedExtracts.push(e.shortName);
}
const matchedPageIds = new Set(matched.map((m) => m.page.id));
const unmatchedPages = pages.filter((p) => !matchedPageIds.has(p.id)).map((p) => p.title);

console.log(`Matched: ${matched.length}`);
console.log(`Unmatched extractions (no Notion page): ${unmatchedExtracts.length}`);
if (unmatchedExtracts.length > 0) for (const u of unmatchedExtracts.slice(0, 15)) console.log(`  no page for "${u}"`);
console.log(`Unmatched Notion pages (no extraction): ${unmatchedPages.length}`);
if (unmatchedPages.length > 0) for (const u of unmatchedPages.slice(0, 15)) console.log(`  no extract for "${u}"`);

if (mode === "dry") {
  console.log("\nDRY mode. No writes. Re-run with --commit to write.");
  process.exit(0);
}

console.log(`\nCOMMIT: writing ${matched.length} crosses in 3s. Ctrl-C to abort.`);
await sleep(3000);
let ok = 0, errors = 0;
for (let i = 0; i < matched.length; i++) {
  const { extract, page } = matched[i];
  const callout = buildCalloutBlock(page.title, extract.intro, extract.profiles);
  const numToggles = callout.callout.children.length;
  process.stdout.write(`  [${i+1}/${matched.length}] "${page.title}" (${numToggles} toggles)  `);
  const result = await appendBlock(page.id, callout);
  if (result.ok) { ok++; console.log("✓"); }
  else { errors++; console.log(`✗ ${result.error}`); }
  await throttle();
}
console.log(`\nDone. Wrote: ${ok}. Errors: ${errors}.`);
