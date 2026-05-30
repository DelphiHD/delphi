// Dedup + title normalization pass for HD Incarnation Crosses.
// Run AFTER clean-shell completes.
//
// Strategy:
//   1. Fetch all pages + their current properties (DBHD Description, Delphi Basic
//      Description, HD Orientation, HD Quarters, Personality Sun Gate).
//   2. Detect "corrupted titles" — titles with import-artifact noise like
//      "RAC of the Four Ways —the line is: Interdependence: the".
//   3. Build a normalized title key for each page (lowercase, drop "the ", strip
//      punctuation, normalize whitespace, drop corrupted-title suffix garbage).
//   4. Group pages by normalized key.
//   5. For each group of size > 1:
//        - 0 pages have non-empty descriptions  → keep one (oldest), delete others; log
//        - 1 page has non-empty descriptions    → keep that one, delete others; log
//        - 2+ pages have non-empty descriptions → FLAG FOR MANUAL REVIEW (Kaycee's call).
//          Don't auto-delete.
//   6. Output:
//        - dedup-plan.json (proposed deletions/keeps)
//        - dedup-flag-for-review.json (multi-description conflict cases for Kaycee)
//        - dedup-corrupted-titles.json (titles that look noisy, for separate cleanup)
//
// Modes:
//   --plan     Dry-run, generate the plan files. No writes.
//   --commit   Execute the plan. Deletes the "loser" page in each clean group.
//              Does NOT touch flagged-for-review pages.

import { readFileSync, writeFileSync } from "fs";

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
const OUT_DIR = "/Users/dorothygale/Desktop/HD Reports/_source";

const mode = process.argv[2] || "--plan";
if (!["--plan", "--commit"].includes(mode)) { console.error("usage: --plan | --commit"); process.exit(1); }

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
    for (const p of j.results) {
      pages.push({
        id: p.id,
        title: plain(p.properties?.Name?.title),
        cross: plain(p.properties?.Cross?.rich_text),
        dbhd: plain(p.properties?.["DBHD Description"]?.rich_text),
        delphi: plain(p.properties?.["Delphi Basic Description"]?.rich_text),
        sunGate: p.properties?.["Personality Sun Gate"]?.relation?.[0]?.id || null,
        orientation: p.properties?.["HD Orientation"]?.relation?.[0]?.id || null,
        quarter: p.properties?.["HD Quarters"]?.relation?.[0]?.id || null,
        created_time: p.created_time,
      });
    }
    if (!j.has_more) break;
    cursor = j.next_cursor;
    await throttle();
  }
  return pages;
}

async function archivePage(pageId) {
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH", headers: HEADERS,
    body: JSON.stringify({ archived: true }),
  });
  return r.ok;
}

async function renamePage(pageId, newTitle) {
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH", headers: HEADERS,
    body: JSON.stringify({
      properties: { Name: { title: [{ type: "text", text: { content: newTitle } }] } },
    }),
  });
  return r.ok;
}

function fixTitle(title) {
  if (!title) return title;
  let t = title;
  // Trim trailing whitespace
  t = t.replace(/\s+$/, "");
  // Strip trailing punctuation artifacts: ; , (but NOT periods or apostrophes)
  t = t.replace(/[;,]+\s*$/, "");
  // Fix "P ower" -> "Power" (PDF extraction artifact)
  t = t.replace(/\bP\s+ower\b/g, "Power");
  // Lowercase "Of" after RAC/LAC/JC prefix
  t = t.replace(/^(RAC|LAC|JC)\s+Of\s+/, "$1 of ");
  // Normalize multiple internal spaces
  t = t.replace(/\s+/g, " ");
  return t;
}

function normalizeTitle(title) {
  if (!title) return "";
  let t = title.trim().toLowerCase();
  // Strip trailing punctuation like ";" or "," that survived bad imports
  t = t.replace(/[;,]+\s*$/, "");
  // If title is corrupted (contains "—the line is" or ":" followed by description text),
  // truncate before the corruption marker.
  t = t.replace(/\s*[—–-]\s*the line is\s*:.*$/, "");
  t = t.replace(/^(rac of (?:the )?[^,]+)\s*,\s*the\s+\d\/\d.*$/, "$1");
  // Drop "the " after the prefix (RAC of, LAC of, JC of)
  t = t.replace(/^(rac|lac|jc)\s+of\s+the\s+/, "$1 of ");
  // Fix "p ower" -> "power" (PDF extraction artifact in the original import)
  t = t.replace(/\bp\s+ower\b/g, "power");
  // Normalize multiple spaces
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function isCorruptedTitle(title) {
  if (!title) return false;
  if (/[—–]\s*the line is/.test(title)) return true;
  if (/,\s*the\s+\d\/\d/.test(title)) return true;  // "RAC of X, the 1/3, ..."
  if (/[;]\s*$/.test(title)) return true;            // trailing semicolon
  if (/\bp ower\b/.test(title)) return true;         // "P ower" artifact
  if (/^[A-Z]+\s+Of\s/.test(title)) return true;     // wrong case "Of"
  if (/\s+$/.test(title)) return true;                // trailing whitespace
  return false;
}

console.log(`Mode: ${mode}`);
console.log(`Loading pages from database…`);
const pages = await listAllPages();
console.log(`  Loaded ${pages.length} pages\n`);

// Pass A: corrupted titles
const corruptedTitles = pages.filter((p) => isCorruptedTitle(p.title));
console.log(`Pass A: corrupted titles → ${corruptedTitles.length} pages`);
for (const p of corruptedTitles.slice(0, 10)) {
  console.log(`  "${p.title}"`);
}
if (corruptedTitles.length > 10) console.log(`  ... and ${corruptedTitles.length - 10} more`);

// Pass B: group by normalized title
const byKey = new Map();
for (const p of pages) {
  const key = normalizeTitle(p.title);
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(p);
}

const dups = [...byKey.entries()].filter(([k, v]) => v.length > 1).sort((a,b) => b[1].length - a[1].length);
console.log(`\nPass B: ${pages.length} pages collapse to ${byKey.size} normalized keys`);
console.log(`  Duplicate groups: ${dups.length}`);

// Pass C: classify each dup group
const cleanPlan = [];        // { canonical, deleteIds, reason }
const flagForReview = [];    // { key, candidates: [...] }
const corruptedOnly = [];    // corrupted titles whose normalized key matches a clean title
for (const [key, group] of dups) {
  const withDesc = group.filter((p) => p.dbhd || p.delphi);
  const titles = group.map((p) => p.title);
  if (withDesc.length === 0) {
    // No descriptions — keep oldest
    const sorted = [...group].sort((a,b) => (a.created_time < b.created_time ? -1 : 1));
    cleanPlan.push({
      key,
      canonical: { id: sorted[0].id, title: sorted[0].title, reason: "oldest, no descriptions in any duplicate" },
      delete: sorted.slice(1).map((p) => ({ id: p.id, title: p.title })),
    });
  } else if (withDesc.length === 1) {
    // Clean case — keep the one with descriptions
    const canonical = withDesc[0];
    const losers = group.filter((p) => p.id !== canonical.id);
    cleanPlan.push({
      key,
      canonical: { id: canonical.id, title: canonical.title, reason: "only page with descriptions" },
      delete: losers.map((p) => ({ id: p.id, title: p.title })),
    });
  } else {
    // Multiple have descriptions — flag for Kaycee
    flagForReview.push({
      key,
      candidates: withDesc.map((p) => ({
        id: p.id,
        title: p.title,
        dbhd_preview: (p.dbhd || "").slice(0, 120),
        delphi_preview: (p.delphi || "").slice(0, 120),
        cross: p.cross,
        sunGate: p.sunGate,
        orientation: p.orientation,
        quarter: p.quarter,
      })),
      other_in_group: group.filter((p) => !p.dbhd && !p.delphi).map((p) => ({ id: p.id, title: p.title })),
    });
  }
}

console.log(`\nPass C: dedup plan`);
console.log(`  Clean deletions queued: ${cleanPlan.reduce((s, p) => s + p.delete.length, 0)} pages across ${cleanPlan.length} groups`);
console.log(`  Flagged for review (multiple with descriptions): ${flagForReview.length} groups`);

// Pass D: title-fix pass for survivors
// After dedup, the pages that REMAIN may still have corrupted titles.
// Apply mechanical fixes: capital "Of"->"of", trailing punct, "P ower"->"Power".
const deletedIds = new Set();
for (const entry of cleanPlan) for (const d of entry.delete) deletedIds.add(d.id);
const survivors = pages.filter((p) => !deletedIds.has(p.id));
const titleFixes = [];
for (const p of survivors) {
  const newTitle = fixTitle(p.title);
  if (newTitle !== p.title) titleFixes.push({ id: p.id, from: p.title, to: newTitle });
}
console.log(`\nPass D: title fixes for surviving pages`);
console.log(`  Title fixes queued: ${titleFixes.length}`);
for (const tf of titleFixes.slice(0, 10)) {
  console.log(`  "${tf.from}" → "${tf.to}"`);
}
if (titleFixes.length > 10) console.log(`  ... and ${titleFixes.length - 10} more`);

// Sample
console.log(`\nSample clean-plan entries:`);
for (const entry of cleanPlan.slice(0, 5)) {
  console.log(`  key="${entry.key}"  KEEP "${entry.canonical.title}" (${entry.canonical.reason})`);
  for (const d of entry.delete) console.log(`     DELETE "${d.title}"`);
}

console.log(`\nSample flag-for-review entries:`);
for (const entry of flagForReview.slice(0, 5)) {
  console.log(`  key="${entry.key}"`);
  for (const c of entry.candidates) {
    console.log(`    candidate "${c.title}"`);
    console.log(`       dbhd: "${c.dbhd_preview}"`);
    console.log(`       delphi: "${c.delphi_preview}"`);
  }
}

// Save outputs
writeFileSync(`${OUT_DIR}/dedup-plan.json`, JSON.stringify(cleanPlan, null, 2));
writeFileSync(`${OUT_DIR}/dedup-flag-for-review.json`, JSON.stringify(flagForReview, null, 2));
writeFileSync(`${OUT_DIR}/dedup-corrupted-titles.json`, JSON.stringify(
  corruptedTitles.map((p) => ({ id: p.id, title: p.title })), null, 2));
writeFileSync(`${OUT_DIR}/dedup-title-fixes.json`, JSON.stringify(titleFixes, null, 2));
console.log(`\nFiles written:`);
console.log(`  ${OUT_DIR}/dedup-plan.json`);
console.log(`  ${OUT_DIR}/dedup-flag-for-review.json`);
console.log(`  ${OUT_DIR}/dedup-corrupted-titles.json`);
console.log(`  ${OUT_DIR}/dedup-title-fixes.json`);

if (mode === "--plan") {
  console.log(`\nPLAN mode. No writes. Review the JSON files above, then re-run with --commit.`);
  process.exit(0);
}

const deleteCount = cleanPlan.reduce((s, p) => s + p.delete.length, 0);
console.log(`\nCOMMIT mode: ${deleteCount} archives + ${titleFixes.length} title fixes in 3s. Ctrl-C to abort.`);
await sleep(3000);
let archived = 0, archErrors = 0;
for (const entry of cleanPlan) {
  for (const d of entry.delete) {
    const ok = await archivePage(d.id);
    if (ok) archived++; else archErrors++;
    process.stdout.write(`  ${ok ? "✓" : "✗"} archived "${d.title}"\n`);
    await throttle();
  }
}
let renamed = 0, renameErrors = 0;
for (const tf of titleFixes) {
  const ok = await renamePage(tf.id, tf.to);
  if (ok) renamed++; else renameErrors++;
  process.stdout.write(`  ${ok ? "✓" : "✗"} renamed "${tf.from}" → "${tf.to}"\n`);
  await throttle();
}
console.log(`\nDone.`);
console.log(`  Archived: ${archived}  errors: ${archErrors}`);
console.log(`  Renamed:  ${renamed}  errors: ${renameErrors}`);
console.log(`  Flagged-for-review: ${flagForReview.length} groups (NOT touched). Review in ${OUT_DIR}/dedup-flag-for-review.json.`);
