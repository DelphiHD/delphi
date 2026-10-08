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
import { chartByToken, briefFromRecord } from "@/lib/hd/chart-record";
import { renderTransitLayer } from "@/lib/render/mandala";
import { crossAspects, pointAt } from "@/lib/astro-extras";
import { longitudeOf } from "@/lib/hd/gate-longitude";
import { PLANET_ORDER, type Activation, type Planet } from "@/lib/render/mandala.types";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bad = (msg: string, code = 400) =>
  NextResponse.json({ ok: false, error: msg }, { status: code });

// The service client is created without generated database types, so its rows
// come back as `never` once it is passed around as a value. Named here as what
// it is: a Supabase client whose tables this file knows by hand.
type Db = { from: (table: string) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any

interface Person {
  name: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  lookupPlace?: string;
  birthTimezone?: string;
}

/**
 * Whose chart a token names, from either source this system has: the roster
 * Kaycee keeps by hand, or a row in public.charts made through the site. Both
 * answer the same question, and a connection broke on every chart from the
 * second kind until they were read together ("that chart is no longer on the
 * roster", Kaycee 2026-09-17).
 */
async function whoIs(db: Db, token: string): Promise<Person | null> {
  const { data: rec } = await db
    .from("client_charts")
    .select("client_slug, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!rec || rec.revoked_at) return null;
  const roster = CLIENTS[String(rec.client_slug)] as Person | undefined;
  if (roster) return roster;
  const row = await chartByToken(token);
  if (!row) return null;
  const b = briefFromRecord(row);
  return {
    name: b.name, birthDate: b.birthDate, birthTime: b.birthTime,
    birthPlace: b.birthPlace, lookupPlace: b.lookupPlace, birthTimezone: b.birthTimezone,
  };
}

/**
 * The place to ASK about. birthPlace is the truth about where somebody was
 * born and is what their chart prints; a few of them are towns the provider's
 * gazetteer has never heard of, and those carry the nearest city it does know.
 * Without this, David Whiting could not be half of a connection at all.
 */
const askAbout = (p: Person) => p.lookupPlace || p.birthPlace;

/**
 * The Earth, added to the other person's astrology.
 *
 * The astrology provider does not return an Earth: it is not an astrological
 * planet. The chart's owner gets one because the builder reads it out of
 * their Human Design data, where Earth is a placement in its own right with a
 * gate, line, colour, tone and base, and turns that into a longitude. Kaycee,
 * 2026-10-05: "We should have the exact coordinates of the earth placement
 * with the human design data... Why do you think you have to make it up?"
 * Nobody had ever done it for the second person, so their Earth row sat
 * empty: Kaycee, 2026-10-08, "why is person 2's Earth placement not
 * populating in the astrology view?" It is read the same way, from their own
 * Human Design data, and never inferred from their Sun.
 */
function withEarth(
  chart: { planets: { name: string }[]; houses: { abs_pos: number }[] } | null,
  places: readonly { planet: string; gate: number; line: number;
    color?: number; tone?: number; base?: number }[] | undefined,
): void {
  if (!chart || chart.planets.some((p) => p.name === "Earth")) return;
  const e = (places ?? []).find((p) => p.planet === "Earth");
  if (!e) return;
  try {
    const lon = longitudeOf(e.gate, e.line, e.color, e.tone, e.base);
    chart.planets.push(pointAt("Earth", "Earth", lon,
      chart.houses.map((h) => h.abs_pos)) as unknown as { name: string });
  } catch {
    // A gate outside 1..64 is not worth losing the connection over.
  }
}

/**
 * The other person's planets, as a layer to lay over the mandala.
 *
 * The wheel's hub shows both bodygraphs now, and a bodygraph without its
 * planets is half a chart: the glyphs round the wheel were still one person's
 * alone. Kaycee, 2026-10-08: "I only see one set of glyphs. I would expect
 * that Person 1's glyphs would be purple and person 2's glyphs would be teal."
 *
 * Same renderer the sky uses, at the same size and glyph scale the published
 * wheel is drawn at, so it lands exactly on the spokes it belongs to. The two
 * sides go in separate groups and the page tints them, the way the chart's own
 * two sides are told apart.
 */
const MANDALA_SIZE = 1200;
const MANDALA_GLYPH = 1.8;
const KNOWN_PLANET = new Set<string>(PLANET_ORDER);
const planetId = (name: string) => name.toLowerCase().replace(/[_\s]+/g, "-");

function glyphLayer(
  places: readonly { planet: string; gate: number; line: number }[],
  cls: string,
  side: "personality" | "design",
): string {
  const acts: Activation[] = places
    .filter((p) => KNOWN_PLANET.has(planetId(p.planet)))
    .map((p) => ({
      side: "transit" as const,
      planet: planetId(p.planet) as Planet,
      gate: p.gate,
      line: p.line,
    }));
  if (!acts.length) return "";
  // The sky's renderer draws the layer, and it tags everything as the sky,
  // which is true of a transit and not of a person: hovering the other
  // person's Mars on the wheel said "Transit Mars" on a connection. Kaycee,
  // 2026-10-08: "notice that tooltip says Transit Mars, this is on a
  // relationship chart, not a transit chart." The marks are relabelled as
  // whose they actually are, here where it is known.
  return `<g class="${cls}">` +
    renderTransitLayer(acts, { size: MANDALA_SIZE, glyphScale: MANDALA_GLYPH })
      .split('data-side="transit"').join(`data-side="${side}" data-person="b"`) +
    `</g>`;
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const token = (q.get("token") ?? "").trim();
  const other = (q.get("other") ?? "").trim();    // a chart the viewer has saved
  const date = (q.get("date") ?? "").trim();      // YYYY-MM-DD
  const time = (q.get("time") ?? "").trim();      // HH:MM
  const place = (q.get("place") ?? "").trim();
  const name = (q.get("name") ?? "").trim() || "Their chart";

  if (!/^[a-f0-9]{32}$/.test(token)) return bad("a chart token is required");
  if (!other) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date must be YYYY-MM-DD");
    if (!/^\d{2}:\d{2}$/.test(time)) return bad("time must be HH:MM");
    if (place.length < 2 || place.length > 120) return bad("a birth place is required");
    const year = Number(date.slice(0, 4));
    if (year < 1900 || year > 2100) return bad("that birth year is outside what the provider covers");
  }

  // Who the page belongs to. Nothing the caller types decides this.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const me = await whoIs(db, token);
  if (!me) return bad("that chart link is not active", 404);

  // The other half: either birth details typed into the panel, or a chart the
  // viewer already holds.
  //
  // A SAVED CHART IS THE VIEWER'S, NEVER THE PAGE'S. This is the same rule
  // /api/my-charts answers by, and it is the whole of the security here: a
  // chart link is a public address, so without a session check, holding two
  // links would be enough to cast a connection between two strangers who had
  // told this system nothing about each other.
  let them: Person | null = null;
  if (other) {
    if (!/^[a-f0-9]{32}$/.test(other)) return bad("that is not a chart link");
    if (other === token) return bad("that is the same chart");
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return bad("sign in to use a chart you have saved", 401);
    const { data: row } = await db.from("charts").select("owner_id").eq("token", other).maybeSingle();
    if (!row) return bad("that chart could not be found", 404);
    let allowed = String(row.owner_id ?? "") === user.id;
    if (!allowed) {
      const { data: admin } = await db.from("delphi_admins")
        .select("user_id").eq("user_id", user.id).maybeSingle();
      allowed = !!admin;
    }
    if (!allowed && row.owner_id) {
      const { data: link } = await db.from("analyst_clients").select("client_id")
        .eq("analyst_id", user.id).eq("client_id", String(row.owner_id))
        .is("ended_at", null).maybeSingle();
      allowed = !!link;
    }
    if (!allowed) return bad("that chart belongs to somebody else", 403);
    them = await whoIs(db, other);
    if (!them) return bad("that chart could not be found", 404);
  } else {
    them = { name, birthDate: date, birthTime: time, birthPlace: place };
  }

  try {
    const [mineTz, theirTz] = await Promise.all([
      me.birthTimezone || getTimezoneForLocation(askAbout(me)),
      them.birthTimezone || getTimezoneForLocation(askAbout(them)),
    ]);
    const conn = await getConnectionChart(
      { name: me.name, birthDate: me.birthDate, birthTime: me.birthTime, birthTimezone: mineTz },
      { name: them.name, birthDate: them.birthDate, birthTime: them.birthTime, birthTimezone: theirTz },
    );
    // The partner's natal astrology, fetched alongside the connection. The
    // synastry wheel needs it, and a failure there must not cost the connection
    // itself, so it is caught separately.
    // Both wheels, and the synastry drawing made from them. Clicking Astrology on
    // a connection should simply show the pair, with nothing else asked of the
    // reader, so the wheel is rendered here rather than left to the page.
    let astro = null;
    let wheelSvg: string | null = null;
    let wheelSvgB: string | null = null;
    // the same pair on the design horizon, one per base person
    let wheelSvgAD: string | null = null;
    let wheelSvgBD: string | null = null;
    let partnerDesign: unknown = null;
    let wheelError: string | null = null;
    // The aspects between the two of them, kept where the response can reach
    // them: the pair of charts they are worked out from lives inside the wheel
    // block below.
    let synastry: ReturnType<typeof crossAspects> = [];
    // and the same between the two DESIGN charts, because the grid follows
    // whichever chart is being read, not always the personality
    let synastryDesign: ReturnType<typeof crossAspects> = [];
    try {
      const [mine, theirs] = await Promise.all([
        getAstro({ birthDate: me.birthDate, birthTime: me.birthTime, place: askAbout(me) }),
        getAstro({ birthDate: them.birthDate, birthTime: them.birthTime, place: askAbout(them) }),
      ]);
      astro = theirs;
      // Their Earth, before anything is worked out from their planets.
      withEarth(theirs as never, conn.b.personality);
      synastry = crossAspects(mine.planets, theirs.planets);
      // The base chart keeps its ascendant and houses; the second contributes
      // planets only. That is the convention for a bi-wheel.
      const carried = [...new Set([...conn.a.gates, ...conn.b.gates])];
      // The renderer takes the second chart in its design slot, so it comes back
      // in the personality/design colours. On a connection those two sides are
      // two PEOPLE, so they are recoloured to match the bodygraph: the first
      // person purple, the second teal.
      const PERSON_A = "#845095";
      const PERSON_B = "#0d9488";
      // Each person's design moment comes from their own HD response, which is
      // where the 88-degree instant is recorded.
      const designAt = async (utc: string | undefined, birthDate: string, birthTime: string, at: string) =>
        utc ? getAstro({ birthDate, birthTime, place: at, atUtc: utc }).catch(() => null) : null;
      const myDesign = await designAt(
        (conn.a as { designUtc?: string }).designUtc, me.birthDate, me.birthTime, askAbout(me));
      const theirDesign = await designAt(
        (conn.b as { designUtc?: string }).designUtc, them.birthDate, them.birthTime, askAbout(them));
      wheelSvg = renderWheel(
        mine, conn.a.name, myDesign, "ascendant",
        [...new Set([...conn.a.gates, ...conn.b.gates])],
        [...new Set(conn.a.gates)],
        [...new Set(conn.b.gates)],
        { personality: theirs, design: theirDesign, colour: PERSON_B, name: conn.b.name },
        PERSON_A,
        // the gate ring belongs to the two of them, not to personality and design
        { a: PERSON_A, b: PERSON_B },
      );
      // The same wheel from the other side: their houses and ascendant frame it,
      // and the two people keep their colours whichever of them is the base.
      wheelSvgB = renderWheel(
        theirs, conn.b.name, theirDesign, "ascendant",
        [...new Set([...conn.a.gates, ...conn.b.gates])],
        [...new Set(conn.b.gates)],
        [...new Set(conn.a.gates)],
        { personality: mine, design: myDesign, colour: PERSON_A, name: conn.a.name, who: "a" },
        PERSON_B,
        { a: PERSON_B, b: PERSON_A },
      );
      // The same pair read on a DESIGN horizon. A design chart is cast at its
      // own moment and carries its own ascendant and houses, so two designs
      // laid in the personality's house frame are in the wrong frame. Kaycee,
      // 2026-10-08: "each design date comes with its own astrology chart and
      // houses. I want to see those charts cast together." Four wheels, then:
      // either person as the base, on either horizon, and the page picks.
      if (myDesign && theirDesign) {
        wheelSvgAD = renderWheel(
          myDesign, conn.a.name, mine, "ascendant",
          [...new Set([...conn.a.gates, ...conn.b.gates])],
          [...new Set(conn.a.gates)],
          [...new Set(conn.b.gates)],
          { personality: theirDesign, design: theirs, colour: PERSON_B, name: conn.b.name },
          PERSON_A,
          { a: PERSON_A, b: PERSON_B },
          null,
          "design",
        );
        wheelSvgBD = renderWheel(
          theirDesign, conn.b.name, theirs, "ascendant",
          [...new Set([...conn.a.gates, ...conn.b.gates])],
          [...new Set(conn.b.gates)],
          [...new Set(conn.a.gates)],
          { personality: myDesign, design: mine, colour: PERSON_A, name: conn.a.name, who: "a" },
          PERSON_B,
          { a: PERSON_B, b: PERSON_A },
          null,
          "design",
        );
      }
      withEarth(theirDesign as never, conn.b.design);
      if (myDesign && theirDesign) {
        synastryDesign = crossAspects(myDesign.planets, theirDesign.planets);
      }
      partnerDesign = theirDesign;
      if (wheelSvg) {
        wheelSvg = wheelSvg
          .replace(/(data-side="personality"[^>]*?)fill="#2f2a33"/g, `$1fill="${PERSON_A}"`)
          .replace(/(data-side="design"[^>]*?)fill="#e06666"/g, `$1fill="${PERSON_B}"`);
      }
    } catch (e) {
      // Naming the fault rather than silently returning nothing: a wheel that
      // fails to draw should say why, not look like a feature that was never built.
      astro = null;
      wheelSvg = null;
      wheelError = (e as Error).message.slice(0, 200);
    }

    return NextResponse.json({
      ok: true,
      astro,
      astroDesign: partnerDesign,
      wheelSvg,
      wheelSvgB,
      wheelSvgAD,
      wheelSvgBD,
      wheelError,
      a: conn.a,
      b: conn.b,
      // The aspects BETWEEN the two of them, which is what a synastry is and
      // what the provider never returns: it only aspects within one chart.
      // The grid on the astrology view had nothing to draw from on a
      // connection, so it was simply not offered there. Kaycee, 2026-10-08:
      // "where is the aspect grid in the astrology view?"
      synastry,
      synastryDesign,
      // The other person's own moments, so the Dates tab can say whose dates
      // it is showing instead of presenting one person's as the chart's.
      bBirth: {
        born: `${them.birthDate}${them.birthTime ? " \u00b7 " + them.birthTime : ""}`,
        place: them.birthPlace,
        design: (conn.b as { designUtc?: string }).designUtc
          ? String((conn.b as { designUtc?: string }).designUtc).slice(0, 16).replace("T", " \u00b7 ") + " UTC"
          : "",
      },
      // the other person's planets, ready to lay over the wheel
      mandalaLayer:
        glyphLayer(conn.b.personality ?? [], "pairb pairb-personality", "personality") +
        glyphLayer(conn.b.design ?? [], "pairb pairb-design", "design"),
      definedTogether: conn.definedTogether,
      openTogether: conn.openTogether,
      definitionLabel: conn.definitionLabel,
      channels: conn.channels,
    });
  } catch (e) {
    return bad(`could not read that chart: ${(e as Error).message}`, 502);
  }
}
