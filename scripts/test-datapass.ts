// Smoke test for the Data Pass generator. Fetches Chris's chart from
// mybodygraph, joins against the now-metadata-rich chunks, and prints the
// rendered Markdown so we can eyeball it for correctness.
//
// Usage: REPORT_CLIENT=chris npx tsx scripts/test-datapass.ts

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

import { getChart, getTimezoneForLocation } from "@/lib/mybodygraph";
import { buildDataPass, renderDataPassMarkdown } from "@/lib/chart/datapass";

interface Client { name: string; birthDate: string; birthTime: string; birthPlace: string; }
const CLIENTS: Record<string, Client> = {
  chris:    { name: "Chris Kulish",       birthDate: "1988-06-03", birthTime: "11:37", birthPlace: "Johnstown, Pennsylvania, United States" },
  sean:     { name: "Sean Preetorious",   birthDate: "1985-01-19", birthTime: "23:02", birthPlace: "San Diego, California, United States" },
  meelad:   { name: "Meelad Kharazian",   birthDate: "1986-02-09", birthTime: "01:02", birthPlace: "Lodi, California, United States" },
  tennyson: { name: "Tennyson",           birthDate: "1993-01-06", birthTime: "07:51", birthPlace: "Orem, Utah, United States" },
  kaycee:   { name: "Kaycee Vandenberg",  birthDate: "1983-06-17", birthTime: "06:29", birthPlace: "Ogden, Utah, United States" },
};

async function main() {
  const slug = process.argv[2] ?? "chris";
  const c = CLIENTS[slug];
  if (!c) { console.error(`unknown client slug: ${slug}`); process.exit(1); }

  console.log(`Building Data Pass for ${c.name}…`);
  const tz = await getTimezoneForLocation(c.birthPlace);
  const chart = await getChart({
    birthDate: c.birthDate, birthTime: c.birthTime, timezone: tz, locationQuery: c.birthPlace,
  });
  console.log(`  Chart: ${chart.type.value} | ${chart.profile.value} | ${chart.definition.value}`);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const dp = await buildDataPass({ supabase, client: { name: c.name }, chart });

  const md = renderDataPassMarkdown(dp);

  mkdirSync(".cache/datapass", { recursive: true });
  const outPath = `.cache/datapass/${slug}.md`;
  writeFileSync(outPath, md);

  console.log(`\n${md}`);
  console.log(`\n→ wrote ${outPath} (${md.length} chars)`);
  console.log(`→ ${dp.warnings.length} audit warnings`);
}

main().catch((e) => { console.error(e); process.exit(1); });
