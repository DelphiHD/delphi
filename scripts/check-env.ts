/**
 * Where every key has to live, and whether it is there.
 *
 * Kaycee, 2026-09-28: "Why are we not logging all of these keys and
 * functionality?" Because nobody wrote it down, and it cost her an evening: the
 * site's address was still a vercel.app from 141 days ago, and the mail key the
 * website needs was in no environment at all, so no sign-in email could ever
 * have arrived.
 *
 * This never prints a value. It prints presence, per place, and says what
 * breaks when something is missing. See docs/KEYS_AND_SERVICES.md.
 *
 * Run:
 *   npx tsx scripts/check-env.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

type Place = "mac" | "vercel" | "github";

interface Key {
  name: string;
  places: Place[];
  what: string;
  breaks: string;
}

const KEYS: Key[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", places: ["mac", "vercel", "github"], what: "the database and storage", breaks: "everything: charts, portal, reports" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", places: ["mac", "vercel", "github"], what: "server-side reads and writes", breaks: "publishing, the funnel, the transit report" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", places: ["vercel"], what: "signing in from a browser", breaks: "the portal and the login page" },
  { name: "NEXT_PUBLIC_SITE_URL", places: ["vercel"], what: "where sign-in links come back to", breaks: "magic links land on the wrong host and fail" },
  { name: "MYBODYGRAPH_API_KEY", places: ["mac", "vercel", "github"], what: "the chart provider", breaks: "every chart, the sky, the transit report" },
  { name: "ANTHROPIC_API_KEY", places: ["mac", "github"], what: "the writing", breaks: "reports and the transit narrative" },
  { name: "NOTION_TOKEN", places: ["mac", "github"], what: "the library sync", breaks: "her words stop reaching the database" },
  { name: "RESEND_API_KEY", places: ["mac", "vercel"], what: "sending mail", breaks: "chart emails, sign-in and reset emails" },
  { name: "RESEND_FROM_EMAIL", places: ["mac", "vercel"], what: "who mail comes from", breaks: "the same" },
  { name: "TRANSIT_LINK_KEY", places: ["mac", "vercel"], what: "the daily report's private link", breaks: "/t/<date> answers 404 to everyone" },
  { name: "SUPABASE_ACCESS_TOKEN", places: ["mac"], what: "applying migrations without the dashboard", breaks: "a migration needs her to paste SQL by hand" },
  { name: "SUPABASE_PROJECT_REF", places: ["mac"], what: "which project a migration goes to", breaks: "the same" },
];

const has = (hay: string[], name: string) => hay.includes(name);

function macKeys(): string[] {
  if (!existsSync(".env.local")) return [];
  return readFileSync(".env.local", "utf8").split("\n")
    .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=")[0].trim());
}

function shell(cmd: string): string {
  try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return ""; }
}

function vercelKeys(): string[] | null {
  const out = shell("vercel env ls production 2>/dev/null");
  if (!out.trim()) return null;
  return out.split("\n").map((l) => l.trim().split(/\s+/)[0]).filter((w) => /^[A-Z][A-Z0-9_]+$/.test(w));
}

function githubKeys(): string[] | null {
  const out = shell("gh secret list --repo DelphiHD/delphi 2>/dev/null");
  if (!out.trim()) return null;
  return out.split("\n").map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
}

function main() {
  const mac = macKeys();
  const vercel = vercelKeys();
  const github = githubKeys();
  const unreachable: string[] = [];
  if (vercel === null) unreachable.push("Vercel (is the vercel CLI signed in?)");
  if (github === null) unreachable.push("GitHub (is the gh CLI signed in?)");

  const missing: string[] = [];
  const rows = KEYS.map((k) => {
    const cell = (p: Place) => {
      if (!k.places.includes(p)) return "  ";
      const list = p === "mac" ? mac : p === "vercel" ? vercel : github;
      if (list === null) return " ?";
      const there = has(list, k.name);
      if (!there) missing.push(`${k.name} on ${p}: ${k.breaks}`);
      return there ? " ✓" : " ✗";
    };
    return `  ${k.name.padEnd(30)} ${cell("mac")}   ${cell("vercel")}   ${cell("github")}    ${k.what}`;
  });

  console.log(`\n  ${"key".padEnd(30)} mac  site  runner   what it is`);
  console.log(`  ${"-".repeat(30)} ---  ----  ------   ----------`);
  for (const r of rows) console.log(r);

  if (unreachable.length) console.log(`\n  not checked: ${unreachable.join(", ")}`);
  if (missing.length) {
    console.log(`\n  ${missing.length} missing:`);
    for (const m of missing) console.log(`    ✗ ${m}`);
    process.exitCode = 1;
  } else {
    console.log("\n  every key is where it needs to be.");
  }
}

main();
