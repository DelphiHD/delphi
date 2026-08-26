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
//   npx tsx scripts/push-transit-reads.ts            # everything on disk
//   npx tsx scripts/push-transit-reads.ts --today    # just today
//   npx tsx scripts/push-transit-reads.ts --date 2026-08-24

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import { CLIENTS } from "./client-roster";
import { loadAllReads, loadDayRead } from "@/lib/transit/reads";

interface Row {
  client_slug: string;
  date: string;
  written_at: string | null;
  paragraph: string;
  completions: unknown;
}

function rowsFor(date: string | null): Row[] {
  const rows: Row[] = [];
  for (const client of Object.values(CLIENTS)) {
    const reads = date
      ? (() => { const r = loadDayRead(client.name, date); return r ? { [date]: r } : {}; })()
      : loadAllReads(client.name);
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

async function main() {
  const args = process.argv.slice(2);
  const dateArg = args.includes("--date") ? args[args.indexOf("--date") + 1] : null;
  const today = args.includes("--today") ? new Date().toISOString().slice(0, 10) : null;
  const date = dateArg ?? today;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`bad date "${date}", want YYYY-MM-DD`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const rows = rowsFor(date);
  if (!rows.length) {
    // Loud, not silent. No rows on a day the report ran means the parser and the
    // report have drifted apart, which is exactly the failure that would quietly
    // leave every client without words.
    console.error(date
      ? `no reads found for ${date} — is there a report on disk for that day?`
      : "no reads found on disk at all");
    process.exitCode = 1;
    return;
  }

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
