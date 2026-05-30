import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync("/Users/dorothygale/delphi/.env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 1) Pull all cross chunks
const { data: chunks, error } = await s
  .from("chunks")
  .select("id, title, body, notion_page_id")
  .eq("source_kind", "cross");

if (error) { console.error(error); process.exit(1); }
console.log(`Loaded ${chunks.length} cross chunks\n`);

// 2) Extract theme name from each title. Patterns:
//   "RAC of the Sphinx 2"     -> theme = "Sphinx"
//   "LAC of The Clarion 1"    -> theme = "Clarion"
//   "JC of Possession"        -> theme = "Possession"
//   "RAC of the Laws, the 1/3, Acceptance: The ability..." -> theme = "Laws" (and: this title is corrupted)
function extractTheme(title) {
  if (!title) return null;
  // Strip RAC/LAC/JC prefix + " of " + optional "The "/"the "
  const m = title.match(/^(?:RAC|LAC|JC)\s+(?:[Oo]f\s+)?(?:[Tt]he\s+)?([^,\d\n]+?)(?:\s+\d+)?(?:\s*[,;:].*)?(?:\s+\d+)?\s*$/);
  if (!m) return null;
  return m[1].trim().toLowerCase().replace(/\s+/g, " ");
}

const themesByChunk = new Map(); // chunk.id -> theme
const allThemes = new Set();
for (const c of chunks) {
  const t = extractTheme(c.title);
  if (t) { themesByChunk.set(c.id, t); allThemes.add(t); }
}
console.log(`Distinct cross themes found in titles: ${allThemes.size}`);
console.log(`  Sample themes: ${[...allThemes].slice(0, 20).join(", ")}\n`);

// Themes to skip in regex (too short / common English words)
const SKIP_THEMES = new Set(["", "the", "of", "a", "an", "to"]);

// 3) For each chunk: scan body for mentions of OTHER cross theme names
// Use word boundaries; case-insensitive.
const themeArray = [...allThemes].filter((t) => t.length >= 5 && !SKIP_THEMES.has(t));

function countThemeMentions(body, theme) {
  if (!body) return 0;
  const escaped = theme.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "gi");
  return (body.match(re) || []).length;
}

const PROFILE_MARKERS = ["1/3", "1/4", "2/4", "2/5", "3/5", "3/6", "4/6", "5/1", "5/2", "6/2", "6/3"];

const report = {
  total: chunks.length,
  empty_body: 0,                  // body length < 100 chars
  tiny_body: 0,                   // 100..999 chars - likely orphan or empty page
  no_profile_markers: 0,          // body present but zero profile markers anywhere
  partial_one_profile_only: 0,    // exactly 1 profile marker present (likely first-section-only import)
  mis_attributed: [],             // dominant theme in body != own theme
  suspect_mismatch: [],           // own theme is not the most-mentioned, but is mentioned
  clean_likely: 0,                // own theme is dominant and reasonable body length
  short_no_own_theme: [],         // body too short to be plausible AND own theme not in body
};

for (const c of chunks) {
  const ownTheme = themesByChunk.get(c.id);
  const body = c.body || "";
  const bodyLen = body.length;
  if (bodyLen < 100) { report.empty_body++; continue; }
  if (bodyLen < 1000) { report.tiny_body++; continue; }

  // Profile marker check
  const profilesFound = PROFILE_MARKERS.filter((p) => body.includes(p));
  if (profilesFound.length === 0) report.no_profile_markers++;
  else if (profilesFound.length === 1) report.partial_one_profile_only++;

  if (!ownTheme) continue;

  // Count mentions of each theme name. Get top 3.
  const counts = themeArray.map((t) => ({ theme: t, count: countThemeMentions(body, t) }));
  counts.sort((a, b) => b.count - a.count);
  const top3 = counts.slice(0, 3);
  const ownCount = counts.find((x) => x.theme === ownTheme)?.count ?? 0;

  // Dominant theme = highest count, if > 0
  const dominant = top3[0];

  if (dominant.count === 0) {
    // No cross-name mentions at all. Could be very generic prose.
    continue;
  }

  if (dominant.theme !== ownTheme && dominant.count > ownCount) {
    // Mis-attributed: dominant theme in body is a DIFFERENT cross
    report.mis_attributed.push({
      title: c.title,
      ownTheme,
      ownCount,
      dominantTheme: dominant.theme,
      dominantCount: dominant.count,
      runnerUp: top3[1],
      bodyPreview: body.slice(0, 200).replace(/\s+/g, " "),
    });
  } else if (dominant.theme === ownTheme) {
    report.clean_likely++;
  } else {
    // Own theme appears but is tied or not dominant
    report.suspect_mismatch.push({
      title: c.title,
      ownTheme,
      ownCount,
      dominantTheme: dominant.theme,
      dominantCount: dominant.count,
    });
  }
}

console.log("=== DAMAGE ASSESSMENT ===");
console.log(`Total cross chunks: ${report.total}`);
console.log(`  Empty body (<100 chars): ${report.empty_body}`);
console.log(`  Tiny body (100-999 chars, likely orphan): ${report.tiny_body}`);
console.log(`  No profile markers anywhere in body: ${report.no_profile_markers}`);
console.log(`  Only ONE profile marker (likely first-profile-only import): ${report.partial_one_profile_only}`);
console.log(`  Clean (own theme is dominant in body): ${report.clean_likely}`);
console.log(`  Mis-attributed (different theme dominates body): ${report.mis_attributed.length}`);
console.log(`  Suspect mismatch (own theme not dominant): ${report.suspect_mismatch.length}`);

console.log("\n=== Sample of mis-attributed pages (up to 15) ===");
for (const m of report.mis_attributed.slice(0, 15)) {
  console.log(`  "${m.title}"`);
  console.log(`     own theme: "${m.ownTheme}" (${m.ownCount} mentions)`);
  console.log(`     dominant in body: "${m.dominantTheme}" (${m.dominantCount} mentions)`);
  console.log(`     body preview: "${m.bodyPreview.slice(0, 140)}..."`);
  console.log();
}

console.log("\n=== Sample of suspect mismatch pages (up to 10) ===");
for (const m of report.suspect_mismatch.slice(0, 10)) {
  console.log(`  "${m.title}"   own="${m.ownTheme}" (${m.ownCount})  dominant="${m.dominantTheme}" (${m.dominantCount})`);
}

console.log("\n=== SUMMARY ===");
const badCount = report.empty_body + report.tiny_body + report.mis_attributed.length + report.suspect_mismatch.length + report.partial_one_profile_only;
const cleanPct = ((report.clean_likely / report.total) * 100).toFixed(1);
const badPct = ((badCount / report.total) * 100).toFixed(1);
console.log(`Likely clean: ${report.clean_likely}/${report.total} (${cleanPct}%)`);
console.log(`Likely damaged: ~${badCount}/${report.total} (${badPct}%)`);
console.log(`  (note: "partial one-profile-only" overlaps with "clean" or "suspect" categories;`);
console.log(`   it's a content-completeness signal, not necessarily an attribution problem)`);
