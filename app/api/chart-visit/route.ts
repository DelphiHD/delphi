// The view a reader chose on a chart page: "Transit · The World". Sent by the
// page with sendBeacon, so nothing waits on it. The token has to name a live
// chart, which is what stops this being an open write endpoint, and what is
// recorded is checked against the views a chart actually has.
//
// Kaycee, 2026-10-11, for the mobile work: which views people use, on what.

import { createClient } from "@supabase/supabase-js";
import { NextResponse, after } from "next/server";
import { isPerson, isOurs, recordVisit, type Device } from "@/lib/visits";

export const dynamic = "force-dynamic";

const MODES = ["Individual", "Variations", "Transit", "Relationship"];
const VIEWS = ["Bodygraph", "Circuits", "The Wheel", "Astrology", "The World"];
const DEVICES: Device[] = ["phone", "tablet", "computer"];

export async function POST(request: Request) {
  let b: { token?: unknown; what?: unknown; device?: unknown };
  try { b = JSON.parse(await request.text()); } catch { return new NextResponse(null, { status: 400 }); }
  const token = typeof b.token === "string" ? b.token : "";
  const [mode, view] = typeof b.what === "string" ? b.what.split(" · ") : [];
  const device = DEVICES.find((d) => d === b.device);
  if (!/^[a-f0-9]{32}$/.test(token) || !MODES.includes(mode) || !VIEWS.includes(view) || !device) {
    return new NextResponse(null, { status: 400 });
  }
  const ua = request.headers.get("user-agent") ?? "";
  if (!isPerson(ua)) return new NextResponse(null, { status: 204 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: row } = await db.from("client_charts").select("revoked_at").eq("token", token).maybeSingle();
  if (!row || row.revoked_at) return new NextResponse(null, { status: 404 });

  const cookie = request.headers.get("cookie") ?? "";
  after(async () => recordVisit({ token, kind: "view", what: mode + " · " + view, device, own: await isOurs(cookie) }));
  return new NextResponse(null, { status: 204 });
}
