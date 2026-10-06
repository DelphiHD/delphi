/**
 * Correcting the birth details on a chart you own.
 *
 * Kaycee, 2026-10-05: "We need to give people the option of editing the chart
 * info in any case... People make mistakes and shouldn't have to pull multiple
 * charts." A wrong minute used to mean a second chart and a second link, with
 * the first one still in somebody's inbox reading as the truth.
 *
 * Signed-in owners only, on her instruction: "Definitely only signed in
 * owners." Every other endpoint here takes the chart token as its credential,
 * which is right for reading and wrong for writing, because a link gets
 * forwarded and a birth time quietly changed by a stranger would invalidate a
 * written report with nothing to show who did it.
 *
 * Every change is written to chart_edits with its old value, so any edit can
 * be read back and undone, and the chart is recast and republished so the link
 * already in somebody's inbox shows the correction rather than the mistake.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { recordEdit } from "@/lib/hd/chart-record";

export const dynamic = "force-dynamic";
// 120, the same as every other route here that rebuilds a chart. 300 is above
// what the plan allows and the deployment is rejected for it, which is why the
// first version of this answered 404 to Kaycee rather than saving anything.
export const maxDuration = 120;
export const runtime = "nodejs";

const ACCURACY = new Set(["document", "told", "approximate", "unknown"]);

const bad = (m: string, code = 400) =>
  NextResponse.json({ ok: false, error: m }, { status: code });

interface Body {
  token?: string;
  birthDate?: string;
  birthTime?: string;
  place?: string;
  timezone?: string;
  timeAccuracy?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return bad("that request was not readable"); }

  const token = (body.token ?? "").trim();
  if (!/^[0-9a-f]{32}$/.test(token)) return bad("that is not a chart");

  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return bad("sign in to change your birth details", 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return bad("this server cannot reach the database", 500);
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: chart } = await db.from("charts")
    .select("id, owner_id, person_name, birth_date, birth_time, birth_place, birth_timezone, time_accuracy")
    .eq("token", token).maybeSingle();
  if (!chart) return bad("no chart with that link", 404);
  // Ownership, not possession of the link.
  if (chart.owner_id !== user.id) {
    return bad("this chart belongs to somebody else", 403);
  }

  const birthDate = (body.birthDate ?? "").trim();
  const birthTime = (body.birthTime ?? "").trim();
  const place = (body.place ?? "").trim();
  const timezone = (body.timezone ?? "").trim();
  const timeAccuracy = (body.timeAccuracy ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return bad("a birth date is needed, as YYYY-MM-DD");
  if (!place) return bad("a birth place is needed, chosen from the list");
  // A place and its timezone come from the provider's lookup together, so a
  // place without one was typed rather than chosen. An UNCHANGED place keeps
  // the timezone the chart already has: making somebody re-pick a place they
  // are not correcting, to fix a minute on the clock, is a trap.
  const samePlace = place === String(chart.birth_place ?? "");
  const zone = timezone || (samePlace ? String(chart.birth_timezone ?? "") : "");
  if (!zone) return bad("that place was typed rather than chosen from the list");
  if (!ACCURACY.has(timeAccuracy)) return bad("that is not one of the birth time answers");
  if (timeAccuracy !== "unknown" && !/^\d{2}:\d{2}$/.test(birthTime)) {
    return bad("a birth time is needed, as HH:MM, unless it is unknown");
  }

  const was = {
    birth_date: String(chart.birth_date ?? ""),
    birth_time: String(chart.birth_time ?? "").slice(0, 5),
    birth_place: String(chart.birth_place ?? ""),
    birth_timezone: String(chart.birth_timezone ?? ""),
    time_accuracy: String(chart.time_accuracy ?? ""),
  };
  const now = {
    birth_date: birthDate,
    birth_time: timeAccuracy === "unknown" ? "" : birthTime,
    birth_place: place,
    birth_timezone: zone,
    time_accuracy: timeAccuracy,
  };
  const changed = (Object.keys(now) as (keyof typeof now)[]).filter((k) => now[k] !== was[k]);
  if (!changed.length) return NextResponse.json({ ok: true, changed: [], message: "nothing changed" });

  // The scan belongs to the details it was run against, so an edit throws it
  // away rather than leaving a confident answer about the old ones behind.
  const patch: Record<string, unknown> = {
    birth_date: now.birth_date,
    birth_time: now.birth_time || null,
    birth_place: now.birth_place,
    birth_timezone: now.birth_timezone,
    time_accuracy: now.time_accuracy,
    time_scan: null,
    time_scan_at: null,
    time_scan_for: null,
  };
  const { error: upErr } = await db.from("charts").update(patch).eq("id", chart.id);
  if (upErr) return bad("that could not be saved", 500);

  // Logged before the rebuild, so a rebuild that fails still leaves a record
  // of what was changed and by whom.
  for (const field of changed) {
    await recordEdit({
      chartId: String(chart.id),
      field,
      oldValue: was[field] || null,
      newValue: now[field] || null,
      editedBy: user.email ?? user.id,
      recast: true,
    });
  }

  try {
    const { runBuilder } = await import("@/scripts/energy-flow-diagram");
    await runBuilder(["--token", token, "--publish", "--no-png"]);
  } catch (e) {
    console.error(`chart edit rebuild ${token}: ${e instanceof Error ? e.message : String(e)}`);
    // The details are saved and logged; only the drawing is behind.
    return NextResponse.json({
      ok: true, changed, rebuilt: false,
      message: "Saved. The chart itself could not be redrawn just now.",
    });
  }

  return NextResponse.json({ ok: true, changed, rebuilt: true });
}
