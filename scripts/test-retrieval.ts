import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const queries = [
  { q: "what is the throat center about", kind: null as string | null },
  { q: "gate 21 third line detriment", kind: "line" as string | null },
  { q: "splenic authority and recognition in the body", kind: null },
  { q: "manifesting generator strategy", kind: null },
];

async function main() {
  for (const { q, kind } of queries) {
    const e = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: q,
    });
    const { data, error } = await supabase.rpc("nearest_chunks", {
      query_embedding: e.data[0].embedding,
      match_count: 3,
      kind_filter: kind,
    });
    if (error) { console.error("err:", error); continue; }
    console.log(`\n› "${q}"  (kind=${kind ?? "any"})`);
    for (const r of data as any[]) {
      const score = r.similarity.toFixed(3);
      const tag = r.gate_number != null && r.line_number != null ? ` [${r.gate_number}.${r.line_number}]` : "";
      console.log(`  ${score}  ${r.source_kind}${tag}  ${r.title.slice(0, 60)}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
