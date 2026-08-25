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
loadEnv({ path: ".env.local" });

import { Client as NotionClient, isFullPage, isFullBlock } from "@notionhq/client";
import OpenAI from "openai";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { logFlag } from "@/lib/flags";
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
  // Raw network / socket failures over a long walk: undici "fetch failed"
  // (TypeError with a cause), connection resets, DNS blips, timeouts. These
  // used to crash the whole sync; retrying them is safe and idempotent.
  const netCodes = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"];
  const code = e?.code ?? e?.cause?.code;
  if (code && netCodes.includes(code)) return { yes: true, reason: String(code) };
  if (/fetch failed|socket hang up|network|terminated/i.test(e?.message ?? "") || /fetch failed|socket hang up/i.test(e?.cause?.message ?? "")) {
    return { yes: true, reason: "network" };
  }
  return { yes: false, reason: "" };
}

// Synced-block source blocks that the integration can't read (their master
// page isn't shared). Collected across the run so we can report them.
const inaccessibleBlocks = new Set<string>();

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
      // Not shared with the integration (a synced block referencing a master
      // page the integration can't see). Skip and record it so we can report
      // exactly which pages need sharing, rather than crashing the whole run.
      if (e?.code === "object_not_found" || e?.status === 404) {
        inaccessibleBlocks.add(blockId);
        console.warn(`  ⚠ block ${blockId.slice(0, 8)}… not shared with the delphi-ingest integration; skipping`);
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
      case "synced_block": {
        // A synced block's real content lives in its children. For a DUPLICATE
        // (reference) synced block the children live under the ORIGINAL block
        // (synced_from.block_id); for the original, under this block's own id.
        // Most of Kaycee's Types/Authorities/etc. write-ups sit inside a synced
        // block, so this MUST be read, not skipped (the old code dropped it,
        // which is why those entries synced empty while gates did not).
        const sourceId = obj.synced_from?.block_id ?? b.id;
        const kids = await getChildren(sourceId);
        rendered = await renderBlocks(kids);
        break;
      }
      case "unsupported": rendered = ""; break;
      default: rendered = text;
    }
    if (rendered) parts.push(rendered);
    // Don't recurse into block types whose content the API can't return, or
    // that we already handled explicitly above.
    // unsupported = opaque (e.g. linked databases); synced_block = its children
    // are fetched inside the case above (avoid double-processing here).
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
  /** EVERY Notion page property, name -> stringified value. This is the
   *  structured metadata the model (and the reports) look fields up by, e.g.
   *  metadata["Function - DBHD - The 9 Centers"]. Also folded into `body` so it
   *  is searchable/grounded, not just directly addressable. */
  metadata?: Record<string, string>;
  embedding?: number[];
  tokens?: number;
}

// Resolve a related Notion page id to its human-readable title, cached across the
// whole sync run so a relation shared by many rows (e.g. every channel pointing at
// the same circuit page) costs at most one lookup. A related page that is deleted
// or not shared with the integration resolves to "" (skipped, never fatal).
const relationTitleCache = new Map<string, string>();
async function resolveRelationTitle(id: string): Promise<string> {
  if (relationTitleCache.has(id)) return relationTitleCache.get(id)!;
  let title = "";
  try {
    const page = await notion.pages.retrieve({ page_id: id });
    if (isFullPage(page)) title = pageTitle(page);
  } catch {
    /* related page unshared / deleted; leave blank */
  }
  relationTitleCache.set(id, title);
  return title;
}

// Stringify a Notion property value SYNCHRONOUSLY into its readable content. EVERY
// property type is captured, no exceptions and no judgment about importance, per
// Kaycee: every field matters. Relations are the one type resolved separately
// (async, in allProps) because they need a page lookup. Any property type Notion
// adds in the future is handled by the generic default below, so nothing is ever
// silently dropped again.
function propValueToString(p: any): string {
  if (!p || !p.type) return "";
  switch (p.type) {
    case "title": return plainText(p.title);
    case "rich_text": return plainText(p.rich_text);
    case "select": return p.select?.name ?? "";
    case "status": return p.status?.name ?? "";
    case "multi_select": return (p.multi_select ?? []).map((s: any) => s.name).join(", ");
    case "number": return p.number != null ? String(p.number) : "";
    case "checkbox": return p.checkbox ? "yes" : "no";
    case "date": return [p.date?.start, p.date?.end].filter(Boolean).join(" to ");
    case "url": return p.url ?? "";
    case "email": return p.email ?? "";
    case "phone_number": return p.phone_number ?? "";
    case "people": return (p.people ?? []).map((u: any) => u.name ?? u.id).filter(Boolean).join(", ");
    case "files": return (p.files ?? []).map((f: any) => f.name || f.external?.url || f.file?.url).filter(Boolean).join(", ");
    case "unique_id": return p.unique_id ? [p.unique_id.prefix, p.unique_id.number].filter((x: any) => x != null).join("-") : "";
    case "created_time": return p.created_time ?? "";
    case "last_edited_time": return p.last_edited_time ?? "";
    case "created_by": return p.created_by?.name ?? p.created_by?.id ?? "";
    case "last_edited_by": return p.last_edited_by?.name ?? p.last_edited_by?.id ?? "";
    case "verification": return p.verification?.state ?? "";
    case "formula": {
      const f = p.formula ?? {};
      if (f.string) return f.string;
      if (f.number != null) return String(f.number);
      if (f.boolean != null) return String(f.boolean);
      if (f.date?.start) return f.date.start;
      return "";
    }
    case "rollup": {
      const r = p.rollup ?? {};
      if (r.type === "array") return (r.array ?? []).map((x: any) => propValueToString(x)).filter(Boolean).join(", ");
      if (r.type === "number" && r.number != null) return String(r.number);
      if (r.type === "date" && r.date?.start) return r.date.start;
      return "";
    }
    default: {
      // Any current or future type not named above: capture whatever readable
      // value it carries rather than dropping it. `button` and the like have no
      // value and yield "" (which allProps drops), but a valued type is kept.
      const v = (p as any)[p.type];
      if (v == null) return "";
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
      if (typeof v === "object") {
        if (v.name) return String(v.name);
        if (v.start) return String(v.start);
        if (Array.isArray(v)) return v.map((x: any) => x?.name ?? x?.id ?? "").filter(Boolean).join(", ");
      }
      return "";
    }
  }
}

// EVERY page property, name -> stringified value (empty values dropped). Async
// because relation properties resolve to the linked page titles (e.g. a channel's
// "Circuit" relation becomes "Understanding Circuit"). Kaycee's databases are the
// source of truth: we capture every property she authored, not a hand-picked few.
async function allProps(page: any): Promise<Record<string, string>> {
  const props = page?.properties ?? {};
  const out: Record<string, string> = {};
  for (const [name, p] of Object.entries(props) as [string, any][]) {
    let v: string;
    if (p?.type === "relation") {
      const ids = (p.relation ?? []).map((r: any) => r.id).filter(Boolean);
      const titles: string[] = [];
      for (const id of ids) { const t = await resolveRelationTitle(id); if (t) titles.push(t); }
      v = titles.join(", ");
    } else {
      v = propValueToString(p);
    }
    v = v.trim();
    if (v) out[name] = v;
  }
  return out;
}

// The property metadata rendered as labeled text, folded into the body so it is
// searchable/grounded (not just directly addressable via chunk.metadata).
function metaText(meta: Record<string, string>): string {
  return Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join("\n");
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
      // Capture EVERY property (relations resolved to linked-page names) once,
      // then use it for both the folded body text and the addressable metadata.
      const meta = await allProps(page);
      // Body content lives in the page body for some databases and in text
      // properties for others; take whichever has content (both if both).
      const content = [rendered, metaText(meta)].filter((s) => s.trim()).join("\n\n");
      const body = title ? `# ${title}\n\n${content}` : content;
      // Keep EVERY page, even an empty one. Kaycee may add content later and must
      // be able to trust the sync picks it up; a skipped page silently would not.
      // (An empty page becomes an empty-bodied chunk with its metadata + title.)
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
        metadata: meta,
      });
    }
    cursor = resp.next_cursor || undefined;
  } while (cursor);
  return chunks;
}

// Descend through (possibly nested or referenced) synced blocks to find the
// callout that holds the 7 line toggles. A flat page is `synced_block ->
// callout`; a nested one (gate 47) is `synced_block -> synced_block -> callout`.
// For a reference synced block, its children live under synced_from.block_id.
async function findLineCompanionCallout(blockId: string, depth = 0): Promise<any | null> {
  if (depth > 4) return null;
  const kids = await getChildren(blockId);
  const callout = kids.find((b: any) => b.type === "callout");
  if (callout) return callout;
  for (const k of kids) {
    if (k.type === "synced_block") {
      const src = k.synced_block?.synced_from?.block_id ?? k.id;
      const found = await findLineCompanionCallout(src, depth + 1);
      if (found) return found;
    }
  }
  return null;
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
        logFlag({ product: "sync", severity: "flag", message: `Line Companion gate ${gateNumber}: no synced block on the page, so no line content came through.`, action: "gate lines skipped" });
        continue;
      }
      // Descend through nested / referenced synced blocks to find the callout
      // that holds the toggles. Some pages (e.g. gate 47) wrap the callout in a
      // second synced block, which a one-level lookup misses.
      const src0 = synced.synced_block?.synced_from?.block_id ?? synced.id;
      const callout = await findLineCompanionCallout(src0);
      if (!callout) {
        console.warn(`  ⚠ Gate ${gateNumber}: no callout found inside the synced block(s)`);
        logFlag({ product: "sync", severity: "flag", message: `Line Companion gate ${gateNumber}: could not find the callout with the line toggles (nested synced block or content on the wrong page in Notion).`, action: "gate lines skipped" });
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

// Completeness guard. The library must only ever get MORE complete, never
// silently less. Before overwriting, compare each freshly-walked page to the
// last good copy on disk. If a page came through THINNER (a fetch failed, a
// synced block did not resolve, a page got unshared), hold its last-good body
// (keep the fresh metadata) and flag it for review. If a page that existed is
// missing entirely, keep the last-good copy. Kaycee reviews the flags and
// decides whether a shrink was correct (e.g. wrong content removed) or a
// failure. Nothing is dropped without a loud, visible record.
async function applyCompletenessGuard(fresh: Chunk[]): Promise<Chunk[]> {
  let lastGood: Chunk[] = [];
  try {
    const data = JSON.parse(await readFile(CHECKPOINT_PATH, "utf8"));
    lastGood = data.chunks ?? [];
  } catch {
    return fresh; // no prior library to guard against
  }
  if (!lastGood.length) return fresh;

  const keyOf = (c: Chunk) => `${c.source_kind}|${c.gate_number}|${c.line_number}|${c.slug}`;
  const lgMap = new Map(lastGood.map((c) => [keyOf(c), c]));
  const freshKeys = new Set(fresh.map(keyOf));
  const SHRINK_RATIO = 0.9;   // flag if new body < 90% of last-good
  const MIN_DROP = 200;       // and dropped more than 200 chars (ignore trivial edits)

  const out: Chunk[] = [];
  let held = 0;
  for (const c of fresh) {
    const lg = lgMap.get(keyOf(c));
    if (lg) {
      const nb = String(c.body || "").length;
      const ob = String(lg.body || "").length;
      if (nb < ob * SHRINK_RATIO && ob - nb > MIN_DROP) {
        logFlag({
          product: "sync",
          severity: "flag",
          message: `${c.source_kind} "${c.title}" came through thin (${nb} chars, was ${ob}). Held last-good content pending review: confirm whether the shrink is correct (wrong content removed) or a fetch failure.`,
          action: "held last-good body, kept fresh metadata",
        });
        out.push({ ...c, body: lg.body });
        held++;
        continue;
      }
    }
    out.push(c);
  }
  // Pages that were in the library but did not come through this run at all
  // (usually a whole database failed above). Restore them from last-good and
  // flag ONCE with a summary rather than one flag per page.
  const missing: Chunk[] = [];
  for (const lg of lastGood) {
    if (!freshKeys.has(keyOf(lg))) { out.push(lg); missing.push(lg); }
  }
  if (missing.length) {
    const byKind: Record<string, number> = {};
    for (const m of missing) byKind[m.source_kind] = (byKind[m.source_kind] ?? 0) + 1;
    const breakdown = Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(", ");
    logFlag({
      product: "sync",
      severity: "flag",
      message: `${missing.length} page(s) did not come through this run (${breakdown}); kept the last-good copies. Usually means a database failed or was empty this run.`,
      action: "held last-good for missing pages",
    });
  }
  const restored = missing.length;
  if (held || restored) console.log(`  completeness guard: held ${held} thinned page(s), restored ${restored} missing page(s). See System Health/Flags.md.`);
  else console.log(`  completeness guard: clean, no page regressed.`);
  return out;
}

async function main() {
  console.log("Phase 3 sync starting");

  // Resume from a previous Notion walk if one is fresh on disk. Lets us
  // recover from OpenAI / Supabase failures without re-paying the 10-minute
  // Notion roundtrip.
  // SYNC_FORCE_WALK forces a fresh Notion read (ignore any checkpoint). We keep
  // the existing chunks.json in place: saveCheckpoint only overwrites it at the
  // very end on success, so if the walk crashes, the current library is untouched.
  let allChunks: Chunk[] | null = process.env.SYNC_FORCE_WALK ? null : await loadCheckpoint();
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
      // Per-database isolation: a transient failure on ONE database (a Notion
      // timeout, a 5xx) must not crash the whole walk and lose everything. On
      // failure we flag it and leave that database's pages out of the fresh
      // set; the completeness guard then holds their last-good content. The
      // sync still completes and the library is preserved.
      try {
        const chunks = t.isLineCompanion
          ? await syncLineCompanion(t.databaseId)
          : await syncStandardDatabase(t.databaseId, t.kind);
        console.log(`${chunks.length} chunks`);
        allChunks.push(...chunks);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`FAILED: ${msg}`);
        logFlag({ product: "sync", severity: "flag", message: `Database "${t.rowName}" failed this run (${msg}). Its pages were held at last-good content by the guard.`, action: "database skipped this run, last-good held" });
      }
    }
    console.log(`Total: ${allChunks.length} chunks`);
    allChunks = await applyCompletenessGuard(allChunks);
    await saveCheckpoint(allChunks);
    console.log(`Checkpoint saved to ${CHECKPOINT_PATH}`);
  }

  if (allChunks.length === 0) {
    console.log("Nothing to embed. Exiting.");
    return;
  }

  // Health summary: entries whose body came through thin (under 200 chars),
  // and any blocks the integration could not read (need sharing).
  const THIN = 200;
  const thin = allChunks.filter((c) => (c.body || "").length < THIN && (c.metadata == null || Object.keys(c.metadata).length === 0));
  if (thin.length) {
    console.log(`\n⚠ ${thin.length} entr${thin.length === 1 ? "y" : "ies"} came through thin (under ${THIN} chars, no metadata):`);
    for (const c of thin) console.log(`    ${c.source_kind.padEnd(16)} ${c.title} (${(c.body || "").length} chars)`);
    logFlag({ product: "sync", severity: "flag", message: `${thin.length} entr${thin.length === 1 ? "y" : "ies"} came through thin with no content: ${thin.slice(0, 8).map((c) => `${c.source_kind} "${c.title}"`).join(", ")}${thin.length > 8 ? ", …" : ""}.`, action: "kept in library, needs source content" });
  } else {
    console.log(`\n✓ every entry came through with real content.`);
  }
  // Relation-resolution guard: relations (like a channel's Circuit) are exactly
  // the class of field that used to be silently dropped. Assert the ones the
  // reports depend on actually came through, so a future regression trips HERE,
  // loudly, instead of surfacing as a blank header in a report days later.
  const channelChunks = allChunks.filter((c) => c.source_kind === "channel");
  const missingCircuit = channelChunks.filter(
    (c) => !Object.entries(c.metadata ?? {}).some(([k, v]) => /circuit/i.test(k) && String(v).trim()),
  );
  if (channelChunks.length && missingCircuit.length === 0) {
    console.log(`\n✓ all ${channelChunks.length} channels carry their Circuit relation.`);
  } else if (missingCircuit.length) {
    console.log(`\n⚠ ${missingCircuit.length}/${channelChunks.length} channel(s) came through with NO Circuit:`);
    for (const c of missingCircuit) console.log(`    ${c.title}`);
    // Most channels missing => relation capture regressed (loud, notifies).
    // A few missing => likely a missing Circuit link in Notion for those rows.
    const regressed = missingCircuit.length >= Math.max(5, channelChunks.length / 2);
    logFlag({
      product: "sync",
      severity: regressed ? "critical" : "flag",
      message: regressed
        ? `${missingCircuit.length}/${channelChunks.length} channels synced with NO Circuit. Relation capture has regressed, relations are being dropped again. Check propValueToString/allProps in sync-notion.ts.`
        : `${missingCircuit.length} channel(s) have no Circuit: ${missingCircuit.slice(0, 6).map((c) => `"${c.title}"`).join(", ")}. Likely a missing Circuit link in Notion for those rows.`,
      action: regressed ? "relation resolution broken; channel headers blank" : "those channel headers will show no circuit",
    });
  }

  if (inaccessibleBlocks.size) {
    console.log(`\n⚠ ${inaccessibleBlocks.size} synced block(s) not shared with the delphi-ingest integration:`);
    for (const id of inaccessibleBlocks) console.log(`    ${id}`);
    logFlag({ product: "sync", severity: "flag", message: `${inaccessibleBlocks.size} synced block(s) are not shared with the delphi-ingest integration, so their content could not be read. Share the master pages with the integration.`, action: "content skipped for those blocks" });
  }

  // Local-only rebuild: walk Notion and write the complete local library copy
  // (.cache/chunks.json), skipping OpenAI embeddings and the Supabase upsert.
  // Used to rebuild the library from Notion when the live database is down.
  if (process.env.SYNC_LOCAL_ONLY) {
    console.log(`\nlocal-only mode: ${allChunks.length} chunks written to ${CHECKPOINT_PATH}. Skipping embeddings + Supabase.`);
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
