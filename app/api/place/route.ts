/**
 * Coordinates for a place chosen from /api/places, for The World's search.
 *
 * The provider's place list (the one the chart forms use) gives names and time
 * zones, not coordinates, so a chosen place is located the way a birthplace
 * is: locate() in lib/astro.ts. Kaycee, 2026-10-10, chose the provider's list
 * over a third-party one that would have needed a credit on the map.
 *
 * Needs a chart link, like /api/transit-wheel, so this is not an open
 * geocoder for anyone who finds it.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { locate } from "@/lib/astro";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bad = (m: string, code = 400) => NextResponse.json({ ok: false, error: m }, { status: code });

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const token = (q.get("token") ?? "").trim();
  const value = (q.get("value") ?? "").trim().slice(0, 160);
  if (!/^[0-9a-f]{32}$/.test(token)) return bad("that is not a chart");
  if (value.length < 2) return bad("a place is needed");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return bad("this server cannot reach the database", 500);
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: chart } = await db.from("charts").select("token").eq("token", token).maybeSingle();
  if (!chart) return bad("no chart with that link", 404);

  try {
    const { lat, lon } = await locate(value);
    return NextResponse.json({ ok: true, lat, lon },
      // A place is a fixed fact.
      { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    console.error(`place ${value}: ${e instanceof Error ? e.message : String(e)}`);
    return bad("that place could not be found", 502);
  }
}
