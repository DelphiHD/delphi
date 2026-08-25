// Morning health digest — runs at 5 AM via LaunchAgent so Kaycee wakes up
// knowing whether the pipeline is green or which specific thing broke.
//
// Writes ~/Desktop/HD Reports/System Health.md and, if anything is red,
// fires a macOS notification. The report lists each check as PASS or FAIL
// with, on FAIL, a concrete fix command she can copy-paste.
//
// Runs before the 6 AM transit report deliberately: if Supabase is down or
// metadata is empty, she sees the alert before the day's transit fails.
//
// Usage:
//   npx tsx scripts/health-check.ts             # run + write report
//   npx tsx scripts/health-check.ts --dry-run   # print to stdout, don't touch disk

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { notifyMac } from "@/lib/notify";
import { verifyReportHtml } from "@/lib/report/verify";
import { castTransitBodygraph } from "@/lib/transit/sky";
import { invokeLLM } from "@/lib/llm/core";

type Check = {
  name: string;
  pass: boolean;
  detail: string;
  fix?: string;
};

// Pre-flight the two services the 6 AM report depends on, at 5 AM, so an outage
// (or a code break like the branded-SVG rename) is flagged BEFORE the report
// runs and fails. This is the exact pair that broke 2026-07-25.
async function checkChartApis(): Promise<Check> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { svg, positions } = await castTransitBodygraph(today, "12:00", "UTC");
    if (!svg || svg.length < 1000 || positions.length !== 13) {
      return { name: "Chart + LLM APIs", pass: false, detail: `branded bodygraph returned ${positions.length} bodies / ${svg?.length ?? 0} chars`, fix: "check lib/mybodygraph.ts branded-SVG path (brandedSvg / includeChartImage) and the mybodygraph API key" };
    }
    const r = await invokeLLM(
      { model: "claude-haiku-4-5", max_tokens: 10, system: "Reply with OK.", messages: [{ role: "user", content: "OK" }] },
      { apiKey: process.env.ANTHROPIC_API_KEY!, hardCostCeilingCents: 5 },
    );
    if (!r.text.trim()) return { name: "Chart + LLM APIs", pass: false, detail: "Anthropic returned empty", fix: "check ANTHROPIC_API_KEY and Anthropic status" };
    return { name: "Chart + LLM APIs", pass: true, detail: `branded bodygraph ok (${positions.length} bodies), Anthropic ok` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const lowCredit = /credit balance is too low|credit balance/i.test(msg);
    return {
      name: "Chart + LLM APIs",
      pass: false,
      detail: msg,
      fix: lowCredit
        ? "Anthropic credits are exhausted. Add credits at https://console.anthropic.com/settings/billing (only Kaycee can do this). Reports will resume automatically once topped up."
        : "an upstream API is failing; the report will be incomplete. Check mybodygraph / Anthropic status + keys.",
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// checks
// ────────────────────────────────────────────────────────────────────────────

async function checkSupabase(): Promise<Check> {
  try {
    const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { count, error } = await supa.from("chunks").select("*", { count: "exact", head: true });
    if (error) return { name: "Supabase reachable", pass: false, detail: error.message, fix: "Log into https://supabase.com/dashboard and check whether the project is paused." };
    if ((count ?? 0) === 0) return { name: "Supabase reachable", pass: false, detail: "chunks table has 0 rows", fix: "npx tsx scripts/sync-notion.ts" };
    return { name: "Supabase reachable", pass: true, detail: `chunks: ${count} rows` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name: "Supabase reachable", pass: false, detail: msg, fix: "Log into https://supabase.com/dashboard and check whether the project is paused." };
  }
}

async function checkMetadata(): Promise<Check> {
  try {
    const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const [chRes, gRes] = await Promise.all([
      supa.from("chunks").select("metadata").eq("source_kind", "channel"),
      supa.from("chunks").select("metadata").eq("source_kind", "gate"),
    ]);
    const chWithMeta = (chRes.data ?? []).filter((r) => Object.keys((r.metadata as object) ?? {}).length > 0).length;
    const gWithMeta = (gRes.data ?? []).filter((r) => Object.keys((r.metadata as object) ?? {}).length > 0).length;
    const chTotal = chRes.data?.length ?? 0;
    const gTotal = gRes.data?.length ?? 0;
    if (chWithMeta === 0 || gWithMeta === 0) {
      return {
        name: "Notion metadata populated",
        pass: false,
        detail: `channels: ${chWithMeta}/${chTotal} with metadata, gates: ${gWithMeta}/${gTotal}`,
        fix: "npx tsx scripts/sync-notion.ts",
      };
    }
    return { name: "Notion metadata populated", pass: true, detail: `channels: ${chWithMeta}/${chTotal}, gates: ${gWithMeta}/${gTotal}` };
  } catch (e) {
    return { name: "Notion metadata populated", pass: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function checkYesterdayTransit(): Check {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const day = d.toISOString().slice(0, 10);
  const path = resolve(homedir(), "Desktop", "HD Reports", "Transits", `${day} - Daily Transit Report.html`);
  // Completeness, not just existence: catches a report that generated but came
  // out gutted (no images, empty gate popups, Chiron/Lilith, etc.).
  const v = verifyReportHtml(path);
  return {
    name: `Yesterday's transit report (${day})`,
    pass: v.pass,
    detail: v.pass ? "complete (images, babies, gate popups all present)" : v.summary,
    fix: v.pass ? undefined : `TRANSIT_DATE=${day} ~/delphi/node_modules/.bin/tsx ~/delphi/scripts/transit-report.ts   # regenerate ${day}`,
  };
}

function checkYesterdayEchoes(): Check {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const day = d.toISOString().slice(0, 10);
  const path = resolve(homedir(), "Desktop", "HD Reports", "Transits", `${day} - Evening Echoes.html`);
  if (!existsSync(path)) {
    return {
      name: `Yesterday's Evening Echoes (${day})`,
      pass: false,
      detail: "file missing",
      fix: `bash ~/delphi/scripts/run-evening-echoes.sh   # regenerate for ${day}`,
    };
  }
  return { name: `Yesterday's Evening Echoes (${day})`, pass: true, detail: "present" };
}

function checkLaunchAgents(): Check {
  const agents = ["com.delphihd.transit-report", "com.delphihd.evening-echoes", "com.delphihd.delphi-pull"];
  const failing: string[] = [];
  const details: string[] = [];
  for (const a of agents) {
    try {
      const out = execSync(`launchctl list | grep ${a} || true`, { encoding: "utf8" }).trim();
      if (!out) {
        failing.push(a);
        details.push(`${a}: NOT LOADED`);
        continue;
      }
      const parts = out.split(/\s+/);
      const exitCode = parts[1];
      if (exitCode !== "0" && exitCode !== "-") {
        failing.push(a);
        details.push(`${a}: last exit ${exitCode}`);
      } else {
        details.push(`${a}: ok`);
      }
    } catch (e) {
      details.push(`${a}: probe error`);
    }
  }
  if (failing.length) {
    return {
      name: "LaunchAgents healthy",
      pass: false,
      detail: details.join(" · "),
      fix: `tail -60 ~/Library/Logs/${failing[0]}.log   # see what failed last`,
    };
  }
  return { name: "LaunchAgents healthy", pass: true, detail: details.join(" · ") };
}

function checkEnv(): Check {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "MYBODYGRAPH_API_KEY", "NOTION_TOKEN"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    return {
      name: "Critical env vars present",
      pass: false,
      detail: `missing: ${missing.join(", ")}`,
      fix: "check ~/delphi/.env.local",
    };
  }
  return { name: "Critical env vars present", pass: true, detail: `all ${required.length} present` };
}

// ────────────────────────────────────────────────────────────────────────────
// main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const checks: Check[] = [
    checkEnv(),
    await checkSupabase(),
    await checkMetadata(),
    await checkChartApis(),
    checkYesterdayTransit(),
    checkYesterdayEchoes(),
    checkLaunchAgents(),
  ];

  const failed = checks.filter((c) => !c.pass);
  const allGreen = failed.length === 0;
  const now = new Date().toISOString().replace("T", " ").slice(0, 16);

  const lines: string[] = [];
  lines.push(`# System Health — ${now} UTC`);
  lines.push("");
  if (allGreen) {
    lines.push("**✅ All systems healthy.**");
    lines.push("");
    lines.push("Every check passed. Start your HD work.");
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Details");
    lines.push("");
    for (const c of checks) lines.push(`- **${c.name}** — ${c.detail}`);
  } else {
    lines.push(`**⚠️ ${failed.length} of ${checks.length} checks failed.**`);
    lines.push("");
    lines.push("## Needs attention");
    lines.push("");
    for (const c of failed) {
      lines.push(`### ${c.name}`);
      lines.push(`- Detail: ${c.detail}`);
      if (c.fix) lines.push(`- Fix: \`${c.fix}\``);
      lines.push("");
    }
    lines.push("---");
    lines.push("");
    lines.push("## Passing checks");
    lines.push("");
    for (const c of checks.filter((x) => x.pass)) lines.push(`- **${c.name}** — ${c.detail}`);
  }

  const md = lines.join("\n") + "\n";

  if (dryRun) {
    console.log(md);
    return;
  }

  const outDir = resolve(homedir(), "Desktop", "HD Reports");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "System Health.md");
  writeFileSync(outPath, md);
  console.log(`✓ wrote ${outPath}`);
  console.log(`  ${allGreen ? "ALL GREEN" : `${failed.length} FAILURES`}`);

  if (!allGreen) {
    const credit = failed.find((c) => /credit balance/i.test(c.detail));
    notifyMac(
      credit
        ? {
            title: "⚠️ Delphi: Anthropic out of credits",
            subtitle: "Reports are paused until you top up",
            message: "Add credits: https://console.anthropic.com/settings/billing",
            sound: "Basso",
          }
        : {
            title: "⚠️ Delphi: system health failed",
            subtitle: `${failed.length} of ${checks.length} checks red`,
            message: failed.map((c) => c.name).join(", "),
            sound: "Basso",
          },
    );
  }
}

main().catch(async (e) => {
  console.error(e);
  try {
    const { notifyFailure } = await import("../lib/notify");
    notifyFailure("Health Check", e);
  } catch { /* notification best-effort */ }
  process.exit(1);
});
