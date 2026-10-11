/**
 * Erase one of your own charts, for good.
 *
 * Kaycee, 2026-10-11: "really erased, if the chart owner wants to delete it we
 * have to give them that option, but there needs to be a message letting them
 * know it can't be reversed." The portal says so before it calls this.
 *
 * What goes: the published file and every earlier version kept beside it, the
 * visit counts, the daily transit reads, the link (client_charts), and with it
 * the chart row and its edit history (both cascade from the link). A profile
 * that called it "my chart" lets go on its own (set null).
 *
 * The files go first. If storage refuses, nothing in the database is touched,
 * so a failed delete can simply be tried again instead of leaving a link
 * pointing at nothing.
 *
 * Only the owner: checked here against the signed-in user before the service
 * key does anything.
 */

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { eraseChart } from "@/lib/erase-chart";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

export async function POST(request: Request): Promise<Response> {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return fail("not signed in", 401);

  let chartId = "";
  try { chartId = String(((await request.json()) as { chartId?: string }).chartId ?? ""); }
  catch { return fail("bad request"); }
  if (!/^[0-9a-f-]{36}$/.test(chartId)) return fail("bad request");

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const { data: chart } = await db.from("charts").select("id, token, owner_id, person_name").eq("id", chartId).maybeSingle();
  if (!chart || chart.owner_id !== user.id) return fail("not found", 404);
  const r = await eraseChart(db, chartId, String(chart.token));
  if (!r.ok) {
    console.error(`delete ${String(chart.token).slice(0, 6)}: ${r.error}`);
    return fail("could not delete the chart just now", 503);
  }
  console.log(`delete ${String(chart.token).slice(0, 6)}: erased by its owner`);
  return Response.json({ ok: true });
}
