/**
 * Write the synced library to .cache/chunks.json.
 *
 * The transit report reads her library from that file. On her Mac the file has
 * always been there; on a fresh machine, which is what a GitHub runner is,
 * nothing has written it yet. This pulls the same rows the database holds and
 * lays them down in the shape the report expects, so the report grounds itself
 * in her words wherever it runs (Kaycee, 2026-09-28: the report runs in the
 * cloud from now on).
 *
 * Run:
 *   npx tsx scripts/cache-library.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { LOCAL_CACHE, loadLibraryChunks } from "@/lib/hd/chunks-source";

async function main() {
  const chunks = await loadLibraryChunks();
  if (!chunks.length) throw new Error("the library came back empty; nothing was written");
  mkdirSync(dirname(LOCAL_CACHE), { recursive: true });
  writeFileSync(LOCAL_CACHE, JSON.stringify(chunks));
  const kinds = new Map<string, number>();
  for (const c of chunks) kinds.set(c.source_kind ?? "?", (kinds.get(c.source_kind ?? "?") ?? 0) + 1);
  console.log(`✓ ${LOCAL_CACHE}: ${chunks.length} pages (${[...kinds].map(([k, n]) => `${k} ${n}`).join(", ")})`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
