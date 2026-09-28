/**
 * Put a day's transit report somewhere it can be read from anywhere.
 *
 * Kaycee, 2026-09-28: "Can we move the transit report process off my mac now?"
 * The report is generated in the cloud from now on, so it has to land somewhere
 * other than her Desktop. It goes to storage beside the charts, under
 * transits/<date>.html, and /t/<date> serves it back.
 *
 * Private, not public. The daily report names her roster and reads their
 * charts, so the link is hers. The public edition, which is the same day
 * without the people, is a separate render and is not this.
 *
 * Run:
 *   npx tsx scripts/publish-transit.ts                      # today, from the usual folder
 *   npx tsx scripts/publish-transit.ts --date 2026-09-28
 *   npx tsx scripts/publish-transit.ts --dir /some/where     # where the files were written
 *   npx tsx scripts/publish-transit.ts --check 2026-09-28    # is that day already up?
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "charts";
const SITE = process.env.CHART_SITE ?? "https://charts.delphihd.com";
const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : undefined; };

/** The report's own folder, the one her Mac has always used. */
const folder = () => resolve(arg("--dir") ?? join(homedir(), "Desktop", "HD Reports", "Transits"));
const today = () => new Date().toISOString().slice(0, 10);

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const d = db();

  const check = arg("--check");
  if (check) {
    const got = await d.storage.from(BUCKET).download(`transits/${check}.html`);
    console.log(got.data ? "already published" : "not published");
    process.exit(got.data ? 0 : 1);
  }

  const date = arg("--date") ?? today();
  const dir = folder();
  let published = 0;
  for (const [name, type] of [[`${date} - Daily Transit Report.html`, "text/html; charset=utf-8"],
    [`${date} - Daily Transit Report.md`, "text/markdown; charset=utf-8"]] as const) {
    const path = join(dir, name);
    if (!existsSync(path)) { console.log(`  no ${name} to publish`); continue; }
    const to = `transits/${date}${name.endsWith(".md") ? ".md" : ".html"}`;
    const up = await d.storage.from(BUCKET).upload(to, readFileSync(path), {
      contentType: type, cacheControl: "0", upsert: true,
    });
    if (up.error) throw new Error(`could not publish ${name}: ${up.error.message}`);
    console.log(`  ✓ ${to}`);
    published++;
  }
  if (!published) throw new Error(`nothing to publish for ${date} in ${dir}`);
  console.log(`\n✓ ${SITE}/t/${date}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
