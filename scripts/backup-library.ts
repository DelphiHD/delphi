/**
 * A dated copy of the synced library on her Desktop, so a database that took
 * months to get right can always be put back.
 *
 * Kaycee, 2026-09-16: "the cross database was the hardest one to get right. I
 * don't want to have to do it again."
 *
 * Writes every row exactly as the sync captured it, page body and every
 * property, one JSON file per database plus a readable index. Nothing is
 * trimmed and nothing is summarised: this is the restore point, not a report.
 *
 * Run:
 *   npx tsx scripts/backup-library.ts
 *   npx tsx scripts/backup-library.ts --dir "/some/other/place"
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadLibraryChunks } from "@/lib/hd/chunks-source";

const args = process.argv.slice(2);
const at = args.indexOf("--dir");
const day = new Date().toISOString().slice(0, 10);
const ROOT = at > -1 ? args[at + 1] : join(homedir(), "Desktop", "HD Reports", "Library Backups", day);

async function main() {
  const chunks = await loadLibraryChunks();
  if (!chunks.length) throw new Error("the library came back empty, nothing was written");

  const byKind = new Map<string, typeof chunks>();
  for (const c of chunks) {
    const k = c.source_kind ?? "unsorted";
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(c);
  }

  mkdirSync(ROOT, { recursive: true });
  const lines: string[] = [`# The library on ${day}`, "", `${chunks.length} pages across ${byKind.size} databases.`, ""];
  for (const [kind, rows] of [...byKind].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...rows].sort((a, b) => String(a.title).localeCompare(String(b.title)));
    writeFileSync(join(ROOT, `${kind}.json`), JSON.stringify(sorted, null, 1));
    const withText = sorted.filter((r) => String((r.metadata ?? {})["Delphi Basic"] ?? "").trim()).length;
    lines.push(`- **${kind}**: ${sorted.length} pages, ${withText} with Delphi Basic text`);
  }
  lines.push("", "Every page is here with its whole body and all of its properties.",
    "To put one back, open its database file and copy the page's fields into Notion.");
  writeFileSync(join(ROOT, "What is in here.md"), lines.join("\n") + "\n");
  console.log(`✓ ${ROOT}`);
  for (const l of lines.filter((l) => l.startsWith("- "))) console.log(`  ${l.slice(2).replace(/\*\*/g, "")}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
