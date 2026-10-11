/**
 * Erase a chart for good: its published file and every earlier version, its
 * visit counts, its daily transit reads, its link, and with the link the chart
 * row and its edit history. See app/api/portal/delete/route.ts for who may.
 *
 * Files first: if storage refuses, the database is left alone, so the delete
 * can be tried again rather than leaving a link pointing at nothing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function eraseChart(db: SupabaseClient, chartId: string, token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: link } = await db.from("client_charts").select("storage_path, client_slug").eq("token", token).maybeSingle();

  if (link?.storage_path) {
    const path = String(link.storage_path);
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : String(link.client_slug);
    const { data: old } = await db.storage.from("charts").list(`${folder}/versions`, { limit: 1000 });
    const files = [path, ...(old ?? []).filter((f) => f.name.startsWith(token)).map((f) => `${folder}/versions/${f.name}`)];
    const gone = await db.storage.from("charts").remove(files);
    if (gone.error) return { ok: false, error: `files not removed: ${gone.error.message}` };
  }

  const steps = [
    await db.from("chart_visits").delete().eq("token", token),
    link?.client_slug ? await db.from("transit_reads").delete().eq("client_slug", String(link.client_slug)) : { error: null },
    // the link last: the chart row and its edits go with it
    link ? await db.from("client_charts").delete().eq("token", token) : await db.from("charts").delete().eq("id", chartId),
  ];
  const err = steps.find((s) => s.error)?.error;
  return err ? { ok: false, error: err.message } : { ok: true };
}
