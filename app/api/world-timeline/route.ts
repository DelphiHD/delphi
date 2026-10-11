/**
 * Upcoming transits to one place's relocated angles, for The World: when each
 * transiting body comes within orb of that place's Ascendant, Descendant,
 * Midheaven and IC, both sides, over the coming year. The person comes from the
 * chart record, never the page. lib/world-transit.ts.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getChart } from "@/lib/mybodygraph";
import { placeTimeline } from "@/lib/world-transit";
import { WORLD_BODIES } from "@/lib/world";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

const bad = (m: string, code = 400) => NextResponse.json({ ok: false, error: m }, { status: code });

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const token = (q.get("token") ?? "").trim();
  const lat = Number(q.get("lat")), lon = Number(q.get("lon"));
  const from = new Date(`${q.get("date") ?? ""}T${q.get("time") ?? "12:00"}:00Z`);
  const bodies = (q.get("bodies") ?? "").split(",").filter((b) => (WORLD_BODIES as readonly string[]).includes(b));
  if (!/^[0-9a-f]{32}$/.test(token)) return bad("that is not a chart");
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return bad("no coordinates");
  if (Number.isNaN(from.getTime())) return bad("a date is needed, as YYYY-MM-DD");
  if (!bodies.length) return bad("no bodies");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return bad("this server cannot reach the database", 500);
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: chart } = await db.from("charts")
    .select("birth_date, birth_time, birth_place, birth_timezone").eq("token", token).maybeSingle();
  if (!chart) return bad("no chart with that link", 404);
  if (!chart.birth_time) return bad("a timeline needs a birth time", 422);
  try {
    const hd = await getChart({ birthDate: String(chart.birth_date), birthTime: String(chart.birth_time).slice(0, 5), timezone: String(chart.birth_timezone) });
    const events = await placeTimeline({ place: String(chart.birth_place), utc: hd.birth.utcDate, designUtc: hd.birth.designUtcDate,
      lat, lon, from, days: 365, bodies });
    return NextResponse.json({ ok: true, from: from.toISOString(), events });
  } catch (e) {
    console.error(`world-timeline ${token}: ${e instanceof Error ? e.message : String(e)}`);
    return bad("that could not be worked out", 502);
  }
}
