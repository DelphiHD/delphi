/**
 * Bring the morning's transit report down to her Desktop.
 *
 * The report is written in the cloud now (.github/workflows/transit-report.yml)
 * and her Mac only collects it, so the folder she has always opened keeps
 * filling whether or not the machine was awake at six. Evening Echoes and the
 * health check read that folder and do not need to know anything changed.
 *
 * Kaycee, 2026-09-28. Catches up quietly: anything from the last week that is
 * missing locally and present in storage is fetched, newest first.
 *
 * Run:
 *   npx tsx scripts/fetch-transit.ts            # today and any of the last 7 days that are missing
 *   npx tsx scripts/fetch-transit.ts --date 2026-09-28
 *   npx tsx scripts/fetch-transit.ts --days 30
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : undefined; };
const OUT = resolve(arg("--dir") ?? join(homedir(), "Desktop", "HD Reports", "Transits"));

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** The days to look for, newest first, in her own timezone. */
function days(): string[] {
  const one = arg("--date");
  if (one) return [one];
  const back = Number(arg("--days") ?? 7);
  const out: string[] = [];
  for (let i = 0; i < back; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(d));
  }
  return out;
}

async function main() {
  const d = db();
  mkdirSync(OUT, { recursive: true });
  let got = 0, had = 0, none = 0;
  for (const date of days()) {
    for (const ext of ["html", "md"] as const) {
      const local = join(OUT, `${date} - Daily Transit Report.${ext}`);
      if (existsSync(local)) { had++; continue; }
      const file = await d.storage.from("charts").download(`transits/${date}.${ext}`);
      if (file.error || !file.data) { none++; continue; }
      writeFileSync(local, Buffer.from(await file.data.arrayBuffer()));
      console.log(`✓ ${local}`);
      got++;
    }
  }
  console.log(`${got} fetched, ${had} already here, ${none} not published`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
