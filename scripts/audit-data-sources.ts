// One-shot: audit what's already in the mybodygraph API response AND in
// Kaycee's Notion-sourced chunks. Answers: do we need to compute returns,
// gate→center, channel→centers, channel→circuit, channel→type? Or is the
// data already there and we're just not using it?

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // 1. RAW mybodygraph response for Tennyson's chart.
  console.log("=== mybodygraph raw response (Tennyson) ===\n");
  const apiKey = process.env.MYBODYGRAPH_API_KEY!;
  const tzUrl = new URL("https://api.bodygraphchart.com/v210502/locations");
  tzUrl.searchParams.set("api_key", apiKey);
  tzUrl.searchParams.set("query", "Orem, Utah, United States");
  const tz = ((await (await fetch(tzUrl)).json()) as Array<{ timezone: string }>)[0].timezone;

  const dataUrl = new URL("https://api.bodygraphchart.com/v221006/hd-data");
  dataUrl.searchParams.set("api_key", apiKey);
  dataUrl.searchParams.set("date", "1993-01-06 07:51");
  dataUrl.searchParams.set("timezone", tz);
  const raw = await (await fetch(dataUrl)).json();
  // Print top-level keys + nested keys to see what fields exist.
  console.log("Top-level keys:", Object.keys(raw).sort());
  if (raw.Properties) {
    console.log("\nProperties keys:", Object.keys(raw.Properties).sort());
  }
  // Look for anything that mentions "return", "saturn", "uranus", "chiron", "kiron", "node", "channel" with details
  console.log("\nLooking for return / transit / planetary-event fields…");
  const jsonStr = JSON.stringify(raw, null, 2);
  for (const term of ["Return", "Saturn", "Uranus", "Chiron", "Kiron", "Transit", "Channel", "Center"]) {
    const matches = jsonStr.match(new RegExp(`"[^"]*${term}[^"]*"`, "gi"))?.slice(0, 10) ?? [];
    if (matches.length) console.log(`  ${term}: ${matches.join(", ")}`);
  }

  // Dump the whole thing in case there are keys I'd otherwise miss.
  console.log("\n--- Full response (first 4000 chars) ---");
  console.log(jsonStr.slice(0, 4000));
  console.log("--- end response excerpt ---\n");

  // 2. SAMPLE channel chunks. Does the body text mention center names?
  console.log("\n=== Channel chunks (sample 3) ===\n");
  const { data: channels } = await s.from("chunks").select("title,body,metadata").eq("source_kind", "channel").in("title", ["21 - 45: The Channel of Money", "10 - 34: The Channel of Exploration", "12 - 22: The Channel of Openness"]);
  for (const c of channels ?? []) {
    console.log(`TITLE: ${c.title}`);
    console.log(`BODY (first 600 chars):`);
    console.log(c.body.slice(0, 600));
    console.log();
  }

  // 3. SAMPLE gate chunks. Does the body text say which center the gate lives in?
  console.log("\n=== Gate chunks (sample 3) ===\n");
  const { data: gates } = await s.from("chunks").select("title,body").eq("source_kind", "gate").in("gate_number", [1, 21, 47]);
  for (const g of gates ?? []) {
    console.log(`TITLE: ${g.title}`);
    console.log(`BODY (first 500 chars):`);
    console.log(g.body.slice(0, 500));
    console.log();
  }

  // 4. The Channels DB raw page properties — what gets dropped during sync?
  console.log("\n=== Channels DB schema (via Notion) ===");
  console.log("(check via inspect-cross-schema pattern; skipped for brevity)");
}

main().catch((e) => { console.error(e); process.exit(1); });
