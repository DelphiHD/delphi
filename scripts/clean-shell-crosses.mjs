// Clean-shell pass for HD Incarnation Crosses database.
// Deletes ALL top-level blocks from each page in the database.
// Preserves: page title, all properties (DBHD Description, Delphi Basic Description,
// HD Orientation, HD Quarters, Personality Sun Gate, Other Gates, Keywords).
// Removes: every block, including the callout that holds the <details> profile blocks.
//
// Modes:
//   node scripts/clean-shell-crosses.mjs --list
//     Just enumerate pages and report current block structure. No writes.
//   node scripts/clean-shell-crosses.mjs --test-one
//     Find one specific page (LAC of Healing 1 — known blank, safe to use)
//     and delete its blocks as a smoke test. Reports before/after.
//   node scripts/clean-shell-crosses.mjs --commit
//     Delete all top-level blocks from every page. NOT reversible.

import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync("/Users/dorothygale/delphi/.env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const NOTION_TOKEN = env.NOTION_TOKEN;
if (!NOTION_TOKEN) { console.error("NOTION_TOKEN missing"); process.exit(1); }
const DB_ID = "26ce3fad-caaa-8025-849d-d0f4c27b1e50"; // HD Incarnation Crosses

const HEADERS = {
  "Authorization": `Bearer ${NOTION_TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

const mode = process.argv[2] || "--list";
if (!["--list", "--test-one", "--commit"].includes(mode)) {
  console.error("usage: --list | --test-one | --commit");
  process.exit(1);
}

// Polite throttling. Notion's stated limit is ~3 req/sec.
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function throttle() { return sleep(350); }

// Paginate through the database
async function listAllPages() {
  const pages = [];
  let cursor = null;
  while (true) {
    const body = cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 };
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: "POST", headers: HEADERS, body: JSON.stringify(body),
    });
    if (!r.ok) { console.error("DB query failed:", r.status, await r.text()); process.exit(1); }
    const j = await r.json();
    for (const p of j.results) {
      // Extract title text
      const titleProp = p.properties?.Name?.title || [];
      const title = titleProp.map((t) => t.plain_text).join("").trim();
      pages.push({ id: p.id, title });
    }
    if (!j.has_more) break;
    cursor = j.next_cursor;
    await throttle();
  }
  return pages;
}

async function listTopLevelBlocks(pageId) {
  const r = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
    headers: HEADERS,
  });
  if (!r.ok) return { blocks: [], error: r.status };
  const j = await r.json();
  return { blocks: j.results, error: null };
}

async function deleteBlock(blockId) {
  const r = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
    method: "DELETE", headers: HEADERS,
  });
  return r.ok;
}

async function nukePage(pageId, title) {
  const { blocks, error } = await listTopLevelBlocks(pageId);
  if (error) return { ok: false, deleted: 0, error: `list ${error}` };
  let deleted = 0;
  for (const b of blocks) {
    const ok = await deleteBlock(b.id);
    if (ok) deleted++;
    await throttle();
  }
  return { ok: true, deleted, total: blocks.length };
}

// ---- main ----

console.log(`Mode: ${mode}`);
console.log(`Loading pages from database ${DB_ID}…`);
const pages = await listAllPages();
console.log(`  Found ${pages.length} pages\n`);

if (mode === "--list") {
  // For each page, report top-level block count + types
  console.log("Sampling top-level block structure on first 20 pages…\n");
  let withBlocks = 0, withoutBlocks = 0;
  const typeHist = {};
  for (let i = 0; i < Math.min(20, pages.length); i++) {
    const p = pages[i];
    const { blocks } = await listTopLevelBlocks(p.id);
    const types = blocks.map((b) => b.type);
    for (const t of types) typeHist[t] = (typeHist[t] || 0) + 1;
    if (blocks.length === 0) withoutBlocks++; else withBlocks++;
    console.log(`  "${p.title}"  [${blocks.length} top-level blocks: ${types.join(", ") || "(empty)"}]`);
    await throttle();
  }
  console.log(`\n  Sample: ${withBlocks} pages with blocks, ${withoutBlocks} empty`);
  console.log(`  Block type histogram (this sample): ${JSON.stringify(typeHist)}`);
  console.log("\nTo proceed: re-run with --test-one (will nuke ONE known-blank page) or --commit (full).");
}

else if (mode === "--test-one") {
  // Find LAC of Healing 1 (known to be a blank orphan from the audit; safe to nuke)
  const target = pages.find((p) => p.title === "LAC of Healing 1") ||
                 pages.find((p) => p.title.toLowerCase() === "lac of healing 1");
  if (!target) {
    console.error("Couldn't find LAC of Healing 1 in the database. Aborting test-one.");
    process.exit(1);
  }
  console.log(`Target: "${target.title}" (${target.id})`);
  const before = await listTopLevelBlocks(target.id);
  console.log(`  Before: ${before.blocks.length} top-level blocks (types: ${before.blocks.map((b) => b.type).join(", ") || "(empty)"})`);
  if (before.blocks.length === 0) {
    console.log(`  Page is already empty. Nothing to test. Picking another known-orphan page…`);
    // Pick the first blank page from the audit results
    const blanks = ["LAC of Healing 1", "LAC of Individualism 1", "LAC of Industry 1",
                    "LAC of Limitation 2", "LAC of Separation 1", "LAC of Wishes 1",
                    "RAC of Penetration 1", "LAC of the Individualism 1"];
    let altTarget = null;
    for (const t of blanks) {
      const cand = pages.find((p) => p.title === t);
      if (!cand) continue;
      const { blocks } = await listTopLevelBlocks(cand.id);
      await throttle();
      if (blocks.length > 0) { altTarget = cand; break; }
    }
    if (!altTarget) {
      console.log(`  All known-orphan pages are blank. Test-one cannot demonstrate deletion. Pick a populated page manually if you want a real test.`);
      process.exit(0);
    }
    console.log(`  Alternative target: "${altTarget.title}"`);
    const altBefore = await listTopLevelBlocks(altTarget.id);
    console.log(`  Before: ${altBefore.blocks.length} top-level blocks`);
    const result = await nukePage(altTarget.id, altTarget.title);
    console.log(`  Result: ${JSON.stringify(result)}`);
    const after = await listTopLevelBlocks(altTarget.id);
    console.log(`  After: ${after.blocks.length} top-level blocks`);
    process.exit(0);
  }
  const result = await nukePage(target.id, target.title);
  console.log(`  Nuke result: ${JSON.stringify(result)}`);
  const after = await listTopLevelBlocks(target.id);
  console.log(`  After: ${after.blocks.length} top-level blocks`);
  console.log(`\nProperty preservation check — re-fetching page properties:`);
  const r = await fetch(`https://api.notion.com/v1/pages/${target.id}`, { headers: HEADERS });
  const j = await r.json();
  const propKeys = Object.keys(j.properties || {});
  console.log(`  Property keys still present: ${propKeys.join(", ")}`);
}

else if (mode === "--commit") {
  console.log(`COMMIT mode: will delete ALL top-level blocks from ${pages.length} pages.`);
  console.log(`Starting in 3s. Ctrl-C to abort.`);
  await sleep(3000);
  const log = [];
  let totalDeleted = 0, totalErrors = 0;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    process.stdout.write(`  [${i+1}/${pages.length}] "${p.title}"  `);
    const result = await nukePage(p.id, p.title);
    if (result.ok) {
      console.log(`deleted ${result.deleted}/${result.total} blocks`);
      totalDeleted += result.deleted;
    } else {
      console.log(`ERROR: ${result.error}`);
      totalErrors++;
    }
    log.push({ id: p.id, title: p.title, ...result });
  }
  console.log(`\n=== COMMIT COMPLETE ===`);
  console.log(`  Total pages: ${pages.length}`);
  console.log(`  Total blocks deleted: ${totalDeleted}`);
  console.log(`  Errors: ${totalErrors}`);
  // Save log
  const logPath = "/Users/dorothygale/Desktop/HD Reports/_source/clean-shell-log.json";
  await import("fs").then((fs) => fs.writeFileSync(logPath, JSON.stringify(log, null, 2)));
  console.log(`  Log: ${logPath}`);
}
