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
import { locate, getAstro, type AstroChart } from "../lib/astro";
import { houseOf, ZODIAC } from "../lib/astro-extras";
import { renderWheel } from "./astro-wheel";

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
    // The relocated chart: the birth moment, both sides, cast at another place.
    // Planets keep their positions; the angles and houses are the new place's.
    // Same provider call and the same wheel as the chart's Astrology view.
    if (url.pathname === "/api/relocate") {
      const g = (k: string) => url.searchParams.get(k) ?? "";
      const coords = { lat: Number(g("lat")), lon: Number(g("lon")) };
      if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) return json(res, 400, { ok: false, error: "no coordinates" });
      const cast = (atUtc: string) => getAstro({ birthDate: "", birthTime: "", place: g("place"), atUtc, coords });
      const [p, d] = await Promise.all([cast(g("p")), cast(g("d"))]);
      const HOUSE: Record<string, number> = { First: 1, Second: 2, Third: 3, Fourth: 4, Fifth: 5, Sixth: 6,
        Seventh: 7, Eighth: 8, Ninth: 9, Tenth: 10, Eleventh: 11, Twelfth: 12 };
      const sum = (a: AstroChart) => {
        const cusps = a.houses.map((h) => h.abs_pos);
        const out: Record<string, number> = {};
        for (const pl of a.planets) out[pl.label] = HOUSE[String(pl.house).split("_")[0]] ?? 0;
        // Earth is the far end of the Sun's axis; the provider does not name it.
        const sun = a.planets.find((x) => x.label === "Sun");
        if (sun) out.Earth = houseOf((sun.abs_pos + 180) % 360, cusps);
        const at = (v: number) => ({ sign: ZODIAC[Math.floor(v / 30)], deg: v % 30 });
        // What a hover on the relocated wheel reads, by the name the wheel tags
        // each glyph with. Earth is placed opposite the Sun, as on the natal.
        const planets: Record<string, { label: string; sign: string; deg: number; element: string; quality: string; house: number }> = {};
        for (const pl of a.planets) planets[pl.name] = { label: pl.label, sign: pl.sign, deg: pl.position,
          element: pl.element, quality: pl.quality, house: out[pl.label] ?? 0 };
        if (sun) {
          const e = (sun.abs_pos + 180) % 360;
          const sign = ZODIAC[Math.floor(e / 30)];
          planets.Earth = { label: "Earth", sign, deg: e % 30,
            element: a.signs[sign]?.element ?? "", quality: a.signs[sign]?.quality ?? "", house: out.Earth };
        }
        return { asc: at(a.ascendant), mc: at(a.mc), house: out, planets };
      };
      if (g("wheels") === "0") return json(res, 200, { ok: true, personality: sum(p), design: sum(d) });
      // Three wheels, as the chart draws them. Each side on its OWN relocated
      // horizon, because a design chart carries its own ascendant and houses
      // (Kaycee, 2026-10-08), and both together on the personality horizon,
      // the way the Astrology view shows a natal chart. Kaycee, 10 October: "I
      // would like to be able to see the astrological chart for both the
      // design and personality sides." Corners say when and where each was
      // cast: the birth instant in UTC, since the local clock is another
      // place's, and the place it was cast for.
      const gates = (k: string) => g(k).split(",").map(Number).filter(Boolean);
      const pG = gates("pg"), dG = gates("dg"), all = [...new Set([...pG, ...dG])];
      const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
        "September", "October", "November", "December"];
      const when = (utc: string) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(utc);
        if (!m) return utc;
        const h = Number(m[4]);
        return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]} \u00b7 ${h % 12 === 0 ? 12 : h % 12}:${m[5]} ${h < 12 ? "AM" : "PM"} UTC`;
      };
      const at = g("at");
      const pWhen = [when(g("p")), at], dWhen = [when(g("d")), at];
      const name = g("name");
      const svg = {
        personality: renderWheel(p, name, null, "ascendant", pG, pG, [], null, undefined, null, null,
          "personality", null, null, null, false, [pWhen]),
        design: renderWheel(d, name, null, "ascendant", dG, [], dG, null, undefined, null, null,
          "design", null, null, null, false, [dWhen]),
        both: renderWheel(p, name, d, "ascendant", all, pG, dG, null, undefined, null, null,
          "personality", null, null, null, false, [pWhen, dWhen]),
      };
      return json(res, 200, { ok: true, personality: sum(p), design: sum(d), svg });
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
