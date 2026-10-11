/**
 * The relocated chart for The World: a chart's birth moment, both sides, cast
 * at another place, with its wheels.
 *
 * Everything about the person comes from the chart record and the provider,
 * never from the page: the page sends only the chart link and where to cast.
 * The work is lib/world-relocate.ts, shared with the local preview server.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getChart } from "@/lib/mybodygraph";
import { relocate } from "@/lib/world-relocate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

const bad = (m: string, code = 400) => NextResponse.json({ ok: false, error: m }, { status: code });

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const token = (q.get("token") ?? "").trim();
  const lat = Number(q.get("lat")), lon = Number(q.get("lon"));
  if (!/^[0-9a-f]{32}$/.test(token)) return bad("that is not a chart");
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return bad("no coordinates");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return bad("this server cannot reach the database", 500);
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: chart } = await db.from("charts")
    .select("person_name, birth_date, birth_time, birth_place, birth_timezone")
    .eq("token", token).maybeSingle();
  if (!chart) return bad("no chart with that link", 404);
  if (!chart.birth_time) return bad("a relocated chart needs a birth time", 422);

  // The second person of a Relationship, whose birth the page has from the
  // connection it cast (they may not have a chart here at all). Still needs a
  // chart link; casting a moment at a place says nothing about anyone.
  if (q.get("who") === "b") {
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
    const p = q.get("p") ?? "", d = q.get("d") ?? "", place = (q.get("place") ?? "").slice(0, 160);
    if (!iso.test(p) || !iso.test(d) || place.length < 2) return bad("the other person's birth is needed");
    const gates = (k: string) => (q.get(k) ?? "").split(",").map(Number).filter((n) => n >= 1 && n <= 64);
    try {
      const out = await relocate({ place, utc: p, designUtc: d, lat, lon, wheels: q.get("wheels") !== "0",
        name: (q.get("name") ?? "").slice(0, 80), at: (q.get("at") ?? "").slice(0, 120),
        personalityGates: gates("pg"), designGates: gates("dg") });
      return NextResponse.json({ ok: true, ...out });
    } catch (e) {
      console.error(`relocate b ${token}: ${e instanceof Error ? e.message : String(e)}`);
      return bad("that could not be cast", 502);
    }
  }

  try {
    const hd = await getChart({
      birthDate: String(chart.birth_date),
      birthTime: String(chart.birth_time).slice(0, 5),
      timezone: String(chart.birth_timezone),
    });
    const out = await relocate({
      place: String(chart.birth_place),
      utc: hd.birth.utcDate, designUtc: hd.birth.designUtcDate,
      lat, lon,
      wheels: q.get("wheels") !== "0",
      name: String(chart.person_name),
      at: (q.get("at") ?? "").slice(0, 120),
      personalityGates: hd.activations.personality.map((a) => a.gate),
      designGates: hd.activations.design.map((a) => a.gate),
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    console.error(`relocate ${token}: ${e instanceof Error ? e.message : String(e)}`);
    return bad("that could not be cast", 502);
  }
}
