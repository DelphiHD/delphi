/**
 * Write one operations-log line to the cloud as well as to the Mac's file.
 *
 * Phase 1 of docs/DASHBOARD_SPEC.md: the online dashboard reads ops_log, so
 * nothing it shows depends on Kaycee's laptop. The line is the same JSON the
 * script writes to its .jsonl file; line_hash (sha1 of that JSON) means the
 * script and scripts/ops-sync.ts can both write it and one row is kept.
 *
 * Never throws and never blocks a run: a report or a publish matters more
 * than its log line, and the backfill catches anything missed here.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export type OpsKind =
  | "report_attempt" | "report_run" | "report_failure"
  | "delivery" | "chart_publish" | "job_run";

export interface OpsRow { kind: OpsKind; at: string; client_slug: string | null; line_hash: string; data: unknown }

export function opsRow(kind: OpsKind, line: string): OpsRow | null {
  let data: Record<string, unknown>;
  try { data = JSON.parse(line); } catch { return null; }
  const at = String(data.at ?? data.timestamp ?? data.started_at ?? "");
  if (!at || Number.isNaN(Date.parse(at))) return null;
  const slug = data.client_slug ?? data.slug ?? null;
  return {
    kind, at, client_slug: slug == null ? null : String(slug),
    line_hash: createHash("sha1").update(`${kind}\n${line}`).digest("hex"),
    data,
  };
}

let db: ReturnType<typeof createClient> | null | undefined;
function client() {
  if (db !== undefined) return db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  db = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return db;
}

/** Upsert rows; returns how many the database now holds of them (0 on any failure). */
export async function writeOps(rows: OpsRow[]): Promise<number> {
  const c = client();
  if (!c || !rows.length) return 0;
  try {
    const { error } = await c.from("ops_log").upsert(rows as never[], { onConflict: "line_hash", ignoreDuplicates: true });
    return error ? 0 : rows.length;
  } catch { return 0; }
}

/** The one-line form for the scripts: the exact JSON they append to their file. */
export async function recordOps(kind: OpsKind, line: string): Promise<void> {
  const row = opsRow(kind, line.trim());
  if (row) await writeOps([row]);
}
