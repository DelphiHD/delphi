// Quick sanity check: fetch 3 gate pages, 3 channel pages, and 3 center pages
// from Notion and run extractProperties on them. Confirm the structured data
// (Center, Channel, Channel Type, Circuit, etc.) shows up correctly.

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { Client as Notion, isFullPage } from "@notionhq/client";

const n = new Notion({ auth: process.env.NOTION_TOKEN! });

function extractProperties(page: { properties?: Record<string, unknown> }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const props = page.properties ?? {};
  for (const [name, raw] of Object.entries(props)) {
    const v = raw as { type?: string; [k: string]: unknown };
    if (!v?.type) continue;
    switch (v.type) {
      case "title": continue;
      case "rich_text": {
        const text = ((v as any).rich_text ?? []).map((r: any) => r.plain_text ?? "").join("").trim();
        if (text) out[name] = text;
        break;
      }
      case "select": { const sel = (v as any).select; if (sel?.name) out[name] = sel.name; break; }
      case "multi_select": {
        const arr = (v as any).multi_select ?? [];
        const names = arr.map((s: any) => s.name).filter(Boolean);
        if (names.length) out[name] = names;
        break;
      }
      case "number": { const n2 = (v as any).number; if (n2 !== null && n2 !== undefined) out[name] = n2; break; }
      case "checkbox": out[name] = Boolean((v as any).checkbox); break;
      case "url": { const u = (v as any).url; if (u) out[name] = u; break; }
      case "relation": {
        const rels = (v as any).relation ?? [];
        const ids = rels.map((r: any) => r.id).filter(Boolean);
        if (ids.length) out[name] = ids;
        break;
      }
    }
  }
  return out;
}

async function getDS(dbId: string): Promise<string> {
  const db = await n.databases.retrieve({ database_id: dbId });
  return (db as any).data_sources[0].id;
}

async function main() {
  // Sample a few HD Gates pages.
  const gatesDs = await getDS("268e3fadcaaa80ecaa77ecca0276c966");
  const gatesQ = await n.dataSources.query({ data_source_id: gatesDs, page_size: 3 });
  console.log("=== 3 sample HD Gates pages ===");
  for (const p of gatesQ.results) {
    if (!isFullPage(p)) continue;
    const title = Object.values(p.properties).find((x: any) => x?.type === "title") as any;
    const titleText = (title?.title ?? []).map((t: any) => t.plain_text).join("");
    console.log(`\n[${titleText}]  page_id=${p.id.slice(0, 8)}`);
    console.log(JSON.stringify(extractProperties(p as any), null, 2));
  }

  // Sample a few HD Channels pages.
  const channelsDs = await getDS("268e3fadcaaa803eabebd603232ee91d");
  const channelsQ = await n.dataSources.query({ data_source_id: channelsDs, page_size: 3 });
  console.log("\n\n=== 3 sample HD Channels pages ===");
  for (const p of channelsQ.results) {
    if (!isFullPage(p)) continue;
    const title = Object.values(p.properties).find((x: any) => x?.type === "title") as any;
    const titleText = (title?.title ?? []).map((t: any) => t.plain_text).join("");
    console.log(`\n[${titleText}]  page_id=${p.id.slice(0, 8)}`);
    console.log(JSON.stringify(extractProperties(p as any), null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
