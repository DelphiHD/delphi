/**
 * Phase 3 V1 sync.
 *
 * Reads the HD Database Directory in Notion, walks every database tagged
 * `Sync to Delphi`, embeds the content with OpenAI text-embedding-3-small,
 * and writes chunks into Supabase's `chunks` table.
 *
 * Run manually:  npx tsx scripts/sync-notion.ts
 *
 * Idempotent: per source_kind, deletes existing rows and re-inserts. Safe to
 * run repeatedly. Total cost per full sync is ~$0.02 of OpenAI embeddings.
 *
 * V1 limitations (intentional, removed in V2):
 *   - No markdown-to-disk step; chunk bodies live only in the `chunks` table.
 *   - No GitHub commit step; the canonical content store is Postgres for now.
 *   - No edge function; embedding runs locally. (Means OPENAI_API_KEY only
 *     needs to be in .env.local, not Supabase secrets, until V2.)
 *   - Runs only when invoked manually; cron wiring is V2.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { Client as NotionClient, isFullPage, isFullBlock } from "@notionhq/client";
import OpenAI from "openai";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const DIRECTORY_ID = "2f1e3fadcaaa80a1a496fb4f22abbb8d";
const FIREWALL_NAMES = new Set(["Reference Files", "HD Readings"]);
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIM = 1536;
const CHECKPOINT_PATH = ".cache/chunks.json";
const CHECKPOINT_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
const NOTION_RPS_MS = 550; // Notion's published limit is 3 req/s; we run slower to avoid 504s from Cloudflare.
const NOTION_MAX_RETRIES = 5;

const notion = new NotionClient({
  auth: must("NOTION_TOKEN"),
  timeoutMs: 120_000, // default is 60s; some HD pages have deep nesting
});
const openai = new OpenAI({ apiKey: must("OPENAI_API_KEY") });
const supabase = createSupabaseClient(
  must("NEXT_PUBLIC_SUPABASE_URL"),
  must("SUPABASE_SERVICE_ROLE_KEY"),
);

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notion rate limiter
// ─────────────────────────────────────────────────────────────────────────────

let lastNotionAt = 0;
async function throttle() {
  const elapsed = Date.now() - lastNotionAt;
  if (elapsed < NOTION_RPS_MS) {
    await sleep(NOTION_RPS_MS - elapsed);
  }
  lastNotionAt = Date.now();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Notion helpers
// ─────────────────────────────────────────────────────────────────────────────

function plainText(rich: any[] | undefined): string {
  return (rich ?? []).map((r) => r.plain_text ?? "").join("");
}

function pageTitle(page: any): string {
  const titleProp = Object.values(page.properties ?? {}).find(
    (p: any) => p?.type === "title",
  ) as any;
  return plainText(titleProp?.title);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "untitled";
}

// Explicit mapping from directory row name → source_kind. Explicit because
// naive singularization mangles words like "Authorities" → "authoritie" and
// "Crosses" → "crosse", and because some Notion row names are typos
// (Kaycee has "HD Definiton") or compound words we want flattened
// (Incarnation Crosses → cross). The kind taxonomy is documented in
// docs/CONTEXT.md.
const KIND_MAP: Record<string, string> = {
  "HD Gates": "gate",
  "HD The Line Companion": "line", // overridden inside syncLineCompanion; harmless here
  "HD Channels": "channel",
  "HD Centers": "center",
  "HD Types": "type",
  "HD Authorities": "authority",
  "HD Profiles": "profile",
  "HD Variables": "variable",
  "HD Channel Types": "channel_type",
  "HD Definiton": "definition",
  "HD Definition": "definition",
  "HD Circuits": "circuit",
  "HD Planets": "planet",
  "HD Incarnation Crosses": "cross",
  "HD Profile Lines": "profile_line",
  "HD Geometry": "geometry",
  "HD Quarters": "quarter",
};

function nameToKind(name: string): string {
  if (KIND_MAP[name]) return KIND_MAP[name];
  // Fallback for any new database Kaycee adds before this map is updated.
  // Not perfect; log so we notice.
  const guess = name
    .replace(/^HD\s+/, "")
    .replace(/^The\s+/i, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  console.warn(`  ⚠ No KIND_MAP entry for "${name}"; falling back to "${guess}"`);
  return guess;
}

// Notion SDK v5 split database query into the "data source" concept. Each
// database has one or more data sources; rows are queried against a data
// source id, not the database id directly. Cache the lookup so we only pay
// the retrieve cost once per database per run.
const dataSourceCache = new Map<string, string>();
async function getDataSourceId(databaseId: string): Promise<string> {
  if (dataSourceCache.has(databaseId)) return dataSourceCache.get(databaseId)!;
  await throttle();
  const db = await notion.databases.retrieve({ database_id: databaseId });
  const sources = (db as any).data_sources ?? [];
  if (sources.length === 0) {
    throw new Error(`database ${databaseId} has no data sources`);
  }
  const id = sources[0].id;
  dataSourceCache.set(databaseId, id);
  return id;
}

async function queryDataSource(databaseId: string, params: { start_cursor?: string; page_size?: number; filter?: any } = {}): Promise<any> {
  const dataSourceId = await getDataSourceId(databaseId);
  await throttle();
  return notion.dataSources.query({
    data_source_id: dataSourceId,
    start_cursor: params.start_cursor,
    page_size: params.page_size ?? 100,
    filter: params.filter,
  });
}

function isRetriable(e: any): { yes: boolean; reason: string } {
  if (e?.code === "notionhq_client_request_timeout") return { yes: true, reason: "timeout" };
  if (e?.code === "notionhq_client_response_error") {
    const s = e?.status ?? 0;
    if (s === 429 || s === 502 || s === 503 || s === 504) return { yes: true, reason: `http ${s}` };
  }
  return { yes: false, reason: "" };
}

async function getChildren(blockId: string): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined;
  let attempt = 0;
  while (true) {
    try {
      do {
        await throttle();
        const resp = await notion.blocks.children.list({
          block_id: blockId,
          start_cursor: cursor,
          page_size: 100,
        });
        all.push(...resp.results);
        cursor = resp.next_cursor || undefined;
      } while (cursor);
      return all;
    } catch (e: any) {
      // ai_block / linked-database: subtree is opaque. Return what we have.
      if (e?.code === "validation_error" && /not supported via the API/i.test(e?.message ?? "")) {
        console.warn(`  ⚠ block ${blockId.slice(0, 8)}… contains an unsupported block type; skipping (${e.message.replace(/Block type /, "")})`);
        return all;
      }
      // Transient infra failures (timeout, 5xx, 429). Exponential backoff.
      const { yes, reason } = isRetriable(e);
      if (yes && attempt < NOTION_MAX_RETRIES) {
        attempt += 1;
        const waitMs = 1500 * 2 ** attempt; // 3s, 6s, 12s, 24s, 48s
        console.warn(`  ⚠ ${reason} on block ${blockId.slice(0, 8)}… retry ${attempt}/${NOTION_MAX_RETRIES} after ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }
      throw e;
    }
  }
}

// Render a list of Notion blocks (recursively) into plain markdown-ish text.
// We keep it loose: this content becomes embedding input + chunk body, not a
// rendered Markdown file. Headings stay as headings; lists keep their bullets;
// other block types fall back to their text content.
async function renderBlocks(blocks: any[]): Promise<string> {
  const parts: string[] = [];
  for (const b of blocks) {
    if (!isFullBlock(b)) continue;
    const t = b.type;
    const obj = (b as any)[t] || {};
    const text = plainText(obj.rich_text);
    let rendered = "";
    switch (t) {
      case "heading_1": rendered = `# ${text}`; break;
      case "heading_2": rendered = `## ${text}`; break;
      case "heading_3": rendered = `### ${text}`; break;
      case "paragraph": rendered = text; break;
      case "bulleted_list_item": rendered = `- ${text}`; break;
      case "numbered_list_item": rendered = `1. ${text}`; break;
      case "to_do": rendered = `- [${obj.checked ? "x" : " "}] ${text}`; break;
      case "quote": rendered = `> ${text}`; break;
      case "callout": rendered = text; break;
      case "toggle": rendered = `**${text}**`; break;
      case "code": rendered = "```\n" + text + "\n```"; break;
      case "divider": rendered = "---"; break;
      case "synced_block": rendered = ""; break;
      case "unsupported": rendered = ""; break;
      default: rendered = text;
    }
    if (rendered) parts.push(rendered);
    // Don't recurse into block types whose content the API can't return.
    // unsupported = opaque (e.g., linked databases); synced_block = handled
    // specially in the Line Companion path or duplicates content elsewhere.
    const skipRecursion = t === "unsupported" || t === "synced_block";
    if (b.has_children && !skipRecursion) {
      const kids = await getChildren(b.id);
      const child = await renderBlocks(kids);
      if (child) parts.push(child);
    }
  }
  return parts.filter(Boolean).join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Chunk model
// ─────────────────────────────────────────────────────────────────────────────

interface Chunk {
  source_path: string;
  source_kind: string;
  source_origin: string | null;
  notion_database_id: string;
  notion_page_id: string;
  notion_block_id: string | null;
  slug: string;
  title: string;
  body: string;
  gate_number: number | null;
  line_number: number | null;
  embedding?: number[];
  tokens?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database sync strategies
// ─────────────────────────────────────────────────────────────────────────────

// Standard: every database row becomes one chunk. Title + page body.
async function syncStandardDatabase(
  databaseId: string,
  kind: string,
): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  let cursor: string | undefined;
  do {
    const resp = await queryDataSource(databaseId, { start_cursor: cursor });
    for (const page of resp.results) {
      if (!isFullPage(page)) continue;
      const title = pageTitle(page);
      const blocks = await getChildren(page.id);
      const rendered = await renderBlocks(blocks);
      const body = title ? `# ${title}\n\n${rendered}` : rendered;
      if (!body.trim()) continue;
      const slug = slugify(title) || page.id.slice(0, 8);
      // Heuristic: pull a leading number from the title as gate_number for
      // gate-like content (e.g., "21 - The Biter").
      const m = title.match(/^(\d+)\b/);
      const gate = m ? parseInt(m[1], 10) : null;
      chunks.push({
        source_path: `content/${kind}/${slug}.md`,
        source_kind: kind,
        source_origin: null,
        notion_database_id: databaseId,
        notion_page_id: page.id,
        notion_block_id: null,
        slug,
        title,
        body,
        gate_number: gate,
        line_number: null,
      });
    }
    cursor = resp.next_cursor || undefined;
  } while (cursor);
  return chunks;
}

// Special: HD The Line Companion. Each row is a gate (e.g. "LC 62"); the body
// is `synced_block → callout → 7 toggles`. Each toggle becomes one chunk.
async function syncLineCompanion(databaseId: string): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  let cursor: string | undefined;
  do {
    const resp = await queryDataSource(databaseId, { start_cursor: cursor });
    for (const page of resp.results) {
      if (!isFullPage(page)) continue;
      const title = pageTitle(page); // e.g., "LC 62"
      const gateMatch = title.match(/(\d+)/);
      if (!gateMatch) {
        console.warn(`  ⚠ Line Companion row "${title}" has no gate number; skipping`);
        continue;
      }
      const gateNumber = parseInt(gateMatch[1], 10);

      const topBlocks = await getChildren(page.id);
      const synced = topBlocks.find((b: any) => b.type === "synced_block");
      if (!synced) {
        console.warn(`  ⚠ Gate ${gateNumber}: no synced_block on page`);
        continue;
      }
      const syncedChildren = await getChildren(synced.id);
      const callout = syncedChildren.find((b: any) => b.type === "callout");
      if (!callout) {
        console.warn(`  ⚠ Gate ${gateNumber}: no callout inside synced_block`);
        continue;
      }
      const toggles = await getChildren(callout.id);

      for (const toggle of toggles) {
        if (toggle.type !== "toggle") continue;
        const toggleTitle = plainText(toggle.toggle?.rich_text);
        let lineNumber: number | null = null;
        // Main Hexagram toggles appear with two label conventions:
        //   "HEXAGRAM 62  PREPONDERANCE OF THE SMALL"  (most gates)
        //   "Main Hexagram"                           (some gates)
        if (/^(HEXAGRAM|MAIN\s*HEXAGRAM)\b/i.test(toggleTitle)) {
          lineNumber = 0;
        } else {
          const lm = toggleTitle.match(/^\d+\.(\d)/);
          if (lm) lineNumber = parseInt(lm[1], 10);
        }
        if (lineNumber === null) {
          console.warn(`  ⚠ Gate ${gateNumber}: can't parse line from "${toggleTitle}"`);
          continue;
        }
        const toggleBody = await renderBlocks(await getChildren(toggle.id));
        if (!toggleBody.trim()) continue;
        const slug = `${gateNumber}-${lineNumber}`;
        chunks.push({
          source_path: `content/line/${slug}.md`,
          source_kind: "line",
          source_origin: "Ra",
          notion_database_id: databaseId,
          notion_page_id: page.id,
          notion_block_id: toggle.id,
          slug,
          title: toggleTitle,
          body: `# ${toggleTitle}\n\n${toggleBody}`,
          gate_number: gateNumber,
          line_number: lineNumber,
        });
      }
    }
    cursor = resp.next_cursor || undefined;
  } while (cursor);
  return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Directory resolution
// ─────────────────────────────────────────────────────────────────────────────

interface Target {
  rowName: string;
  kind: string;
  databaseId: string;
  isLineCompanion: boolean;
}

async function resolveTargets(): Promise<Target[]> {
  const dirResp = await queryDataSource(DIRECTORY_ID, {
    filter: { property: "Sync to Delphi", checkbox: { equals: true } },
  });

  const targets: Target[] = [];
  for (const row of dirResp.results) {
    if (!isFullPage(row)) continue;
    const name = pageTitle(row);
    if (FIREWALL_NAMES.has(name)) {
      console.warn(`  ⚠ Skipping ${name} (firewalled)`);
      continue;
    }

    // Try inline child_database first.
    const rowBlocks = await getChildren(row.id);
    const inline = rowBlocks.find((b: any) => b.type === "child_database");
    let databaseId: string | null = inline?.id ?? null;

    // Fallback: search Notion for a data source matching the row name. Notion
    // SDK v5+ exposes data sources rather than databases here. The result's
    // `id` is the data-source id; `parent.database_id` is the database it
    // belongs to. We cache both so subsequent queryDataSource calls skip the
    // databases.retrieve roundtrip.
    if (!databaseId) {
      await throttle();
      const search = await notion.search({
        query: name,
        filter: { property: "object", value: "data_source" },
        page_size: 10,
      });
      const match: any = search.results.find((r: any) => {
        if (r.object !== "data_source") return false;
        return plainText(r.title) === name;
      });
      if (match) {
        databaseId = match.parent?.database_id ?? null;
        if (databaseId) dataSourceCache.set(databaseId, match.id);
      }
    }

    if (!databaseId) {
      console.warn(`  ✗ Could not resolve database for "${name}"`);
      continue;
    }

    targets.push({
      rowName: name,
      kind: nameToKind(name),
      databaseId,
      isLineCompanion: /line\s+companion/i.test(name),
    });
  }
  return targets;
}

// ─────────────────────────────────────────────────────────────────────────────
// Embedding + persistence
// ─────────────────────────────────────────────────────────────────────────────

async function embedChunks(chunks: Chunk[]): Promise<void> {
  const BATCH = 100;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const inputs = batch.map((c) =>
      `${c.title}\n\n${c.body}`.slice(0, 8000),
    );
    const resp = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: inputs,
    });
    for (let j = 0; j < batch.length; j++) {
      const emb = resp.data[j].embedding;
      if (emb.length !== EMBED_DIM) {
        throw new Error(`unexpected embedding dim ${emb.length}`);
      }
      batch[j].embedding = emb;
      batch[j].tokens = Math.ceil(inputs[j].length / 4); // rough; replace with tiktoken later
    }
    process.stdout.write(
      `  embedded ${Math.min(i + BATCH, chunks.length)}/${chunks.length}\r`,
    );
  }
  process.stdout.write("\n");
}

async function persistChunks(chunks: Chunk[]): Promise<void> {
  // Group by kind so we can replace one kind at a time. Cleaner audit trail
  // and means a partial sync of one kind doesn't leave orphans of another.
  const byKind = new Map<string, Chunk[]>();
  for (const c of chunks) {
    if (!byKind.has(c.source_kind)) byKind.set(c.source_kind, []);
    byKind.get(c.source_kind)!.push(c);
  }

  for (const [kind, group] of byKind) {
    process.stdout.write(`  persisting ${group.length} ${kind} chunks…`);

    // Delete old chunks of this kind, then insert the fresh batch. Atomic
    // would be nicer but PostgREST doesn't expose transactions; in practice a
    // brief gap during the swap is acceptable (sync runs at off-hours).
    const { error: delErr } = await supabase
      .from("chunks")
      .delete()
      .eq("source_kind", kind);
    if (delErr) {
      console.error(`\n  ✗ delete failed for ${kind}:`, delErr);
      throw delErr;
    }

    // Insert in batches of 50 (PostgREST has request-size limits and our
    // bodies + embeddings are roughly 10-30 KB each).
    const INS = 50;
    for (let i = 0; i < group.length; i += INS) {
      const slice = group.slice(i, i + INS).map((c) => ({
        source_path: c.source_path,
        source_kind: c.source_kind,
        source_origin: c.source_origin,
        notion_database_id: c.notion_database_id,
        notion_page_id: c.notion_page_id,
        notion_block_id: c.notion_block_id,
        slug: c.slug,
        title: c.title,
        body: c.body,
        tokens: c.tokens,
        gate_number: c.gate_number,
        line_number: c.line_number,
        embedding: c.embedding,
      }));
      const { error: insErr } = await supabase.from("chunks").insert(slice);
      if (insErr) {
        console.error(`\n  ✗ insert failed for ${kind} batch ${i / INS}:`, insErr);
        throw insErr;
      }
    }
    process.stdout.write(" done\n");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function loadCheckpoint(): Promise<Chunk[] | null> {
  try {
    const s = await stat(CHECKPOINT_PATH);
    const age = Date.now() - s.mtimeMs;
    if (age > CHECKPOINT_MAX_AGE_MS) {
      console.log(`  (checkpoint is ${Math.round(age / 60_000)} min old — ignoring)`);
      return null;
    }
    const data = JSON.parse(await readFile(CHECKPOINT_PATH, "utf8"));
    return data.chunks as Chunk[];
  } catch {
    return null;
  }
}

async function saveCheckpoint(chunks: Chunk[]): Promise<void> {
  await mkdir(dirname(CHECKPOINT_PATH), { recursive: true });
  await writeFile(
    CHECKPOINT_PATH,
    JSON.stringify({ savedAt: new Date().toISOString(), chunks }, null, 0),
  );
}

async function main() {
  console.log("Phase 3 sync starting");

  // Resume from a previous Notion walk if one is fresh on disk. Lets us
  // recover from OpenAI / Supabase failures without re-paying the 10-minute
  // Notion roundtrip.
  let allChunks: Chunk[] | null = await loadCheckpoint();
  if (allChunks) {
    console.log(`Resuming from checkpoint: ${allChunks.length} chunks already extracted`);
  } else {
    console.log("\nResolving tagged databases…");
    const targets = await resolveTargets();
    console.log(`Resolved ${targets.length} target databases:`);
    for (const t of targets) {
      console.log(`  • ${t.rowName.padEnd(28)} → kind=${t.kind}${t.isLineCompanion ? "  [line companion]" : ""}`);
    }

    console.log("\nExtracting chunks from Notion…");
    allChunks = [];
    for (const t of targets) {
      process.stdout.write(`  ${t.rowName.padEnd(28)} … `);
      const chunks = t.isLineCompanion
        ? await syncLineCompanion(t.databaseId)
        : await syncStandardDatabase(t.databaseId, t.kind);
      console.log(`${chunks.length} chunks`);
      allChunks.push(...chunks);
    }
    console.log(`Total: ${allChunks.length} chunks`);
    await saveCheckpoint(allChunks);
    console.log(`Checkpoint saved to ${CHECKPOINT_PATH}`);
  }

  if (allChunks.length === 0) {
    console.log("Nothing to embed. Exiting.");
    return;
  }

  console.log("\nEmbedding with OpenAI text-embedding-3-small…");
  await embedChunks(allChunks);

  console.log("\nPersisting to Supabase…");
  await persistChunks(allChunks);

  console.log("\n✓ Sync complete.");
}

main().catch((err) => {
  console.error("\nFAILED:", err);
  process.exit(1);
});
