/**
 * The synced HD library, from wherever this code happens to be running.
 *
 * The library lives in two places: the `chunks` table in Supabase, which the
 * Notion sync writes, and `.cache/chunks.json` on Kaycee's Mac, which is a dump
 * of the same rows. Every reader so far took the file, which is why building a
 * chart needed her laptop.
 *
 * This reads the table when the environment can reach it and falls back to the
 * file otherwise, so the same code builds a chart on her Mac and on a server.
 *
 * The two are the same DATA but not the same SHAPE: Notion multi-selects arrive
 * from Postgres as arrays (`["Pressure","Motor"]`) and sit in the file as the
 * comma-joined string the readers all expect (`"Pressure, Motor"`). Normalising
 * here means nothing downstream has to know which source it got.
 */

import { existsSync, readFileSync } from "node:fs";

export interface LibraryChunk {
  source_kind?: string;
  source_path?: string;
  slug?: string;
  title?: string;
  body?: string;
  gate_number?: number | null;
  line_number?: number | null;
  metadata?: Record<string, string>;
}

export const LOCAL_CACHE = ".cache/chunks.json";

/** Read once per process: a chart build asks several times over. */
let memo: LibraryChunk[] | null = null;

/**
 * Postgres hands back what Notion's own field types are underneath; the file
 * has already flattened them. Two cases, both seen in this library:
 *   multi-select  ["Pressure","Motor"]                    -> "Pressure, Motor"
 *   relation      [{id, kind, title: "Tribal: Ego"}]      -> "Tribal: Ego"
 * Numbers and plain strings pass through untouched, because the file keeps
 * those as they are and the readers expect it.
 */
function flatten(v: unknown): unknown {
  if (Array.isArray(v)) {
    return v.map((x) => flatten(x)).filter((x) => x !== "" && x !== null && x !== undefined).join(", ");
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const named = o.title ?? o.name ?? o.option ?? o.id;
    return named === undefined ? "" : String(named);
  }
  return v;
}

function normaliseMetadata(meta: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!meta || typeof meta !== "object") return out;
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    const f = flatten(v);
    if (f === "" ) continue;
    out[k] = f as string;
  }
  return out;
}

function fromFile(path: string): LibraryChunk[] | null {
  if (!existsSync(path)) return null;
  const d = JSON.parse(readFileSync(path, "utf8"));
  const rows = Array.isArray(d) ? d : (d.chunks ?? null);
  return rows ?? null;
}

/**
 * Every row, in pages. Supabase caps a select at 1000 by default and the
 * library is already past 850, so this pages rather than silently returning a
 * truncated library, which would look like missing source material rather than
 * a missing page.
 */
async function fromDatabase(): Promise<LibraryChunk[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const all: LibraryChunk[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await db
      .from("chunks")
      .select("source_kind, source_path, slug, title, body, gate_number, line_number, metadata")
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(`library read failed: ${error.message}`);
    for (const row of (data ?? []) as LibraryChunk[]) {
      all.push({ ...row, metadata: normaliseMetadata(row.metadata) });
    }
    if (!data || data.length < page) break;
  }
  return all.length ? all : null;
}

/**
 * The library, database first. Set HD_LIBRARY_LOCAL=1 to force the local copy
 * while working against a sync that has not been pushed yet.
 */
export async function loadLibraryChunks(opts: { preferLocal?: boolean } = {}): Promise<LibraryChunk[]> {
  if (memo) return memo;

  if (opts.preferLocal) {
    const local = fromFile(LOCAL_CACHE);
    if (local) return (memo = local);
  }

  const remote = await fromDatabase().catch((e) => {
    // A database that cannot be reached is not an empty library. Say so, then
    // try the file, so a chart build on her Mac survives a network blip.
    console.warn(`  library: database unavailable (${e instanceof Error ? e.message : e})`);
    return null;
  });
  if (remote) return (memo = remote);

  const local = fromFile(LOCAL_CACHE);
  if (local) return (memo = local);

  throw new Error(
    "no HD library available: the chunks table was unreachable and " +
    `${LOCAL_CACHE} is not on disk. Run the Notion sync, or set ` +
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
}

/** For tests and one-offs that want a clean read. */
export function resetLibraryCache(): void {
  memo = null;
}
