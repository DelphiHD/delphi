// Validate an existing report against its Data Pass.
// Usage: npx tsx scripts/test-validator.ts <client-slug>

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { getChart, getTimezoneForLocation } from "@/lib/mybodygraph";
import { buildDataPass } from "@/lib/chart/datapass";
import { validateReport, renderValidationMarkdown } from "@/lib/report/validate";

interface Client { name: string; birthDate: string; birthTime: string; birthPlace: string; }
const CLIENTS: Record<string, Client> = {
  chris:    { name: "Chris Kulish",       birthDate: "1988-06-03", birthTime: "11:37", birthPlace: "Johnstown, Pennsylvania, United States" },
  sean:     { name: "Sean Preetorious",   birthDate: "1985-01-19", birthTime: "23:02", birthPlace: "San Diego, California, United States" },
  meelad:   { name: "Meelad Kharazian",   birthDate: "1986-02-09", birthTime: "01:02", birthPlace: "Lodi, California, United States" },
  tennyson: { name: "Tennyson",           birthDate: "1993-01-06", birthTime: "07:51", birthPlace: "Orem, Utah, United States" },
  kaycee:   { name: "Kaycee Vandenberg",  birthDate: "1983-06-17", birthTime: "06:29", birthPlace: "Ogden, Utah, United States" },
};

async function main() {
  const slug = process.argv[2] ?? "tennyson";
  const c = CLIENTS[slug];
  if (!c) { console.error(`unknown slug: ${slug}`); process.exit(1); }

  const tz = await getTimezoneForLocation(c.birthPlace);
  const chart = await getChart({
    birthDate: c.birthDate, birthTime: c.birthTime, timezone: tz, locationQuery: c.birthPlace,
  });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const dp = await buildDataPass({ supabase, client: { name: c.name }, chart });

  const reportPath = process.argv[3] ?? `.cache/reports/${slug}-foundation.md`;
  const text = readFileSync(reportPath, "utf8");
  const v = validateReport(text, dp);
  console.log(renderValidationMarkdown(v));
}

main().catch((e) => { console.error(e); process.exit(1); });
