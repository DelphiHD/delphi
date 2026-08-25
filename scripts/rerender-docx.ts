// Re-render an existing client's .docx from their already-generated markdown.
//
// Use this when the markdown content is good but the visual rendering
// changed (new brand colors, new section images, new layout tweaks).
// Skips the expensive LLM step entirely; just re-fetches the chart from
// mybodygraph (free), rebuilds the DataPass (free), and re-renders the
// docx (free).
//
// Usage:
//   npx tsx scripts/rerender-docx.ts \
//     --name "Matt Hollingshead" \
//     --date 1984-04-08 --time 07:15 \
//     --place "Bountiful, Utah, United States"
//
// Optional flags:
//   --tier foundation|planetary|quickstart   (default: foundation)
//   --md   path to the source markdown       (default: ~/Desktop/HD Reports/<Name>/<Name> - <Tier> - v<latest>.md)

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";

import { getChart, getTimezoneForLocation } from "@/lib/mybodygraph";
import { buildDataPass } from "@/lib/chart/datapass";
import { renderReportDocx, svgToPng } from "@/lib/render/docx";
import { renderCrossMandala, renderFullMandala } from "@/lib/render/mandala";
import type { Activation as MandalaActivation, MandalaChart, Planet as MandalaPlanet } from "@/lib/render/mandala.types";

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

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (!flags.name || !flags.date || !flags.time || !flags.place) {
    console.error("usage: npx tsx scripts/rerender-docx.ts --name \"...\" --date YYYY-MM-DD --time HH:MM --place \"...\" [--tier foundation|planetary|quickstart] [--md <path>]");
    process.exit(1);
  }

  const tier = (flags.tier || "foundation").toLowerCase() as "foundation" | "planetary" | "quickstart";
  const kindLabel = tier === "foundation" ? "Foundation" : tier === "planetary" ? "Planetary Overview" : "Quickstart";
  const reportTitle = tier === "foundation" ? "Human Design Analysis"
                    : tier === "planetary"  ? "Planetary Overview"
                    :                          "Quickstart";

  // Resolve the source markdown: explicit --md flag, else find the latest
  // version in the client's HD Reports folder. Kaycee reorganized 5/26 so
  // active client deliverables live under "Paid HD Reports/<Name>/". Try
  // that path first, fall back to the legacy flat structure for older
  // clients. HD_REPORTS_DIR env var overrides everything.
  const clientDir = process.env.HD_REPORTS_DIR ?? (() => {
    const paid = resolve(homedir(), "Desktop", "HD Reports", "Paid HD Reports", flags.name);
    if (existsSync(paid)) return paid;
    return resolve(homedir(), "Desktop", "HD Reports", flags.name);
  })();
  let mdPath = flags.md;
  if (!mdPath) {
    if (!existsSync(clientDir)) {
      console.error(`Client folder not found: ${clientDir}`);
      process.exit(1);
    }
    const prefix = `${flags.name} - ${kindLabel} - v`;
    let maxV = 0;
    let chosen: string | null = null;
    for (const f of readdirSync(clientDir)) {
      if (!f.startsWith(prefix) || !f.endsWith(".md")) continue;
      const m = f.slice(prefix.length, -3).match(/^(\d+)/);
      if (m && parseInt(m[1], 10) >= maxV) {
        maxV = parseInt(m[1], 10);
        chosen = resolve(clientDir, f);
      }
    }
    if (!chosen) {
      console.error(`No markdown found in ${clientDir} matching "${prefix}<N>.md". Use --md to point at a file.`);
      process.exit(1);
    }
    mdPath = chosen;
  }
  console.log(`Using markdown: ${mdPath}`);

  // Fetch chart + dataPass (cheap, no LLM).
  console.log(`Fetching chart from mybodygraph…`);
  const tz = await getTimezoneForLocation(flags.place);
  const chart = await getChart({
    birthDate: flags.date,
    birthTime: flags.time,
    timezone: tz,
    locationQuery: flags.place,
    includeChartImage: true,
  });
  console.log(`  ${chart.type.value} | ${chart.profile.value} | ${chart.authority.value} | ${chart.definition.value}`);

  console.log(`Building Data Pass…`);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const dataPass = await buildDataPass({ supabase, client: { name: flags.name }, chart });

  const md = readFileSync(mdPath, "utf8");

  // Planetary Overview: route through the PO-specific renderer, NOT the
  // generic one. See the same comment in generate-report.ts for why. The
  // PO renderer reads its markdown from .cache/reports/{slug}-planetary.md,
  // so we stage the source md there before spawning it.
  if (tier === "planetary") {
    const slugFromName = flags.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").split("-")[0];
    const { spawnSync } = await import("node:child_process");
    const { writeFileSync: wfs, mkdirSync: mds } = await import("node:fs");
    mds(".cache/reports", { recursive: true });
    wfs(`.cache/reports/${slugFromName}-planetary.md`, md);
    console.log(`Rendering branded .docx via scripts/render-planetary-docx.ts (PO-specific renderer)…`);
    const res = spawnSync("./node_modules/.bin/tsx", ["scripts/render-planetary-docx.ts", slugFromName], { stdio: "inherit", cwd: process.cwd() });
    if (res.status !== 0) { console.error(`\n✗ render-planetary-docx.ts exited with code ${res.status}`); process.exit(1); }
    return;
  }

  // Cross Mandala (inline) + Full Mandala (cover) for Planetary Overviews.
  let crossMandalaPng: Buffer | undefined;
  let coverMandalaPng: Buffer | undefined;
  if (tier === "planetary" && chart.chartImageSvg) {
    try {
      const activations: MandalaActivation[] = [];
      const planetKey = (p: string): MandalaPlanet | null => {
        const key = p.toLowerCase().replace(/\s+/g, "-");
        const valid: MandalaPlanet[] = ["sun", "earth", "moon", "north-node", "south-node", "mercury", "mars", "venus", "jupiter", "saturn", "uranus", "neptune", "pluto"];
        return valid.includes(key as MandalaPlanet) ? (key as MandalaPlanet) : null;
      };
      for (const a of chart.activations.personality) { const k = planetKey(a.planet); if (k) activations.push({ side: "personality", planet: k, gate: a.gate, line: a.line }); }
      for (const a of chart.activations.design)      { const k = planetKey(a.planet); if (k) activations.push({ side: "design",      planet: k, gate: a.gate, line: a.line }); }
      const pSun = chart.activations.personality.find((a) => a.planet === "Sun");
      const pEarth = chart.activations.personality.find((a) => a.planet === "Earth");
      const dSun = chart.activations.design.find((a) => a.planet === "Sun");
      const dEarth = chart.activations.design.find((a) => a.planet === "Earth");
      if (pSun && pEarth && dSun && dEarth) {
        const mandalaChart: MandalaChart = {
          clientName: flags.name, activations,
          cross: { personalitySun: pSun.gate, personalityEarth: pEarth.gate, designSun: dSun.gate, designEarth: dEarth.gate },
          bodygraphSvg: chart.chartImageSvg,
        };
        const svg = renderCrossMandala(mandalaChart);
        crossMandalaPng = svgToPng(svg, { widthPx: 1600 });
        console.log(`  ✓ Cross Mandala rendered (${(crossMandalaPng.length / 1024).toFixed(0)} KB)`);
        const fullSvg = renderFullMandala(mandalaChart, { size: 1600 });
        coverMandalaPng = svgToPng(fullSvg, { widthPx: 1600 });
        console.log(`  ✓ Full Mandala (cover) rendered (${(coverMandalaPng.length / 1024).toFixed(0)} KB)`);
      }
    } catch (e) {
      console.log(`  ⚠ Cross Mandala render failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`Rendering branded .docx…`);
  const buf = await renderReportDocx({
    markdown: md,
    clientName: flags.name,
    reportTitle,
    chart,
    dataPass,
    crossMandalaPng,
    coverMandalaPng,
  });

  // Write a NEW version so the original isn't overwritten — easier to
  // compare side-by-side and to roll back if the new visuals are off.
  mkdirSync(clientDir, { recursive: true });
  const prefix = `${flags.name} - ${kindLabel} - v`;
  let nextV = 1;
  for (const f of readdirSync(clientDir)) {
    if (!f.startsWith(prefix) || !f.endsWith(".docx")) continue;
    const m = f.slice(prefix.length, -5).match(/^(\d+)/);
    if (m) nextV = Math.max(nextV, parseInt(m[1], 10) + 1);
  }
  const outDocx = resolve(clientDir, `${prefix}${nextV}.docx`);
  writeFileSync(outDocx, buf);
  console.log(`\n✓ branded .docx written (${(buf.length / 1024).toFixed(0)} KB):`);
  console.log(`    ${outDocx}`);
  console.log(`\n→ open in Finder:  open "${clientDir}"`);
}

main().catch((e) => { console.error(e); process.exit(1); });
