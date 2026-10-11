/**
 * Status, notes and resolution on a problem report, from the dashboard.
 * Admins only, checked against delphi_admins before the service key writes.
 */
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUSES = ["new", "looking", "fixed", "not-a-bug", "duplicate"];
const no = (status: number) => Response.json({ ok: false }, { status });

export async function POST(request: Request): Promise<Response> {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return no(401);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: admin } = await db.from("delphi_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!admin) return no(403);

  let b: { id?: unknown; status?: unknown; notes?: unknown; resolution?: unknown };
  try { b = await request.json(); } catch { return no(400); }
  const id = String(b.id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return no(400);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.status === "string") {
    if (!STATUSES.includes(b.status)) return no(400);
    patch.status = b.status;
    patch.resolved_at = ["fixed", "not-a-bug", "duplicate"].includes(b.status) ? new Date().toISOString() : null;
  }
  if (typeof b.notes === "string") patch.notes = b.notes.slice(0, 8000);
  if (typeof b.resolution === "string") patch.resolution = b.resolution.slice(0, 8000);
  const { error } = await db.from("problem_reports").update(patch).eq("id", id);
  if (error) return no(500);
  return Response.json({ ok: true });
}
