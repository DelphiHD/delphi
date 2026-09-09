/**
 * A chart, made on request.
 *
 * Somebody on the website gives their birth details; this casts their chart,
 * publishes it, and hands back the link. No roster entry, no laptop, no waiting
 * for Kaycee to run anything.
 *
 * The heavy lifting is the same builder that makes her clients' charts. Nothing
 * here draws a chart of its own: one builder, so a fix to hers is a fix to
 * everybody's and the two can never drift.
 *
 * What this route does NOT do is take a place name on trust. The provider's own
 * location lookup resolves it, and its answer for the timezone is what the chart
 * is cast from and what is stored. A timezone guessed from a place name is where
 * wrong charts come from.
 */

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// A chart takes about ten seconds. Pro allows five minutes; this asks for two,
// which is room for a slow provider without holding a request open all day.
export const maxDuration = 120;
export const runtime = "nodejs";

interface Body {
  name?: string;
  birthDate?: string;      // YYYY-MM-DD
  birthTime?: string;      // HH:MM, or absent when unknown
  place?: string;          // exactly as returned by /api/places
  timezone?: string;       // ditto
  timeAccuracy?: string;   // document | told | approximate | unknown
  forEmail?: string;
}

const ACCURACY = new Set(["document", "told", "approximate", "unknown"]);

function bad(message: string, status = 400): Response {
  return Response.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("that request was not readable");
  }

  const name = (body.name ?? "").trim();
  const birthDate = (body.birthDate ?? "").trim();
  const birthTime = (body.birthTime ?? "").trim();
  const place = (body.place ?? "").trim();
  const timezone = (body.timezone ?? "").trim();
  const timeAccuracy = (body.timeAccuracy ?? "told").trim();

  if (!name) return bad("a name is needed");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return bad("a birth date is needed, as YYYY-MM-DD");
  if (!place) return bad("a birth place is needed, chosen from the list");
  // The place and its timezone come from the provider's own lookup together. A
  // place without one means the form sent something typed rather than chosen.
  if (!timezone) return bad("that place was typed rather than chosen from the list");
  if (!ACCURACY.has(timeAccuracy)) return bad("that is not one of the birth time answers");
  if (timeAccuracy !== "unknown" && !/^\d{2}:\d{2}$/.test(birthTime)) {
    return bad("a birth time is needed, as HH:MM, unless it is unknown");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return bad("this server cannot reach the database", 500);
  const db = createClient(url, key, { auth: { persistSession: false } });

  // 32 hex characters, the same shape every existing link has.
  const token = randomBytes(16).toString("hex");
  const storagePath = `${token}.html`;

  // client_charts first: charts points at it, and a chart with no link is a
  // chart nobody can open.
  const { error: linkErr } = await db.from("client_charts").insert({
    token,
    client_slug: token,
    client_name: name,
    storage_path: storagePath,
  });
  if (linkErr) return bad(`could not reserve a link: ${linkErr.message}`, 500);

  const { error: chartErr } = await db.from("charts").insert({
    person_name: name,
    birth_date: birthDate,
    birth_time: timeAccuracy === "unknown" ? null : birthTime,
    birth_place: place,
    birth_timezone: timezone,
    time_accuracy: timeAccuracy,
    tier: "free",
    token,
    for_email: body.forEmail?.trim() || null,
  });
  if (chartErr) {
    await db.from("client_charts").delete().eq("token", token);
    return bad(`could not record the chart: ${chartErr.message}`, 500);
  }

  try {
    // Imported here rather than at the top of the file: the builder is a large
    // module, and a request that fails validation should not pay to load it.
    const { runBuilder } = await import("@/scripts/energy-flow-diagram");
    await runBuilder(["--token", token, "--publish", "--no-png"]);
  } catch (e) {
    // A chart that failed to build must not leave a link that opens nothing.
    await db.from("charts").delete().eq("token", token);
    await db.from("client_charts").delete().eq("token", token);
    return bad(`the chart could not be drawn: ${e instanceof Error ? e.message : e}`, 500);
  }

  return Response.json({
    ok: true,
    token,
    url: `https://charts.delphihd.com/c/${token}`,
  });
}
