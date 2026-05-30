// Merge "X" and "X 1" duplicate pairs in HD Incarnation Crosses.
//
// Background: Kaycee's original page-creation convention omitted the "1"
// rotation suffix for first-rotation crosses. The Haiku import agent created
// new pages with the suffix instead of writing to her canonical ones. Then the
// v3 extraction wrote fresh body content to the agent-created "X 1" pages,
// while her canonical "X" pages have the hand-validated DBHD/Delphi
// descriptions but empty body.
//
// This script reunites them: takes the body content from the "X 1" cache file,
// appends it as a callout to the canonical "X" page, archives the "X 1" page.
//
// For pairs where BOTH pages have descriptions, skip and log to a flag file
// for Kaycee's manual review.
//
// Usage:
//   --dry        Report the plan. No writes.
//   --commit     Execute.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "fs";

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
const FLAG_FILE = "/Users/dorothygale/Desktop/HD Reports/_source/rotation-merge-flag-for-review.json";

const mode = process.argv.includes("--commit") ? "commit" : "dry";

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function throttle() { return sleep(400); }
function plain(richArr) { return (richArr || []).map((x) => x.plain_text || "").join("").trim(); }

async function listAllPages() {
  const pages = [];
  let cursor = null;
  while (true) {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: "POST", headers: HEADERS,
      body: JSON.stringify(cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 }),
    });
    const j = await r.json();
    for (const p of j.results) {
      pages.push({
        id: p.id,
        title: plain(p.properties?.Name?.title),
        hasDesc: !!(plain(p.properties?.["DBHD Description"]?.rich_text) || plain(p.properties?.["Delphi Basic Description"]?.rich_text)),
      });
    }
    if (!j.has_more) break;
    cursor = j.next_cursor;
    await throttle();
  }
  return pages;
}

function normalize(title) {
  return title.toLowerCase().replace(/^(rac|lac|jc)\s+of\s+the\s+/, "$1 of ").replace(/\s+/g, " ").trim();
}

function paragraphsFromProse(text) {
  const paragraphs = (text || "").split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p);
  const blocks = [];
  for (const p of paragraphs) {
    let remaining = p;
    while (remaining.length > 0) {
      blocks.push({ object: "block", type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: remaining.slice(0, 1900) } }] } });
      remaining = remaining.slice(1900);
    }
  }
  return blocks;
}

function buildToggleBlock(summary, prose) {
  return { object: "block", type: "toggle",
    toggle: { rich_text: [{ type: "text", text: { content: summary } }], children: paragraphsFromProse(prose).slice(0, 100) } };
}

function buildCalloutBlock(crossTitle, intro, profiles) {
  const toggles = [];
  if (intro && intro.length > 50) toggles.push(buildToggleBlock("Cross Intro", intro));
  for (const p of profiles) {
    if (p.body && p.body.length >= 30) toggles.push(buildToggleBlock(p.profile, p.body));
  }
  return { object: "block", type: "callout",
    callout: { icon: { type: "emoji", emoji: "💡" },
      rich_text: [{ type: "text", text: { content: crossTitle } }], children: toggles } };
}

async function appendBlock(pageId, block) {
  const r = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: "PATCH", headers: HEADERS, body: JSON.stringify({ children: [block] }),
  });
  if (!r.ok) return { ok: false, error: `${r.status}: ${(await r.text()).slice(0, 300)}` };
  return { ok: true };
}

async function archivePage(pageId) {
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH", headers: HEADERS, body: JSON.stringify({ archived: true }),
  });
  return r.ok;
}

// ---- main ----

console.log(`Mode: ${mode}`);
console.log("Loading pages…");
const pages = await listAllPages();
console.log(`  ${pages.length} pages\n`);

// Build normalized title map
const byKey = new Map();
for (const p of pages) {
  const k = normalize(p.title);
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(p);
}

// Find X / X-1 pairs
const pairs = [];
for (const [key, group] of byKey) {
  if (group.length !== 1) continue;
  const k1 = key + " 1";
  const grp1 = byKey.get(k1);
  if (!grp1 || grp1.length !== 1) continue;
  pairs.push({ x: group[0], x1: grp1[0], key, k1 });
}
console.log(`Found ${pairs.length} X / X-1 pairs\n`);

// Cache files are named by the v3 shortName, which strips "of the" → "of".
// Map a Notion page title to its expected cache file name.
function titleToCacheName(title) {
  return title.replace(/^(RAC|LAC|JC)\s+of\s+[Tt]he\s+/, "$1 of ").replace(/[\/\\]/g, "_");
}

const toMerge = [];
const toFlag = [];
const noCache = [];
for (const pair of pairs) {
  const cacheFile = `${CACHE_DIR}/${titleToCacheName(pair.x1.title)}.json`;
  if (!existsSync(cacheFile)) {
    noCache.push(pair);
    continue;
  }
  const cache = JSON.parse(readFileSync(cacheFile, "utf8"));
  const isCachePartial = (cache.missing || []).length > 0;

  if (pair.x.hasDesc && pair.x1.hasDesc) {
    toFlag.push({ ...pair, reason: "both have descriptions" });
  } else if (!pair.x.hasDesc && !pair.x1.hasDesc) {
    toFlag.push({ ...pair, reason: "neither has descriptions" });
  } else if (pair.x.hasDesc && !pair.x1.hasDesc) {
    toMerge.push({ pair, cache, canonical: pair.x, source: pair.x1, isCachePartial });
  } else {
    // X1 has desc, X doesn't — unusual, flag for review
    toFlag.push({ ...pair, reason: "X 1 has descriptions but X does not" });
  }
}

console.log(`Plan:`);
console.log(`  To merge (X has desc, X 1 has body): ${toMerge.length}`);
console.log(`  Flagged for manual review: ${toFlag.length}`);
console.log(`  No cache for X 1: ${noCache.length}\n`);

if (toFlag.length > 0) {
  console.log(`Flagged pairs:`);
  for (const f of toFlag) console.log(`  "${f.x.title}" <-> "${f.x1.title}"  reason: ${f.reason}`);
  writeFileSync(FLAG_FILE, JSON.stringify(toFlag.map((f) => ({
    canonical: { id: f.x.id, title: f.x.title, hasDesc: f.x.hasDesc },
    duplicate: { id: f.x1.id, title: f.x1.title, hasDesc: f.x1.hasDesc },
    reason: f.reason,
  })), null, 2));
  console.log(`  written: ${FLAG_FILE}\n`);
}

if (noCache.length > 0) {
  console.log(`No cache for these X 1 pages (likely the 10 partial extractions):`);
  for (const n of noCache) console.log(`  "${n.x1.title}"  (would merge to "${n.x.title}")`);
  console.log();
}

if (mode === "dry") {
  console.log("DRY mode. No writes. Re-run with --commit.");
  process.exit(0);
}

console.log(`Committing ${toMerge.length} merges in 3s. Ctrl-C to abort.`);
await sleep(3000);
let ok = 0, errors = 0;
for (let i = 0; i < toMerge.length; i++) {
  const { cache, canonical, source, isCachePartial } = toMerge[i];
  const callout = buildCalloutBlock(canonical.title, cache.intro, cache.profiles);
  const partialFlag = isCachePartial ? " [partial cache]" : "";
  process.stdout.write(`  [${i+1}/${toMerge.length}] "${canonical.title}" <- "${source.title}"${partialFlag}  `);
  const appendResult = await appendBlock(canonical.id, callout);
  if (!appendResult.ok) { errors++; console.log(`✗ append failed: ${appendResult.error}`); continue; }
  await throttle();
  const archived = await archivePage(source.id);
  if (!archived) { errors++; console.log(`✗ archive failed (body merged but duplicate not archived)`); continue; }
  ok++;
  console.log("✓");
  await throttle();
}
console.log(`\nDone. Merged: ${ok}. Errors: ${errors}.`);
console.log(`Flagged for review: ${toFlag.length}  (see ${FLAG_FILE})`);
