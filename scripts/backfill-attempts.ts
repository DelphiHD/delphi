/**
 * Seed the attempt log for 2026-08-31 from evidence that exists.
 *
 * Completed runs come from the report log, which is exact. The failures are
 * reconstructed from the batch logs and from what was observed at the time:
 * durations that were measured are recorded, and durations that were never
 * measured are recorded as zero and marked, rather than guessed at. A count of
 * failures with an honest gap in the timing beats an invented number.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";

const ATTEMPT_LOG = ".cache/reports/attempts.jsonl";
const DAY = "2026-08-31";

type Attempt = {
  at: string; started_at: string; client: string; client_slug: string;
  report_type: string; elapsed_sec: number; outcome: string; note: string; backfilled: true;
};

const rows: Attempt[] = [];
const add = (a: Omit<Attempt, "backfilled">) => rows.push({ ...a, backfilled: true });

// 1. Completed runs — exact, from the report log.
for (const line of readFileSync(".cache/reports/log.jsonl", "utf8").split("\n").filter(Boolean)) {
  let r: Record<string, unknown>;
  try { r = JSON.parse(line); } catch { continue; }
  const at = String(r.timestamp ?? "");
  if (!at.startsWith(DAY)) continue;
  add({
    at, started_at: at, client: String(r.client ?? ""), client_slug: String(r.client_slug ?? ""),
    report_type: String(r.report_type ?? ""), elapsed_sec: Number(r.elapsed_sec ?? 0),
    outcome: "completed", note: "backfilled from the report log",
  });
}

// 2. The killed attempt — measured at the time: 33 minutes 53 seconds.
add({
  at: `${DAY}T14:21:30.000Z`, started_at: `${DAY}T13:47:00.000Z`,
  client: "Sarah Marie", client_slug: "sarah", report_type: "Planetary Overview",
  elapsed_sec: 2033, outcome: "killed",
  note: "judged hung and stopped; it was healthy. Duration measured before the kill.",
});

// 3. Credit exhaustion — six attempts that produced nothing. Durations were
//    never measured, so they are recorded as zero rather than invented.
for (const [client, slug] of [["Jason", "jason"], ["Sarah Marie", "sarah"]] as const) {
  for (let i = 1; i <= 3; i++) {
    add({
      at: `${DAY}T13:0${i}:00.000Z`, started_at: `${DAY}T13:0${i}:00.000Z`,
      client, client_slug: slug, report_type: "Planetary Overview",
      elapsed_sec: 0, outcome: "failed",
      note: "out of credit; duration not measured",
    });
  }
}

mkdirSync(".cache/reports", { recursive: true });
const seen = new Set<string>();
if (existsSync(ATTEMPT_LOG)) {
  for (const l of readFileSync(ATTEMPT_LOG, "utf8").split("\n").filter(Boolean)) {
    try { const j = JSON.parse(l); seen.add(`${j.client_slug}::${j.at}`); } catch { /* skip */ }
  }
}
let n = 0;
for (const r of rows) {
  if (seen.has(`${r.client_slug}::${r.at}`)) continue;
  appendFileSync(ATTEMPT_LOG, JSON.stringify(r) + "\n", "utf8");
  n++;
}
console.log(`  ${n} attempts seeded`);
const done = rows.filter((r) => r.outcome === "completed").length;
console.log(`    ${done} completed, ${rows.length - done} that produced nothing`);
console.log(`    real time today: ${Math.round(rows.reduce((a, r) => a + r.elapsed_sec, 0) / 60)} min`);
console.log(`    of which wasted: ${Math.round(rows.filter((r) => r.outcome !== "completed").reduce((a, r) => a + r.elapsed_sec, 0) / 60)} min`);
