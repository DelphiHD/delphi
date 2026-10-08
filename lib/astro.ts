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
import { join } from "node:path";
import { cacheRoot, tryMkdir } from "@/lib/cache-dir";

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
  /** first sentence of the provider's own text, for a hover. Their words, not
   *  ours: nothing here is authored. */
  blurb?: string;
  signBlurb?: string;
  /** What to call it on screen. The API's node names are misleading: Mean_Node
   *  and True_Node come back exactly 180 degrees apart on every chart, which is
   *  the node axis, not the one-degree difference between a mean and a true
   *  north node. Checked against the Human Design North Node on four charts,
   *  True_Node matched it to two decimals every time and Mean_Node was opposite,
   *  so True_Node is north and Mean_Node is south. */
  label: string;
}

export interface AstroAspect {
  p1_name: string;
  p2_name: string;
  p1_abs_pos: number;
  p2_abs_pos: number;
  aspect: string;
  orbit: number;
}

export interface SignNote {
  element: string;
  quality: string;
  /** "The Ram", "The Scales" */
  symbol: string;
  blurb: string;
  /** what the element stands for: "Action and Passion" */
  theme: string;
}

export interface AstroChart {
  planets: AstroPoint[];
  /** the twelve signs with their element, modality and a one-line read */
  signs: Record<string, SignNote>;
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
const GEO_CACHE = join(cacheRoot(), "geocode.json");

/** Kaycee's own words. A sign on the wheel is a sign, not a claim about whoever
 *  is reading, so these are written about the sign itself. Her copy, verbatim. */
const SIGN_NOTE: Record<string, { symbol: string; blurb: string }> = {
  Aries: { symbol: "The Ram", blurb: "Represents courage, initiation, and direct energy." },
  Taurus: { symbol: "The Bull", blurb: "Represents grounding, comfort, reliability, and patience." },
  Gemini: { symbol: "The Twins", blurb: "Represents curiosity, adaptability, and dual perspectives." },
  Cancer: { symbol: "The Crab", blurb: "Represents deep sensitivity, intuition, and nurturing care." },
  Leo: { symbol: "The Lion", blurb: "Represents vitality, confidence, leadership, and creativity." },
  Virgo: { symbol: "The Virgin", blurb: "Represents organization, service, and a helpful nature." },
  Libra: { symbol: "The Scales", blurb: "Represents balance, harmony, relationships, and beauty." },
  Scorpio: { symbol: "The Scorpion", blurb: "Represents intensity, transformation, and emotional depth." },
  Sagittarius: { symbol: "The Archer", blurb: "Represents adventure, expansion, and optimism." },
  Capricorn: { symbol: "The Goat", blurb: "Represents ambition, structure, and hard work." },
  Aquarius: { symbol: "The Water Bearer", blurb: "Represents innovation, independence, and humanitarian ideas." },
  Pisces: { symbol: "The Fish", blurb: "Represents imagination, empathy, and spiritual connection." },
};

/** What each element stands for, also hers. */
const ELEMENT_THEME: Record<string, string> = {
  Fire: "Action and Passion",
  Earth: "Stability and Practicality",
  Air: "Intellect and Communication",
  Water: "Emotion and Intuition",
};

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
  // The cache is a convenience, not a requirement. On a serverless host the
  // filesystem is read-only and this threw, which took down the whole chart
  // for a reason that had nothing to do with the chart.
  try {
    if (tryMkdir(cacheRoot())) writeFileSync(GEO_CACHE, JSON.stringify(cache, null, 2));
  } catch { /* in-memory for this request is enough */ }
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
  /** UTC instant to read instead of the birth moment, for the design side.
   *  The design side is the same person at a different moment, so it is read
   *  the same way: another natal chart, about 88 days earlier, with an
   *  ascendant, angles and houses of its own.
   *
   *  On a wheel cast for the BIRTH moment only its planets are used, the way
   *  a synastry bi-wheel takes planets from the second chart and nothing
   *  else. Its own houses are not wrong there, they simply belong to another
   *  horizon. Reading two designs together means casting the wheel ON that
   *  horizon instead, which /api/connection does: Kaycee, 2026-10-08, "each
   *  design date comes with its own astrology chart and houses. I want to see
   *  those charts cast together." */
  atUtc?: string;
}): Promise<AstroChart> {
  const loc = await locate(args.place);
  const url = new URL(API_BASE + ASTRO_PATH);
  url.searchParams.set("api_key", apiKey());
  if (args.atUtc) {
    // "1983-03-18T22:32:13+00:00" -> "1983-03-18 22:32", read as UTC
    const d = args.atUtc.slice(0, 16).replace("T", " ");
    url.searchParams.set("date", d);
    url.searchParams.set("timezone", "UTC");
  } else {
    url.searchParams.set("date", `${args.birthDate} ${args.birthTime}`);
    url.searchParams.set("timezone", loc.timezone);
  }
  url.searchParams.set("latitude", String(loc.lat));
  url.searchParams.set("longitude", String(loc.lon));
  url.searchParams.set("house_system", args.houseSystem ?? "P");
  if (args.includeProviderSvg) url.searchParams.set("design", "delphi");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`astro-data failed: ${res.status} ${res.statusText}`);
  const j: any = await res.json();

  /** One sentence. The provider writes paragraphs; a hover is not the place. */
  const firstSentence = (t: unknown): string => {
    const s = String(t ?? "").trim();
    if (!s) return "";
    const m = /^.*?[.!?](\s|$)/.exec(s);
    return (m ? m[0] : s).trim();
  };

  const LABEL: Record<string, string> = {
    True_Node: "North Node",
    Mean_Node: "South Node",
    Mean_Lilith: "Lilith",
  };

  const clean = (p: any): AstroPoint => ({
    label: LABEL[p.name] ?? String(p.name ?? "").replace(/_/g, " "),
    name: p.name, sign: p.sign, sign_num: p.sign_num, position: p.position,
    abs_pos: p.abs_pos, element: p.element, quality: p.quality,
    emoji: p.emoji, house: p.house, point_type: p.point_type,
    blurb: firstSentence(p.description?.planet),
    signBlurb: firstSentence(p.description?.zodiac),
  });

  // Element and modality are fixed properties of the signs themselves, so they
  // are counted off the wheel rather than asked for: every fourth sign shares an
  // element, every third a modality.
  const ZODIAC = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  const ELEMENTS = ["Fire", "Earth", "Air", "Water"];
  const QUALITIES = ["Cardinal", "Fixed", "Mutable"];
  // The provider's sign text is written for a person with that Sun sign: "your
  // courage and enthusiasm are your greatest strengths". On a wheel, hovering a
  // sign is not a claim that the reader is one, so that text says something
  // untrue about eleven signs out of twelve. Element and modality are facts and
  // stay; the sentence waits for Kaycee's own words.
  const signs: Record<string, SignNote> = {};
  ZODIAC.forEach((name, i) => {
    const el = ELEMENTS[i % 4];
    signs[name] = {
      element: el,
      quality: QUALITIES[i % 3],
      symbol: SIGN_NOTE[name]?.symbol ?? "",
      blurb: SIGN_NOTE[name]?.blurb ?? "",
      theme: ELEMENT_THEME[el] ?? "",
    };
  });

  const planets = Object.values(j.Planets ?? {}).map(clean);
  const houses = (j.Houses ?? []).map(clean);

  /* The South Node, held exactly opposite the North.
   *
   * The provider's Mean_Node comes back on an exact whole degree every time:
   * 149.000, 158.000, 169.000, 199.000. That is a rounded field, not a mean
   * node, and it is up to a degree away from the true node's opposite. Across
   * 36 of Kaycee's charts it put the South Node on the WRONG LINE in 16 of
   * them, which is 44 per cent, worst case 0.972 degrees against a line of
   * 0.9375.
   *
   * The provider's own Human Design endpoint has the nodes exactly opposite on
   * every chart checked, including one where this field disagrees by a whole
   * gate, so this is that one field rather than the provider's method.
   * Kaycee, 2026-10-05: "as far as I know the nodes are exactly opposite
   * eachother... if it's more accurate then I think we need to change them."
   *
   * Only the position is corrected. The provider's aspect list still measures
   * the node from the rounded value; she does not report on nodal aspects and
   * recomputing the whole set is a bigger change than this one is worth. */
  const north = planets.find((x) => x.name === "True_Node");
  const south = planets.find((x) => x.name === "Mean_Node");
  if (north && south) {
    const abs = (north.abs_pos + 180) % 360;
    const n = Math.floor(abs / 30);
    const sector = houses.findIndex((h: AstroPoint, i: number) => {
      const a = h.abs_pos, b = houses[(i + 1) % houses.length].abs_pos;
      return a <= b ? abs >= a && abs < b : abs >= a || abs < b;
    });
    south.abs_pos = abs;
    south.sign_num = n;
    south.sign = ZODIAC[n];
    south.position = abs % 30;
    south.element = ELEMENTS[n % 4];
    south.quality = QUALITIES[n % 3];
    const sameSign = planets.find((x) => x.sign === ZODIAC[n] && x.emoji);
    if (sameSign) south.emoji = sameSign.emoji;
    if (sector >= 0 && houses[sector]) south.house = houses[sector].name;
  }

  return {
    planets,
    signs,
    houses,
    aspects: Object.values(j.Aspects ?? {}) as AstroAspect[],
    ascendant: j.ASCMC?.[0] ?? 0,
    mc: j.ASCMC?.[1] ?? 0,
    providerSvg: j.SVG,
  };
}
