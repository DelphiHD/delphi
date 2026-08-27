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
import { renderReportDocx, svgToPng } from "@/lib/render/docx";
import { renderCrossMandala } from "@/lib/render/mandala";
import type { Activation as MandalaActivation, MandalaChart, Planet as MandalaPlanet } from "@/lib/render/mandala.types";
import { CLIENTS, type ClientBrief, placeForLookup } from "./client-roster";

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

// Tiny flag parser. Supports `--name "X"`, `--name=X`. Used for the ad-hoc
// mode where the caller passes chart data on the CLI instead of editing
// the CLIENTS map (the common case for real client work — the map is just
// for the benchmark cohort).
function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq >= 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { out[key] = "true"; continue; }
    out[key] = next; i++;
  }
  return out;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
}

const USAGE = [
  "usage:",
  "  slug mode:  npx tsx scripts/generate-report.ts <chris|sean|...> [foundation|planetary|quickstart]",
  "  ad-hoc:     npx tsx scripts/generate-report.ts --name \"Client Name\" --date 1988-06-03 --time 11:37 \\",
  "                  --place \"Johnstown, Pennsylvania, United States\" [--tier foundation] [--no-docx]",
  "",
  "flags:",
  "  --name, --date (YYYY-MM-DD), --time (HH:MM 24h local), --place (geocodable string)",
  "  --tier  foundation | planetary | quickstart   (default: foundation)",
  "  --no-docx  skip the branded .docx render (markdown only)",
  "  --slug  override the generated client slug used for filenames",
].join("\n");

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const isAdHoc = !!(flags.name && flags.date && flags.time && flags.place);

  let brief: ClientBrief;
  let kindArg: string;
  if (isAdHoc) {
    const slug = flags.slug || slugify(flags.name);
    brief = {
      // ad-hoc runs are not roster members, so they carry no permanent id
      id: CLIENTS[slug]?.id ?? "",
      slug,
      name: flags.name,
      birthDate: flags.date,
      birthTime: flags.time,
      birthPlace: flags.place,
    };
    kindArg = (flags.tier || "foundation").toLowerCase();
  } else {
    const slug = process.argv[2];
    kindArg = (process.argv[3] || "foundation").toLowerCase();
    if (!slug || !CLIENTS[slug]) {
      console.error(USAGE);
      process.exit(1);
    }
    brief = CLIENTS[slug];
  }
  if (!["foundation", "planetary", "quickstart"].includes(kindArg)) {
    console.error(USAGE);
    process.exit(1);
  }
  const renderDocx = flags["no-docx"] !== "true";
  const kind = kindArg as "foundation" | "planetary" | "quickstart";
  const kindLabel = kind === "foundation" ? "Foundation Report" : kind === "planetary" ? "Planetary Overview" : "Quickstart";
  console.log(`\n=== ${kindLabel} for ${brief.name} ===\n`);

  // 1. Resolve timezone + fetch chart.
  console.log(`Resolving timezone for "${placeForLookup(brief)}"…`);
  const tz = await getTimezoneForLocation(placeForLookup(brief));
  console.log(`  ${tz}`);
  console.log(`Fetching chart from mybodygraph…`);
  const chart = await getChart({
    birthDate: brief.birthDate,
    birthTime: brief.birthTime,
    timezone: tz,
    locationQuery: placeForLookup(brief),
    includeChartImage: renderDocx, // pulls the Delphi-styled bodygraph SVG
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
  // The chart is CAST from lookupPlace, which for a small town is a larger one
  // nearby. The report must still say where the person was actually born, so the
  // display place is put back over the query we had to use to geocode.
  if (dataPass.birth) dataPass.birth.place = brief.birthPlace;
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

  // Where deliverables go. Two destinations and one operator-facing rule
  // baked in: every output file lands somewhere Kaycee can find in Finder.
  // The .cache/reports/ paths inside the worktree are debug-only.
  //
  //   - REAL client work (ad-hoc mode):   ~/Desktop/HD Reports/Paid HD Reports/<Client>/
  //   - Benchmark cohort (slug mode):      ~/Desktop/Benchmark Reports/Phase 4 Output/
  //
  // All client subfolders live under "Paid HD Reports/" (Kaycee's convention).
  // Override either with HD_REPORTS_DIR or BENCHMARK_REPORTS_DIR.
  const clientDir = process.env.HD_REPORTS_DIR
    ?? resolve(homedir(), "Desktop", "HD Reports", "Paid HD Reports", brief.name);
  const benchmarkDir = process.env.BENCHMARK_REPORTS_DIR
    ?? resolve(homedir(), "Desktop", "Benchmark Reports", "Phase 4 Output");
  // For ad-hoc real-client runs, primary destination is clientDir.
  // For slug-mode benchmark runs, primary destination is benchmarkDir.
  // A report about a real person belongs in that person's folder. Slug mode used
  // to mean "benchmark run" purely because that is what slug mode was first
  // written for, which quietly filed paying clients' deliverables under
  // Benchmark Reports as "Phase 4 v2". Benchmarking is now the thing you ask
  // for, with --benchmark, rather than the thing you get by default.
  const toClientDir = !flags.benchmark;
  const primaryDir = toClientDir ? clientDir : benchmarkDir;
  mkdirSync(primaryDir, { recursive: true });

  const kindLabel2 = kind === "foundation" ? "Foundation"
                   : kind === "planetary"  ? "Planetary Overview"
                   :                         "Quickstart";
  // Versioning convention differs by destination:
  //   - Benchmark: "<Name> - <Tier> - Phase 4 v<N>.md/.docx"
  //   - Client:    "<Name> - <Tier> - v<N>.md/.docx"  (no "Phase 4" prefix —
  //                this is the client's actual deliverable, not a benchmark)
  const versionPrefix = toClientDir
    ? `${brief.name} - ${kindLabel2} - v`
    : `${brief.name} - ${kindLabel2} - Phase 4 v`;
  let nextV = 1;
  if (existsSync(primaryDir)) {
    let maxV = 0;
    for (const f of readdirSync(primaryDir)) {
      if (!f.startsWith(versionPrefix) || !f.endsWith(".md")) continue;
      const m = f.slice(versionPrefix.length, -3).match(/^(\d+)/);
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
    // The reasons, not just the count. Without these a REJECT is a number and
    // somebody must re-run the validator by hand to learn what leaked, which is
    // exactly what happened on 2026-08-27.
    type HardIssue = { severity: string; section: string; rule: string; message: string; detected?: string };
    const pickIssues = (sev: string) => ("validation" in result)
      ? (result as { validation: { issues: HardIssue[] } }).validation.issues
          .filter((i) => i.severity === sev)
          .map((i) => ({
            rule: i.rule,
            section: i.section,
            message: i.message,
            detected: String(i.detected ?? "").replace(/\s+/g, " ").slice(0, 240),
          }))
      : [];
    const softIssues = pickIssues("soft");
    const hardIssues = ("validation" in result)
      ? (result as { validation: { issues: HardIssue[] } }).validation.issues
          .filter((i) => i.severity === "hard")
          .map((i) => ({
            rule: i.rule,
            section: i.section,
            message: i.message,
            detected: String(i.detected ?? "").replace(/\s+/g, " ").slice(0, 240),
          }))
      : [];
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

  // Write the cache copy (debug / re-render input) and the primary
  // deliverable (visible in Finder). The cache path is ALSO printed so
  // anyone debugging can find it, but it's secondary to the visible path.
  const outPath = `.cache/reports/${brief.slug}-${outSuffix}.md`;
  writeFileSync(outPath, finalText);

  const primaryMdPath = resolve(primaryDir, `${versionPrefix}${nextV}.md`);
  writeFileSync(primaryMdPath, finalText);
  console.log(`\n✓ markdown written:`);
  console.log(`    ${primaryMdPath}`);
  console.log(`    (debug copy: ${resolve(outPath)})`);

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
    // The reasons, not just the count. Without these a REJECT is a number and
    // somebody has to re-run the validator by hand to find out what leaked,
    // which is exactly what happened on 2026-08-27.
    // how many sections had to be written twice because the validator rejected
    // the first attempt: a report that needed three retries is a report whose
    // prompt is fighting the material, and worth seeing next to its cost
    retried_sections: ("sections" in result)
      ? (result as { sections: { retried?: boolean }[] }).sections.filter((x) => x.retried).length
      : 0,
    total_sections: ("sections" in result)
      ? (result as { sections: unknown[] }).sections.length : 0,
    hard_issues:   hardIssues,
    soft_issues:   softIssues,
    primary_path: primaryMdPath,
    cache_path:   resolve(outPath),
  };
  appendFileSync(".cache/reports/log.jsonl", JSON.stringify(logEntry) + "\n");

  // 6. Lint: no em dashes.
  if (/—/.test(result.text)) {
    const count = (result.text.match(/—/g) ?? []).length;
    console.log(`\n  ⚠ ${count} em dash(es) found in output. Fix the prompt; report fails the no-em-dash rule.`);
  } else {
    console.log(`\n  ✓ no em dashes`);
  }

  // 7. Branded .docx render — Georgia + purple #845095 + Delphi bodygraph on
  // the title page. Lives alongside the markdown so Kaycee can light-edit in
  // Word and send to the client. Skip with --no-docx.
  if (renderDocx) {
    const reportTitle = kind === "foundation" ? "Human Design Analysis"
                      : kind === "planetary"  ? "Planetary Overview"
                      :                         "Quickstart";

    // Standalone assets for the client folder: the Bodygraph chart PNG plus the
    // Full and Cross Mandala PNGs, nice to have on their own for slides and
    // handouts. Runs for every tier (placed before the planetary early-return
    // below). Best-effort: a failure here is logged but never fails the report,
    // and it only runs for roster clients (the exporter resolves the chart and
    // output folder from the slug).
    if (CLIENTS[brief.slug]) {
      const { spawnSync } = await import("node:child_process");
      console.log(`\nExporting standalone chart + mandala PNGs…`);
      const pngRes = spawnSync("./node_modules/.bin/tsx", ["scripts/export-mandala-pngs.ts", brief.slug], { stdio: "inherit", cwd: process.cwd() });
      if (pngRes.status !== 0) console.log(`  ⚠ standalone PNG export exited ${pngRes.status} (report is unaffected)`);
    } else {
      console.log(`\n  (skipping standalone PNG export: slug "${brief.slug}" is not in the roster)`);
    }

    // Planetary Overview: route through scripts/render-planetary-docx.ts,
    // NOT the generic renderer. The PO-specific renderer knows how to expand
    // [[PERSONALITY_PLACEMENTS_TABLE]] / [[DESIGN_PLACEMENTS_TABLE]] markers,
    // insert the Full Mandala on the cover, insert the Cross Mandala after
    // the Cross H1, and render per-H2 hexagram images. The generic renderer
    // does none of that — using it for a PO yields brackets where the tables
    // should be and a bodygraph composite where the mandala should be.
    if (kind === "planetary") {
      const { spawnSync } = await import("node:child_process");
      console.log(`\nRendering branded .docx via scripts/render-planetary-docx.ts (PO-specific renderer)…`);
      const res = spawnSync("./node_modules/.bin/tsx", ["scripts/render-planetary-docx.ts", brief.slug], { stdio: "inherit", cwd: process.cwd() });
      if (res.status !== 0) {
        console.error(`\n✗ render-planetary-docx.ts exited with code ${res.status}`);
        process.exit(1);
      }
      return;
    }

    if (!chart.chartImageSvg) {
      console.log(`\n  ⚠ no Delphi bodygraph SVG returned by mybodygraph; .docx will render without the composite cover.`);
    }
    // Cross Mandala image — inserted after the "{Cross Name} | (P/E | D/E)"
    // H1 in the Planetary Overview. Skip for other tiers (foundation +
    // quickstart don't emit that H1 pattern, so the renderer wouldn't slot
    // the image anywhere anyway).
    let crossMandalaPng: Buffer | undefined;
    if (kind === "planetary" && chart.chartImageSvg) {
      try {
        const activations: MandalaActivation[] = [];
        const planetKey = (p: string): MandalaPlanet | null => {
          const key = p.toLowerCase().replace(/\s+/g, "-");
          const valid: MandalaPlanet[] = ["sun", "earth", "moon", "north-node", "south-node", "mercury", "mars", "venus", "jupiter", "saturn", "uranus", "neptune", "pluto"];
          return valid.includes(key as MandalaPlanet) ? (key as MandalaPlanet) : null;
        };
        for (const a of chart.activations.personality) {
          const k = planetKey(a.planet); if (!k) continue;
          activations.push({ side: "personality", planet: k, gate: a.gate, line: a.line });
        }
        for (const a of chart.activations.design) {
          const k = planetKey(a.planet); if (!k) continue;
          activations.push({ side: "design", planet: k, gate: a.gate, line: a.line });
        }
        const pSun = chart.activations.personality.find((a) => a.planet === "Sun");
        const pEarth = chart.activations.personality.find((a) => a.planet === "Earth");
        const dSun = chart.activations.design.find((a) => a.planet === "Sun");
        const dEarth = chart.activations.design.find((a) => a.planet === "Earth");
        if (pSun && pEarth && dSun && dEarth) {
          const mandalaChart: MandalaChart = {
            clientName: brief.name,
            activations,
            cross: {
              personalitySun: pSun.gate, personalityEarth: pEarth.gate,
              designSun: dSun.gate, designEarth: dEarth.gate,
            },
            bodygraphSvg: chart.chartImageSvg,
          };
          const svg = renderCrossMandala(mandalaChart);
          crossMandalaPng = svgToPng(svg, { widthPx: 1600 });
          console.log(`\n  ✓ Cross Mandala rendered (${(crossMandalaPng.length / 1024).toFixed(0)} KB)`);
        }
      } catch (e) {
        console.log(`\n  ⚠ Cross Mandala render failed (docx will render without it): ${e instanceof Error ? e.message : e}`);
      }
    }

    console.log(`\nRendering branded .docx (with composite cover)…`);
    const buf = await renderReportDocx({
      markdown: result.text,
      clientName: brief.name,
      reportTitle,
      chart,
      dataPass,
      crossMandalaPng,
    });

    const docxCachePath = `.cache/reports/${brief.slug}-${outSuffix}.docx`;
    writeFileSync(docxCachePath, buf);

    const primaryDocxPath = resolve(primaryDir, `${versionPrefix}${nextV}.docx`);
    writeFileSync(primaryDocxPath, buf);
    console.log(`\n✓ branded .docx written (${(buf.length / 1024).toFixed(0)} KB):`);
    console.log(`    ${primaryDocxPath}`);
    console.log(`    (debug copy: ${resolve(docxCachePath)})`);
    console.log(`\n→ open in Finder:  open "${primaryDir}"`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
