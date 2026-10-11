/**
 * The transiting sky for The World: every body's right ascension and
 * declination at one UTC moment, and its sign and degree. The page draws the
 * transit lines from these against the chart's own sidereal time. A fact of the
 * sky, the same for everyone, so no chart link is needed. lib/world-transit.ts.
 */
import { NextResponse } from "next/server";
import { transitSky } from "@/lib/world-transit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

const bad = (m: string, code = 400) => NextResponse.json({ ok: false, error: m }, { status: code });

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const date = q.get("date") ?? "", time = q.get("time") ?? "12:00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date must be YYYY-MM-DD");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return bad("time must be HH:MM, 24 hour");
  const when = new Date(`${date}T${time}:00Z`);
  const year = when.getUTCFullYear();
  if (Number.isNaN(when.getTime()) || year < 1900 || year > 2100) return bad("date must be between 1900 and 2100");
  try {
    const sky = await transitSky(when);
    return NextResponse.json({ ok: true, ...sky }, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    console.error(`world-sky ${date} ${time}: ${e instanceof Error ? e.message : String(e)}`);
    return bad("that could not be cast", 502);
  }
}
