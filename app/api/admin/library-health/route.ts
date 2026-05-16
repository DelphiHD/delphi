import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Aggregate-only stats about the chunks table. Counts and timestamps, no chunk
// bodies. Useful for spot-checking that the nightly sync ran and produced the
// expected library shape.
//
// Not gated on auth in V2 because the data is non-sensitive (no chunk bodies
// or embeddings, only kind counts and last-sync time). If we ever want to lock
// this down, add an ADMIN_TOKEN check.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = createAdminClient();

  const { data: kindRows, error: kindErr } = await supabase
    .from("chunks")
    .select("source_kind");

  if (kindErr) {
    return NextResponse.json({ error: kindErr.message }, { status: 500 });
  }

  const byKind: Record<string, number> = {};
  for (const r of kindRows ?? []) {
    byKind[r.source_kind] = (byKind[r.source_kind] ?? 0) + 1;
  }

  const { data: latest, error: latestErr } = await supabase
    .from("chunks")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1);

  const lastSyncedAt = latestErr ? null : latest?.[0]?.updated_at ?? null;

  // How long ago was the last sync, in human terms?
  let lastSyncAge: string | null = null;
  if (lastSyncedAt) {
    const ms = Date.now() - new Date(lastSyncedAt).getTime();
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    lastSyncAge = h > 0 ? `${h}h ${m}m ago` : `${m}m ago`;
  }

  return NextResponse.json(
    {
      total: (kindRows ?? []).length,
      by_kind: byKind,
      last_synced_at: lastSyncedAt,
      last_sync_age: lastSyncAge,
      generated_at: new Date().toISOString(),
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
    },
  );
}
