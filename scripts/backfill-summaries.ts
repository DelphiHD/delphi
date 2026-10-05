/**
 * The display summary for charts that were published before it existed.
 *
 * From 2026-10-05 every publish writes profile, type, authority, definition
 * and the personality Sun onto the chart row, so a list of charts can be read
 * without casting twenty of them. The 81 charts already published have none.
 *
 * Republishing all of them would take twenty minutes and redraw pages that are
 * already correct. This asks the provider for the Human Design data alone, one
 * call per chart, and writes the summary. Nothing is drawn and no published
 * file is touched.
 *
 *   npx tsx scripts/backfill-summaries.ts            # anything missing one
 *   npx tsx scripts/backfill-summaries.ts --all      # rewrite every one
 */

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import { getChart } from "@/lib/mybodygraph";

async function main() {
  const all = process.argv.includes("--all");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are not set");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const q = db.from("charts")
    .select("token, person_name, birth_date, birth_time, birth_place, birth_timezone, summary")
    .order("person_name");
  const { data, error } = await (all ? q : q.is("summary", null));
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  console.log(`${rows.length} chart(s) to summarise\n`);

  let done = 0;
  const failed: string[] = [];
  for (const r of rows) {
    const name = String(r.person_name);
    try {
      const chart = await getChart({
        birthDate: String(r.birth_date),
        // No stored time means the chart is cast for noon, the same choice the
        // builder makes, so the summary matches the published page.
        birthTime: String(r.birth_time ?? "12:00").slice(0, 5),
        // The timezone stored on the row is the provider's own answer for that
        // place, from the day the chart was made. Using it rather than looking
        // the place up again is what keeps this summary identical to the
        // published page: a place lookup that moved would move the chart.
        timezone: String(r.birth_timezone),
        locationQuery: String(r.birth_place),
      });
      const sun = chart.activations.personality.find((a) => a.planet === "Sun");
      const up = await db.from("charts").update({
        summary: {
          profile: chart.profile.value,
          type: chart.type.value,
          authority: chart.authority.value,
          definition: chart.definition.value,
          personalitySun: sun ? `${sun.gate}.${sun.line}` : "",
          cross: chart.incarnationCross.value,
          at: new Date().toISOString(),
        },
      }).eq("token", String(r.token));
      if (up.error) throw new Error(up.error.message);
      done++;
      console.log(`  ${name.padEnd(30)} ${chart.type.value} · ${chart.profile.value}`);
    } catch (e) {
      failed.push(`${name}: ${e instanceof Error ? e.message : e}`);
      console.log(`  ${name.padEnd(30)} FAILED`);
    }
  }

  console.log(`\n${done} summarised`);
  if (failed.length) {
    console.log(`${failed.length} could not be read:`);
    for (const f of failed) console.log(`  ${f}`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
