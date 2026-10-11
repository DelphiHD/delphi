/**
 * Builds the shared world for The World view: coastline, country borders and
 * cities, drawn once into public/world/world-v1.json and fetched by every chart.
 *
 * Kept out of the charts themselves because a chart page is already about
 * 3 MB and is streamed through a function with a response limit near 4.5 MB
 * (Kaycee approved the shared file, 10 October; docs/ASTROCARTOGRAPHY_PLAN.md).
 * The paths are drawn in the view's own frame, equirectangular, 80N to 70S,
 * 1440 wide, which is the frame the page draws lines in.
 *
 * Sources, all public domain, no credit needed on the map:
 *   world-atlas@2.0.2 land-50m.json and countries-50m.json (Natural Earth)
 *   Natural Earth ne_50m_populated_places_simple.geojson
 *   Natural Earth ne_50m_admin_0_countries.geojson (continents only; not shipped)
 * kept in .cache/world-atlas and .cache/natural-earth. Rebuild with
 *   npx tsx scripts/build-world-geometry.ts
 * and bump the file name when the drawing changes, so cached copies refresh.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const TOP = 80, BOTTOM = -70, W = 1440;
const H = (W / 360) * (TOP - BOTTOM);
const x = (lon: number) => ((lon + 180) / 360) * W;
const y = (lat: number) => ((TOP - lat) / (TOP - BOTTOM)) * H;
const f = (n: number) => n.toFixed(1);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** TopoJSON land to one SVG path, stitched from its delta-encoded arcs. */
function landPath(file: string): string {
  const topo = JSON.parse(readFileSync(file, "utf8"));
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;
  const arcs: [number, number][][] = topo.arcs.map((arc: number[][]) => {
    let ax = 0, ay = 0;
    return arc.map(([dx, dy]) => { ax += dx; ay += dy; return [ax * sx + tx, ay * sy + ty] as [number, number]; });
  });
  const ring = (ids: number[]) => {
    const pts: [number, number][] = [];
    for (const id of ids) {
      const a = id < 0 ? [...arcs[~id]].reverse() : arcs[id];
      pts.push(...(pts.length ? a.slice(1) : a));
    }
    // Land that straddles the 180 meridian (Fiji, Chukotka) would otherwise
    // be drawn the long way round the map. Unwrap it into one continuous
    // shape and draw it again a world over; the frame clips both copies.
    for (let i = 1; i < pts.length; i++) {
      const d = pts[i][0] - pts[i - 1][0];
      if (d > 180) pts[i] = [pts[i][0] - 360, pts[i][1]];
      else if (d < -180) pts[i] = [pts[i][0] + 360, pts[i][1]];
    }
    const draw = (shift: number) =>
      "M" + pts.map(([lon, lat]) => `${f(x(lon + shift))},${f(y(lat))}`).join("L") + "Z";
    const lons = pts.map((p) => p[0]);
    if (Math.max(...lons) > 180) return draw(0) + draw(-360);
    if (Math.min(...lons) < -180) return draw(0) + draw(360);
    return draw(0);
  };
  const out: string[] = [];
  for (const g of topo.objects.land.geometries) {
    const polys = g.type === "Polygon" ? [g.arcs] : g.arcs;
    for (const poly of polys) for (const r of poly) out.push(ring(r));
  }
  return out.join("");
}

/**
 * Country borders, faint, from world-atlas countries-50m (the same source and
 * detail as the coastline, so they meet it exactly). Only arcs two countries
 * share are drawn: the coast is already the land's edge.
 */
function bordersPath(file: string): string {
  const topo = JSON.parse(readFileSync(file, "utf8"));
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;
  const owners = new Map<number, Set<number>>();
  topo.objects.countries.geometries.forEach((g: { type: string; arcs: unknown }, gi: number) => {
    const walk = (a: unknown): void => {
      if (typeof a === "number") {
        const i = a < 0 ? ~a : a;
        if (!owners.has(i)) owners.set(i, new Set());
        owners.get(i)!.add(gi);
      } else if (Array.isArray(a)) a.forEach(walk);
    };
    walk(g.arcs);
  });
  const out: string[] = [];
  owners.forEach((who, i) => {
    if (who.size < 2) return;
    let ax = 0, ay = 0;
    const pts = topo.arcs[i].map(([dx, dy]: number[]) => { ax += dx; ay += dy; return [ax * sx + tx, ay * sy + ty]; });
    let d = "";
    pts.forEach(([lon, lat]: number[], k: number) => {
      // A border that crosses the 180 meridian is lifted there, not drawn round.
      const jump = k > 0 && Math.abs(lon - pts[k - 1][0]) > 180;
      d += `${k === 0 || jump ? "M" : "L"}${f(x(lon))},${f(y(lat))}`;
    });
    out.push(d);
  });
  return out.join("");
}

/**
 * Each city's continent, for the Find My Places continent filter (Kaycee,
 * 2026-10-11). From Natural Earth's countries, joined on ADM0_A3, with the
 * few places that file leaves out or files under open ocean placed by hand,
 * Russia split at the Urals (60E) so Vladivostok is not counted as Europe, and
 * Turkey at the Bosphorus.
 */
const CONTINENT = new Map<string, string>();
for (const f of JSON.parse(readFileSync(join(".cache", "natural-earth", "ne_50m_admin_0_countries.geojson"), "utf8")).features) {
  CONTINENT.set(String(f.properties.ADM0_A3), String(f.properties.CONTINENT));
}
const BY_HAND: Record<string, string> = {
  GIB: "Europe", SJM: "Europe", SSD: "Africa",          // not in the countries file under these codes
  SHN: "Africa", SYC: "Africa", MUS: "Africa",          // filed under open ocean
  MDV: "Asia", IOT: "Asia", SGS: "South America", ATF: "Africa", HMD: "Oceania",
};
function continentOf(adm0: string, lon: number): string {
  if (adm0 === "RUS") return lon >= 60 ? "Asia" : "Europe";
  // and Turkey at the Bosphorus, so Istanbul and Thrace are Europe
  if (adm0 === "TUR") return lon < 29.1 ? "Europe" : "Asia";
  const c = BY_HAND[adm0] ?? CONTINENT.get(adm0) ?? "";
  if (!c) throw new Error(`no continent for country ${adm0}`);
  return c;
}

/** Natural Earth's populated places: name, country, position, and the zoom
 *  at which a web map would first show it, which decides when it appears. */
function cities(file: string) {
  const geo = JSON.parse(readFileSync(file, "utf8"));
  return geo.features.map((ft: { properties: Record<string, unknown> }) => {
    const q = ft.properties;
    return {
      n: String(q.name), c: String(q.adm0name), lat: r3(Number(q.latitude)), lon: r3(Number(q.longitude)),
      z: Number(q.min_zoom), cap: String(q.featurecla).startsWith("Admin-0 capital") ? 1 : 0,
      // Research stations are places on the map but not places to live.
      stn: String(q.featurecla) === "Scientific station" ? 1 : 0,
      pop: Number(q.pop_max),
      ct: continentOf(String(q.adm0_a3), Number(q.longitude)),
    };
  }).sort((a: { z: number; pop: number }, b: { z: number; pop: number }) => a.z - b.z || b.pop - a.pop);
}

const OUT = join("public", "world", "world-v1.json");
mkdirSync(join("public", "world"), { recursive: true });
const world = {
  v: 1, W, H, TOP, BOTTOM,
  land: landPath(join(".cache", "world-atlas", "land-50m.json")),
  borders: bordersPath(join(".cache", "world-atlas", "countries-50m.json")),
  cities: cities(join(".cache", "natural-earth", "ne_50m_populated_places_simple.geojson")),
};
writeFileSync(OUT, JSON.stringify(world));
console.log(OUT, (JSON.stringify(world).length / 1024).toFixed(0) + " KB", world.cities.length, "cities");
