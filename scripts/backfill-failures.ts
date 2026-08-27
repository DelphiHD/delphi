// Re-runs the validator over every report already on disk and writes one line
// per failure, so the failure log has history rather than starting empty.
//
// Costs nothing: validation is local. One chart call per client to rebuild the
// data pass it validates against, which her plan covers.

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { CLIENTS, clientOutputDir, placeForLookup } from "./client-roster";
import { getChart, getTimezoneForLocation } from "@/lib/mybodygraph";
import { buildDataPass } from "@/lib/chart/datapass";
import { validateReport } from "@/lib/report/validate";

const OUT = ".cache/reports/failures.jsonl";

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  mkdirSync(".cache/reports", { recursive: true });
  writeFileSync(OUT, "");
  let clients = 0, reports = 0, issues = 0;

  for (const c of Object.values(CLIENTS)) {
    const dir = clientOutputDir(c);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    if (!files.length) continue;

    let dp: unknown;
    try {
      const tz = await getTimezoneForLocation(placeForLookup(c));
      const chart = await getChart({ birthDate: c.birthDate, birthTime: c.birthTime, timezone: tz, locationQuery: placeForLookup(c) });
      dp = await buildDataPass({ supabase: db, client: { name: c.name }, chart } as never);
    } catch (e) {
      console.log(`  ${c.id} ${c.name}: chart unavailable, skipped (${e instanceof Error ? e.message : e})`);
      continue;
    }
    clients++;

    // newest version of each tier only: older versions were superseded
    const newest: Record<string, string> = {};
    for (const f of files) {
      const tier = /foundation/i.test(f) ? "Foundation" : /planetary/i.test(f) ? "Planetary Overview" : null;
      if (!tier) continue;
      const p = join(dir, f);
      if (!newest[tier] || statSync(p).mtimeMs > statSync(newest[tier]).mtimeMs) newest[tier] = p;
    }

    for (const [tier, path] of Object.entries(newest)) {
      const text = readFileSync(path, "utf8");
      const v = validateReport(text, dp as never, tier === "Foundation" ? "foundation" : "planetary");
      reports++;
      for (const i of v.issues) {
        issues++;
        appendFileSync(OUT, JSON.stringify({
          at: new Date(statSync(path).mtimeMs).toISOString(),
          id: c.id, slug: c.slug, client: c.name,
          report: tier,
          severity: i.severity,
          rule: i.rule,
          section: i.section,
          message: i.message,
          detected: String(i.detected ?? "").replace(/\s+/g, " ").slice(0, 300),
          file: path.split("/").pop(),
        }) + "\n");
      }
      console.log(`  ${c.id} ${c.name.padEnd(24)} ${tier.padEnd(20)} ${v.summary}`);
    }
  }
  console.log(`\n  ${clients} clients, ${reports} reports, ${issues} issues written to ${OUT}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
