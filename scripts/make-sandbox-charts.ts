/**
 * Sandbox charts: one of every type and definition, belonging to nobody.
 *
 * Kaycee, 2026-09-12: "will you create some sandbox test charts for each type
 * and definition... so we can easily test these changes on live charts that
 * don't belong to anybody when we're ready? That way we're not messing up
 * someone's actual chart."
 *
 * Every change to the builder today had to be looked at on a real chart, and
 * the only real charts are her clients'. These stand in for them: a full,
 * published, openable chart for each shape the builder has to draw, so a change
 * can be checked against a Reflector or a wide split without touching anybody.
 *
 * The birth data is copied from her roster, because a made-up birth time gives
 * a made-up chart and the point is to exercise real shapes. So although the
 * names are invented, the charts underneath are somebody's: they stay private,
 * and they are not for sharing.
 *
 * They carry source "sandbox", which the dashboard shows in its own colour and
 * leaves out of the people count. Kaycee: "differentiate them somehow on the
 * funnel so they aren't counted as actual clients."
 *
 * Run:
 *   npx tsx scripts/make-sandbox-charts.ts            # create and publish
 *   npx tsx scripts/make-sandbox-charts.ts --list     # what exists now
 *   npx tsx scripts/make-sandbox-charts.ts --remove   # take them all away
 */

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getChart } from "@/lib/mybodygraph";
import { readSplit } from "@/lib/hd/split-kind";
import type { Center } from "@/lib/hd/gate-center";

const SOURCE = "sandbox";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

const CENTER_FROM_API: Record<string, Center> = {
  head: "head", ajna: "ajna", throat: "throat", g: "g", heart: "heart",
  "solar plexus": "solar-plexus", sacral: "sacral", spleen: "spleen", root: "root",
};

/** "Manifesting Generator" -> "MG", so a name fits a column. */
const SHORT: Record<string, string> = {
  "Manifesting Generator": "MG",
  "Manifestor": "Manifestor",
  "Generator": "Generator",
  "Projector": "Projector",
  "Reflector": "Reflector",
};

/** "Split Definition" plus which kind of split, which no API reports. */
function shapeOf(definition: string, kind: string | null): string {
  // "No Definition" must not be trimmed to "No", which is what the first
  // version did and it produced "Sandbox Reflector No".
  if (/^no\b/i.test(definition.trim())) return "No Definition";
  const base = definition.replace(/\s*Definition\s*$/i, "").trim();
  if (!/split/i.test(base) || !kind) return base || "No Definition";
  return base === "Split" ? (kind === "simple" ? "Simple Split" : "Wide Split") : base;
}

async function main() {
  const mode = process.argv.includes("--remove") ? "remove"
    : process.argv.includes("--list") ? "list" : "make";
  const d = db();

  if (mode === "list" || mode === "remove") {
    const { data } = await d.from("charts").select("person_name, token").eq("source", SOURCE).order("person_name");
    const rows = data ?? [];
    console.log(`${rows.length} sandbox chart(s)`);
    for (const r of rows) console.log(`  ${String(r.person_name).padEnd(34)} https://charts.delphihd.com/c/${r.token}`);
    if (mode === "list" || !rows.length) return;
    for (const r of rows) {
      await d.from("charts").delete().eq("token", r.token);
      await d.from("client_charts").delete().eq("token", r.token);
    }
    console.log(`\nremoved ${rows.length}`);
    return;
  }

  // One of each shape, taken from the roster so the charts are real ones.
  const { data: roster } = await d.from("charts")
    .select("person_name, birth_date, birth_time, birth_timezone, birth_place")
    .eq("tier", "seed").order("person_name");

  const picked = new Map<string, { name: string; row: Record<string, unknown> }>();
  for (const p of roster ?? []) {
    const chart = await getChart({
      birthDate: String(p.birth_date),
      birthTime: String(p.birth_time ?? "12:00").slice(0, 5),
      timezone: String(p.birth_timezone),
      locationQuery: String(p.birth_place),
    });
    const split = readSplit({
      definedChannels: (chart.channels ?? []).map((c) => c.id),
      definedCenters: (chart.centers ?? []).filter((c) => c.defined).map((c) => CENTER_FROM_API[c.name]),
      gates: [...(chart.activations.personality ?? []), ...(chart.activations.design ?? [])].map((a) => a.gate),
    });
    const label = `Sandbox ${SHORT[chart.type.value] ?? chart.type.value} ${shapeOf(chart.definition.value, split.kind)}`;
    if (picked.has(label)) continue;
    picked.set(label, { name: label, row: p });
  }

  console.log(`${picked.size} shapes to make\n`);
  const { runBuilder } = await import("@/scripts/energy-flow-diagram");

  for (const [label, { row }] of [...picked.entries()].sort()) {
    const existing = await d.from("charts").select("token").eq("person_name", label).eq("source", SOURCE).maybeSingle();
    let token = existing.data?.token as string | undefined;
    if (!token) {
      token = randomBytes(16).toString("hex");
      await d.from("client_charts").insert({
        token, client_slug: token, client_name: label, storage_path: `${token}.html`,
      });
      await d.from("charts").insert({
        token, person_name: label,
        birth_date: row.birth_date, birth_time: row.birth_time,
        birth_place: row.birth_place, birth_timezone: row.birth_timezone,
        time_accuracy: "document", tier: "free", visibility: "private", source: SOURCE,
      });
    }
    await runBuilder(["--token", token, "--publish", "--no-png"]);
    console.log(`  ${label.padEnd(34)} https://charts.delphihd.com/c/${token}`);
  }
  console.log(`\nAll marked "sandbox" on the dashboard and left out of the people count.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
