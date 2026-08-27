/**
 * Natal astrology data from bodygraphchart.
 *
 * A separate endpoint from the Human Design one, on its own API version
 * (v240815 rather than v221006), which is why it is easy to miss: probing
 * /v221006/astro-data returns "API endpoint not found".
 *
 * It returns real astrology, not HD: zodiac longitudes, houses, aspects and
 * the angles. The `design` parameter returns a rendered wheel as well, but
 * that wheel draws every glyph and number as a path rather than as text, so
 * its typography cannot be restyled. We draw our own from these numbers.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const API_BASE = "https://api.bodygraphchart.com";
const ASTRO_PATH = "/v240815/astro-data";
const LOCATIONS_PATH = "/v210502/locations";

function apiKey(): string {
  const k = process.env.MYBODYGRAPH_API_KEY ?? process.env.BODYGRAPHCHART_API_KEY;
  if (!k) throw new Error("MYBODYGRAPH_API_KEY is not set");
  return k;
}

export interface AstroPoint {
  name: string;
  sign: string;
  sign_num: number;
  /** degrees within the sign */
  position: number;
  /** degrees round the whole zodiac, 0 at 0 Aries */
  abs_pos: number;
  element: string;
  quality: string;
  emoji: string;
  house: string;
  point_type: string;
}

export interface AstroAspect {
  p1_name: string;
  p2_name: string;
  p1_abs_pos: number;
  p2_abs_pos: number;
  aspect: string;
  orbit: number;
}

export interface AstroChart {
  planets: AstroPoint[];
  houses: AstroPoint[];
  aspects: AstroAspect[];
  ascendant: number;
  mc: number;
  /** the provider's own wheel, kept for reference; we render our own */
  providerSvg?: string;
}

/**
 * Coordinates, which the astrology endpoint needs and the HD one does not.
 *
 * The provider's own location lookup returns a timezone and nothing else, no
 * latitude or longitude, and sending it none is not an error: it quietly falls
 * back to somewhere off the coast of Africa. For a 6:29am birth in Utah that
 * put the Ascendant in Sagittarius instead of Cancer, which rotates the whole
 * wheel and moves every planet into the wrong house. So the timezone comes from
 * the provider and the coordinates come from OpenStreetMap, cached on disk so a
 * place is only ever looked up once.
 */
const GEO_CACHE = ".cache/geocode.json";

function readGeoCache(): Record<string, { lat: number; lon: number }> {
  try { return JSON.parse(readFileSync(GEO_CACHE, "utf8")); } catch { return {}; }
}

async function geocode(query: string): Promise<{ lat: number; lon: number }> {
  const cache = readGeoCache();
  if (cache[query]) return cache[query];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const res = await fetch(url, { headers: { "User-Agent": "delphi-hd-reports/1.0 (charts.delphihd.com)" } });
  if (!res.ok) throw new Error(`geocoding failed for "${query}": ${res.status}`);
  const hits: any = await res.json();
  if (!Array.isArray(hits) || !hits.length) {
    throw new Error(`no coordinates found for "${query}" — try the nearest larger town`);
  }
  const out = { lat: Number(hits[0].lat), lon: Number(hits[0].lon) };
  if (!Number.isFinite(out.lat) || !Number.isFinite(out.lon)) {
    throw new Error(`geocoder returned no usable coordinates for "${query}"`);
  }
  cache[query] = out;
  mkdirSync(".cache", { recursive: true });
  writeFileSync(GEO_CACHE, JSON.stringify(cache, null, 2));
  return out;
}

export async function locate(query: string): Promise<{ timezone: string; lat: number; lon: number }> {
  const url = new URL(API_BASE + LOCATIONS_PATH);
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("query", query);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`locations failed: ${res.status}`);
  const hits = await res.json();
  if (!Array.isArray(hits) || !hits.length) {
    throw new Error(`no location match for "${query}" — try the nearest larger town`);
  }
  const { lat, lon } = await geocode(query);
  return { timezone: hits[0].timezone, lat, lon };
}

export async function getAstro(args: {
  birthDate: string;
  birthTime: string;
  place: string;
  /** Placidus by default; the API takes about twenty systems as single letters */
  houseSystem?: string;
  includeProviderSvg?: boolean;
}): Promise<AstroChart> {
  const loc = await locate(args.place);
  const url = new URL(API_BASE + ASTRO_PATH);
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("date", `${args.birthDate} ${args.birthTime}`);
  url.searchParams.set("timezone", loc.timezone);
  url.searchParams.set("latitude", String(loc.lat));
  url.searchParams.set("longitude", String(loc.lon));
  url.searchParams.set("house_system", args.houseSystem ?? "P");
  if (args.includeProviderSvg) url.searchParams.set("design", "delphi");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`astro-data failed: ${res.status} ${res.statusText}`);
  const j: any = await res.json();

  const clean = (p: any): AstroPoint => ({
    name: p.name, sign: p.sign, sign_num: p.sign_num, position: p.position,
    abs_pos: p.abs_pos, element: p.element, quality: p.quality,
    emoji: p.emoji, house: p.house, point_type: p.point_type,
  });

  return {
    planets: Object.values(j.Planets ?? {}).map(clean),
    houses: (j.Houses ?? []).map(clean),
    aspects: Object.values(j.Aspects ?? {}) as AstroAspect[],
    ascendant: j.ASCMC?.[0] ?? 0,
    mc: j.ASCMC?.[1] ?? 0,
    providerSvg: j.SVG,
  };
}
