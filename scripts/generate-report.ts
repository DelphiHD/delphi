// Phase 4 iteration runner.
//
// Pulls a chart from mybodygraph, retrieves library chunks, calls Claude via
// invokeLLM, writes the resulting Markdown report to .cache/reports/<slug>.md.
// Verbose by design so each iteration shows exactly what the model saw.
//
// Run:
//   npx tsx scripts/generate-report.ts <client-slug>
//
// Available client slugs map to the benchmark cases in the operator brief:
//   chris   — Chris Kulish    1988-06-03 11:37 Johnstown, Pennsylvania
//   sean    — Sean Preetorious 1985-01-19 23:02 San Diego, California
//   meelad  — Meelad Kharazian 1986-02-09 01:02 Lodi, California

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { getChart, getTimezoneForLocation } from "@/lib/mybodygraph";
import { retrieveForChart } from "@/lib/retrieval/chartChunks";
import { buildFoundationReport } from "@/lib/report/foundation";
import { buildPlanetaryOverview } from "@/lib/report/planetary";

interface ClientBrief {
  slug: string;
  name: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
}

const CLIENTS: Record<string, ClientBrief> = {
  chris: {
    slug: "chris",
    name: "Chris Kulish",
    birthDate: "1988-06-03",
    birthTime: "11:37",
    birthPlace: "Johnstown, Pennsylvania, United States",
  },
  sean: {
    slug: "sean",
    name: "Sean Preetorious",
    birthDate: "1985-01-19",
    birthTime: "23:02",
    birthPlace: "San Diego, California, United States",
  },
  meelad: {
    slug: "meelad",
    name: "Meelad Kharazian",
    birthDate: "1986-02-09",
    birthTime: "01:02",
    birthPlace: "Lodi, California, United States",
  },
};

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

async function main() {
  const slug = process.argv[2];
  const kindArg = (process.argv[3] || "foundation").toLowerCase();
  if (!slug || !CLIENTS[slug] || !["foundation", "planetary"].includes(kindArg)) {
    console.error("usage: npx tsx scripts/generate-report.ts <chris|sean|meelad> [foundation|planetary]");
    process.exit(1);
  }
  const brief = CLIENTS[slug];
  const kind = kindArg as "foundation" | "planetary";
  const kindLabel = kind === "foundation" ? "Foundation Report" : "Planetary Overview";
  console.log(`\n=== ${kindLabel} for ${brief.name} ===\n`);

  // 1. Resolve timezone + fetch chart.
  console.log(`Resolving timezone for "${brief.birthPlace}"…`);
  const tz = await getTimezoneForLocation(brief.birthPlace);
  console.log(`  ${tz}`);
  console.log(`Fetching chart from mybodygraph…`);
  const chart = await getChart({
    birthDate: brief.birthDate,
    birthTime: brief.birthTime,
    timezone: tz,
    locationQuery: brief.birthPlace,
  });
  console.log(`  ${chart.type.value} | ${chart.profile.value} | ${chart.authority.value} | ${chart.definition.value}`);
  console.log(`  Cross: ${chart.incarnationCross.value}`);
  console.log(`  Quarter: ${chart.quarter}`);
  console.log(`  Channels: ${chart.channels.map((c) => c.id).join(", ") || "(none)"}`);

  // 2. Retrieve chunks.
  console.log(`\nRetrieving library chunks…`);
  const supabase = createClient(must("NEXT_PUBLIC_SUPABASE_URL"), must("SUPABASE_SERVICE_ROLE_KEY"));
  const retrieval = await retrieveForChart(supabase, chart);
  console.log(`  ${retrieval.chunks.length} chunks (~${retrieval.totalTokensEstimate.toLocaleString()} tokens)`);

  const byKind = new Map<string, number>();
  for (const c of retrieval.chunks) byKind.set(c.source_kind, (byKind.get(c.source_kind) ?? 0) + 1);
  for (const [k, n] of [...byKind.entries()].sort()) console.log(`    ${k.padEnd(15)} ${n}`);

  if (retrieval.missing.length) {
    console.log(`\n  ${retrieval.missing.length} missing items (proceeding anyway):`);
    for (const m of retrieval.missing.slice(0, 20)) console.log(`    - ${m}`);
    if (retrieval.missing.length > 20) console.log(`    … and ${retrieval.missing.length - 20} more`);
  }

  // 3. Load IDENTITY and VOICE.
  const root = resolve(__dirname, "..");
  const identityMd = readFileSync(resolve(root, "docs/IDENTITY.md"), "utf8");
  const voiceMd = readFileSync(resolve(root, "docs/VOICE.md"), "utf8");

  // 4. Generate.
  const length = (process.env.REPORT_LENGTH as "short" | "standard" | "long") ?? "standard";
  console.log(`\nCalling Claude (Sonnet 4.6, kind=${kind}${kind === "foundation" ? `, length=${length}` : ""}) …`);
  const t0 = Date.now();
  const apiKey = must("ANTHROPIC_API_KEY");
  const ceiling = Number(process.env.HARD_COST_CEILING_CENTS ?? 80);
  const result =
    kind === "foundation"
      ? await buildFoundationReport({
          client: { name: brief.name },
          chart,
          retrieval,
          identityMd,
          voiceMd,
          model: "claude-sonnet-4-6",
          length,
          apiKey,
          hardCostCeilingCents: ceiling,
        })
      : await buildPlanetaryOverview({
          client: { name: brief.name },
          chart,
          retrieval,
          identityMd,
          voiceMd,
          model: "claude-sonnet-4-6",
          apiKey,
          hardCostCeilingCents: ceiling,
        });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  done in ${elapsed}s`);
  for (const sec of result.sections) {
    console.log(`    [${sec.name}]  in=${sec.usage.input_tokens}  out=${sec.usage.output_tokens}  cache_write=${sec.usage.cache_creation_input_tokens}  cache_read=${sec.usage.cache_read_input_tokens}  cost=$${(sec.cost_cents / 100).toFixed(4)}`);
  }
  console.log(`  total cost = $${(result.cost_cents / 100).toFixed(4)}`);

  // 5. Write.
  mkdirSync(".cache/reports", { recursive: true });
  const outSuffix = kind === "foundation" ? "foundation" : "planetary";
  const outPath = `.cache/reports/${brief.slug}-${outSuffix}.md`;
  writeFileSync(outPath, result.text);
  console.log(`\n✓ ${outPath} (${result.text.split(/\s+/).length.toLocaleString()} words)`);

  // 6. Lint: no em dashes.
  if (/—/.test(result.text)) {
    const count = (result.text.match(/—/g) ?? []).length;
    console.log(`\n  ⚠ ${count} em dash(es) found in output. Fix the prompt; report fails the no-em-dash rule.`);
  } else {
    console.log(`\n  ✓ no em dashes`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
