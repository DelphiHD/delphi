/**
 * Who can see what, changed from the dashboard.
 *
 * Kaycee, 2026-10-05: "Should we add something to the dashboard so I can view
 * and adjust permissions on the backend?... people will be making their own
 * accounts from the website so I likely wont be involved most of the time."
 *
 * Accounts now appear without her. Until this, the only way to see who had
 * arrived or to give anybody anything was a database client, which means in
 * practice it did not happen.
 *
 * Two things can be granted. Admin, which is everything. And a client of
 * hers, which lets an analyst read that person's charts and nothing else.
 *
 * THE LOCKOUT GUARD
 *
 * The last admin cannot be removed, by themselves or by anyone. There is no
 * other way back in: the table has no policies and no grants, so recovering
 * from an empty admin table means a database client and the service key.
 */

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["admin.add", "admin.remove", "client.link", "client.unlink"]);
const UUID = /^[0-9a-f-]{36}$/;

const no = (message: string, status = 400) =>
  Response.json({ ok: false, error: message }, { status });

export async function POST(request: Request): Promise<Response> {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return no("sign in first", 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return no("this server cannot reach the database", 500);
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: isAdmin } = await db.from("delphi_admins")
    .select("user_id").eq("user_id", user.id).maybeSingle();
  if (!isAdmin) return no("that account cannot change permissions", 403);

  let body: { action?: string; userId?: string };
  try { body = (await request.json()) as typeof body; } catch { return no("unreadable"); }
  const action = String(body.action ?? "");
  const userId = String(body.userId ?? "");
  if (!ACTIONS.has(action)) return no("not a permission this understands");
  if (!UUID.test(userId)) return no("not an account");

  if (action === "admin.add") {
    const { error } = await db.from("delphi_admins").upsert({ user_id: userId });
    return error ? no(error.message, 500) : Response.json({ ok: true });
  }

  if (action === "admin.remove") {
    const { count } = await db.from("delphi_admins")
      .select("user_id", { count: "exact", head: true });
    if ((count ?? 0) <= 1) {
      return no("That is the only admin. Add another before removing this one, or nobody can get back in.");
    }
    const { error } = await db.from("delphi_admins").delete().eq("user_id", userId);
    return error ? no(error.message, 500) : Response.json({ ok: true });
  }

  // A client of the admin doing the asking, never of somebody else: this is
  // the dashboard granting Kaycee sight of a person, not a way to hand one
  // analyst another analyst's client list.
  if (action === "client.link") {
    const { error } = await db.from("analyst_clients")
      .upsert({ analyst_id: user.id, client_id: userId, began_with: "manual", ended_at: null });
    return error ? no(error.message, 500) : Response.json({ ok: true });
  }

  const { error } = await db.from("analyst_clients")
    .update({ ended_at: new Date().toISOString() })
    .eq("analyst_id", user.id).eq("client_id", userId).is("ended_at", null);
  return error ? no(error.message, 500) : Response.json({ ok: true });
}
