/**
 * Seed the chart change log from the publish records that already exist.
 *
 * The log only starts recording when a chart is published with the new code, so
 * without this the Changes tab opens empty on a roster of 39 published charts.
 * These rows say when each chart was last published and nothing more, because
 * nothing more was kept: no previous version exists for anything published
 * before rollback copies existed, and there is no honest way to say what moved.
 * Rows written from here are marked so they are never mistaken for the real
 * thing.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const CHANGE_LOG = ".cache/charts/changelog.jsonl";

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await db
    .from("client_charts")
    .select("client_slug, client_name, updated_at, revoked_at")
    .order("updated_at", { ascending: true });
  if (error) throw new Error(error.message);

  mkdirSync(".cache/charts", { recursive: true });

  const already = new Set<string>();
  if (existsSync(CHANGE_LOG)) {
    for (const line of readFileSync(CHANGE_LOG, "utf8").split("\n").filter(Boolean)) {
      try { const j = JSON.parse(line); already.add(`${j.slug}::${j.at}`); } catch { /* skip */ }
    }
  }

  let written = 0;
  for (const row of data ?? []) {
    if (row.revoked_at) continue;
    const at = new Date(row.updated_at).toISOString();
    if (already.has(`${row.client_slug}::${at}`)) continue;
    appendFileSync(CHANGE_LOG, JSON.stringify({
      at,
      slug: row.client_slug,
      client: row.client_name,
      what: "published (before the change log existed)",
      rollback: "",
      backfilled: true,
    }) + "\n", "utf8");
    written++;
  }

  console.log(`  ${written} chart${written === 1 ? "" : "s"} seeded into the change log`);
}
main();
