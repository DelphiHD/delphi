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
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { getChart, getTimezoneForLocation } from "@/lib/mybodygraph";
import { retrieveForChart } from "@/lib/retrieval/chartChunks";
import { buildDataPass } from "@/lib/chart/datapass";
import { buildFoundationReport } from "@/lib/report/foundation";
import { buildPlanetaryOverview } from "@/lib/report/planetary";
import { buildQuickstart } from "@/lib/report/quickstart";

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
  tennyson: {
    slug: "tennyson",
    name: "Tennyson",
    birthDate: "1993-01-06",
    birthTime: "07:51",
    birthPlace: "Orem, Utah, United States",
  },
  kaycee: {
    slug: "kaycee",
    name: "Kaycee Vandenberg",
    birthDate: "1983-06-17",
    birthTime: "06:29",
    birthPlace: "Ogden, Utah, United States",
  },
  paul: {
    slug: "paul",
    name: "Paul",
    birthDate: "1978-11-07",
    birthTime: "15:10",
    birthPlace: "Bountiful, Utah, United States",
  },
  tiff: {
    slug: "tiff",
    name: "Tiff",
    birthDate: "1981-12-01",
    birthTime: "15:05",
    birthPlace: "Saratoga Springs, New York, United States",
  },
  michael: {
    slug: "michael",
    name: "Michael",
    birthDate: "1958-08-29",
    birthTime: "07:33",
    birthPlace: "Gary, Indiana, United States",
  },
  matt: {
    slug: "matt",
    name: "Matt Hollingshead",
    birthDate: "1984-04-08",
    birthTime: "07:15",
    birthPlace: "Bountiful, Utah, United States",
  },
  brit: {
    slug: "brit",
    name: "Brit",
    birthDate: "1988-03-21",
    birthTime: "13:27",
    birthPlace: "Payson, Utah, United States",
  },
  jason: {
    slug: "jason",
    name: "Jason",
    birthDate: "1981-09-11",
    birthTime: "16:51",
    birthPlace: "Lodi, California, United States",
  },
  sarah: {
    slug: "sarah",
    name: "Sarah Marie",
    birthDate: "1986-05-13",
    birthTime: "09:20",
    birthPlace: "Murray, Utah, United States",
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
  if (!slug || !CLIENTS[slug] || !["foundation", "planetary", "quickstart"].includes(kindArg)) {
    console.error("usage: npx tsx scripts/generate-report.ts <chris|sean|meelad|tennyson|kaycee> [foundation|planetary|quickstart]");
    process.exit(1);
  }
  const brief = CLIENTS[slug];
  const kind = kindArg as "foundation" | "planetary" | "quickstart";
  const kindLabel = kind === "foundation" ? "Foundation Report" : kind === "planetary" ? "Planetary Overview" : "Quickstart";
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

  // 3. Build the canonical Data Pass.
  console.log(`\nBuilding Data Pass…`);
  const dataPass = await buildDataPass({ supabase, client: { name: brief.name }, chart });
  console.log(`  ${dataPass.personalityActivations.length} P + ${dataPass.designActivations.length} D activations`);
  console.log(`  Definition: ${dataPass.split.definitionLabel} (${dataPass.split.islandCount} island${dataPass.split.islandCount === 1 ? "" : "s"})`);
  if (dataPass.warnings.length) {
    console.log(`  ⚠ ${dataPass.warnings.length} audit warning${dataPass.warnings.length === 1 ? "" : "s"}:`);
    for (const w of dataPass.warnings) console.log(`    - ${w}`);
  }

  // 4. Load IDENTITY and VOICE.
  const root = resolve(__dirname, "..");
  const identityMd = readFileSync(resolve(root, "docs/IDENTITY.md"), "utf8");
  const voiceMd = readFileSync(resolve(root, "docs/VOICE.md"), "utf8");

  // 5. Generate.
  const length = (process.env.REPORT_LENGTH as "standard" | "long") ?? "standard";
  console.log(`\nCalling Claude (Sonnet 4.6, kind=${kind}${kind === "foundation" ? `, length=${length}` : ""}) …`);
  const t0 = Date.now();
  const apiKey = must("ANTHROPIC_API_KEY");
  const ceiling = Number(process.env.HARD_COST_CEILING_CENTS ?? 80);
  const result =
    kind === "foundation"
      ? await buildFoundationReport({
          client: { name: brief.name },
          chart,
          dataPass,
          retrieval,
          identityMd,
          voiceMd,
          model: "claude-sonnet-4-6",
          length,
          apiKey,
          hardCostCeilingCents: ceiling,
        })
      : kind === "planetary"
      ? await buildPlanetaryOverview({
          client: { name: brief.name },
          chart,
          dataPass,
          retrieval,
          identityMd,
          voiceMd,
          model: "claude-sonnet-4-6",
          apiKey,
          hardCostCeilingCents: ceiling,
        })
      : await buildQuickstart({
          client: { name: brief.name },
          chart,
          dataPass,
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
    const retryFlag = "retried" in sec && (sec as { retried?: boolean }).retried ? " (retried)" : "";
    console.log(`    [${sec.name}]${retryFlag}  in=${sec.usage.input_tokens}  out=${sec.usage.output_tokens}  cache_write=${sec.usage.cache_creation_input_tokens}  cache_read=${sec.usage.cache_read_input_tokens}  cost=$${(sec.cost_cents / 100).toFixed(4)}`);
  }
  console.log(`  total cost = $${(result.cost_cents / 100).toFixed(4)}`);

  // Surface validation (all three tiers now emit it).
  if ("validation" in result) {
    const v = (result as { validation: { passed: boolean; hardCount: number; softCount: number; factsChecked: number; factsMatched: number; summary: string; issues: { severity: string; section: string; rule: string; message: string; expected?: string; detected: string }[] } }).validation;
    console.log(`\nValidation: ${v.summary}`);
    if (v.issues.length) {
      for (const i of v.issues) {
        const sev = i.severity === "hard" ? "✗" : "⚠";
        console.log(`  ${sev} [${i.section}] ${i.rule}: ${i.message}`);
        if (i.expected) console.log(`      Expected: ${i.expected}`);
        console.log(`      Detected: ${i.detected.replace(/\n/g, " ").slice(0, 160)}`);
      }
    }
  }

  // 5. Determine version + assemble the metadata block, then write.
  mkdirSync(".cache/reports", { recursive: true });
  const outSuffix = kind; // foundation | planetary | quickstart

  // Auto-publish to the operator's Benchmark Reports folder (default:
  // ~/Desktop/Benchmark Reports/Phase 4 Output). Override with the
  // BENCHMARK_REPORTS_DIR env var. Each run creates a NEW versioned file
  // (Phase 4 v<N+1>) so prior pilots are preserved automatically. We
  // compute the next version FIRST so the metadata block at the top of
  // the file can carry it.
  const benchmarkDir = process.env.BENCHMARK_REPORTS_DIR
    ?? resolve(homedir(), "Desktop", "Benchmark Reports", "Phase 4 Output");
  const kindLabel2 = kind === "foundation" ? "Foundation"
                   : kind === "planetary"  ? "Planetary Overview"
                   :                         "Quickstart";
  let nextV = 1;
  if (existsSync(benchmarkDir)) {
    const prefix = `${brief.name} - ${kindLabel2} - Phase 4 v`;
    let maxV = 0;
    for (const f of readdirSync(benchmarkDir)) {
      if (!f.startsWith(prefix) || !f.endsWith(".md")) continue;
      const m = f.slice(prefix.length, -3).match(/^(\d+)/);
      if (m) maxV = Math.max(maxV, parseInt(m[1], 10));
    }
    nextV = maxV + 1;
  }

  // Assemble an HTML-comment metadata block. Invisible in the rendered
  // Markdown / PDF but visible in the source, so every report carries
  // its own audit trail: version, cost, validation summary, model.
  // Anyone reading the .md file later can tell exactly which run produced
  // it and whether it passed validation.
  const wordCount = result.text.split(/\s+/).length;
  const validationLine = ("validation" in result)
    ? (result as { validation: { passed: boolean; hardCount: number; softCount: number; summary: string } }).validation.summary
    : "(no validation)";
  const hardCount = ("validation" in result)
    ? (result as { validation: { hardCount: number } }).validation.hardCount
    : 0;
  const softCount = ("validation" in result)
    ? (result as { validation: { softCount: number } }).validation.softCount
    : 0;
  const generatedAt = new Date().toISOString();
  const metadataBlock = `<!--
report:        ${kindLabel2}
client:        ${brief.name}
version:       v${nextV}
generated_at:  ${generatedAt}
elapsed_sec:   ${elapsed}
model:         ${"model" in result ? result.model : "claude-sonnet-4-6"}
cost_usd:      ${(result.cost_cents / 100).toFixed(4)}
words:         ${wordCount.toLocaleString()}
validation:    ${validationLine}
hard_failures: ${hardCount}
soft_warnings: ${softCount}
-->
`;
  const finalText = metadataBlock + result.text;

  const outPath = `.cache/reports/${brief.slug}-${outSuffix}.md`;
  writeFileSync(outPath, finalText);
  console.log(`\n✓ ${outPath} (${wordCount.toLocaleString()} words)`);

  if (existsSync(benchmarkDir)) {
    const benchmarkPath = resolve(benchmarkDir, `${brief.name} - ${kindLabel2} - Phase 4 v${nextV}.md`);
    writeFileSync(benchmarkPath, finalText);
    console.log(`✓ published to: ${benchmarkPath}`);
  } else {
    console.log(`  (skipped benchmark publish: ${benchmarkDir} not found; set BENCHMARK_REPORTS_DIR to enable)`);
  }

  // 5c. Append to the report log (JSONL — one JSON object per line, easy
  // to grep, jq, or load into a sheet). Lives next to the working-copy
  // reports so it's visible to anyone inspecting the cache. Each line is
  // the full record for one run; never overwrite.
  const logEntry = {
    timestamp:     generatedAt,
    client:        brief.name,
    client_slug:   brief.slug,
    report_type:   kindLabel2,
    version:       nextV,
    model:         "model" in result ? result.model : "claude-sonnet-4-6",
    cost_usd:      Math.round((result.cost_cents / 100) * 10000) / 10000,
    words:         wordCount,
    elapsed_sec:   Number(elapsed),
    validation:    validationLine,
    hard_failures: hardCount,
    soft_warnings: softCount,
    benchmark_path: existsSync(benchmarkDir)
      ? resolve(benchmarkDir, `${brief.name} - ${kindLabel2} - Phase 4 v${nextV}.md`)
      : null,
    cache_path: resolve(outPath),
  };
  appendFileSync(".cache/reports/log.jsonl", JSON.stringify(logEntry) + "\n");
  console.log(`✓ logged to .cache/reports/log.jsonl`);

  // 6. Lint: no em dashes.
  if (/—/.test(result.text)) {
    const count = (result.text.match(/—/g) ?? []).length;
    console.log(`\n  ⚠ ${count} em dash(es) found in output. Fix the prompt; report fails the no-em-dash rule.`);
  } else {
    console.log(`\n  ✓ no em dashes`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
