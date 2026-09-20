/**
 * Public figures: charts of well-known people, for teaching and content readings.
 *
 * Kaycee, 2026-09-14: Ra Uru Hu on the workshop's Origins page, "it would be nice
 * to have him in the roster anyways for educational purposes", and "I'll likely
 * start doing celebrity chart readings for content". Named "Public Figure" at her
 * request.
 *
 * Mirrors the website form and scripts/make-sandbox-charts.ts: a client_charts link
 * row, a charts row, then the builder with --publish, so the chart gets a live
 * link. No account, no email. Source "public-figure", which the dashboard labels
 * Public Figure and leaves out of the people count, and which no event room pulls.
 *
 * The birth place goes through the provider's own place list, the same one the
 * website form uses, so the timezone is the provider's and the chart always casts.
 *
 * Run:
 *   npx tsx scripts/add-public-figure.ts --name "Ra Uru Hu" --date 1948-04-09 --time 00:05 --place "Montreal, Quebec"
 *   npx tsx scripts/add-public-figure.ts --list
 */

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SOURCE = "public-figure";
const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : undefined; };

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function place(q: string): Promise<{ value: string; timezone: string }> {
  const key = process.env.MYBODYGRAPH_API_KEY;
  if (!key) throw new Error("MYBODYGRAPH_API_KEY is not set");
  const u = new URL("https://api.bodygraphchart.com/v210502/locations");
  u.searchParams.set("api_key", key);
  u.searchParams.set("query", q.slice(0, 80));
  const res = await fetch(u);
  if (!res.ok) throw new Error(`place lookup failed: ${res.status}`);
  const raw = (await res.json()) as { value?: string; timezone?: string }[];
  const hit = (Array.isArray(raw) ? raw : []).find((r) => r.value && r.timezone);
  if (!hit) throw new Error(`the provider does not know a place called "${q}"`);
  return { value: hit.value!, timezone: hit.timezone! };
}

async function main() {
  const d = db();
  if (args.includes("--list")) {
    const { data } = await d.from("charts").select("person_name, token").eq("source", SOURCE).order("person_name");
    console.log(`${(data ?? []).length} public figure chart(s)`);
    for (const r of data ?? []) console.log(`  ${String(r.person_name).padEnd(30)} https://charts.delphihd.com/c/${r.token}`);
    return;
  }

  const name = arg("--name"), date = arg("--date"), time = arg("--time"), where = arg("--place");
  const accuracy = arg("--accuracy") ?? "document";
  if (!name || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !time || !/^\d{2}:\d{2}$/.test(time) || !where) {
    throw new Error('needs --name "Full Name" --date YYYY-MM-DD --time HH:MM --place "City, Region"');
  }
  const p = await place(where);
  console.log(`${name}: ${date} ${time}, ${p.value} (${p.timezone})`);

  const existing = await d.from("charts").select("token").eq("person_name", name).eq("source", SOURCE).maybeSingle();
  let token = existing.data?.token as string | undefined;
  if (!token) {
    token = randomBytes(16).toString("hex");
    const link = await d.from("client_charts").insert({
      token, client_slug: token, client_name: name, storage_path: `${token}.html`,
    });
    if (link.error) throw new Error(`could not add the link: ${link.error.message}`);
    const row = await d.from("charts").insert({
      token, person_name: name, birth_date: date, birth_time: time,
      birth_place: p.value, birth_timezone: p.timezone,
      time_accuracy: accuracy, tier: "free", visibility: "public", source: SOURCE,
    });
    if (row.error) {
      await d.from("client_charts").delete().eq("token", token);
      throw new Error(`could not add the chart: ${row.error.message}`);
    }
  } else {
    console.log("  already in the funnel, rebuilding its chart");
  }

  const { runBuilder } = await import("@/scripts/energy-flow-diagram");
  await runBuilder(["--token", token, "--publish", "--no-png"]);
  console.log(`\n✓ ${name}: https://charts.delphihd.com/c/${token}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
