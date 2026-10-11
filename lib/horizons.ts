/**
 * Chiron's place in the sky, from NASA JPL Horizons.
 *
 * Astro-cartography draws a body's lines from its right ascension and
 * declination. astronomy-engine has no Chiron, and the chart provider returns
 * only its ecliptic longitude, which leaves out the up-to-seven-degree tilt of
 * Chiron's orbit: Kaycee's natal Chiron sat 3.2 degrees below the ecliptic.
 * Horizons is the reference for where solar-system bodies are, free and
 * keyless. Kaycee, 2026-10-10, chose it over drawing Chiron flat on the
 * ecliptic. See docs/DECISIONS.md.
 *
 * Geocentric, apparent (true equator and equinox of date), which is the frame
 * lib/astrocartography.ts uses for every other body. One lookup per instant,
 * cached on disk, so a chart only ever asks once.
 *
 * Checked 2026-10-10 on Kaycee's birth: converted back to ecliptic longitude it
 * agrees with the provider's Chiron to 0.4 arcminutes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cacheRoot } from "@/lib/cache-dir";

const FILE = () => join(cacheRoot(), "horizons-chiron.json");

function readCache(): Record<string, { ra: number; dec: number }> {
  try { return JSON.parse(readFileSync(FILE(), "utf8")); } catch { return {}; }
}

/** Chiron's apparent geocentric RA and Dec in degrees at one UTC instant. */
export async function chironEquatorial(when: Date): Promise<{ ra: number; dec: number }> {
  // Horizons tables by the minute; seconds are irrelevant for a body this slow.
  const key = when.toISOString().slice(0, 16);
  const cache = readCache();
  if (cache[key]) return cache[key];
  const at = key.replace("T", " ");
  // One minute later, worked out as a time: at :59 the old string arithmetic
  // asked for ":60", Horizons refused it, and two charts with a 20:59 design
  // moment could not be published (11 October).
  const stop = new Date(Date.parse(`${key}:00Z`) + 60_000).toISOString().slice(0, 16).replace("T", " ");
  const q = (v: string) => encodeURIComponent(`'${v}'`);
  const url = "https://ssd.jpl.nasa.gov/api/horizons.api?format=json" +
    `&COMMAND=${q("2060;")}&OBJ_DATA=${q("NO")}&MAKE_EPHEM=${q("YES")}&EPHEM_TYPE=${q("OBSERVER")}` +
    `&CENTER=${q("500@399")}&START_TIME=${q(at)}&STOP_TIME=${q(stop)}` +
    `&STEP_SIZE=${q("1 m")}&QUANTITIES=${q("2")}&ANG_FORMAT=${q("DEG")}&EXTRA_PREC=${q("YES")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Horizons failed: ${res.status}`);
  const body = (await res.json()) as { result?: string; error?: string };
  const text = body.result ?? "";
  const rows = text.slice(text.indexOf("$$SOE") + 5, text.indexOf("$$EOE")).trim().split("\n");
  const cols = (rows[0] ?? "").trim().split(/\s+/);
  const ra = Number(cols[cols.length - 2]), dec = Number(cols[cols.length - 1]);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) {
    throw new Error(`Horizons gave no Chiron position for ${key}: ${body.error ?? text.slice(0, 200)}`);
  }
  cache[key] = { ra, dec };
  try { writeFileSync(FILE(), JSON.stringify(cache, null, 2)); } catch { /* in memory is enough */ }
  return { ra, dec };
}
