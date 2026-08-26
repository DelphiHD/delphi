// The sky for one date, for the transit overlay on a client chart page.
//
// The chart itself stays a baked file. Only the positions come from here, so a
// client can step to any date, forwards or back, without the page being
// re-rendered. The read that goes with a date is baked into the chart, because
// those live in Kaycee's own morning reports.
//
// A moment in the sky is fixed, so every answer is cached: the same date asked
// twice is one call to the chart provider, ever. Her plan has unlimited charts,
// so this is about speed rather than money.
//
// Anchored at 12:00 UTC, matching the anchor her daily report uses, so the
// chart and the read describe the same moment.

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { castSkyAt } from "@/lib/transit/sky";

export const dynamic = "force-dynamic";

const ANCHOR = "12:00";
// Wide enough for a second Saturn return either side of a working life, narrow
// enough that nobody can walk the provider through the entire ephemeris.
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

const bad = (msg: string, code = 400) =>
  NextResponse.json({ ok: false, error: msg }, { status: code });

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date must be YYYY-MM-DD");
  const when = new Date(date + "T12:00:00Z");
  if (Number.isNaN(when.getTime())) return bad("not a real date");
  const year = +date.slice(0, 4);
  if (year < MIN_YEAR || year > MAX_YEAR) return bad(`date must be between ${MIN_YEAR} and ${MAX_YEAR}`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    : null;

  if (db) {
    const { data } = await db.from("sky_cache").select("positions").eq("date", date).maybeSingle();
    if (data?.positions) {
      return NextResponse.json({ ok: true, date, anchor: ANCHOR, positions: data.positions, cached: true });
    }
  }

  let positions;
  try {
    const moment = await castSkyAt(date, ANCHOR, "UTC");
    positions = moment.positions.map((p) => ({
      planet: p.planet, gate: p.gate, line: p.line, fixingState: p.fixingState,
    }));
  } catch (e) {
    console.error("sky: cast failed", date, e);
    return bad("could not read the sky for that date", 502);
  }

  // best effort: a failed cache write must not fail the request
  if (db) {
    const { error } = await db.from("sky_cache").upsert({ date, positions });
    if (error) console.error("sky: cache write failed", date, error.message);
  }

  return NextResponse.json({
    ok: true, date, anchor: ANCHOR, positions, cached: false,
    // a day's sky never changes, so this is safe to hold onto for a long time
    headers: undefined,
  }, { headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
}
