/**
 * The journal, for a chart page: a signed-in person's saved places (and next,
 * snapshots and notes). See supabase/migrations/20261011_journal.sql.
 *
 * Everything goes through the signed-in session, so the owner-only policies
 * decide what can be read or written; this route cannot hand one person's
 * journal to another even if it tried. Not signed in is a 401, which the page
 * reads as "keep places in this browser", as before.
 *
 * Whose chart an entry was made on is read from the chart link here, never
 * taken from the page.
 */
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const no = (status: number) => Response.json({ ok: false }, { status });
const TOKEN = /^[a-f0-9]{32}$/;

interface Place { name?: unknown; country?: unknown; lat?: unknown; lon?: unknown }
const cleanPlace = (p: Place) => {
  const lat = Number(p.lat), lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { name: String(p.name ?? "").slice(0, 200), country: String(p.country ?? "").slice(0, 200), lat, lon };
};

/** The person a live chart link belongs to, or null. */
async function personOf(token: string): Promise<string | null> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data } = await db.from("client_charts").select("client_name, revoked_at").eq("token", token).maybeSingle();
  if (!data || data.revoked_at) return null;
  const { data: c } = await db.from("charts").select("person_name").eq("token", token).maybeSingle();
  return String(c?.person_name ?? data.client_name);
}

export async function GET(request: Request) {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return no(401);
  const u = new URL(request.url);
  const token = u.searchParams.get("token") ?? "", kind = u.searchParams.get("kind") ?? "place";
  if (!TOKEN.test(token)) return no(400);
  const { data, error } = await session.from("journal_entries")
    .select("id, kind, place, created_at").eq("chart_token", token).eq("kind", kind).order("created_at");
  if (error) return no(500);
  return Response.json({ ok: true, entries: data });
}

/** Save places: one, or several at once (the move from the browser on first sign-in). */
export async function POST(request: Request) {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return no(401);
  let b: { token?: unknown; places?: unknown };
  try { b = await request.json(); } catch { return no(400); }
  const token = String(b.token ?? "");
  if (!TOKEN.test(token) || !Array.isArray(b.places) || b.places.length > 200) return no(400);
  const person = await personOf(token);
  if (!person) return no(404);

  const { data: have } = await session.from("journal_entries").select("place").eq("chart_token", token).eq("kind", "place");
  const same = (a: { lat: number; lon: number }, x: { lat: number; lon: number }) => Math.abs(a.lat - x.lat) < 1e-4 && Math.abs(a.lon - x.lon) < 1e-4;
  const kept = (have ?? []).map((h) => h.place as { lat: number; lon: number }).filter(Boolean);
  const rows = (b.places as Place[]).map(cleanPlace).filter((p): p is NonNullable<typeof p> => !!p)
    .filter((p, i, all) => !kept.some((k) => same(k, p)) && all.findIndex((q) => same(q, p)) === i)
    .map((p) => ({ owner_id: user.id, kind: "place", chart_token: token, person, people: [person], place: p,
      title: p.name || `${p.lat.toFixed(1)}, ${p.lon.toFixed(1)}` }));
  if (rows.length) {
    const { error } = await session.from("journal_entries").insert(rows);
    if (error) return no(500);
  }
  const { data } = await session.from("journal_entries").select("id, kind, place, created_at").eq("chart_token", token).eq("kind", "place").order("created_at");
  return Response.json({ ok: true, entries: data });
}

export async function DELETE(request: Request) {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return no(401);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return no(400);
  const { data, error } = await session.from("journal_entries").delete().eq("id", id).select("id");
  if (error) return no(500);
  return Response.json({ ok: !!data?.length });
}
