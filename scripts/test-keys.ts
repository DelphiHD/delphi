import { config as loadEnv } from "dotenv";
// override:true because the parent shell sometimes pre-sets ANTHROPIC_API_KEY=""
// (e.g. claude-for-desktop), and dotenv's default behavior is to skip already-set vars.
loadEnv({ path: ".env.local", override: true });

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { Client as Notion } from "@notionhq/client";

const a = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const o = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const n = new Notion({ auth: process.env.NOTION_TOKEN! });

async function main() {
  console.log("Anthropic…");
  const ar = await a.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 16,
    messages: [{ role: "user", content: "Say OK" }],
  });
  console.log(`  ${(ar.content[0] as any).text} (in=${ar.usage.input_tokens} out=${ar.usage.output_tokens})`);

  console.log("OpenAI…");
  const oe = await o.embeddings.create({ model: "text-embedding-3-small", input: "hello" });
  console.log(`  embedding dim=${oe.data[0].embedding.length}`);

  console.log("Supabase chunks count…");
  const { count, error } = await s.from("chunks").select("id", { count: "exact", head: true });
  if (error) throw error;
  console.log(`  ${count} chunks in DB`);

  console.log("Notion HD Database Directory probe…");
  const directoryId = "2f1e3fadcaaa80a1a496fb4f22abbb8d";
  const db = await n.databases.retrieve({ database_id: directoryId });
  console.log(`  directory has ${(db as any).data_sources?.length ?? 0} data source(s)`);

  console.log("\n✓ all four keys work");
}

main().catch((e) => { console.error(e); process.exit(1); });
