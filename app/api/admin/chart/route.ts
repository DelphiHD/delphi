/**
 * A chart, made from the dashboard.
 *
 * Kaycee, 2026-10-03: "can you just make me a widget on the dashboard with a
 * chart creator so I don't have to deal with this kind of bullshit every
 * fucking time I need a chart? Please be sure to add selectors for the
 * different funnel columns."
 *
 * Until now a chart she wanted for herself meant a terminal: add-public-figure
 * for a famous person, add-client for a roster entry, make-sandbox-charts for a
 * test. Three scripts, none of them reachable from her phone, and nothing at
 * all if her laptop was shut.
 *
 * This is the same thing those scripts do, behind her sign-in: reserve the
 * link, write the funnel row, run the one builder. Not /api/chart, which is the
 * public form and so has rate limits, account creation and an email on the end
 * of it. None of that belongs here.
 *
 * Every funnel column is hers to set. Source, tier, visibility and birth-time
 * accuracy are the four the dashboard sorts and counts by, so the chart is in
 * the right place the moment it exists rather than needing a correction later.
 */

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Same budget as the public form: a chart is about ten seconds, and the
// provider is sometimes slow.
export const maxDuration = 120;
export const runtime = "nodejs";

const ACCURACY = new Set(["document", "told", "approximate", "unknown"]);
const TIER = new Set(["seed", "free", "purchased", "gift"]);
const VISIBILITY = new Set(["private", "shared", "public"]);
/** Roster charts carry no source at all, which is what the dashboard reads. */
const KNOWN_SOURCE = new Set(["", "signup", "sandbox", "public-figure"]);

interface Body {
  name?: string;
  birthDate?: string;
  birthTime?: string;
  place?: string;
  timezone?: string;
  timeAccuracy?: string;
  source?: string;
  tier?: string;
  visibility?: string;
  forEmail?: string;
}

function bad(message: string, status = 400): Response {
  return Response.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  // Her sign-in, then the same admin table the dashboard and the chart policies
  // use. A service-role builder behind an open door is not a door.
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return bad("sign in first", 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return bad("this server cannot reach the database", 500);
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: isAdmin } = await db.from("delphi_admins")
    .select("user_id").eq("user_id", user.id).maybeSingle();
  if (!isAdmin) return bad("that account cannot make charts here", 403);

  let body: Body;
  try { body = (await request.json()) as Body; } catch { return bad("that request was not readable"); }

  const name = (body.name ?? "").trim();
  const birthDate = (body.birthDate ?? "").trim();
  const birthTime = (body.birthTime ?? "").trim();
  const place = (body.place ?? "").trim();
  const timezone = (body.timezone ?? "").trim();
  const timeAccuracy = (body.timeAccuracy ?? "told").trim();
  const tier = (body.tier ?? "free").trim();
  const visibility = (body.visibility ?? "private").trim();
  const forEmail = (body.forEmail ?? "").trim().toLowerCase() || null;

  // An event slug is a source too, so anything lowercase and hyphenated is
  // allowed alongside the four the dashboard names. "bfki" got here that way.
  const source = (body.source ?? "").trim().toLowerCase();
  if (!KNOWN_SOURCE.has(source) && !/^[a-z0-9][a-z0-9-]{1,30}$/.test(source)) {
    return bad("that is not a source the dashboard can read");
  }

  if (!name) return bad("a name is needed");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return bad("a birth date is needed, as YYYY-MM-DD");
  if (!place) return bad("a birth place is needed, chosen from the list");
  if (!timezone) return bad("that place was typed rather than chosen from the list");
  if (!ACCURACY.has(timeAccuracy)) return bad("that is not one of the birth time answers");
  if (!TIER.has(tier)) return bad("that is not one of the tiers");
  if (!VISIBILITY.has(visibility)) return bad("that is not one of the visibilities");
  if (timeAccuracy !== "unknown" && !/^\d{2}:\d{2}$/.test(birthTime)) {
    return bad("a birth time is needed, as HH:MM, unless it is unknown");
  }

  // The same name twice in the same part of the funnel is almost always a
  // second go at one chart rather than a second person. Say so and stop,
  // rather than quietly leaving her two links for one person.
  const lookFor = db.from("charts").select("token").eq("person_name", name);
  const twin = await (source ? lookFor.eq("source", source) : lookFor.is("source", null)).maybeSingle();
  if (twin.data?.token) {
    return Response.json({
      ok: false,
      error: `${name} is already in the funnel here.`,
      token: twin.data.token,
      url: `https://charts.delphihd.com/c/${twin.data.token}`,
    }, { status: 409 });
  }

  const token = randomBytes(16).toString("hex");

  // client_charts first: charts points at it, and a chart with no link is a
  // chart nobody can open.
  const link = await db.from("client_charts").insert({
    token, client_slug: token, client_name: name, storage_path: `${token}.html`,
  });
  if (link.error) return bad(`could not reserve a link: ${link.error.message}`, 500);

  const row = await db.from("charts").insert({
    token,
    person_name: name,
    birth_date: birthDate,
    // A time she could not get is null; a rough one she did get is kept, so the
    // scan sweeps her six hours rather than all twenty-four.
    birth_time: timeAccuracy === "unknown" && !/^\d{2}:\d{2}$/.test(birthTime) ? null : birthTime,
    birth_place: place,
    birth_timezone: timezone,
    time_accuracy: timeAccuracy,
    tier,
    visibility,
    source: source || null,
    for_email: forEmail,
  });
  if (row.error) {
    await db.from("client_charts").delete().eq("token", token);
    return bad(`could not record the chart: ${row.error.message}`, 500);
  }

  try {
    const { runBuilder } = await import("@/scripts/energy-flow-diagram");
    await runBuilder(["--token", token, "--publish", "--no-png"]);
  } catch (e) {
    // Nothing half-made is left behind: no row, no link, no chart with a
    // section missing. The builder's own words come back to her, because she is
    // the one who can tell a wrong birth place from a provider having a bad day.
    await db.from("charts").delete().eq("token", token);
    await db.from("client_charts").delete().eq("token", token);
    const why = e instanceof Error ? e.message : String(e);
    console.error(`admin chart ${token} failed to build: ${e instanceof Error ? e.stack ?? why : why}`);
    return bad(why, 500);
  }

  return Response.json({ ok: true, token, url: `https://charts.delphihd.com/c/${token}` });
}
