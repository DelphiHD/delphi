// Stage 3: read extracted cross content from cache files, match to Notion pages,
// write callout+toggle blocks back to Notion.
//
// Usage:
//   --dry        Plan only: report matches, unmatched extractions, unmatched pages.
//   --commit     Write callout blocks to matched pages.

import { readFileSync, readdirSync } from "fs";

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
const CACHE_DIR = "/Users/dorothygale/Desktop/HD Reports/_source/cross-extract-cache";

const mode = process.argv[2] || "--dry";
if (!["--dry", "--commit"].includes(mode)) { console.error("usage: --dry | --commit"); process.exit(1); }

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function throttle() { return sleep(350); }

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

// Convert PDF cross title to Notion canonical form.
//   "The Right Angle Cross of the Sphinx 1" -> "RAC of the Sphinx 1"
//   "The Juxtaposition Cross of Listening"  -> "JC of Listening"
//   "The Left Angle Cross of Masks 1"       -> "LAC of Masks 1"
function pdfTitleToNotionForm(pdfTitle) {
  if (!pdfTitle) return null;
  let t = pdfTitle.trim();
  // Strip "The " prefix
  t = t.replace(/^The\s+/, "");
  t = t.replace(/^Right Angle Cross of /, "RAC of ");
  t = t.replace(/^Left Angle Cross of /, "LAC of ");
  t = t.replace(/^Juxtaposition Cross of /, "JC of ");
  // Normalize internal whitespace
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function normalizeForMatch(title) {
  if (!title) return "";
  return title.toLowerCase()
    .replace(/^(rac|lac|jc)\s+of\s+the\s+/, "$1 of ")
    .replace(/\s+/g, " ")
    .trim();
}

// Build a callout block with nested toggle blocks
function buildCalloutBlock(crossTitle, crossIntro, profiles, gateIntro) {
  const toggleBlocks = [];

  function richTextChunks(text) {
    // Notion rich_text max 2000 chars per run. Split if needed.
    const chunks = [];
    let remaining = text || "";
    while (remaining.length > 0) {
      const piece = remaining.slice(0, 1900);
      chunks.push({ type: "text", text: { content: piece } });
      remaining = remaining.slice(1900);
    }
    return chunks.length > 0 ? chunks : [{ type: "text", text: { content: " " } }];
  }

  function paragraphsFromText(text) {
    // Split by double-newline to make multiple paragraph blocks.
    const paragraphs = (text || "").split(/\n\s*\n/).filter((p) => p.trim());
    return paragraphs.map((p) => ({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: richTextChunks(p.trim()) },
    }));
  }

  if (gateIntro && gateIntro.trim()) {
    toggleBlocks.push({
      object: "block",
      type: "toggle",
      toggle: {
        rich_text: [{ type: "text", text: { content: "Gate Intro" } }],
        children: paragraphsFromText(gateIntro),
      },
    });
  }
  if (crossIntro && crossIntro.trim()) {
    toggleBlocks.push({
      object: "block",
      type: "toggle",
      toggle: {
        rich_text: [{ type: "text", text: { content: "Cross Intro" } }],
        children: paragraphsFromText(crossIntro),
      },
    });
  }
  for (const [profileKey, prose] of Object.entries(profiles || {})) {
    if (!prose || !prose.trim()) continue;
    toggleBlocks.push({
      object: "block",
      type: "toggle",
      toggle: {
        rich_text: [{ type: "text", text: { content: profileKey } }],
        children: paragraphsFromText(prose),
      },
    });
  }

  return {
    object: "block",
    type: "callout",
    callout: {
      icon: { type: "emoji", emoji: "💡" },
      rich_text: [{ type: "text", text: { content: crossTitle } }],
      children: toggleBlocks,
    },
  };
}

async function appendCalloutToPage(pageId, calloutBlock) {
  const r = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: "PATCH", headers: HEADERS,
    body: JSON.stringify({ children: [calloutBlock] }),
  });
  if (!r.ok) {
    const txt = await r.text();
    return { ok: false, error: `${r.status}: ${txt.slice(0, 300)}` };
  }
  return { ok: true };
}

// ---- main ----

console.log(`Mode: ${mode}`);
console.log(`Reading extraction cache from ${CACHE_DIR}…`);
const cacheFiles = readdirSync(CACHE_DIR).filter((f) => f.startsWith("gate-") && f.endsWith(".json"));
console.log(`  Found ${cacheFiles.length} gate cache files\n`);

// Read all caches and flatten to a list of (cross, gateIntro) entries
const extracted = []; // { gate, cross, gateIntro }
for (const f of cacheFiles) {
  const cached = JSON.parse(readFileSync(`${CACHE_DIR}/${f}`, "utf8"));
  if (!cached.parsed) {
    console.log(`  [skip ${f}] parse error: ${cached.parse_error}`);
    continue;
  }
  const gate = cached.parsed.gate;
  const gateIntro = cached.parsed.gate_intro || "";
  for (const cross of cached.parsed.crosses || []) {
    extracted.push({ gate, cross, gateIntro });
  }
}
console.log(`Extracted crosses: ${extracted.length}\n`);

// Load Notion pages
console.log("Loading Notion pages…");
const pages = await listAllPages();
console.log(`  Loaded ${pages.length} pages\n`);

// Build title→page lookup
const byNormalizedTitle = new Map();
for (const p of pages) byNormalizedTitle.set(normalizeForMatch(p.title), p);

// Match each extracted cross to a Notion page
const matched = [];
const unmatchedExtracts = [];
for (const e of extracted) {
  const notionForm = pdfTitleToNotionForm(e.cross.title);
  const key = normalizeForMatch(notionForm);
  let pageHit = byNormalizedTitle.get(key);
  if (!pageHit) {
    // Try variants: with/without "the", with rotation 1 default
    const variants = [
      key.replace(/^(rac|lac|jc)\s+of\s+the\s+/, "$1 of "),
      key.replace(/^(rac|lac|jc)\s+of\s+/, "$1 of the "),
      // JC without rotation, plus rotation 1
      key + " 1",
    ];
    for (const v of variants) {
      const hit = byNormalizedTitle.get(v);
      if (hit) { pageHit = hit; break; }
    }
  }
  if (pageHit) matched.push({ extract: e, page: pageHit });
  else unmatchedExtracts.push({ pdfTitle: e.cross.title, notionForm, gate: e.gate });
}

// Find pages not matched by any extraction
const matchedPageIds = new Set(matched.map((m) => m.page.id));
const unmatchedPages = pages.filter((p) => !matchedPageIds.has(p.id));

console.log(`=== MATCHING REPORT ===`);
console.log(`  Matched: ${matched.length} extractions → Notion pages`);
console.log(`  Unmatched extractions (no Notion page found): ${unmatchedExtracts.length}`);
console.log(`  Unmatched Notion pages (no extraction): ${unmatchedPages.length}`);

if (unmatchedExtracts.length > 0) {
  console.log(`\nSample unmatched extractions:`);
  for (const u of unmatchedExtracts.slice(0, 10)) {
    console.log(`  gate ${u.gate}: PDF "${u.pdfTitle}"  →  computed "${u.notionForm}"`);
  }
}
if (unmatchedPages.length > 0) {
  console.log(`\nSample unmatched Notion pages:`);
  for (const u of unmatchedPages.slice(0, 10)) {
    console.log(`  "${u.title}"`);
  }
}

if (mode === "--dry") {
  console.log(`\nDRY mode. No writes.`);
  process.exit(0);
}

console.log(`\nCOMMIT mode: writing ${matched.length} pages in 3s. Ctrl-C to abort.`);
await sleep(3000);
let ok = 0, errors = 0;
for (let i = 0; i < matched.length; i++) {
  const { extract, page } = matched[i];
  const callout = buildCalloutBlock(
    page.title,
    extract.cross.cross_intro,
    extract.cross.profiles,
    extract.cross.angle === "RAC" ? extract.gateIntro : ""  // only put Gate Intro on the RAC page
  );
  const result = await appendCalloutToPage(page.id, callout);
  if (result.ok) ok++;
  else errors++;
  console.log(`  [${i+1}/${matched.length}] ${result.ok ? "✓" : "✗"} "${page.title}"  ${result.ok ? "" : result.error}`);
  await throttle();
}
console.log(`\nDone. Wrote: ${ok}  errors: ${errors}.`);
