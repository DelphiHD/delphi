/**
 * The sky over a chart, drawn, for a moment the reader picks.
 *
 * Kaycee's list, 2026-10-05: a Transit pill that "allows someone to see todays
 * transit cast on their chart with option to change the date", opening on the
 * transit alone, and able to ride on either side.
 *
 * A published chart is a baked file, so it cannot draw a wheel for a date
 * nobody knew about when it was built. This renders one on request, with the
 * same renderer the page itself was drawn with, so the two can never be two
 * different pictures of the same thing.
 *
 * WHERE A TRANSIT IS CAST
 *
 * Greenwich by default. Kaycee, 2026-10-05: "we need to add a location field
 * that defaults to greenwich time, but can be adjusted to local time if
 * needed." A chart of the moment is not about where anybody was born, and
 * quietly using the birth place would be an answer nobody gave. A place sent
 * from the form is the provider's own, so its coordinates and timezone are
 * theirs and never guessed.
 *
 * ORBS
 *
 * Hers, 2026-10-05: one degree for everything, three for the Sun, and the
 * Moon kept apart at three because it moves thirteen degrees a day and its
 * aspects last hours rather than days. Her synastry orbs would paint a
 * transit chart solid.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAstro } from "@/lib/astro";
import { getChart } from "@/lib/mybodygraph";
import { renderWheel } from "@/scripts/astro-wheel";
import { crossAspects } from "@/lib/astro-extras";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

const TRANSIT_COLOUR = "#0d9488";

/**
 * The default moment is Greenwich time, which is UTC, and that is not the
 * same thing as London's clock: London runs an hour ahead of it all summer.
 * So the hour is read as UTC outright rather than as a local time somewhere,
 * and the only thing the place is used for is the horizon the houses hang
 * off. The provider has no Greenwich of its own; London is eight kilometres
 * away and is the nearest it knows.
 */
const GREENWICH_PLACE = "London, England, United Kingdom";

/** Tight, because a transiting body is always in range of something. */
const TRANSIT_ORBS: Record<string, number> = {
  conjunction: 1, opposition: 1, square: 1, trine: 1, sextile: 1,
};
const WIDE_FOR = new Set(["Sun", "Moon"]);
const WIDE = 3;

const bad = (m: string, code = 400) => NextResponse.json({ ok: false, error: m }, { status: code });

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const token = (q.get("token") ?? "").trim();
  const date = (q.get("date") ?? "").trim();
  const time = (q.get("time") ?? "12:00").trim();
  const side = q.get("side") === "design" ? "design" : "personality";
  // "alone" draws the sky by itself; otherwise it rides over the named side.
  const mode = q.get("mode") === "alone" ? "alone" : "over";
  // A place sent from the form is a local clock somewhere. No place means
  // Greenwich, and Greenwich time is UTC.
  const asked = (q.get("place") ?? "").trim();
  const place = asked || GREENWICH_PLACE;
  const atUtc = asked ? undefined : `${date}T${time}:00+00:00`;

  if (!/^[0-9a-f]{32}$/.test(token)) return bad("that is not a chart");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("a date is needed, as YYYY-MM-DD");
  if (!/^\d{2}:\d{2}$/.test(time)) return bad("a time is needed, as HH:MM");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return bad("this server cannot reach the database", 500);
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: chart } = await db.from("charts")
    .select("person_name, birth_date, birth_time, birth_place, birth_timezone, time_accuracy")
    .eq("token", token).maybeSingle();
  if (!chart) return bad("no chart with that link", 404);

  try {
    // The sky itself, cast where the reader asked for it.
    const sky = await getAstro({ birthDate: date, birthTime: time, place, atUtc });

    if (mode === "alone") {
      return NextResponse.json({
        ok: true,
        wheelSvg: renderWheel(sky, "Transit", null, "ascendant", [], [], []),
        aspects: [],
        place, utc: !asked,
      });
    }

    // The chart it is arriving over. A chart with no birth time is cast at
    // noon, exactly as its own page was, so the two agree.
    //
    // The design side is a different moment, not the same chart relabelled.
    // Asking only for the birth chart and calling it the design was the first
    // version of this and it answered with identical aspects for both sides,
    // which is how it was caught.
    const born = {
      birthDate: String(chart.birth_date),
      birthTime: String(chart.birth_time ?? "12:00").slice(0, 5),
      place: String(chart.birth_place),
    };
    let designUtc: string | undefined;
    if (side === "design") {
      const hd = await getChart({
        birthDate: born.birthDate, birthTime: born.birthTime,
        timezone: String(chart.birth_timezone), locationQuery: born.place,
      });
      designUtc = hd.birth.designUtcDate;
      if (!designUtc) return bad("that chart has no design moment to cast", 502);
    }
    const natal = await getAstro({ ...born, atUtc: designUtc });

    // Transit to natal, which is the reading. Each aspect is measured against
    // the body doing the transiting, so the Sun and the Moon get their wider
    // orb wherever they appear.
    const all = crossAspects(natal.planets, sky.planets, { ...TRANSIT_ORBS, quintile: 0 });
    const aspects = all.filter((a) => {
      const allowed = WIDE_FOR.has(a.p2_name) || WIDE_FOR.has(a.p1_name) ? WIDE : 1;
      return Math.abs(a.orbit) <= allowed;
    });

    return NextResponse.json({
      ok: true,
      wheelSvg: renderWheel(natal, String(chart.person_name), sky, "ascendant", [], [], [],
        null, undefined, null,
        { side: "transit", outside: true, colour: TRANSIT_COLOUR },
        side === "design" ? "design" : "personality",
        aspects),
      aspects: aspects.map((a) => ({
        natal: a.p1_name, transit: a.p2_name, aspect: a.aspect,
        orbit: Math.round(Math.abs(a.orbit) * 10) / 10,
        moon: a.p2_name === "Moon",
      })),
      place, utc: !asked,
    });
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    console.error(`transit wheel ${token} ${date}: ${why}`);
    return bad(why, 502);
  }
}
