/**
 * Rename a client without losing their history.
 *
 * The folder a client's work lives in is derived from their name
 * (see clientOutputDir), so changing the name in the roster and nothing
 * else silently strands every report they already have. This does the
 * whole move in one step and then checks it landed.
 *
 * The slug and the HD id never change. Those are what the published
 * chart link and the transit reads are keyed on, so a rename is
 * cosmetic everywhere that matters.
 *
 *   npx tsx scripts/rename-client.ts <slug> "New Name"
 *   npx tsx scripts/rename-client.ts <slug> "New Name" --dry-run
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CLIENTS, clientOutputDir } from "./client-roster.ts";

const [slug, newName, ...rest] = process.argv.slice(2);
const dryRun = rest.includes("--dry-run");

if (!slug || !newName) {
  console.error('usage: npx tsx scripts/rename-client.ts <slug> "New Name" [--dry-run]');
  process.exit(1);
}

const client = CLIENTS[slug];
if (!client) {
  console.error(`no client with slug "${slug}". Known slugs: ${Object.keys(CLIENTS).join(", ")}`);
  process.exit(1);
}

const oldName = client.name;
if (oldName === newName) {
  console.log(`${slug} is already called "${newName}". Nothing to do.`);
  process.exit(0);
}

// A rename mid-run writes reports to the folder we are moving out from under it.
const busy = (() => {
  try {
    return execSync("pgrep -fl 'add-client.ts|generate-report.ts' || true", { encoding: "utf8" }).trim();
  } catch { return ""; }
})();
if (busy && !dryRun) {
  console.error("A report run is in progress. Renaming now would send its output to the old folder.");
  console.error(busy.split("\n").map(l => "  " + l.slice(0, 100)).join("\n"));
  console.error("\nWait for it to finish, then run this again.");
  process.exit(1);
}

const oldDir = clientOutputDir(client);
const newDir = path.join(path.dirname(oldDir), newName);

console.log(`${client.id}  ${oldName}  ->  ${newName}`);
console.log(`  slug stays ${slug}, id stays ${client.id}, chart link unchanged\n`);

const notes: string[] = [];
const skipped: string[] = [];

// 1. the folder
if (fs.existsSync(oldDir)) {
  if (fs.existsSync(newDir)) {
    console.error(`"${newName}" already has a folder. Merge by hand — I will not combine two people's work.`);
    process.exit(1);
  }
  if (!dryRun) fs.renameSync(oldDir, newDir);
  notes.push(`folder moved to ${path.basename(newDir)}`);
} else {
  notes.push("no folder on disk yet");
}

// 2. the files inside, which carry the name as a prefix
const dirNow = dryRun && fs.existsSync(oldDir) ? oldDir : newDir;
if (fs.existsSync(dirNow)) {
  let moved = 0;
  for (const f of fs.readdirSync(dirNow)) {
    if (!f.startsWith(oldName + " - ")) continue;
    const to = newName + f.slice(oldName.length);
    if (fs.existsSync(path.join(dirNow, to))) {
      // a newer file already claims that name — leave both, say so
      skipped.push(f);
      continue;
    }
    if (!dryRun) fs.renameSync(path.join(dirNow, f), path.join(dirNow, to));
    moved++;
  }
  notes.push(`${moved} file${moved === 1 ? "" : "s"} renamed`);
}

// 3. the roster
const rosterPath = "scripts/client-roster.ts";
const src = fs.readFileSync(rosterPath, "utf8");
const needle = `name: "${oldName}"`;
const hits = src.split(needle).length - 1;
if (hits !== 1) {
  console.error(`expected exactly one \`${needle}\` in the roster, found ${hits}. Stopping before I break it.`);
  process.exit(1);
}
if (!dryRun) fs.writeFileSync(rosterPath, src.replace(needle, `name: "${newName}"`));
notes.push("roster updated");

for (const n of notes) console.log("  " + n);
if (skipped.length) {
  console.log(`\n  left alone (a newer file already has that name):`);
  for (const f of skipped) console.log("    " + f);
}

if (dryRun) { console.log("\ndry run — nothing changed"); process.exit(0); }

// 4. check it actually landed, in a fresh process that re-reads the roster
const check = execSync(
  `npx tsx -e 'import {CLIENTS,clientOutputDir} from "./scripts/client-roster.ts";` +
  `import fs from "node:fs";const c=CLIENTS["${slug}"];` +
  `console.log(JSON.stringify({name:c.name,id:c.id,dir:fs.existsSync(clientOutputDir(c)),` +
  `files:fs.existsSync(clientOutputDir(c))?fs.readdirSync(clientOutputDir(c)).length:0}));'`,
  { encoding: "utf8", cwd: process.cwd() },
).trim().split("\n").pop()!;
const after = JSON.parse(check);

console.log("\nverified:");
console.log(`  roster reads ${after.name}, id ${after.id}`);
console.log(`  folder present: ${after.dir}, holding ${after.files} file${after.files === 1 ? "" : "s"}`);
if (after.name !== newName || !after.dir) {
  console.error("\nsomething did not land. Check by hand before running anything else.");
  process.exit(1);
}
console.log(`\nNotion still lists them under the old name until you change it there.`);
