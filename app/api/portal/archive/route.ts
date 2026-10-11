/**
 * Archive or restore one of your own charts: out of your list, link intact.
 * Kaycee, 2026-10-11. See supabase/migrations/20261011_chart_archive.sql.
 *
 * Written through the signed-in session, not the service key, so row level
 * security decides: only the owner's own row can change.
 */

import { createClient as createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });

  let b: { chartId?: unknown; archived?: unknown };
  try { b = await request.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }
  const chartId = String(b.chartId ?? "");
  if (!/^[0-9a-f-]{36}$/.test(chartId) || typeof b.archived !== "boolean") return Response.json({ ok: false }, { status: 400 });

  const { data, error } = await session.from("charts")
    .update({ archived_at: b.archived ? new Date().toISOString() : null })
    .eq("id", chartId).eq("owner_id", user.id).select("id");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (!data?.length) return Response.json({ ok: false }, { status: 404 });
  return Response.json({ ok: true });
}
