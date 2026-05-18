// Look hard for planetary-return dates in mybodygraph's response.
// Check the main response (Tooltips, Properties.*, deeper paths) and probe
// for separate endpoints if they exist.

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { writeFileSync, mkdirSync } from "node:fs";

async function main() {
  const apiKey = process.env.MYBODYGRAPH_API_KEY!;

  // 1. Get a full chart for Tennyson and dump EVERY string in the response
  // that contains a year-like token (2020-2099) or a planetary return word.
  const tzUrl = new URL("https://api.bodygraphchart.com/v210502/locations");
  tzUrl.searchParams.set("api_key", apiKey);
  tzUrl.searchParams.set("query", "Orem, Utah, United States");
  const tz = ((await (await fetch(tzUrl)).json()) as Array<{ timezone: string }>)[0].timezone;

  const url = new URL("https://api.bodygraphchart.com/v221006/hd-data");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("date", "1993-01-06 07:51");
  url.searchParams.set("timezone", tz);
  const raw = await (await fetch(url)).json();

  mkdirSync(".cache", { recursive: true });
  writeFileSync(".cache/mybodygraph-tennyson-raw.json", JSON.stringify(raw, null, 2));
  console.log("Wrote .cache/mybodygraph-tennyson-raw.json for full inspection");
  console.log(`Top-level keys: ${Object.keys(raw).sort().join(", ")}\n`);

  // 2. Look INSIDE Tooltips specifically — might have return data.
  if (raw.Tooltips) {
    console.log("=== Tooltips structure ===");
    console.log(`Keys at Tooltips level: ${Object.keys(raw.Tooltips).slice(0, 30).join(", ")}`);
    console.log(`Sample Tooltips entry (first key):`);
    const k = Object.keys(raw.Tooltips)[0];
    console.log(JSON.stringify(raw.Tooltips[k], null, 2).slice(0, 1500));
  }

  // 3. Look for the words "Saturn Return", "Uranus Opposition", "Chiron Return", "2027", "2034", "2043"
  // (Tennyson's likely return years given birth 1993).
  console.log("\n=== Searching for return-date-like strings ===");
  const jsonStr = JSON.stringify(raw);
  for (const pattern of [
    /Saturn Return[^"]*?"[^"]+"/g,
    /Uranus Opposition[^"]*?"[^"]+"/g,
    /Chiron Return[^"]*?"[^"]+"/g,
    /Second Saturn[^"]*?"[^"]+"/g,
    /"20[2-6][0-9]-[01][0-9]-[0-3][0-9][^"]*"/g, // ISO dates in the 2020-2069 range
    /Return[^"]*"\s*:\s*"[^"]+"/g,
  ]) {
    const matches = jsonStr.match(pattern)?.slice(0, 5);
    if (matches?.length) {
      console.log(`Pattern ${pattern.source}: ${matches.length} matches`);
      for (const m of matches) console.log(`  ${m.slice(0, 200)}`);
    }
  }

  // 4. Probe for a separate "transits" endpoint, since the chart endpoint is /v221006/hd-data.
  console.log("\n=== Probing for /v221006/transits / /v221006/returns / similar ===");
  const probePaths = [
    "/v221006/transits",
    "/v221006/returns",
    "/v221006/planetary-returns",
    "/v221006/hd-returns",
    "/v221006/saturn-return",
    "/v210502/transits",
    "/v210502/returns",
  ];
  for (const path of probePaths) {
    const probeUrl = new URL("https://api.bodygraphchart.com" + path);
    probeUrl.searchParams.set("api_key", apiKey);
    probeUrl.searchParams.set("date", "1993-01-06 07:51");
    probeUrl.searchParams.set("timezone", tz);
    try {
      const r = await fetch(probeUrl);
      console.log(`  ${path}: ${r.status} ${r.statusText}`);
      if (r.status === 200) {
        const body = await r.text();
        console.log(`    body (first 300): ${body.slice(0, 300)}`);
      }
    } catch (e) {
      console.log(`  ${path}: ERR ${(e as any)?.message}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
