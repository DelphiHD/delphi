import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // Per-kind counts.
  const { data: counts } = await s.rpc("nearest_chunks", {
    query_embedding: new Array(1536).fill(0),
    match_count: 1,
    kind_filter: null,
  });
  console.log("RPC check OK\n");

  const kinds = [
    "gate", "line", "channel", "center", "type", "authority", "profile", "variable",
    "channel_type", "definition", "circuit", "planet", "cross", "profile_line",
    "geometry", "quarter",
  ];
  for (const k of kinds) {
    const { count } = await s
      .from("chunks")
      .select("id", { count: "exact", head: true })
      .eq("source_kind", k);
    console.log(`  ${k.padEnd(15)} ${count ?? 0}`);
  }

  // Sample titles per kind.
  console.log("\nSample titles:");
  for (const k of kinds) {
    const { data } = await s
      .from("chunks")
      .select("title")
      .eq("source_kind", k)
      .limit(5);
    if (data?.length) {
      console.log(`  ${k}: ${data.map((x) => x.title).join(" | ")}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
