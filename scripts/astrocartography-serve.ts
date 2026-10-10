/**
 * Serves the astro-cartography preview with the provider's place search
 * behind it, on this machine only.
 *
 * Kaycee, 10 October: search should use "the location picker that comes with
 * our API", not a list that would need crediting on the map. The provider's
 * list is the one the chart forms use (/api/places on the site), but it holds
 * names and time zones, not coordinates, and its key cannot sit in a page. So
 * this does what the site does: /api/places passes the query to the provider,
 * and /api/place finds a chosen place's coordinates the same way a birthplace
 * is found, through locate(), cached on disk.
 *
 *   npx tsx scripts/astrocartography-serve.ts      then open http://localhost:8782
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { locate } from "../lib/astro";

const PORT = Number(process.env.ACG_PORT ?? 8782);
const DIR = join(homedir(), "Desktop", "HD Reports", "Astrocartography");

function json(res: import("node:http").ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/api/places") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (q.length < 2) return json(res, 200, { ok: true, places: [] });
      const u = new URL("https://api.bodygraphchart.com/v210502/locations");
      u.searchParams.set("api_key", process.env.MYBODYGRAPH_API_KEY ?? "");
      u.searchParams.set("query", q.slice(0, 80));
      const r = await fetch(u);
      if (!r.ok) return json(res, 502, { ok: false, error: `provider ${r.status}` });
      const raw = (await r.json()) as { value?: string; asciiname?: string; admin1?: string; country?: string }[];
      const places = (Array.isArray(raw) ? raw : []).filter((p) => p.value).slice(0, 8)
        .map((p) => ({ value: p.value, name: p.asciiname ?? p.value, region: [p.admin1, p.country].filter(Boolean).join(", ") }));
      return json(res, 200, { ok: true, places });
    }
    if (url.pathname === "/api/place") {
      const value = (url.searchParams.get("value") ?? "").trim();
      const { lat, lon } = await locate(value);
      return json(res, 200, { ok: true, lat, lon });
    }
    // The page itself: the one asked for, or the only one there.
    const name = decodeURIComponent(url.pathname.slice(1)) ||
      readdirSync(DIR).find((f) => f.endsWith(".html")) || "";
    if (!name.endsWith(".html") || name.includes("/")) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(join(DIR, name)));
  } catch (e) {
    json(res, 500, { ok: false, error: (e as Error).message });
  }
}).listen(PORT, () => console.log(`astrocartography on http://localhost:${PORT}`));
