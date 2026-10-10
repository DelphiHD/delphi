/**
 * The World, standalone, for trying it out on this machine.
 *
 * A thin page around the same pieces the chart uses: lib/world.ts for the
 * chart's data, assets/world/world.client.js and world.css for the view, and
 * public/world/world-v1.json for the map (build it with
 * scripts/build-world-geometry.ts). Served with search and the relocated chart
 * behind it by scripts/astrocartography-serve.ts on localhost:8782.
 *
 *   npx tsx scripts/astrocartography-preview.ts "Kaycee Vandenberg"
 *
 * Writes to ~/Desktop/HD Reports/Astrocartography/<name>.html. Not published.
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { getChart } from "../lib/mybodygraph";
import { locate, getAstro } from "../lib/astro";
import { loadLibraryChunks } from "../lib/hd/chunks-source";
import { buildWorldData } from "../lib/world";

const [, , personName] = process.argv;
if (!personName) throw new Error("usage: astrocartography-preview.ts <person>");

(async () => {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await s.from("charts")
    .select("person_name, birth_date, birth_time, birth_place, birth_timezone")
    .eq("person_name", personName).limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error(`no chart for ${personName}`);
  const date = String(row.birth_date), time = String(row.birth_time).slice(0, 5), place = String(row.birth_place);

  const chart = await getChart({ birthDate: date, birthTime: time, timezone: String(row.birth_timezone) });
  const at = await locate(place);
  const astro = {
    personality: await getAstro({ birthDate: date, birthTime: time, place }),
    design: await getAstro({ birthDate: date, birthTime: time, place, atUtc: chart.birth.designUtcDate }),
  };
  // Her Delphi Basic for each planet, the same column the chart's hovers read.
  const basic: Record<string, string> = {};
  for (const c of await loadLibraryChunks({ preferLocal: process.env.HD_LIBRARY_LOCAL === "1" })) {
    if (c.source_kind !== "planet") continue;
    const m = (c.metadata ?? {}) as Record<string, string>;
    const t = ["Delphi Basic", "Delphi Basic Description", "Delphi Free Chart"].map((f) => (m[f] ?? "").toString().trim()).find(Boolean);
    if (t) basic[(c.title ?? "").trim()] = t;
  }
  const world = await buildWorldData({
    person: personName, born: { date, time, place }, birthplace: at,
    utc: chart.birth.utcDate, designUtc: chart.birth.designUtcDate, astro,
    activations: chart.activations, basic,
  });

  const b64 = (p: string) => readFileSync(p).toString("base64");
  const fontCss = [400, 600].map((w) =>
    `@font-face{font-family:Montserrat;font-weight:${w};src:url(data:font/ttf;base64,${b64(join("assets", "fonts", `Montserrat-${w}.ttf`))}) format('truetype');}`).join("");
  const sub = `${place} · ${date} ${time} · design ${chart.birth.designUtcDate.slice(0, 16).replace("T", " ")} UTC`;
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${personName} The World</title>
<style>${fontCss}
body{margin:0;font-family:Montserrat,-apple-system,sans-serif;background:#faf8fb;color:#2f2a33;height:100vh;display:flex;flex-direction:column;overflow:hidden}
header{padding:16px 24px 4px}h1{margin:0;font-weight:600;font-size:22px;color:#845095}.sub{color:#6b6790;font-size:13px;margin-top:4px}
#world{flex:1;min-height:0}
${readFileSync(join("assets", "world", "world.css"), "utf8")}</style></head><body>
<header><h1>${personName}</h1><div class="sub">${sub}</div></header>
<div id="world"></div>
<img class="brandmark logo" hidden alt="" src="data:image/svg+xml;base64,${b64(join("assets", "brand", "Delphi Logo.svg"))}">
<img class="brandmark know" hidden alt="" src="data:image/svg+xml;base64,${b64(join("assets", "brand", "Know Thyself.svg"))}">
<script>var FONTCSS=${JSON.stringify(fontCss)};</script>
<script>${readFileSync(join("assets", "world", "world.client.js"), "utf8")}</script>
<script>DelphiWorld.mount(document.getElementById("world"), ${JSON.stringify(world)}, {
  geometry: "/world/world-v1.json",
  api: { places: "/api/places", place: "/api/place", relocate: "/api/relocate" },
});</script>
</body></html>`;

  const dir = join(homedir(), "Desktop", "HD Reports", "Astrocartography");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${personName}.html`);
  writeFileSync(out, html);
  console.log(out, (html.length / 1024).toFixed(0) + " KB, world data " + (JSON.stringify(world).length / 1024).toFixed(0) + " KB");
})();
