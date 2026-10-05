/**
 * The sky's bodies as a layer to lay over a chart's mandala.
 *
 * The Wheel was the one view that ignored the Transit chart type: the
 * bodygraph re-lights at runtime, the astrology wheel is rendered per request,
 * and the mandala was baked once with the client's own planets and never
 * looked again. Kaycee, 2026-10-05: "Oh yeah, I don't see it there."
 *
 * The whole wheel is not re-rendered, because the published file's mandala
 * carries a bodygraph composited into its hub and a ring on every gate that
 * chart's anchors know about. This returns only the transit's spokes and
 * glyphs, in the same geometry, for the page to drop in and take out again.
 */
import { NextResponse } from "next/server";
import { castSkyAt } from "@/lib/transit/sky";
import { renderTransitLayer } from "@/lib/render/mandala";
import { PLANET_ORDER, type Activation, type Planet } from "@/lib/render/mandala.types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

/** The published chart draws its mandala at this size and glyph scale, so a
 *  layer meant to sit on top of it has to be cast at the same ones. */
const SIZE = 1200;
const GLYPH_SCALE = 1.8;

const KNOWN = new Set<string>(PLANET_ORDER);
const idOf = (name: string) => name.toLowerCase().replace(/\s+/g, "-");

const bad = (m: string, code = 400) =>
  NextResponse.json({ ok: false, error: m }, { status: code });

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const date = (q.get("date") ?? "").trim();
  const time = (q.get("time") ?? "12:00").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("a date is needed, as YYYY-MM-DD");
  if (!/^\d{2}:\d{2}$/.test(time)) return bad("a time is needed, as HH:MM");

  try {
    const moment = await castSkyAt(date, time, "UTC");
    // Chiron and Lilith are not on the mandala's spoke list, the same as
    // everywhere else that counts the thirteen.
    const activations: Activation[] = moment.positions
      .filter((p) => KNOWN.has(idOf(p.planet)))
      .map((p) => ({
        side: "transit" as const,
        planet: idOf(p.planet) as Planet,
        gate: p.gate,
        line: p.line,
        longitude: p.longitude,
      }));
    return NextResponse.json({
      ok: true, date, time,
      layer: renderTransitLayer(activations, { size: SIZE, glyphScale: GLYPH_SCALE }),
      count: activations.length,
    });
  } catch (e) {
    console.error(`transit mandala ${date} ${time}: ${e instanceof Error ? e.message : String(e)}`);
    return bad("that could not be cast", 502);
  }
}
