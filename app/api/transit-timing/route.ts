/**
 * When each transiting body entered the sign and gate it is in, and when it
 * leaves. Kaycee, 2026-10-05: "We want to know, when this planet entered this
 * sign and gate and when it moves to the next sign and gate. Organize it by
 * sign, then gate."
 *
 * Ours rather than the provider's: neither of its endpoints returns an
 * ingress, only a position. The search lives in lib/hd/ephemeris and was
 * checked against known dates before anything was built on it, including the
 * awkward ones where a planet retrogrades back over a cusp and returns:
 * Pluto's final entry into Aquarius on 19 November 2024 and Neptune's into
 * Aries on 26 January 2026 both come back right.
 *
 * The lunar nodes are not in the ephemeris this uses, so they come back with
 * no timing rather than a guess.
 */
import { NextResponse } from "next/server";
import { bandStay, longitudeAt, COMPUTABLE_BODIES } from "@/lib/hd/ephemeris";
import { gateLineFromLongitude } from "@/lib/hd/gate-longitude";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

const ZODIAC = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

/** Chiron is in the slow table, so it answers even though it is not in the
 *  computable list. */
const BODIES = [...COMPUTABLE_BODIES, "Chiron"];

const bad = (m: string, code = 400) =>
  NextResponse.json({ ok: false, error: m }, { status: code });

// One minute of sky is the same answer for everyone who asks it, and the
// search is the expensive part, so the answer is kept.
const cache = new Map<string, unknown>();

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const date = (q.get("date") ?? "").trim();
  const time = (q.get("time") ?? "12:00").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("a date is needed, as YYYY-MM-DD");
  if (!/^\d{2}:\d{2}$/.test(time)) return bad("a time is needed, as HH:MM");

  const key = `${date}T${time}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.json(hit);

  const when = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(when.getTime())) return bad("that is not a moment");

  try {
    const bodies = BODIES.map((planet) => {
      const lon = longitudeAt(planet, when);
      if (lon === null) return { planet, computable: false };
      const sign = bandStay(planet, when, "sign");
      const gate = bandStay(planet, when, "gate");
      const gl = gateLineFromLongitude(lon);
      return {
        planet, computable: true,
        sign: ZODIAC[sign ? sign.index : 0],
        signEntered: sign?.enteredUtc ?? null,
        signLeaves: sign?.leavesUtc ?? null,
        gate: gl.gate, line: gl.line,
        gateEntered: gate?.enteredUtc ?? null,
        gateLeaves: gate?.leavesUtc ?? null,
      };
    });
    const body = { ok: true, date, time, bodies };
    if (cache.size > 400) cache.clear();
    cache.set(key, body);
    return NextResponse.json(body);
  } catch (e) {
    console.error(`transit timing ${date} ${time}: ${e instanceof Error ? e.message : String(e)}`);
    return bad("that could not be cast", 502);
  }
}
