/**
 * The charts the person looking at this page can open.
 *
 * Kaycee, 2026-10-05: an account holds several charts and the viewer moves
 * between them. "A parent might want to be able to easily toggle back and
 * forth between their kids charts without re-entering their birth info... we'll
 * need this to work in the relationship view as well so it's not really
 * negotiable."
 *
 * THE LIST BELONGS TO THE VIEWER, NEVER TO THE CHART
 *
 * This is the whole of the security design and it is worth saying plainly. A
 * chart link is a public address: anyone holding it can open the page. If this
 * answered with the charts of the person the open chart belongs to, then
 * sending somebody your link would hand them your entire list. So it answers
 * from the session cookie and nothing else. No token is accepted, no chart is
 * named in the request, and a visitor who is not signed in gets an empty list
 * and no picker.
 *
 * What an analyst sees: Kaycee, 2026-10-05, "yes for me, no for everyone else".
 * Her clients' charts come back in a second group, from the analyst_clients
 * mapping that already exists. An ordinary account only ever sees its own.
 */

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface Listed {
  token: string;
  name: string;
  born: string;
  primary?: boolean;
}

const EMPTY = { ok: true, signedIn: false, mine: [] as Listed[], clients: [] as Listed[] };

export async function GET(): Promise<Response> {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  // Not signed in is not an error. It is most people, and they get no picker.
  if (!user) return Response.json(EMPTY);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ ...EMPTY, signedIn: true });
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Only charts that still have a live link are offerable: the picker exists to
  // open one, and an entry that opens nothing is worse than no entry.
  const live = new Set(
    ((await db.from("client_charts").select("token").is("revoked_at", null)).data ?? [])
      .map((r) => String(r.token)),
  );

  const shape = (r: Record<string, unknown>, primaryId: string | null): Listed => ({
    token: String(r.token),
    name: String(r.person_name ?? ""),
    born: String(r.birth_date ?? "").slice(0, 10),
    primary: primaryId !== null && r.id === primaryId,
  });

  // The column arrived on 2026-10-05. Asking for it on a database that has not
  // had the migration yet should cost the picker, not the page.
  let primaryId: string | null = null;
  try {
    const p = await db.from("profiles").select("primary_chart_id").eq("id", user.id).maybeSingle();
    primaryId = (p.data?.primary_chart_id as string | null) ?? null;
  } catch { primaryId = null; }

  const cols = "id, token, person_name, birth_date, created_at";
  const mineRows = (await db.from("charts").select(cols)
    .eq("owner_id", user.id).order("created_at", { ascending: true })).data ?? [];
  const mine = mineRows.filter((r) => live.has(String(r.token))).map((r) => shape(r, primaryId));
  // Theirs first, whatever the order they were made in.
  mine.sort((a, b) => Number(b.primary ?? false) - Number(a.primary ?? false));

  // An analyst's clients, and only an analyst's.
  const { data: isAdmin } = await db.from("delphi_admins")
    .select("user_id").eq("user_id", user.id).maybeSingle();
  const { data: links } = await db.from("analyst_clients")
    .select("client_id").eq("analyst_id", user.id).is("ended_at", null);
  const clientIds = (links ?? []).map((l) => String(l.client_id));
  let clients: Listed[] = [];
  if (isAdmin || clientIds.length) {
    const q = db.from("charts").select(cols).neq("owner_id", user.id);
    const rows = (await (clientIds.length && !isAdmin
      ? q.in("owner_id", clientIds) : q).order("person_name")).data ?? [];
    clients = rows.filter((r) => live.has(String(r.token))).map((r) => shape(r, null));
  }

  // Whether there is an account at all is its own answer. Somebody signed in
  // with no second chart yet gets no picker but may still be offered the chance
  // to keep the chart they are about to make, and an empty list cannot say that.
  return Response.json({ ok: true, signedIn: true, mine, clients });
}
