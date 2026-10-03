// Files Kaycee's transit reads in Supabase so the charts can fetch them.
//
// The chart is a baked HTML file. Before this, a morning's read only reached a
// client when all 28 charts were rebuilt and republished, which needed her
// laptop and a few minutes. Now the read lives in one place and every chart
// pulls the current one: generate, push, done.
//
// Runs straight after the daily transit report, and is safe to run by hand or
// twice. Pushes every archived read by default so a fresh database catches up
// on its own; `--today` limits it to the current day for the nightly path.
//
// Kaycee, 2026-10-03: "everything should still function the same, all we did
// was move it from my laptop to online, I never said to stop publishing the
// syntheses." This step lived only in run-transit-report.sh, the wrapper the
// LaunchAgent used, so when the report moved to GitHub Actions on 09-28 the
// push stopped happening and every chart's transit view froze on the last read
// her laptop had filed. --from-storage reads the report out of storage instead
// of off a disk, so the push runs anywhere, and --catch-up finds any published
// day that never got its reads and files it. A missed morning heals itself.
//
//   npx tsx scripts/push-transit-reads.ts            # everything on disk
//   npx tsx scripts/push-transit-reads.ts --today    # just today
//   npx tsx scripts/push-transit-reads.ts --date 2026-08-24
//   npx tsx scripts/push-transit-reads.ts --dir ./out --today
//   npx tsx scripts/push-transit-reads.ts --from-storage --today --catch-up

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLIENTS } from "./client-roster";
import { loadAllReads, loadDayRead, transitsDir } from "@/lib/transit/reads";

interface Row {
  client_slug: string;
  date: string;
  written_at: string | null;
  paragraph: string;
  completions: unknown;
}

function rowsFor(date: string | null, dir: string): Row[] {
  const rows: Row[] = [];
  for (const client of Object.values(CLIENTS)) {
    const reads = date
      ? (() => { const r = loadDayRead(client.name, date, client.id, dir); return r ? { [date]: r } : {}; })()
      : loadAllReads(client.name, client.id, dir);
    for (const [d, r] of Object.entries(reads)) {
      rows.push({
        client_slug: client.slug,
        date: d,
        written_at: r.writtenAt || null,
        paragraph: r.paragraph,
        completions: r.completions,
      });
    }
  }
  return rows;
}

/** The day's report markdown, out of storage, written where the parser looks. */
async function fetchFromStorage(db: SupabaseClient, date: string, dir: string): Promise<boolean> {
  const got = await db.storage.from("charts").download(`transits/${date}.md`);
  if (!got.data) return false;
  writeFileSync(join(dir, `${date} - Daily Transit Report.md`), await got.data.text());
  return true;
}

/** Published days that have no reads filed. A morning the push missed, in other
 *  words, which is the thing that should never need a person to notice it. */
async function daysOwed(db: SupabaseClient, except: string[]): Promise<string[]> {
  const listed = await db.storage.from("charts").list("transits", { limit: 400 });
  const published = (listed.data ?? [])
    .filter((f) => f.name.endsWith(".md"))
    .map((f) => f.name.replace(/\.md$/, ""))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const filed = await db.from("transit_reads").select("date");
  const have = new Set((filed.data ?? []).map((r) => String(r.date)));
  const skip = new Set(except);
  return published.filter((d) => !have.has(d) && !skip.has(d)).sort();
}

async function main() {
  const args = process.argv.slice(2);
  const after = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
  const dateArg = after("--date");
  const today = args.includes("--today") ? new Date().toISOString().slice(0, 10) : null;
  const date = dateArg ?? today;
  const fromStorage = args.includes("--from-storage");
  const catchUp = args.includes("--catch-up");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`bad date "${date}", want YYYY-MM-DD`);
  if ((fromStorage || catchUp) && !date && !catchUp) throw new Error("--from-storage wants --today or --date");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const dir = after("--dir") ?? (fromStorage || catchUp ? mkdtempSync(join(tmpdir(), "delphi-reads-")) : transitsDir());

  // Which days to file. The named one, then anything published that never got
  // its reads, so a morning the push missed is picked up by the next one.
  const wanted: string[] = [];
  if (date) wanted.push(date);
  if (catchUp) wanted.push(...await daysOwed(db, wanted));

  const rows: Row[] = [];
  const empty: string[] = [];
  for (const d of wanted.length ? wanted : [null]) {
    if (d && (fromStorage || catchUp) && !after("--dir")) {
      const there = await fetchFromStorage(db, d, dir);
      if (!there) { empty.push(`${d} (not published)`); continue; }
    }
    const got = rowsFor(d, dir);
    if (!got.length) { empty.push(d ?? "the archive"); continue; }
    rows.push(...got);
  }

  if (!rows.length) {
    // Loud, not silent. No rows on a day the report ran means the parser and the
    // report have drifted apart, which is exactly the failure that would quietly
    // leave every client without words.
    console.error(date
      ? `no reads found for ${date} (is the report published for that day?)`
      : "no reads found at all");
    process.exitCode = 1;
    return;
  }
  if (empty.length) console.warn(`nothing to file for: ${empty.join(", ")}`);

  // one statement, so a partial push cannot leave half the roster on yesterday
  const { error } = await db.from("transit_reads")
    .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: "client_slug,date" });
  if (error) throw new Error(`push failed: ${error.message}`);

  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const people = new Set(rows.map((r) => r.client_slug)).size;
  console.log(`pushed ${rows.length} read(s): ${people} client(s), ` +
    `${dates.length} day(s) (${dates[0]}${dates.length > 1 ? ` to ${dates[dates.length - 1]}` : ""})`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
