/**
 * Apply a migration without a dashboard visit and without a password.
 *
 * Migrations used to need `supabase link`, which needs the database password,
 * which a note in DECISIONS.md said lived in a contractor's password vault.
 * Kaycee, 2026-09-12: "Oh no, I don't have any of Tennyson's passwords. He was
 * just a contractor helping to set all this up."
 *
 * She does not need them. A personal access token from her own Supabase account
 * is enough, and unlike a database password it is hers, revocable in one click,
 * and takes thirty seconds to make. With SUPABASE_ACCESS_TOKEN in .env.local
 * this applies any migration file on its own.
 *
 * Run:
 *   npx tsx scripts/apply-migration.ts supabase/migrations/20260912_birth_time_scan.sql
 *   npx tsx scripts/apply-migration.ts --pending     # everything not yet applied
 */

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";

function token(): string {
  const t = process.env.SUPABASE_ACCESS_TOKEN;
  if (!t) {
    console.error(
      "SUPABASE_ACCESS_TOKEN is not set.\n" +
      "Make one at https://supabase.com/dashboard/account/tokens and add it to .env.local.",
    );
    process.exit(1);
  }
  return t;
}

function projectRef(): string {
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!ref) { console.error("SUPABASE_PROJECT_REF is not set in .env.local."); process.exit(1); }
  return ref;
}

/** Run one statement batch against the project. */
async function run(sql: string): Promise<unknown> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef()}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return text; }
}

/**
 * A record of what has been applied, kept in the database itself so it is true
 * for everybody rather than true on one laptop.
 */
async function ensureLedger(): Promise<Set<string>> {
  await run(`
    create table if not exists public.applied_migrations (
      filename    text primary key,
      applied_at  timestamptz not null default now()
    );
    alter table public.applied_migrations enable row level security;
    drop policy if exists "service role only" on public.applied_migrations;
    create policy "service role only" on public.applied_migrations
      for all to service_role using (true) with check (true);
  `);
  const rows = await run(`select filename from public.applied_migrations;`) as { filename: string }[];
  return new Set((Array.isArray(rows) ? rows : []).map((r) => r.filename));
}

async function apply(file: string, done: Set<string>): Promise<void> {
  const name = file.replace(/^.*\//, "");
  if (done.has(name)) { console.log(`  already applied  ${name}`); return; }
  const sql = readFileSync(join(DIR, name), "utf8");
  await run(sql);
  await run(`insert into public.applied_migrations (filename) values ('${name.replace(/'/g, "''")}')
             on conflict (filename) do nothing;`);
  console.log(`  applied          ${name}`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Give a migration file, or --pending for everything outstanding.");
    process.exit(1);
  }
  const done = await ensureLedger();
  const files = arg === "--pending"
    ? readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()
    : [arg];

  console.log(`${files.length} migration file(s)`);
  for (const f of files) await apply(f, done);
  console.log("Done.");
}

main().catch((e) => {
  console.error(`\nCould not apply: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
