// Brings Kaycee's existing roster into public.charts as seed rows.
//
// Their real birth details live in scripts/client-roster.ts and their timezones
// were resolved by the provider when their charts were first cast, so both come
// from where they already are rather than being invented. Nothing is guessed: a
// person whose timezone cannot be resolved is reported and skipped, not filled
// in with a plausible-looking value.
//
// Idempotent. A chart already in the table is left alone, so this can be run
// again after adding somebody.
//
//   npx tsx scripts/seed-charts.ts --dry-run   # say what it would write
//   npx tsx scripts/seed-charts.ts             # write it

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { CLIENTS } from "./client-roster";

const DRY = process.argv.includes("--dry-run");

/** The timezone the provider resolved when this person's chart was cast. */
function cachedTimezone(slug: string): string | null {
  const p = resolve(".cache", "charts", `${slug}.json`);
  if (!existsSync(p)) return null;
  try {
    // It sits on the birth block, alongside the location query the provider
    // was actually given: {"timezone": "America/Denver", "locationQuery": "..."}
    const chart = JSON.parse(readFileSync(p, "utf8")) as { birth?: { timezone?: string } };
    return chart.birth?.timezone ?? null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: links, error } = await db
    .from("client_charts")
    .select("token, client_slug, client_name, revoked_at");
  if (error) throw new Error(`could not read client_charts: ${error.message}`);

  const live = (links ?? []).filter((l) => !l.revoked_at);
  const { data: already } = await db.from("charts").select("token");
  const have = new Set((already ?? []).map((r: { token: string }) => r.token));

  const rows: Record<string, unknown>[] = [];
  const skipped: string[] = [];

  for (const link of live) {
    if (have.has(link.token)) continue;
    const person = (CLIENTS as Record<string, {
      name: string; birthDate: string; birthTime: string; birthPlace: string;
    }>)[link.client_slug];
    if (!person) { skipped.push(`${link.client_slug}: not in the roster`); continue; }

    const tz = cachedTimezone(link.client_slug);
    if (!tz) { skipped.push(`${person.name}: no resolved timezone on file`); continue; }

    rows.push({
      person_name: person.name,
      birth_date: person.birthDate,
      birth_time: person.birthTime || null,
      birth_place: person.birthPlace,
      birth_timezone: tz,
      // Their times came to Kaycee the way a client's times come: told, not
      // documented. Anyone she knows to have a birth certificate can be moved
      // to 'document' from the dashboard later.
      time_accuracy: "told",
      tier: "seed",
      token: link.token,
    });
  }

  console.log(`  ${live.length} live charts | ${have.size} already seeded | ${rows.length} to write`);
  for (const s of skipped) console.log(`  ⚠ skipped ${s}`);

  if (!rows.length) { console.log("  nothing to do"); return; }
  if (DRY) {
    for (const r of rows.slice(0, 3)) console.log("   ", JSON.stringify(r));
    console.log(`  dry run: ${rows.length} rows not written`);
    return;
  }

  const { error: insErr } = await db.from("charts").insert(rows);
  if (insErr) throw new Error(`insert failed: ${insErr.message}`);

  const { count } = await db.from("charts").select("*", { count: "exact", head: true });
  console.log(`  wrote ${rows.length}; charts now holds ${count}`);
  if (skipped.length) {
    console.log(`  ${skipped.length} were skipped rather than guessed at; fix those and run again.`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
