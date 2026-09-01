// A connection chart for the person whose chart this is, against anybody.
//
// The chart page is a baked file and cannot hold the provider key, so it asks
// here instead: birth date, time and place go in, the pair's chart comes back.
// Same shape as /api/sky, which the transit picker already uses, so a client can
// run a connection against anyone without anything being rebuilt.
//
// The client is identified by their chart token rather than by anything they
// type, so a page can only ever ask for connections against its own owner.

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getConnectionChart } from "@/lib/hd/relationship";
import { getTimezoneForLocation } from "@/lib/mybodygraph";
import { getAstro } from "@/lib/astro";
import { renderWheel } from "@/scripts/astro-wheel";
import { CLIENTS } from "@/scripts/client-roster";

export const dynamic = "force-dynamic";

const bad = (msg: string, code = 400) =>
  NextResponse.json({ ok: false, error: msg }, { status: code });

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const token = (q.get("token") ?? "").trim();
  const date = (q.get("date") ?? "").trim();      // YYYY-MM-DD
  const time = (q.get("time") ?? "").trim();      // HH:MM
  const place = (q.get("place") ?? "").trim();
  const name = (q.get("name") ?? "").trim() || "Their chart";

  if (!/^[a-f0-9]{32}$/.test(token)) return bad("a chart token is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date must be YYYY-MM-DD");
  if (!/^\d{2}:\d{2}$/.test(time)) return bad("time must be HH:MM");
  if (place.length < 2 || place.length > 120) return bad("a birth place is required");

  const year = Number(date.slice(0, 4));
  if (year < 1900 || year > 2100) return bad("that birth year is outside what the provider covers");

  // Who the page belongs to. Nothing the caller types decides this.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: rec } = await db
    .from("client_charts")
    .select("client_slug, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!rec || rec.revoked_at) return bad("that chart link is not active", 404);

  const me = CLIENTS[rec.client_slug];
  if (!me) return bad("that chart is no longer on the roster", 404);

  try {
    const [mineTz, theirTz] = await Promise.all([
      getTimezoneForLocation(me.birthPlace),
      getTimezoneForLocation(place),
    ]);
    const conn = await getConnectionChart(
      { name: me.name, birthDate: me.birthDate, birthTime: me.birthTime, birthTimezone: mineTz },
      { name, birthDate: date, birthTime: time, birthTimezone: theirTz },
    );
    // The partner's natal astrology, fetched alongside the connection. The
    // synastry wheel needs it, and a failure there must not cost the connection
    // itself, so it is caught separately.
    // Both wheels, and the synastry drawing made from them. Clicking Astrology on
    // a connection should simply show the pair, with nothing else asked of the
    // reader, so the wheel is rendered here rather than left to the page.
    let astro = null;
    let wheelSvg: string | null = null;
    try {
      const [mine, theirs] = await Promise.all([
        getAstro({ birthDate: me.birthDate, birthTime: me.birthTime, place: me.birthPlace }),
        getAstro({ birthDate: date, birthTime: time, place }),
      ]);
      astro = theirs;
      // The base chart keeps its ascendant and houses; the second contributes
      // planets only. That is the convention for a bi-wheel.
      const carried = [...new Set([...conn.a.gates, ...conn.b.gates])];
      wheelSvg = renderWheel(
        mine, `${conn.a.name} and ${conn.b.name}`, theirs, "aries",
        carried,
        [...new Set(conn.a.gates)],
        [...new Set(conn.b.gates)],
      );
    } catch {
      astro = null;
      wheelSvg = null;
    }

    return NextResponse.json({
      ok: true,
      astro,
      wheelSvg,
      a: conn.a,
      b: conn.b,
      definedTogether: conn.definedTogether,
      openTogether: conn.openTogether,
      definitionLabel: conn.definitionLabel,
      channels: conn.channels,
    });
  } catch (e) {
    return bad(`could not read that chart: ${(e as Error).message}`, 502);
  }
}
