/**
 * A chart added to the account of the person who is signed in.
 *
 * Kaycee, 2026-10-05: "there needs to be a way for people to store charts...
 * Nobody has additional charts saved because you refuse to build that
 * functionality."
 *
 * The public form at /chart has always been able to put a second chart on an
 * account, but only by asking for an email again and matching on it, which is
 * a strange thing to ask somebody who is already signed in and is why nobody
 * ever ended up with a second chart. This route asks for nothing it already
 * knows: the owner is the session, full stop.
 *
 * Same builder as every other chart, so a fix to one chart is a fix to all of
 * them, and the same refusal to publish a chart with a section missing.
 */

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const maxDuration = 120;
export const runtime = "nodejs";

/** Enough for a family and their friends, low enough that a loop is noticed. */
const PER_ACCOUNT = 25;
const ACCURACY = new Set(["document", "told", "approximate", "unknown"]);

const bad = (message: string, status = 400) =>
  Response.json({ ok: false, error: message }, { status });

export async function POST(request: Request): Promise<Response> {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return bad("sign in first", 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return bad("this server cannot reach the database", 500);
  const db = createClient(url, key, { auth: { persistSession: false } });

  let body: Record<string, string>;
  try { body = (await request.json()) as Record<string, string>; }
  catch { return bad("that request was not readable"); }

  const name = (body.name ?? "").trim();
  const birthDate = (body.birthDate ?? "").trim();
  const birthTime = (body.birthTime ?? "").trim();
  const place = (body.place ?? "").trim();
  const timezone = (body.timezone ?? "").trim();
  const timeAccuracy = (body.timeAccuracy ?? "told").trim();

  if (!name) return bad("a name is needed");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return bad("a birth date is needed");
  if (!place || !timezone) return bad("choose a birth place from the list");
  if (!ACCURACY.has(timeAccuracy)) return bad("that is not one of the birth time answers");
  if (timeAccuracy !== "unknown" && !/^\d{2}:\d{2}$/.test(birthTime)) {
    return bad("a birth time is needed, as HH:MM, unless it is unknown");
  }

  const { count } = await db.from("charts")
    .select("id", { count: "exact", head: true }).eq("owner_id", user.id);
  if ((count ?? 0) >= PER_ACCOUNT) {
    return bad(`This account already holds ${PER_ACCOUNT} charts. Write to hello@delphihd.com if you need more.`, 429);
  }

  const token = randomBytes(16).toString("hex");
  const link = await db.from("client_charts").insert({
    token, client_slug: token, client_name: name, storage_path: `${token}.html`,
  });
  if (link.error) return bad("could not reserve a link", 500);

  const row = await db.from("charts").insert({
    token,
    owner_id: user.id,
    person_name: name,
    birth_date: birthDate,
    birth_time: timeAccuracy === "unknown" && !/^\d{2}:\d{2}$/.test(birthTime) ? null : birthTime,
    birth_place: place,
    birth_timezone: timezone,
    time_accuracy: timeAccuracy,
    tier: "free",
    visibility: "private",
    source: "portal",
  });
  if (row.error) {
    await db.from("client_charts").delete().eq("token", token);
    return bad("could not record the chart", 500);
  }

  try {
    const { runBuilder } = await import("@/scripts/energy-flow-diagram");
    await runBuilder(["--token", token, "--publish", "--no-png"]);
  } catch (e) {
    await db.from("charts").delete().eq("token", token);
    await db.from("client_charts").delete().eq("token", token);
    console.error(`portal chart ${token} failed: ${e instanceof Error ? e.stack ?? e.message : e}`);
    return bad("Something went wrong drawing that chart. Please try again in a moment, or write to hello@delphihd.com and we will sort it out.", 500);
  }

  return Response.json({ ok: true, token, url: `https://charts.delphihd.com/c/${token}` });
}
