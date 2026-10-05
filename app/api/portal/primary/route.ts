/**
 * Which chart a person says is theirs.
 *
 * Set by them, in their own portal. Kaycee, 2026-10-05: "The person's portal,
 * I don't see why I would ever choose that for them."
 *
 * The database has the last word: a trigger on profiles refuses a primary
 * chart that is not the profile owner's, so this route being wrong cannot make
 * somebody's list point at a stranger's chart.
 */

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });

  let chartId = "";
  try { chartId = String(((await request.json()) as { chartId?: string }).chartId ?? ""); }
  catch { return Response.json({ ok: false }, { status: 400 }); }
  if (!/^[0-9a-f-]{36}$/.test(chartId)) return Response.json({ ok: false }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ ok: false }, { status: 500 });
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { error } = await db.from("profiles")
    .update({ primary_chart_id: chartId }).eq("id", user.id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
