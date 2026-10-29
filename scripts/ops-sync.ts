/**
 * Copy the Mac's operations logs into the cloud ops_log table.
 *
 * Safe to run any number of times: each line is keyed by its hash, so a line
 * already there is skipped. Runs once to bring the history up, and after each
 * report run to catch any line the script's own write missed (a killed run, a
 * dropped connection). The files stay where they are.
 *
 *   npx tsx scripts/ops-sync.ts            # copy, then say what the cloud holds
 *   npx tsx scripts/ops-sync.ts --check    # compare counts only, change nothing
 */
import { config } from "dotenv"; config({ path: ".env.local", override: true });
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { opsRow, writeOps, type OpsKind, type OpsRow } from "../lib/ops/record";

const LOGS: [OpsKind, string][] = [
  ["report_attempt", ".cache/reports/attempts.jsonl"],
  ["report_run", ".cache/reports/log.jsonl"],
  ["report_failure", ".cache/reports/failures.jsonl"],
  ["delivery", ".cache/reports/deliveries.jsonl"],
  ["chart_publish", ".cache/charts/changelog.jsonl"],
];

(async () => {
  const check = process.argv.includes("--check");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  let short = 0;
  for (const [kind, path] of LOGS) {
    const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n").map((l) => l.trim()).filter(Boolean) : [];
    const rows = lines.map((l) => opsRow(kind, l)).filter((r): r is OpsRow => !!r);
    const unique = new Map(rows.map((r) => [r.line_hash, r]));
    const all = [...unique.values()];
    if (!check) for (let i = 0; i < all.length; i += 500) await writeOps(all.slice(i, i + 500));
    const { count } = await db.from("ops_log").select("id", { count: "exact", head: true }).eq("kind", kind);
    const unread = lines.length - rows.length;
    const ok = (count ?? 0) >= unique.size;
    if (!ok) short++;
    console.log(`${ok ? "ok  " : "SHORT"} ${kind.padEnd(15)} file ${String(lines.length).padStart(4)} lines (${unique.size} distinct${unread ? `, ${unread} unreadable` : ""})  cloud ${count ?? 0}`);
  }
  if (short) { console.log(`\n${short} log(s) not fully in the cloud.`); process.exit(1); }
  console.log("\nEvery line on the Mac is in the cloud.");
})();
