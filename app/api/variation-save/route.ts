/**
 * What a variation of a birth day needs before it can be saved as a chart.
 *
 * The save window is handed a chart token and a time off that day, and nothing
 * else: the birth date, place and timezone come from the record here rather
 * than riding in a query string a stranger controls. GET answers with the
 * default name and the date it would be cast for; POST makes the chart.
 *
 * Kaycee, 2026-10-08: "if someone clicks Save this Variation it would open a
 * new tab/window that prompts them to rename the chart if they want to, when
 * they click Save the new chart opens in the new window."
 *
 * WHO MAY DO THIS. Signed in, and the chart has to be one this account can
 * already open: their own, or a client's if they are the analyst, which is the
 * rule /api/my-charts answers by. A chart link is a public address, so without
 * that anyone holding a link could fill somebody else's account with charts.
 */

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { chartByToken } from "@/lib/hd/chart-record";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const runtime = "nodejs";

const bad = (message: string, status = 400) =>
  Response.json({ ok: false, error: message }, { status });

// The service client is created without generated database types, so its rows
// come back as `never` once it is passed around as a value. Named here as what
// it is: a Supabase client whose tables this file knows by hand.
type Db = { from: (table: string) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any

/** The same rule /api/my-charts answers by, asked about one chart. */
async function mayOpen(
  db: Db, userId: string, ownerId: string | null,
): Promise<boolean> {
  if (ownerId && ownerId === userId) return true;
  const { data: admin } = await db.from("delphi_admins")
    .select("user_id").eq("user_id", userId).maybeSingle();
  if (admin) return true;
  if (!ownerId) return false;
  const { data: link } = await db.from("analyst_clients").select("client_id")
    .eq("analyst_id", userId).eq("client_id", ownerId).is("ended_at", null).maybeSingle();
  return !!link;
}

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("this server cannot reach the database");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function settings(request: Request) {
  const q = new URL(request.url).searchParams;
  const from = (q.get("from") ?? "").trim();
  const time = (q.get("time") ?? "").trim();
  if (!/^[a-f0-9]{32}$/.test(from)) return { error: "that is not a chart link" };
  if (!/^\d{2}:\d{2}$/.test(time)) return { error: "that is not a time of day" };

  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: "sign in first", status: 401 };

  const db = service();
  const rec = await chartByToken(from);
  if (!rec) return { error: "that chart could not be found", status: 404 };
  if (!(await mayOpen(db, user.id, rec.ownerId))) {
    return { error: "that chart belongs to somebody else", status: 403 };
  }
  return { db, user, rec, time };
}

export async function GET(request: Request): Promise<Response> {
  const s = await settings(request);
  if ("error" in s) return bad(s.error!, s.status ?? 400);
  return Response.json({
    ok: true,
    name: `${s.rec!.personName} ${s.time}`,
    born: s.rec!.birthDate,
    place: s.rec!.birthPlace,
    time: s.time,
  });
}

export async function POST(request: Request): Promise<Response> {
  const s = await settings(request);
  if ("error" in s) return bad(s.error!, s.status ?? 400);
  const { db, user, rec, time } = s as {
    db: Db;
    user: { id: string };
    rec: NonNullable<Awaited<ReturnType<typeof chartByToken>>>;
    time: string;
  };

  let body: { name?: string };
  try { body = (await request.json()) as { name?: string }; }
  catch { return bad("that request was not readable"); }
  const name = (body.name ?? "").trim();
  if (!name) return bad("a name is needed");
  if (name.length > 80) return bad("that name is too long");

  /** Enough for a family and their friends, the same ceiling the portal has. */
  const { count } = await db.from("charts")
    .select("id", { count: "exact", head: true }).eq("owner_id", user.id);
  if ((count ?? 0) >= 25) {
    return bad("This account already holds 25 charts. Write to hello@delphihd.com if you need more.", 429);
  }

  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(16).toString("hex");
  const link = await db.from("client_charts").insert({
    token, client_slug: token, client_name: name, storage_path: `${token}.html`,
  });
  if (link.error) return bad("could not reserve a link", 500);

  // The birth day is the source chart's; only the hour is the variation's. The
  // place and its timezone travel with the record rather than being resolved
  // again, because the provider already answered that when it was created.
  const row = await db.from("charts").insert({
    token,
    owner_id: user.id,
    person_name: name,
    birth_date: rec.birthDate,
    birth_time: time,
    birth_place: rec.birthPlace,
    lookup_place: rec.lookupPlace,
    birth_timezone: rec.birthTimezone,
    // A time picked off a scan of the day is exactly known as a time; what is
    // not known is that it is the birth time. It is recorded as told, the same
    // as any time somebody gives us, and never as a document.
    time_accuracy: "told",
    tier: "free",
    visibility: "private",
    source: "variation",
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
    console.error(`variation chart ${token} failed: ${e instanceof Error ? e.stack ?? e.message : e}`);
    return bad("Something went wrong drawing that chart. Please try again in a moment, or write to hello@delphihd.com and we will sort it out.", 500);
  }

  return Response.json({ ok: true, token, url: `https://charts.delphihd.com/c/${token}` });
}
